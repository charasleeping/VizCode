import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const plugin = root + 'plugin/vizcode/';
execFileSync('npm', ['run', 'build'], { cwd: plugin + 'frontend', stdio: 'inherit' });
const require = createRequire(plugin + 'frontend/package.json');
const { minify } = require('terser');
const source = await readFile(plugin + 'amd/src/answer.js', 'utf8');
const result = await minify(source.replace('define([', 'define("qtype_vizcode/answer",['));
await mkdir(plugin + 'amd/build', { recursive: true });
await writeFile(plugin + 'amd/build/answer.min.js', result.code);
if (process.argv.includes('--zip')) {
    await mkdir(root + 'dist', { recursive: true });
    await rm(root + 'dist/vizcode.zip', { force: true });
    execFileSync('zip', ['-qr', root + 'dist/vizcode.zip', 'vizcode', '-x',
        'vizcode/frontend/node_modules/*', '*/__pycache__/*'], { cwd: root + 'plugin', stdio: 'inherit' });
}