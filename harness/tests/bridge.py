import pathlib,shutil,subprocess,tempfile,hashlib,json
root=pathlib.Path(__file__).resolve().parents[2]
with tempfile.TemporaryDirectory(prefix='vizcode-bridge-test-') as temp:
 target=pathlib.Path(temp)
 (target/'version.php').write_text("<?php $branch = '405';\n")
 for source,dest in [('harness/upstream-coderunner','question/type/coderunner'),('harness/upstream-behaviour','question/behaviour/adaptive_adapted_for_coderunner')]:shutil.copytree(root/source,target/dest,ignore=shutil.ignore_patterns('.git'))
 command=['python3',str(root/'plugin/vizcode/bridge/install.py'),'--moodle',temp]
 manifest=json.loads((root/'plugin/vizcode/bridge/manifest.json').read_text())
 for opts in [[],[],['--verify'],['--remove'],['--remove']]:subprocess.run(command+opts,check=True)
 for item in manifest['patches']:assert hashlib.sha256((target/item['path']).read_bytes()).hexdigest()==item['sha256']
 subprocess.run(command,check=True)
 for item in manifest['patches']:subprocess.run(['php','-l',str(target/item['path'])],check=True,capture_output=True)
 original=target/manifest['patches'][0]['path'];unmodified=original.read_text();original.write_text(unmodified+'\n// site modification\n')
 state={str(p):p.read_bytes() for p in target.rglob('*.php')}
 assert subprocess.run(command,capture_output=True).returncode!=0
 assert all(pathlib.Path(name).read_bytes()==data for name,data in state.items())
 original.write_text(unmodified)
 (target/'version.php').write_text("<?php $branch = '500';\n")
 result=subprocess.run(command,capture_output=True,text=True);assert result.returncode!=0 and 'Moodle 4.5 only' in result.stderr
 (target/'version.php').write_text("<?php $branch = '405';\n")
 version=target/'question/type/coderunner/version.php';version.write_text('<?php $plugin->version = 9999999999;\n')
 result=subprocess.run(command,capture_output=True,text=True);assert result.returncode!=0 and 'Unsupported CodeRunner/behaviour' in result.stderr
 assert original.read_text()==unmodified
 print('Bridge round-trip, idempotence, syntax, modified-site and unsupported-version refusal passed.')
