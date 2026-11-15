#!/usr/bin/env python3
"""Version-checked, all-or-nothing planning of a small CodeRunner integration bridge."""
import argparse,hashlib,json,pathlib,re,os,sys
p=argparse.ArgumentParser();p.add_argument('--moodle',required=True);p.add_argument('--remove',action='store_true');p.add_argument('--verify',action='store_true');args=p.parse_args()
root=pathlib.Path(args.moodle).resolve();manifest=json.loads(pathlib.Path(__file__).with_name('manifest.json').read_text())
def version(path):
 text=(root/path).read_text();return int(re.search(r'\$plugin->version\s*=\s*(\d+)',text)[1])
try:
 moodle=(root/'version.php').read_text()
 branch=re.search(r"\$branch\s*=\s*['\"]([^'\"]+)",moodle)
 if not branch or branch[1]!='405':raise ValueError('This bridge supports Moodle 4.5 only; no files changed.')
 if version('question/type/coderunner/version.php')!=manifest['coderunner'] or version('question/behaviour/adaptive_adapted_for_coderunner/version.php')!=manifest['behaviour']:raise ValueError('Unsupported CodeRunner/behaviour version; no files changed.')
 jobs=[]
 for item in manifest['patches']:
  path=root/item['path'];data=path.read_bytes();digest=hashlib.sha256(data).hexdigest()
  if digest not in [item['sha256'],item['patched_sha256']]:raise ValueError('Unexpected modifications: '+item['path'])
  if args.verify:
   if digest!=item['patched_sha256']:raise ValueError('Bridge missing: '+item['path'])
   continue
  if args.remove:
   if digest==item['sha256']:continue
   content=data.decode()
   for old,new in reversed(item['replacements']):content=content.replace(new,old)
   if hashlib.sha256(content.encode()).hexdigest()!=item['sha256']:raise ValueError('Cannot restore '+item['path'])
  else:
   if digest==item['patched_sha256']:continue
   content=data.decode()
   for old,new in item['replacements']:
    if content.count(old)!=1:raise ValueError('Invalid bridge anchor')
    content=content.replace(old,new)
  jobs.append((path,content.encode(),data))
 for item in manifest['additions']:
  path=root/item['path'];content=item['content'].encode();old=path.read_bytes() if path.exists() else None
  if old is not None and old!=content:raise ValueError('Unexpected bridge file: '+item['path'])
  if args.verify:
   if old is None:raise ValueError('Missing '+item['path'])
  elif args.remove:
   if old is not None:jobs.append((path,None,old))
  elif old is None:jobs.append((path,content,None))
 # Validation above completes before the first mutation.
 changed=[]
 try:
  for path,content,old in jobs:
   path.parent.mkdir(parents=True,exist_ok=True)
   if old is not None and not args.remove:
    backup=path.with_name(path.name+'.vizcode.bridge-backup')
    if not backup.exists():backup.write_bytes(old)
   if content is None:path.unlink()
   else:
    temp=path.with_name(path.name+'.vizcode.tmp');temp.write_bytes(content);os.replace(temp,path)
   changed.append((path,old))
 except BaseException:
  for path,old in reversed(changed):
   if old is None:path.unlink(missing_ok=True)
   else:path.write_bytes(old)
  raise
 print(('Verified' if args.verify else 'Removed' if args.remove else 'Installed')+' VizCode bridge; '+str(len(jobs))+' file changes.')
except Exception as error:print(str(error),file=sys.stderr);sys.exit(1)
