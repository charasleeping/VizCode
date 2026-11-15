import { readFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const upstreams = JSON.parse(await readFile(root + 'upstreams.json', 'utf8'));
for (const [directory, upstream] of Object.entries(upstreams)) {
    let exists = true;
    try { await access(root + directory); } catch { exists = false; }
    if (exists) {
        const actual = execFileSync('git', ['rev-parse','HEAD'], {cwd:root+directory,encoding:'utf8'}).trim();
        if(actual !== upstream.commit) throw new Error('Unexpected upstream revision in '+directory+'. Preserve local work and restore the pinned checkout before continuing.');
        console.log(`Verified pinned checkout: ${directory}`);
        continue;
    }
    execFileSync('git', ['init', root + directory], { stdio: 'inherit' });
    execFileSync('git', ['remote','add','origin',upstream.url], {cwd:root+directory,stdio:'inherit'});
    execFileSync('git', ['fetch','--depth=1','origin',upstream.commit], {cwd:root+directory,stdio:'inherit'});
    execFileSync('git', ['checkout', '--detach', 'FETCH_HEAD'], { cwd: root + directory, stdio: 'inherit' });
}