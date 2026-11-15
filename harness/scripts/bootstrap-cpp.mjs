import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = new URL('../../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('plugin/vizcode/frontend/src/cpp/compiler-manifest.json',root)));
const output = new URL('plugin/vizcode/execution-assets/cpp/',root);
await mkdir(output,{recursive:true});
const hash = data => createHash('sha256').update(data).digest('hex');
async function install(asset, target) {
    let data;
    try { data = await readFile(target); } catch {}
    if (data && hash(data) === asset.sha256) return;
    const response = await fetch(asset.url);
    if (!response.ok) throw new Error('Compiler download failed: ' + asset.name);
    data = Buffer.from(await response.arrayBuffer());
    if (hash(data) !== asset.sha256) throw new Error('Compiler checksum mismatch: ' + asset.name);
    await writeFile(target,data);
    console.log('Installed verified C++ asset: '+asset.name);
}
for (const asset of manifest.assets) await install(asset,new URL(asset.name,output));
const overlay = new URL('sysroot-eh.tar',output);
let valid = false;
try { valid = hash(await readFile(overlay)) === manifest.eh_sha256; } catch {}
if (!valid) {
    const archive = join(tmpdir(),'vizcode-cpp-' + manifest.sdk_asset.sha256 + '.tar.gz');
    await install(manifest.sdk_asset,archive);
    execFileSync('python3',[fileURLToPath(new URL('harness/scripts/extract-cpp-eh.py',root)),archive,fileURLToPath(overlay)]);
    if (hash(await readFile(overlay)) !== manifest.eh_sha256) throw new Error('C++ library overlay checksum mismatch');
}
