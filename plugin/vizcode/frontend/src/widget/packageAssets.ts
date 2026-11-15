import { unzipSync } from 'fflate';
export interface PackageAsset { digest: string; name: string; mode: 'both' | 'grading'; config: Record<string, any>; archive: string; }
export function unpackPackage(item: PackageAsset): Record<string, Uint8Array> {
    if (!/^[a-f0-9]{64}$/.test(item.digest) || item.archive.length > 23000000) throw new Error('Invalid package artifact');
    const bytes = Uint8Array.from(atob(item.archive), character => character.charCodeAt(0));
    let total = 0, count = 0;
    return unzipSync(bytes, { filter: file => {
        total += file.originalSize; count++;
        if (count > 10000 || total > 67108864 || file.name.startsWith('/') || file.name.split('/').includes('..')) throw new Error('Invalid package archive');
        return true;
    }});
}
