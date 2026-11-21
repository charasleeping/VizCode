"""Actual Java 21/JDI regressions in the same restricted job used by the service."""
import subprocess,json
command=['docker','run','--rm','-i','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','384m','--pids-limit','64','--tmpfs','/tmp:rw,nosuid,nodev,size=64m,mode=1777','vizcode-java-job:21']
def run(code,calls='',stdin='',eof=False):
 p=subprocess.run(command,input=json.dumps({'code':code,'scratchCode':calls,'stdin':stdin,'inputEof':eof}),text=True,capture_output=True,timeout=50)
 assert p.returncode==0,p.stderr
 result=json.loads(p.stdout);return result
r=run('static int fact(int n){return n<2?1:n*fact(n-1);}','System.out.println(VizAnswer.fact(5));')
assert not r.get('error'),r
assert r['trace'][-1]['stdout']=='120\n',r
assert max(len(t.get('stack_to_render',[])) for t in r['trace'])>=5
assert any(t.get('source_area')=='scratch' for t in r['trace'])
print('Method fragments, recursive frames, generated-call mappings and output passed.')
r=run('class Box { int value=7; } public class Main { public static void main(String[] args){ Box b=new Box(); int[] a={1,2}; System.out.println(b.value+a[1]); } }')
assert not r.get('error'),r
assert r['trace'][-1]['stdout']=='9\n',r
assert any(t.get('heap') for t in r['trace'])
print('Complete programs, objects and arrays passed.')
code='import java.util.*; public class Main { public static void main(String[] args){ Scanner s=new Scanner(System.in); int a=s.nextInt(); int b=s.nextInt(); System.out.println(a+b); } }'
r=run(code);assert r.get('inputRequest'),r
r=run(code,stdin='5\n');assert r.get('inputRequest'),r
r=run(code,stdin='5\n7\n');assert r['trace'][-1]['stdout']=='12\n',r
r=run(code,stdin='5 7\n');assert r['trace'][-1]['stdout']=='12\n',r
code='import java.util.*; public class Main { public static void main(String[] args){ System.out.println(new Scanner(System.in).nextLine().length()); } }'
r=run(code,stdin='\n');assert r['trace'][-1]['stdout']=='0\n',r
code='public class Main { public static void main(String[] args) throws Exception { System.out.print(new String(System.in.readAllBytes())); } }'
r=run(code);assert r.get('inputRequest',{}).get('kind')=='all',r
r=run(code,stdin='hello\nworld',eof=True);assert r['trace'][-1]['stdout']=='hello\nworld',r
print('Successive reads, newline/space input, blank lines and whole-input replay passed.')
r=run('static int broken( {');assert 'error' in r and 'line' in r['error'],r
r=run('public class Main { public static void main(String[] args){ throw new IllegalStateException("test"); } }')
assert any('IllegalStateException' in t.get('exception_msg','') for t in r.get('trace',[])),r
r=run('public class Main { public static void main(String[] args){ Integer.parseInt("invalid"); } }')
assert any('NumberFormatException' in t.get('exception_msg','') and t.get('source_line')==1 for t in r.get('trace',[])),r
r=run('public class Main { public static void main(String[] args){ try { Integer.parseInt("invalid"); } catch(NumberFormatException e) { System.out.println("caught"); } } }')
assert r['trace'][-1]['stdout']=='caught\n',r
r=run('public class Main { public static void main(String[] args) throws Exception { new Thread(()->{}).start(); } }');assert 'single-threaded' in r.get('error',''),r
r=run('public class Main { public static void main(String[] args){ while(true){} } }');assert r.get('error') or any(t.get('event')=='instruction_limit_reached' for t in r['trace']),r
print('Compiler/runtime diagnostics, unsupported threads and execution limits passed.')

r=run('public class Main { public static void main(String[] args){ long value=Long.MAX_VALUE; System.out.println(value); } }')
assert r['trace'][-1]['stdout']=='9223372036854775807\n',r
assert '9223372036854775807' in json.dumps(r) and 'IMPORTED_FAUX_PRIMITIVE' in json.dumps(r),r
print('Large Java long values retain exact digits in memory snapshots and output.')
r=run('class Box { int value=7; Box next; } public class Main { static Box same(Box x) { x.value=9; return x; } public static void main(String[] args) { Box b=new Box(); b.next=b; Box alias=same(b); System.out.println(alias.value); } }')
returns=[t for t in r['trace'] if t.get('event')=='return' and any(f['func_name'].endswith('.same') for f in t.get('stack_to_render',[]))]
assert returns,r
for t in returns:
 frame=next(f for f in t['stack_to_render'] if f['func_name'].endswith('.same'));locals=frame['encoded_locals']
 assert locals['__return__']==locals['x'],t
 node=t['heap'][str(locals['x'][1])];assert ['value',9] in node and ['next',locals['x']] in node,t
print('Java return-object mutation, aliases and self-reference share one snapshot identity map.')
