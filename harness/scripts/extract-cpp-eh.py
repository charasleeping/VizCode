"""Create the small exception-enabled overlay from the checksummed WASI SDK archive."""
import sys
import tarfile
with tarfile.open(sys.argv[1], 'r:gz') as source, tarfile.open(sys.argv[2], 'w', format=tarfile.USTAR_FORMAT) as target:
    for info in source:
        name = info.name.split('/', 1)[-1]
        header = name.startswith('include/wasm32-wasip1/eh')
        library = name.startswith('lib/wasm32-wasip1/eh') and ((info.isfile() and name.count('/') == 3) or info.isdir())
        if (header or library) and '/llvm-lto' not in name:
            if '..' in name.split('/') or not (info.isfile() or info.isdir()):
                raise ValueError('Unexpected SDK archive entry')
            info.name = name
            target.addfile(info, source.extractfile(info) if info.isfile() else None)
