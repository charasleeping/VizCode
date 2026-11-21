"""Bounded native C++ compilation; all work runs inside an isolated job."""
import json,sys,subprocess,tempfile,pathlib,os
try:
 raw=sys.stdin.buffer.read(650001)
 if len(raw)>650000:raise ValueError('Trace request exceeds limit.')
 req=json.loads(raw);code=req['code'];calls=req.get('scratchCode','')
 if not isinstance(code,str) or len(code)>100000 or not isinstance(calls,str) or len(calls)>100000:raise ValueError('Source exceeds limit.')
 with tempfile.TemporaryDirectory(prefix='vizcpp-') as directory:
  root=pathlib.Path(directory);os.chdir(root)
  source='#include <bits/stdc++.h>\nusing namespace std;\n#line 1 "answer.cpp"\n'+code
  # Ask the compiler, rather than a source regex: main may use macros or trailing return types.
  (root/'source.cpp').write_text(source)
  compiler=['g++','-std=c++17','-g3','-O0','-fno-omit-frame-pointer']
  compiled=subprocess.run(compiler+['-c','source.cpp','-o','source.o'],capture_output=True,text=True,timeout=20)
  if compiled.returncode:raise ValueError(compiled.stderr[:12000])
  symbols=subprocess.run(['nm','--defined-only','source.o'],capture_output=True,text=True,timeout=2)
  program=any(line.split()[-1:] == ['main'] for line in symbols.stdout.splitlines())
  if program and calls.strip():raise ValueError('Automatic calls are disabled for programs containing main.')
  if not program:source+='\n#line 1 "calls.cpp"\nint main(){\n'+calls+'\n}\n'
  (root/'source.cpp').write_text(source)
  (root/'io.cpp').write_text('#include <cstdio>\n#include <iostream>\nstruct V{V(){setvbuf(stdout,nullptr,_IONBF,0);setvbuf(stderr,nullptr,_IONBF,0);std::cout.setf(std::ios::unitbuf);std::cerr.setf(std::ios::unitbuf);}};static V v;\n')
  compile=subprocess.run(compiler+(['source.o'] if program else ['source.cpp'])+['io.cpp','-o','answer'],capture_output=True,text=True,timeout=20)
  if compile.returncode:raise ValueError(compile.stderr[:12000])
  if req.get('diagnose'):raise ValueError('This syntax is not supported by callable discovery.')
  (root/'request.json').write_text(json.dumps(req));(root/'stdin').write_text(req.get('stdin',''));(root/'stdout').touch()
  result=subprocess.run(['gdb','-q','-nx','-batch','-ex','set auto-load safe-path /opt/vizcode','-ex','file answer','-ex','source /opt/vizcode/trace.py'],capture_output=True,text=True,timeout=25)
  if not (root/'result.json').exists():raise ValueError('Native debugging could not complete: '+result.stderr[-1500:])
  print((root/'result.json').read_text())
except subprocess.TimeoutExpired:print(json.dumps({'error':'C++ compilation or tracing timed out.'}))
except Exception as error:print(json.dumps({'error':str(error)[:12000]}))
