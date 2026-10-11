import { loadPyodide } from './pyodide/pyodide.mjs';

let runtime;
self.onmessage = async event => {
    const { type, id, payload } = event.data;
    try {
        if (type === 'initialize') {
            runtime = await loadPyodide({ indexURL: new URL('./pyodide/', import.meta.url).href });
            runtime.FS.mkdir('/home/pyodide/optlite');
            for (const name of ['__init__.py', '_version.py', 'pg_logger.py', 'pg_encoder.py']) {
                const response = await fetch(new URL('./optlite/' + name, import.meta.url));
                if (!response.ok) throw new Error('Tracer asset unavailable');
                runtime.FS.writeFile('/home/pyodide/optlite/' + name, await response.text());
            }
            self.postMessage({ type: 'ready', id });
        } else if (type === 'execute') {
            runtime.globals.set('request_json', JSON.stringify(payload));
            const result = runtime.runPython(`helper_namespace = {'__name__': 'optmentor_runtime', 'request_json': request_json}
exec(compile(${JSON.stringify(`
import json, io, bdb, types
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
def read_input(prompt=''):
    if not pg_logger.input_string_queue:
        raise EOFError('Input exhausted')
    return pg_logger.input_string_queue.pop(0)
pg_logger.raw_input_wrapper = read_input
pg_logger.StringIO = types.SimpleNamespace(StringIO=BoundedOutput)
pg_logger.input_string_queue = lines
def finalize(code, trace):
    for entry in trace:
        line = entry.get('line')
        if isinstance(line, int):
            entry['source_area'] = 'scratch' if line > boundary else 'answer'
            entry['source_line'] = line - boundary if line > boundary else line
    return json.dumps({'code': source, 'trace': trace, 'scratchStart': boundary + 1})
logger = pg_logger.PGLogger(False, False, False, finalize, disable_security_checks=True, allow_all_modules=True)
logger.trace = BoundedTrace()
try:
    logger._runscript(source)
except bdb.BdbQuit:
    pass
result_json = logger.finalize()
`)}, '<optmentor-runtime>', 'exec'), helper_namespace)
helper_namespace['result_json']`);
            self.postMessage({ type: 'result', id, payload: result });
        }
    } catch (error) {
        self.postMessage({ type: 'error', id, payload: String(error.message).slice(0, 4096) });
    }
};