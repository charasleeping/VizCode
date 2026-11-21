"""Package the companion installer, bridge, backend and exact committed source."""
from pathlib import Path
import hashlib,shutil,subprocess,re,json
root=Path(__file__).resolve().parents[2]
if subprocess.run(['python3',str(root/'harness/scripts/license-audit.py'),'check','--archive',str(root/'dist/vizcode.zip')],cwd=root).returncode:
    raise SystemExit('Release bundle not created: maintainer release verification is required.')
if subprocess.check_output(['git','status','--porcelain','--untracked-files=all'],cwd=root,text=True).strip():
    raise SystemExit('Commit the reviewed source and license evidence before packaging matching source.')
version=re.search(r"\$plugin->release = '([^']+)'",(root/'plugin/vizcode/version.php').read_text())[1]
stage=root/'dist/vizcode-release';shutil.rmtree(stage,ignore_errors=True);stage.mkdir(parents=True)
def copy(source,dest):
 source=root/source;dest=stage/dest;dest.parent.mkdir(parents=True,exist_ok=True)
 if source.is_dir():shutil.copytree(source,dest,dirs_exist_ok=True,ignore=shutil.ignore_patterns('.DS_Store','__pycache__','*.bridge-backup'))
 else:shutil.copy2(source,dest)
copy('dist/vizcode.zip','plugins/vizcode.zip')
for file in ['README.md','LICENSE','COPYRIGHT.md','upstreams.json']:copy(file,file)
copy('docs','docs');copy('release/INSTALL.md','INSTALL.md')
copy('plugin/vizcode/THIRD_PARTY_NOTICES.md','THIRD_PARTY_NOTICES.md');copy('plugin/vizcode/licenses','licenses')
copy('release/compose.yaml','backend/compose.yaml');copy('release/backend.env.example','backend/.env.example')
for file in ['Dockerfile','patch-measurements.py']:copy('harness/jobe/'+file,'backend/grader/'+file)
copy('services/java','backend/java')
copy('services/tracing','backend/services/tracing')
copy('plugin/vizcode/frontend/src/widget/protocol.mjs','backend/plugin/vizcode/frontend/src/widget/protocol.mjs')
copy('api','api')
copy('examples/adapters','examples/adapters')
copy('harness/coderunner-fixture/Dockerfile.execution','backend/execution/Dockerfile')
copy('harness/server.mjs','backend/execution/harness/server.mjs')
copy('services/java/proxy.mjs','backend/execution/services/java/proxy.mjs')
copy('services/tracing','backend/execution/services/tracing')
copy('plugin/vizcode/frontend/src/widget/protocol.mjs','backend/execution/plugin/vizcode/frontend/src/widget/protocol.mjs')
copy('plugin/vizcode/execution-assets','backend/execution/plugin/vizcode/execution-assets')
subprocess.run(['git','archive','--format=tar.gz','--output='+str(stage/'source.tar.gz'),'HEAD'],cwd=root,check=True)
(stage/'COMMIT').write_text(subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True))
(stage/'SHA256SUMS').write_text(''.join(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+p.relative_to(stage).as_posix()+'\n' for p in sorted(stage.rglob('*')) if p.is_file()))
name=root/'dist'/('vizcode-'+version+'-bundle');shutil.make_archive(str(name),'zip',stage);print(str(name)+'.zip')
