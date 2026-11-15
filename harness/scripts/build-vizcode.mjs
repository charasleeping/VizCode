import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const plugin = root + 'plugin/vizcode/';
const manifest = JSON.parse(await readFile(plugin + 'frontend/src/cpp/compiler-manifest.json'));
const memfs = await readFile(plugin + 'frontend/src/cpp/memfs.wasm');
if (createHash('sha256').update(memfs).digest('hex') !== manifest.memfs_sha256) throw new Error('Invalid memory filesystem binary');
for (const asset of [...manifest.assets, { name: 'sysroot-eh.tar', sha256: manifest.eh_sha256 }]) {
    let data;
    try { data = await readFile(plugin + 'execution-assets/cpp/' + asset.name); }
    catch { throw new Error('Missing C++ compiler assets. Run node harness/scripts/bootstrap-cpp.mjs first.'); }
    if (createHash('sha256').update(data).digest('hex') !== asset.sha256) throw new Error('Invalid C++ asset: ' + asset.name);
}
execFileSync('npm', ['run', 'build'], { cwd: plugin + 'frontend', stdio: 'inherit' });
const require = createRequire(plugin + 'frontend/package.json');
const { minify } = require('terser');
await mkdir(plugin + 'amd/build', { recursive: true });
for (const module of ['ui']) {
    const source = await readFile(plugin + 'amd/src/' + module + '.js', 'utf8');
    const result = await minify(source.replace('define([', 'define("local_vizcode/' + module + '",['));
    await writeFile(plugin + 'amd/build/' + module + '.min.js', result.code);
}
if (process.argv.includes('--zip')) {
    // Development compilation is unrestricted; new distributable archives fail closed.
    execFileSync('python3', [root + 'harness/scripts/license-audit.py', 'check'], { cwd: root, stdio: 'inherit' });
    await mkdir(root + 'dist', { recursive: true });
    await rm(root + 'dist/vizcode.zip', { force: true });
    execFileSync('zip', ['-qr', root + 'dist/vizcode.zip', 'vizcode', '-x',
        'vizcode/frontend/*', 'vizcode/execution-assets/*', '*/__pycache__/*', '*/.DS_Store'], { cwd: root + 'plugin', stdio: 'inherit' });
}
