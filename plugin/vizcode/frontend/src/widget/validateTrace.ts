const events = new Set(['step_line', 'call', 'return', 'exception', 'uncaught_exception', 'instruction_limit_reached']);
const integer = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
const record = (value: unknown): value is Record<string, any> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

export function validateTrace(result: any, expectedCode: string) {
    if (!record(result) || result.code !== expectedCode || !Array.isArray(result.trace) || result.trace.length > 1001) {
        throw new Error('Invalid execution trace');
    }
    if (result.inputRequest != null && (!record(result.inputRequest) ||
        !['line', 'all'].includes(result.inputRequest.kind) || typeof result.inputRequest.prompt !== 'string' ||
        result.inputRequest.prompt.length > 100000 || !integer(result.inputRequest.step) ||
        result.inputRequest.step >= result.trace.length)) throw new Error('Invalid input request');
    let budget = 100000;
    function value(item: any, depth = 0): boolean {
        if (--budget < 0 || depth > 60) return false;
        if (item === null || ['string', 'boolean'].includes(typeof item)) return true;
        if (typeof item === 'number') return Number.isFinite(item);
        if (!Array.isArray(item)) return false;
        const [tag, name] = item;
        const pair = (entry: any) => Array.isArray(entry) && entry.length === 2 &&
            typeof entry[0] === 'string' && value(entry[1], depth + 1);
        if (tag === 'REF') return item.length === 2 && integer(name);
        if (tag === 'JS_SPECIAL_VAL') return item.length === 2 && typeof name === 'string';
        if (tag === 'SPECIAL_FLOAT' || tag === 'IMPORTED_FAUX_PRIMITIVE') return item.length === 2 && typeof name === 'string';
        if (tag === 'FUNCTION') return typeof name === 'string' && (item[2] === null || integer(item[2]));
        if (tag === 'HEAP_PRIMITIVE') return typeof name === 'string' && value(item[2], depth + 1);
        if (['LIST', 'TUPLE', 'SET'].includes(tag)) return item.slice(1).every(entry => value(entry, depth + 1));
        if (tag === 'DICT') return item.slice(1).every(entry => Array.isArray(entry) && entry.length === 2 &&
            entry.every(child => value(child, depth + 1)));
        if (tag === 'INSTANCE') return typeof name === 'string' && item.slice(2).every(pair);
        if (tag === 'INSTANCE_PPRINT') return typeof name === 'string' && typeof item[2] === 'string' && item.slice(3).every(pair);
        if (tag === 'CLASS') return typeof name === 'string' && Array.isArray(item[2]) &&
            item[2].every(parent => typeof parent === 'string') && item.slice(3).every(pair);
        return false;
    }
    const snapshot = (item: any) => record(item) && Object.values(item).every(entry => value(entry));
    for (const entry of result.trace) {
        if (!record(entry) || !events.has(entry.event) ||
            (entry.line !== undefined && (!integer(entry.line) || entry.line > expectedCode.split('\n').length + 1)) ||
            (entry.stdout !== undefined && typeof entry.stdout !== 'string') ||
            (entry.exception_msg !== undefined && typeof entry.exception_msg !== 'string')) throw new Error('Invalid trace event');
        if (entry.heap !== undefined && (!record(entry.heap) || !Object.keys(entry.heap).every(key => /^\d+$/.test(key)) ||
            !Object.values(entry.heap).every(item => value(item)))) throw new Error('Invalid heap snapshot');
        if (entry.globals !== undefined && !snapshot(entry.globals)) throw new Error('Invalid globals snapshot');
        if (entry.stack_to_render !== undefined && (!Array.isArray(entry.stack_to_render) ||
            entry.stack_to_render.length > 64 || !entry.stack_to_render.every(frame => record(frame) &&
                integer(frame.frame_id) && typeof frame.func_name === 'string' && snapshot(frame.encoded_locals)))) {
            throw new Error('Invalid stack snapshot');
        }
    }
}