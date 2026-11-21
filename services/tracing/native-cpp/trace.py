"""GDB-side snapshot recorder. Never invokes user functions to inspect values."""
import gdb,json,pathlib,time,copy
req=json.loads(pathlib.Path('request.json').read_text());trace=[];deadline=time.monotonic()+18
identity={};nextid=0;frameids={};nextframe=0;finishes={};lastframes=[];pending=None;allocations={};generations={};bytes_count=0
files={'answer.cpp','calls.cpp'};lastloc=None;owners={};live_owners=set()
live_owner_bases=set();owner_epochs={}
stopped_signal=None;exit_code=None
def stopped(event):
 global stopped_signal
 if isinstance(event,gdb.SignalEvent):stopped_signal=event.stop_signal
def exited(event):
 global exit_code
 exit_code=getattr(event,'exit_code',None)
gdb.events.stop.connect(stopped);gdb.events.exited.connect(exited)

def unavailable(reason):return ['INSTANCE_PPRINT','Unavailable',reason]
def address(value):
 try:return int(value.address)
 except:return None

def snapshot_value(value,heap,depth=0):
 global nextid
 if depth>12 or len(heap)>300:return ['IMPORTED_FAUX_PRIMITIVE','<snapshot limit>']
 try:
  if value.is_optimized_out:return ['IMPORTED_FAUX_PRIMITIVE','<unavailable>']
  typ=value.type.strip_typedefs().unqualified();kind=typ.code
  if kind in (gdb.TYPE_CODE_REF,gdb.TYPE_CODE_RVALUE_REF):return snapshot_value(value.referenced_value(),heap,depth+1)
  if kind==gdb.TYPE_CODE_BOOL:return bool(value)
  if kind in (gdb.TYPE_CODE_INT,gdb.TYPE_CODE_ENUM,gdb.TYPE_CODE_CHAR):
   n=int(value);return n if abs(n)<=9007199254740991 else ['IMPORTED_FAUX_PRIMITIVE',str(n)]
  if kind==gdb.TYPE_CODE_FLT:
   f=float(value);return f if abs(f)!=float('inf') and f==f else ['SPECIAL_FLOAT',str(f)]
  if kind==gdb.TYPE_CODE_PTR:
   ptr=int(value)
   if not ptr:return None
   target=typ.target().strip_typedefs().unqualified()
   if target.code in (gdb.TYPE_CODE_VOID,gdb.TYPE_CODE_FUNC):return ['IMPORTED_FAUX_PRIMITIVE',str(value)]
   if (ptr in owners and owners[ptr] not in live_owners) or allocations.get(ptr)=='expired':return ['IMPORTED_FAUX_PRIMITIVE','<expired reference>']
   if target.code in (gdb.TYPE_CODE_INT,gdb.TYPE_CODE_ENUM,gdb.TYPE_CODE_CHAR,gdb.TYPE_CODE_BOOL,gdb.TYPE_CODE_FLT):
    key=(ptr,str(target),owners.get(ptr,generations.get(ptr,0)))
    if key not in identity:nextid+=1;identity[key]=nextid
    ident=identity[key]
    if str(ident) not in heap:heap[str(ident)]=['HEAP_PRIMITIVE',str(target),snapshot_value(value.dereference(),heap,depth+1)]
    return ['REF',ident]
   return snapshot_value(value.dereference(),heap,depth+1)
  addr=address(value)
  if addr is None:
   # Register-held values have no durable storage identity. Python's id(value)
   # can be reused and must never masquerade as the identity of a C++ object.
   nextid+=1;ident=nextid
  else:
   key=(addr,str(typ),owners.get(addr,generations.get(addr,0)))
   if key not in identity:nextid+=1;identity[key]=nextid
   ident=identity[key]
  if str(ident) in heap:return ['REF',ident]
  display_type=str(typ)+(' (identity unavailable)' if addr is None else '')
  heap[str(ident)]=['INSTANCE',display_type]
  if kind==gdb.TYPE_CODE_ARRAY:
   low,high=typ.range();heap[str(ident)]=['LIST']+[snapshot_value(value[i],heap,depth+1) for i in range(low,min(high+1,low+200))]+([['IMPORTED_FAUX_PRIMITIVE','<truncated array>']] if high-low+1>200 else [])
  elif kind in (gdb.TYPE_CODE_STRUCT,gdb.TYPE_CODE_UNION):
   if kind==gdb.TYPE_CODE_UNION:heap[str(ident)]=unavailable('Union inspection is unsupported')
   elif 'basic_string<' in str(typ):
    try:return value['_M_dataplus']['_M_p'].string(length=min(int(value['_M_string_length']),65536))
    except:heap[str(ident)]=unavailable('String unavailable')
   elif str(typ).startswith('std::vector<') and 'bool,' not in str(typ):
    start=value['_M_impl']['_M_start'];end=value['_M_impl']['_M_finish'];count=min(int(end-start),200)
    heap[str(ident)]=['LIST']+[snapshot_value((start+i).dereference(),heap,depth+1) for i in range(max(0,count))]+([['IMPORTED_FAUX_PRIMITIVE','<truncated vector>']] if int(end-start)>200 else [])
   else:
    fields=[]
    for field in typ.fields()[:80]:
     if field.is_base_class:fields.append((str(field.type),snapshot_value(value.cast(field.type),heap,depth+1)))
     elif field.name and not field.artificial:
      try:fields.append((field.name,snapshot_value(value[field.name],heap,depth+1)))
      except:fields.append((field.name,['IMPORTED_FAUX_PRIMITIVE','<unavailable>']))
    heap[str(ident)]=['INSTANCE',display_type]+[[n,v] for n,v in fields]
  else:heap[str(ident)]=unavailable('Unsupported type '+str(typ))
  return ['REF',ident]
 except (gdb.error,ValueError,OverflowError):return ['IMPORTED_FAUX_PRIMITIVE','<unreadable>']

