import json,subprocess
r=subprocess.run(['docker','run','--rm','-i','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','512m','--pids-limit','64','--tmpfs','/tmp:rw,exec,nosuid,nodev,size=128m,mode=1777','vizcode-debugpy-job:1'],input=json.dumps({'code':'x = 3\nx += 4\nprint(x)','scratchCode':'','stdin':''}),text=True,capture_output=True,timeout=45)
assert r.returncode==0,r.stderr
result=json.loads(r.stdout);assert not result.get('error'),result
assert result['version']=='1.0' and result['events'],result
assert result['events'][-1]['stdout']=='7\n',result
assert any(v['name']=='x' and v['value'].get('value')==7 for e in result['events'] for f in e['frames'] for v in f['locals']),result
print('Installed debugpy DAP profile: stepping, locals and stdout passed without Internet access')
r=subprocess.run(['docker','run','--rm','-i','--network','none','--read-only','--cap-drop','ALL','--memory','512m','vizcode-debugpy-job:1'],input=json.dumps({'code':'raise RuntimeError("must not execute")','scratchCode':'','stdin':'','diagnose':True}),text=True,capture_output=True,timeout=10)
assert 'Non-executing diagnostics/discovery are unsupported' in json.loads(r.stdout).get('error',''),r.stdout
print('Unsupported diagnostics are rejected without launching student code')
