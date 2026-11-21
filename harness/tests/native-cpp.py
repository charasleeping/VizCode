"""Native adapter contract: values are read by GDB, never by rewritten returns."""
import subprocess,json,os
command=['docker','run','--rm','-i','--network','none','--read-only','--cap-drop','ALL','--cap-add','SYS_PTRACE','--security-opt','no-new-privileges','--memory','512m','--pids-limit','64','--tmpfs','/tmp:rw,exec,nosuid,nodev,size=128m,mode=1777','vizcode-cpp-job:1']
def run(code,calls='',stdin='',eof=True):
 p=subprocess.run(command,input=json.dumps({'code':code,'scratchCode':calls,'stdin':stdin,'inputEof':eof,'interactiveInput':True}),text=True,capture_output=True,timeout=50)
 assert p.returncode==0,p.stderr
 r=json.loads(p.stdout);assert not r.get('error'),r
 return r
r=run('int fact(int n){return n<2?1:n*fact(n-1);}','fact(5);')
assert [t['stack_to_render'][-1]['encoded_locals'].get('__return__') for t in r['trace'] if t['event']=='return']==[1,2,6,24,120],r
print('One-line recursive return values passed')
r=run('struct Box { int value; };\nint main(){\n Box b{7};\n Box* p=&b;\n Box* q=&b;\n b.value=9;\n int done=1;\n}')
matched=False
for t in r['trace']:
 for f in t.get('stack_to_render',[]):
  v=f['encoded_locals']
  if all(k in v for k in ['b','p','q','done']) and v['done']==1:
   assert v['b']==v['p']==v['q'],v
   assert ['value',9] in t['heap'][str(v['b'][1])],t
   matched=True
assert matched,r
print('Stack object mutation and aliases passed')
r=run('int main(){int a;std::cin>>a;std::cout<<a*2<<"\\n";}',stdin='5\n')
assert r['trace'][-1]['stdout']=='10\n',r
r=run('int main(){int a;std::cin>>a;std::cout<<a;}',eof=False)
assert r.get('inputRequest'),r
print('Input and bounded input pauses passed')
r=run('struct Box{int value;Box* next;};\nint main(){\nBox* p=new Box{7,nullptr};\nBox* q=p;\np->next=p;\np->value=9;\nint done=1;\ndelete p;\n}')
assert any(f.get('encoded_locals',{}).get('p')==f.get('encoded_locals',{}).get('q') and f.get('encoded_locals',{}).get('done')==1 for t in r['trace'] for f in t.get('stack_to_render',[])),r
assert any('<expired reference>' in json.dumps(t) for t in r['trace']),r
print('Heap objects, aliases, cycles and expired pointers passed')
r=run('struct Box{int value;};\nBox make(){return Box{42};}', 'make();')
ret=[t for t in r['trace'] if t['event']=='return']
assert ret and '__return__' in ret[-1]['stack_to_render'][-1]['encoded_locals'],r
assert any(['value',42] in v for t in ret for v in t['heap'].values()),r
r=run('int global=3;\nint& same(){return global;}', 'same();')
assert any('__return__' in f.get('encoded_locals',{}) for t in r['trace'] if t['event']=='return' for f in t['stack_to_render']),r
print('Object and reference returns passed')
r=run('int main(){std::vector<int> v{1,2};\nv.push_back(3);\nstd::cout<<v.size()<<"\\n";}')
assert r['trace'][-1]['stdout']=='3\n',r
assert any(v==['LIST',1,2,3] for t in r['trace'] for v in t.get('heap',{}).values()),r
print('Supported collection snapshots passed')
r=run('int main(){try{throw std::runtime_error("expected");}catch(const std::exception&e){std::cout<<e.what()<<"\\n";}}')
assert r['trace'][-1]['stdout']=='expected\n',r
r=run('int global=4;\nint main(){std::cout<<global<<"\\n";}')
assert r['trace'][-1]['stdout']=='4\n',r
assert any(t.get('globals',{}).get('global')==4 for t in r['trace']),r
r=run('template<class T>T twice(T x){return x+x;}\nint main(){std::cout<<twice(3)<<"\\n";}')
assert r['trace'][-1]['stdout']=='6\n',r
r=run('int main(){int x=3;auto f=[x](int y){return x+y;};std::cout<<f(4)<<"\\n";}')
assert r['trace'][-1]['stdout']=='7\n',r
r=run('struct Box{static int copies;int value;Box(int v):value(v){}Box(const Box& o):value(o.value){++copies;}Box(Box&& o):value(o.value){++copies;}};int Box::copies=0;\nBox make(){return Box{42};}\nint main(){Box b=make();std::cout<<b.value<<":"<<Box::copies<<"\\n";}')
assert r['trace'][-1]['stdout']=='42:0\n',r
r=run('std::unique_ptr<int> make(){return std::make_unique<int>(42);}\nint main(){auto p=make();std::cout<<*p<<"\\n";}')
assert r['trace'][-1]['stdout']=='42\n',r
assert any('__return__' in f.get('encoded_locals',{}) for t in r['trace'] for f in t.get('stack_to_render',[])),r
print('Exceptions, globals, templates, lambdas, copy elision and move-only returns passed')
r=run('struct Box{int value;};\nint main(){\n {Box a{1};\n std::cout<<a.value;\n }\n {Box b{2};\n std::cout<<b.value;\n }\n}')
ids={}
for t in r['trace']:
 for f in t.get('stack_to_render',[]):
  for name in ['a','b']:
   value=f.get('encoded_locals',{}).get(name)
   if isinstance(value,list) and value[0]=='REF':ids[name]=value[1]