def location(frame):
 try:
  sal=frame.find_sal();name=pathlib.Path(sal.symtab.filename).name if sal.symtab else ''
  return name,int(sal.line)
 except:return '',0

def collect_owners():
 global nextframe,live_owners,live_owner_bases
 previous=live_owner_bases;live_owner_bases=set();live_owners=set();f=gdb.newest_frame()
 while f:
  name,line=location(f)
  if name in files:
   key=(f.name(),int(f.read_register('sp')))
   if key not in frameids:nextframe+=1;frameids[key]=nextframe
   try:
    block=f.block()
    while block and not block.is_global and not block.is_static:
     for sym in block:
      if sym.is_argument or sym.is_variable:
       try:
        value=sym.value(f);typ=value.type.strip_typedefs()
        if typ.code not in (gdb.TYPE_CODE_PTR,gdb.TYPE_CODE_REF,gdb.TYPE_CODE_RVALUE_REF,gdb.TYPE_CODE_FUNC,gdb.TYPE_CODE_VOID):
         addr=address(value)
         if addr is not None:
          base=('stack',frameids[key],int(block.start),sym.name,sym.line)
          if base not in previous and base not in live_owner_bases:owner_epochs[base]=owner_epochs.get(base,0)+1
          live_owner_bases.add(base);token=(base,owner_epochs[base])
          owners[addr]=token;live_owners.add(token)
       except:pass
     block=block.superblock
   except:pass
  f=f.older()

def frames(heap):
 global nextframe
 out=[];f=gdb.newest_frame()
 while f:
  name,line=location(f)
  if name in files:
   key=(f.name(),int(f.read_register('sp')))
   if key not in frameids:nextframe+=1;frameids[key]=nextframe
   fid=frameids[key];locals={};ordered=[];seen=set()
   try:
    block=f.block()
    while block and not block.is_global and not block.is_static:
     for sym in block:
      if (sym.is_argument or sym.is_variable) and sym.name and sym.name not in seen:
       seen.add(sym.name)
       try:
        locals[sym.name]=['IMPORTED_FAUX_PRIMITIVE','<not yet available on this source line>'] if sym.is_variable and sym.line>=line else snapshot_value(sym.value(f),heap)
        ordered.append(sym.name)
       except:pass
     block=block.superblock
   except gdb.error:pass
   out.append({'frame_id':fid,'func_name':f.name() or '<anonymous>','encoded_locals':locals,'ordered_varnames':ordered,'parent_frame_id_list':[],'is_parent':False,'is_zombie':False,'is_highlighted':not out,'unique_hash':str(fid)})
   if key not in finishes and f.name()!='main':
    try:finishes[key]=Return(f,key)
    except gdb.error:pass
  f=f.older()
 return list(reversed(out))

