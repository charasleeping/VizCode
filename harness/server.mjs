import http from 'node:http';
import {javaTrace} from '../services/java/proxy.mjs';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace = fileURLToPath(new URL('../', import.meta.url));
const liveExecution = resolve(workspace, 'plugin/vizcode/execution-assets');
const liveAssets = resolve(workspace, 'plugin/vizcode/assets');
const harness = resolve(workspace, 'harness');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
    '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml' };
const workerPolicy = "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; worker-src http://127.0.0.1:4101/live/pyodide/ http://127.0.0.1:4101/live/cpp/";
let authenticatedHits = 0;

function serve(port, isolated) {
    return http.createServer(async (request, response) => {
        const url = new URL(request.url, `http://${request.headers.host}`);
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('X-Content-Type-Options', 'nosniff');
        response.setHeader('Referrer-Policy', 'no-referrer');
        if(isolated && url.pathname==='/java/trace'){await javaTrace(request,response);return;}
        if (!isolated && url.pathname === '/authenticated-action') {
            authenticatedHits++;
            response.end('Authenticated endpoint must not be reachable by student code');
            return;
        }
        if (!isolated && url.pathname === '/probe-count') {
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ authenticatedHits }));
            return;
        }
        if (isolated) {
            response.setHeader('Content-Security-Policy', url.pathname.endsWith('.html')
                ? "default-src 'none'; script-src 'self'; worker-src 'self'; connect-src 'none'; frame-ancestors "+(process.env.VIZCODE_FRAME_ANCESTORS || "http://localhost:4100 http://localhost:4112")+"; base-uri 'none'; form-action 'none'"
                : workerPolicy.replaceAll("http://127.0.0.1:4101", "http://"+request.headers.host));
        }
        let root = isolated ? liveExecution : harness;
        let pathname = url.pathname === '/' ? '/live.html' : url.pathname;
        if (isolated && pathname.startsWith('/live/')) {
            root = liveExecution;
            pathname = pathname.slice('/live'.length);
        } else if (!isolated && pathname.startsWith('/vizcode/')) {
            root = liveAssets;
            pathname = pathname.slice('/vizcode'.length);
        } else if (isolated && pathname.startsWith('/probe/')) {
            root = harness;
            pathname = pathname.slice('/probe'.length);
        }
        try {
            const file = resolve(root, '.' + decodeURIComponent(pathname));
            if (!file.startsWith(root + sep)) throw new Error('Invalid path');
            response.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream');
            response.end(await readFile(file));
        } catch {
            response.writeHead(404);
            response.end('Not found');
        }
    }).listen(port, () => console.log(`${isolated ? 'Execution' : 'Harness'}: http://${isolated ? '127.0.0.1' : 'localhost'}:${port}`));
}

const servers = process.argv.includes('--execution-only') ? [serve(Number(process.env.VIZCODE_EXECUTION_PORT || 4101), true)] :
    process.argv.includes('--editor-only') ? [serve(4100, false)] : [serve(4100, false), serve(Number(process.env.VIZCODE_EXECUTION_PORT || 4101), true)];
process.on('SIGTERM', () => servers.forEach(server => server.close()));