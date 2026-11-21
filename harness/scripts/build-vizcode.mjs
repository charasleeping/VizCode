import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const plugin = root + 'plugin/vizcode/';
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
