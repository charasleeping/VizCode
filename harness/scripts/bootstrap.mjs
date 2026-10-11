import { readFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const upstreams = JSON.parse(await readFile(root + 'upstreams.json', 'utf8'));
for (const [directory, upstream] of Object.entries(upstreams)) {
    let exists = true;
    try { await access(root + directory); } catch { exists = false; }
    if (exists) {
        console.log(`Preserving existing checkout: ${directory}`);
        continue;
    }
    execFileSync('git', ['clone', '--filter=blob:none', upstream.url, root + directory], { stdio: 'inherit' });
    execFileSync('git', ['checkout', '--detach', upstream.commit], { cwd: root + directory, stdio: 'inherit' });
}