assert len(ids)==2 and ids['a']!=ids['b'],r
r=run('struct Box{int value;};\nint main(){\n Box b{7};\n const Box* p=&b;\n Box* q=&b;\n int done=1;\n std::cout<<p->value;\n}')
assert any(v.get('b')==v.get('p')==v.get('q') and isinstance(v.get('b'),list) and v['b'][0]=='REF' for t in r['trace'] for f in t.get('stack_to_render',[]) for v in [f['encoded_locals']] if 'p' in v and 'q' in v),r
print('Stack lifetime identities and const-qualified object aliases passed')
r=run('int initial(){return 7;}\nint global=initial();\nint main(){std::cout<<global<<"\\n";}')
assert r['trace'][-1]['stdout']=='7\n',r
assert any(f['func_name']=='initial' for t in r['trace'] for f in t.get('stack_to_render',[])),r
print('User function calls during global initialization are traced')
r=run('#define ENTRY main\nauto ENTRY() -> int {std::cout<<42<<"\\n";}')
assert r['trace'][-1]['stdout']=='42\n',r
print('Compiler-based complete-program detection handles macros and trailing return types')
r=run('int main(){raise(SIGSEGV);}')
assert any('SIGSEGV' in t.get('exception_msg','') for t in r['trace']),r
r=run('int fail(){throw std::runtime_error("expected");}\nint main(){try{fail();}catch(...){std::cout<<"caught\\n";}}')
assert r['trace'][-1]['stdout']=='caught\n',r
assert any(t.get('return_kind')=='exceptional' for t in r['trace']),r
r=run('int recover(){try{throw 1;}catch(...){return 5;}}','recover();')
assert any(t.get('return_kind')=='value' and t['stack_to_render'][-1]['encoded_locals'].get('__return__')==5 for t in r['trace']),r
print('Fatal signals and exceptional function exits are explicit')
r=run('struct Box{int value;};\nint main(){\n for(int i=0;i<2;i++){\n  Box b{i};\n  std::cout<<b.value;\n }\n}')
ids={}
for t in r['trace']:
 for f in t.get('stack_to_render',[]):
  b=f['encoded_locals'].get('b')
  if isinstance(b,list) and b[0]=='REF':
   for field in t['heap'].get(str(b[1]),[]):
    if isinstance(field,list) and field[0]=='value':ids[field[1]]=b[1]
assert len(ids)==2 and ids[0]!=ids[1],r
print('Repeated block lifetimes receive distinct object identities')