def output():
 with pathlib.Path('stdout').open('rb') as stream:return stream.read(65536).decode('utf8','replace')
def append(event):
 global bytes_count
 event['stdout']=output();event.setdefault('globals',{});event.setdefault('ordered_globals',[])
 size=len(json.dumps(event).encode());bytes_count+=size
 if len(trace)>=1000 or bytes_count>2000000:raise RuntimeError('Trace exceeds 1000 steps / 2 MiB limit.')
 trace.append(event)

def globals_snapshot(heap):
 result={}
 try:
  block=gdb.newest_frame().block()
  while block:
   if block.is_global or block.is_static:
    for sym in block:
     if sym.is_variable and sym.name and not sym.name.startswith('__'):
      try:
       if sym.symtab and pathlib.Path(sym.symtab.filename).name in ('source.cpp','answer.cpp'):
        result[sym.name]=snapshot_value(sym.value(),heap)
      except:pass
   block=block.superblock
 except:pass
 return result

def record(event='step_line',frame=None):
 global lastframes,lastloc
 collect_owners();heap={};stack=frames(heap)
 if not stack:return
 name,line=location(frame or gdb.newest_frame())
 if name not in files:return
 lastframes=copy.deepcopy(stack);lastloc=(name,line)
 source_line=max(1,line-(1 if name=='calls.cpp' else 0));mapped=source_line if name=='answer.cpp' else req['code'].count('\n')+2+source_line
 globals=globals_snapshot(heap)
 append({'globals':globals,'ordered_globals':list(globals),'event':event,'line':mapped,'source_area':'answer' if name=='answer.cpp' else 'scratch','source_line':source_line,'stack_to_render':stack,'heap':heap})

class Return(gdb.FinishBreakpoint):
 def __init__(self,frame,key):
  super().__init__(frame,internal=True);self.key=key;self.saved=None;self.exceptional=False
  try:self.void=frame.function().type.target().code==gdb.TYPE_CODE_VOID
  except:self.void=False
 def stop(self):
  if self.saved:
   event=copy.deepcopy(self.saved);event['event']='return'
   # The callee's stack storage has expired. Inspect live caller objects and
   # the actual ABI return value; do not present stale callee locals as live.
   collect_owners();heap={};callers=frames(heap);callee=event['stack_to_render'][-1]
   callee['encoded_locals']={};callee['ordered_varnames']=[]
   event['stack_to_render']=callers+[callee];event['heap']=heap
   event['return_kind']='exceptional' if self.exceptional else 'void' if self.void else ('unavailable' if self.return_value is None else 'value')
   if not self.exceptional and self.return_value is not None:
    value=snapshot_value(self.return_value,heap);callee['encoded_locals']['__return__']=value;callee['ordered_varnames'].append('__return__')
   append(event)
  frameids.pop(self.key,None);finishes.pop(self.key,None)
  return True
 def out_of_scope(self):
  if self.saved:
   event=copy.deepcopy(self.saved);event['event']='return';event['return_kind']='exceptional'
   callee=event['stack_to_render'][-1];callee['encoded_locals']={};callee['ordered_varnames']=[]
   event['stack_to_render']=[callee];event['globals']={};event['ordered_globals']=[];event['heap']={}
   append(event)
  frameids.pop(self.key,None);finishes.pop(self.key,None)

def save_returns():
 if trace:
  for bp in list(finishes.values()):
   if bp.is_valid():
    ids=[f['frame_id'] for f in trace[-1].get('stack_to_render',[])]
    fid=frameids.get(bp.key)
    if fid in ids:
     e=copy.deepcopy(trace[-1]);index=ids.index(fid);e['stack_to_render']=e['stack_to_render'][:index+1];bp.saved=e

class Freed(gdb.Breakpoint):
 def stop(self):
  try:
   f=gdb.newest_frame();regs=('rdi','x0');ptr=None
   for reg in regs:
    try:ptr=int(f.read_register(reg));break
    except:pass
   if ptr:allocations[ptr]='expired';generations[ptr]=generations.get(ptr,0)+1
  except:pass
  return False
class AllocReturn(gdb.FinishBreakpoint):
 def stop(self):
  try:
   ptr=int(self.return_value);allocations[ptr]='live'
  except:pass
  return False
