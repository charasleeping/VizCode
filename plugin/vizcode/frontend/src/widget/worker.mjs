import { loadPyodide } from './pyodide/pyodide.mjs';

let runtime;
let language = 'python3';
let cppTracer;
self.onmessage = async event => {
    const { type, id, payload } = event.data;
    try {
        if (type === 'initialize') {
            language = event.data.language || 'python3';
            if(!['python3','cpp','java'].includes(language))throw new Error('Unsupported language');
            if (language === 'java') { self.postMessage({type:'ready',id}); return; }
            if (language === 'cpp') {
                cppTracer = await import('./cpp/runner.mjs');
                await cppTracer.prepare();
                self.postMessage({ type: 'ready', id });
                return;
            }
            runtime = await loadPyodide({ indexURL: new URL('./pyodide/', import.meta.url).href });
            runtime.FS.mkdir('/home/pyodide/optlite');
            for (const name of ['__init__.py', '_version.py', 'pg_logger.py', 'pg_encoder.py']) {
                const response = await fetch(new URL('./optlite/' + name, import.meta.url));
                if (!response.ok) throw new Error('Tracer asset unavailable');
                runtime.FS.writeFile('/home/pyodide/optlite/' + name, await response.text());
            }
            self.postMessage({ type: 'ready', id });
        } else if (type === 'execute') {
            if(language==='java') {
                const response=await fetch(new URL('../java/trace',import.meta.url),{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+payload.javaTicket},body:JSON.stringify(payload)});
                const result=await response.json();if(!response.ok)throw new Error(result.error || 'Java debugging unavailable.');
                self.postMessage({type:'result',id,payload:JSON.stringify(result)});return;
            }
            if (payload.diagnose) {
                let message='';
                if (language==='cpp') message=await cppTracer.diagnoseCpp(payload);
                else {
                    runtime.globals.set('__viz_diagnostic_source',payload.code);
                    message=runtime.runPython(`import ast
try:
    ast.parse(__viz_diagnostic_source, filename='<answer>')
    __viz_diagnostic_message = ''
except SyntaxError as error:
    __viz_diagnostic_message = f"{type(error).__name__}: {error.msg} (line {error.lineno}, column {error.offset})" + chr(10) + (error.text or '').rstrip()
__viz_diagnostic_message`);
                    runtime.globals.delete('__viz_diagnostic_source');
                }
                throw new Error(message || 'This syntax is not supported by live debugging.');
            }

            if (payload.functions) {
                const {buildCalls} = await import('./function-discovery.mjs');
                payload.scratchCode = buildCalls(payload.code, language, payload.functions).source;
            }

            if (language === 'cpp') {
                const result = await cppTracer.traceCpp(payload, () => self.postMessage({ type: 'compiled', id }));
                self.postMessage({ type: 'result', id, payload: result });
                return;
            }
            runtime.globals.set('request_json', JSON.stringify(payload));
            const result = runtime.runPython(`helper_namespace = {'__name__': 'optmentor_runtime', 'request_json': request_json}
exec(compile(${JSON.stringify(`
import json, io, bdb, types, sys
from optlite import pg_logger
request = json.loads(request_json)
answer = request['code']
boundary = answer.count('\\n') + 2
source = answer + '\\n# Scratch (local only)\\n' + request['scratchCode']
stdin = request['stdin'].replace('\\r\\n', '\\n').replace('\\r', '\\n')
lines = stdin.split('\\n') if stdin else []
if stdin.endswith('\\n'):
    lines.pop()
class BoundedOutput(io.StringIO):
    size = 0
    def write(self, text):
        self.size += len(text.encode('utf-8'))
        if self.size > 65536:
            raise RuntimeError('Output exceeds 64 KiB limit')
        return super().write(text)
class BoundedTrace(list):
    size = 0
    def append(self, entry):
        self.size += len(json.dumps(entry).encode('utf-8'))
        if len(self) >= 1000 or self.size > 2000000:
            super().append({'event': 'instruction_limit_reached', 'exception_msg': 'Trace limit reached (1000 steps / 2 MiB)'})
            raise bdb.BdbQuit()
        super().append(entry)
# Input requests unwind the isolated run; the next run replays supplied bytes.
interactive = request.get('interactiveInput', False)
eof = request.get('inputEof', not interactive)
pending_input = None
class InteractiveBytes(io.BytesIO):
    def need(self, kind, prompt=''):
        global pending_input
        pending_input = {'kind': kind, 'prompt': str(prompt)}
        raise pg_logger.RawInputException(str(prompt))
    def read(self, size=-1):
        if size != 0 and interactive and not eof and (size < 0 or self.tell() >= len(self.getvalue())):
            self.need('all' if size < 0 else 'line')
        return super().read(size)
    def read1(self, size=-1):
        return self.read(size)
    def readline(self, size=-1):
        if size == 0: return b''
        remaining = self.getvalue()[self.tell():]
        if interactive and not eof and (not remaining or (b'\\n' not in remaining and (size < 0 or len(remaining) < size))):
            self.need('line')
        return super().readline(size)
class InteractiveText(io.TextIOBase):
    def __init__(self):
        self.buffer = InteractiveBytes(stdin.encode('utf-8'))
    def readable(self): return True
    @property
    def encoding(self): return 'utf-8'
    def byte_limit(self, size):
        if size < 0: return -1
        remaining = self.buffer.getvalue()[self.buffer.tell():].decode('utf-8')
        return len(remaining[:size].encode('utf-8')) if remaining else size
    def read(self, size=-1): return self.buffer.read(self.byte_limit(size)).decode('utf-8')
    def readline(self, size=-1): return self.buffer.readline(self.byte_limit(size)).decode('utf-8')
    def readlines(self, hint=-1): return self.read().splitlines(keepends=True)
    def __iter__(self): return self
    def __next__(self):
        text = self.readline()
        if not text: raise StopIteration
        return text
stream = InteractiveText()
def read_input(prompt=''):
    if interactive and not eof and stream.buffer.tell() >= len(stream.buffer.getvalue()):
        stream.buffer.need('line', prompt)
    if prompt: sys.stdout.write(str(prompt))
    text = stream.readline()
    if not text: raise EOFError('Input exhausted')
    return text.rstrip('\\n').rstrip('\\r')
pg_logger.raw_input_wrapper = read_input
pg_logger.StringIO = types.SimpleNamespace(StringIO=BoundedOutput)
pg_logger.input_string_queue = lines
def finalize(code, trace):
    if pending_input:
        trace[:] = [entry for entry in trace if entry.get('event') != 'raw_input']
        pending_input['step'] = max(0, len(trace) - 1)
        if trace: trace[-1]['stdout'] = logger.user_stdout.getvalue()
    for entry in trace:
        line = entry.get('line')
        if isinstance(line, int):
            entry['source_area'] = 'scratch' if line > boundary else 'answer'
            entry['source_line'] = line - boundary if line > boundary else line
    return json.dumps({'code': source, 'trace': trace, 'scratchStart': boundary + 1, 'inputRequest': pending_input})
logger = pg_logger.PGLogger(False, False, False, finalize, disable_security_checks=True, allow_all_modules=True)
logger.trace = BoundedTrace()
original_stdin = sys.stdin
sys.stdin = stream
try:
    logger._runscript(source)
except bdb.BdbQuit:
    pass
finally:
    sys.stdin = original_stdin
result_json = logger.finalize()
`)}, '<optmentor-runtime>', 'exec'), helper_namespace)
helper_namespace['result_json']`);
            self.postMessage({ type: 'result', id, payload: result });
        }
    } catch (error) {
        self.postMessage({ type: 'error', id, payload: String(error.message).slice(0, 4096) });
    }
};