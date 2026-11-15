import { API } from './vendor/shared.js';
import { createClangApi, astDumpJson, CLANG22_CONFIG } from './vendor/compiler-bridge.js';
import { instrument } from './instrument.mjs';
let bundle;
let output = '';
let executing = false;
const readBuffer = async name => {
    const response = await fetch(new URL(name, import.meta.url));
    if (!response.ok) throw new Error('C++ runtime asset unavailable: ' + name);
    return response.arrayBuffer();
};
export async function prepare() {
    bundle = createClangApi({ APIClass: API, readBuffer,
        config: { ...CLANG22_CONFIG,
            clangExtraArgs: ['-internal-isystem','/include/wasm32-wasip1/eh/c++/v1',
                '-internal-isystem','/include/wasm32-wasip1', '-std=c++17', '-fexceptions', '-fcxx-exceptions',
                '-exception-model=wasm', '-mllvm', '-wasm-enable-eh', '-mllvm', '-wasm-use-legacy-eh=false', '-target-feature','+exception-handling'],
            lldFlags: ['--export-dynamic','-Llib/wasm32-wasip1/eh'],
            lldLibs: ['-lc','-lc++','-lc++abi','-lunwind','-lclang_rt.builtins'] },
        compileStreaming: async name => WebAssembly.compile(await readBuffer(name)), showTiming: false,
        hostWrite: text => {
            if (!executing) return;
            output += text;
            if (new TextEncoder().encode(output).length > 65536) throw new Error('Output exceeds 64 KiB limit');
        }
    });
    await bundle.api.ready;
    await bundle.api.untar(bundle.api.memfs, 'sysroot-eh.tar');
    await Promise.all([bundle.api.getModule('clang22'), bundle.api.getModule('lld22')]);
    const response = await fetch(new URL('trace-runtime.hpp', import.meta.url));
    if (!response.ok) throw new Error('C++ tracing runtime unavailable');
    bundle.api.memfs.addFile('vizcode-runtime.hpp', await response.text());
}
export async function traceCpp(request, onCompiled = () => {}) {
    const code = request.code + '\n// Scratch (local only)\n' + request.scratchCode;
    const boundary = request.code.split('\n').length + 1;
    const api = bundle.api;
    let source = request.code;
    // Scratch is executed by a wrapper main after a complete program, or as the
    // main body for a function-only answer. Map its lines back to the scratch pane.
    const initial = await astDumpJson(bundle, source, { input: 'answer.cc' });
    const main = (initial.ast.inner || []).find(node => node.kind === 'FunctionDecl' && node.name === 'main');
    if (main) {
        const bytes = new TextEncoder().encode(source);
        const offset = main.loc.offset;
        const body = main.inner.find(node => node.kind === 'CompoundStmt');
        const end = body.range.end.offset;
        source = new TextDecoder().decode(bytes.slice(0,offset)) + '__viz_answer_main' + new TextDecoder().decode(bytes.slice(offset + 4,end)) + 'return 0;' + new TextDecoder().decode(bytes.slice(end));
        const parameters = (main.inner || []).filter(n => n.kind === 'ParmVarDecl');
        source += '\nint main(){__viz_answer_main(' + (parameters.length ? '0,nullptr' : '') + ');\n';
    } else source += '\nint main(){\n';
    source += request.scratchCode + '\n}\n';
    const { ast } = await astDumpJson(bundle, source, { input: 'combined.cc' });
    const rewritten = instrument(source, ast);
    const trace = [];
    let bytes = 0;
    const mapLine = line => {
        // Renaming main does not change the line count. The synthetic wrapper
        // occupies one line before the scratch source.
        const answerLines = request.code.split('\n').length;
        return line > answerLines ? Math.min(line + 1, code.split('\n').length) : line;
    };
    api.memfs.traceSnapshot = text => {
        if (trace.length >= 1000 || bytes > 2000000) throw new Error('Trace limit reached (1000 steps / 2 MiB)');
        const snapshot = JSON.parse(text);
        const line = mapLine(snapshot.line);
        const stack = snapshot.frames.map((frame,index) => ({ frame_id: frame.id, func_name: frame.name === '__viz_answer_main' ? 'main' : frame.name,
            encoded_locals: frame.vars, ordered_varnames: Object.keys(frame.vars), parent_frame_id_list: [],
            is_parent: false, is_zombie: false, is_highlighted: index === snapshot.frames.length - 1, unique_hash: String(frame.id) }));
        const entry = { event: snapshot.event, line, source_area: line > boundary ? 'scratch' : 'answer',
            source_line: line > boundary ? line - boundary : line, func_name: stack.at(-1)?.func_name || '<module>',
            globals: snapshot.globals, ordered_globals: Object.keys(snapshot.globals), stack_to_render: stack,
            heap: snapshot.heap, stdout: output };
        bytes += new TextEncoder().encode(JSON.stringify(entry)).length;
        trace.push(entry);
    };
    const start = bundle.log.text.length;
    try {
        await api.compile({ input: 'instrumented.cc', contents: rewritten, obj: 'answer.o' });
        await api.link('answer.o', 'answer.wasm');
    } catch (error) {
        throw new Error('C++ compilation failed:\n' + bundle.log.text.slice(start).replace(/\x1b\[[0-9;]*m/g,'').slice(0,12000));
    }
    const module = await WebAssembly.compile(api.memfs.getFileContents('answer.wasm'));
    api.memfs.setStdinStr(request.stdin);
    let inputRequest;
    const inputStop = new Error('Input requested');
    api.memfs.onInputRead = () => {
        if (request.interactiveInput && !request.inputEof && api.memfs.stdinStrPos >= api.memfs.stdinStr.length) {
            inputRequest = {kind: 'line', prompt: '', step: Math.max(0, trace.length - 1)};
            throw inputStop;
        }
    };
    output = '';
    onCompiled();
    executing = true;
    try {
        await api.run(module, 'answer.wasm');
    } catch (error) {
        if (!inputRequest) trace.push({ event: trace.length >= 1000 || bytes > 2000000 ? 'instruction_limit_reached' : 'uncaught_exception',
            exception_msg: String(error.message).slice(0,4096), stdout: output });
    } finally { executing = false; api.memfs.onInputRead = undefined; }
    if (trace.length) trace[trace.length - 1].stdout = output;
    // API command/status logs are deliberately disabled during student execution.
    return JSON.stringify({ code, trace, inputRequest });
}

/** AST compilation only: diagnostics do not link or execute student code. */
export async function diagnoseCpp(request) {
    const start=bundle.log.text.length;
    try {await astDumpJson(bundle,request.code,{input:'answer.cc'});return '';}
    catch(error){return (bundle.log.text.slice(start) || String(error.message)).replace(/\x1b\[[0-9;]*m/g,'').slice(0,12000);}
}