class Alloc(gdb.Breakpoint):
 def stop(self):
  try:AllocReturn(gdb.newest_frame(),internal=True)
  except:pass
  return False

class Throw(gdb.Breakpoint):
 def stop(self):
  for bp in finishes.values():bp.exceptional=True
  return False
class Catch(gdb.Breakpoint):
 def stop(self):
  # Frames still present at the handler caught the exception themselves and
  # may subsequently return normally. Unwound frames must never expose ABI garbage.
  frame=gdb.newest_frame()
  while frame:
   try:
    key=(frame.name(),int(frame.read_register('sp')))
    if key in finishes:finishes[key].exceptional=False
   except:pass
   frame=frame.older()
  return False

try:
 gdb.execute('set pagination off');gdb.execute('set confirm off');gdb.execute('set print elements 200');gdb.execute('set breakpoint pending on');gdb.execute('set auto-load python-scripts off');gdb.execute('set debuginfod enabled off');gdb.execute('set inferior-tty /dev/null')
 Throw('__cxa_throw',internal=True);Catch('__cxa_begin_catch',internal=True)
 for spec in ['operator delete(void*)','operator delete[](void*)','operator delete(void*, unsigned long)']:
  try:Freed(spec,internal=True)
  except:pass
 for spec in ['operator new(unsigned long)','operator new[](unsigned long)']:
  try:Alloc(spec,internal=True)
  except:pass
 gdb.execute('rbreak answer.cpp:.',to_string=True);gdb.execute('break main');gdb.execute('run < stdin > stdout 2>&1');gdb.execute('catch syscall read');readbp=gdb.breakpoints()[-1];reading=False
 for i in range(4000):
  if stopped_signal:raise RuntimeError('Program stopped with '+stopped_signal+'.')
  if time.monotonic()>deadline:raise RuntimeError('Execution timed out.')
  if pathlib.Path('stdout').stat().st_size>65536:raise RuntimeError('Output exceeds 64 KiB limit.')
  if not gdb.selected_inferior().threads():break
  if len(gdb.selected_inferior().threads())>1:raise RuntimeError('Live C++ tracing supports single-threaded console programs.')
  frame=gdb.newest_frame();name,line=location(frame)
  # A read catchpoint stops on entry and exit. Input is a finite replay file.
  pc=int(frame.pc());isread=False
  try:
   arch=frame.architecture().name();fd=int(frame.read_register('x0' if 'aarch64' in arch else 'rdi'))
   isread=name not in files and fd==0 and ('read' in (frame.name() or '') or frame.name() is None)
  except:pass
  if isread:
   pid=gdb.selected_inferior().pid
   try:pos=int(next(x.split(':')[1] for x in pathlib.Path('/proc/'+str(pid)+'/fdinfo/0').read_text().splitlines() if x.startswith('pos:')))
   except:pos=-1
   if pos>=pathlib.Path('stdin').stat().st_size and not req.get('inputEof',not req.get('interactiveInput',False)):
    pending={'kind':'line','prompt':'','step':max(0,len(trace)-1)};break
   gdb.execute('continue',to_string=True);continue
  if name in files:
   previous=trace[-1].get('stack_to_render',[]) if trace else [];record('step_line',frame)
   current=trace[-1].get('stack_to_render',[]) if trace else []
   if len(current)>len(previous):trace[-1]['event']='call'
   save_returns();gdb.execute('step',to_string=True)
  else:
   save_returns();gdb.execute('finish',to_string=True)
 else:raise RuntimeError('Execution step limit reached.')
 if exit_code:raise RuntimeError('Program exited with status '+str(exit_code)+'.')
 if trace:trace[-1]['stdout']=output()
except Exception as error:
 if len(trace)>=1000:trace.pop()
 bytes_count=0
 append({'event':'instruction_limit_reached' if 'limit' in str(error) or 'timed out' in str(error) else 'uncaught_exception','exception_msg':str(error),'stack_to_render':[],'heap':{}})
finally:
 result={'code':req['code']+'\n// Scratch (local only)\n'+req.get('scratchCode',''),'trace':trace}
 if pending:result['inputRequest']=pending
 pathlib.Path('result.json').write_text(json.dumps(result))
 try:gdb.execute('kill',to_string=True)
 except:pass
