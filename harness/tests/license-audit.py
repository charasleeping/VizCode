# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (c) 2026 Pui Chin Li
"""Gate failures use synthetic evidence; production findings are never approved here."""
import importlib.util,json,tempfile
from pathlib import Path
spec=importlib.util.spec_from_file_location('audit',Path(__file__).parents[1]/'scripts/license-audit.py');audit=importlib.util.module_from_spec(spec);spec.loader.exec_module(audit)
with tempfile.TemporaryDirectory() as directory:
 root=Path(directory);modules=root/'plugin/vizcode/execution-assets/license-modules';modules.mkdir(parents=True);module=modules/'fixture.json';module.write_text(json.dumps({'packages':[],'files':[]}))
 license=root/'fixture-license.txt';license.write_text('Synthetic test license\n');source=root/'vendor/a.js';source.parent.mkdir();source.write_text('fixture\n')
 def baseline():return {'schema':1,'components':[{'id':'fixture','status':'verified','shipped':True,'source_access':'https://example.invalid/source','patterns':['vendor/*'],'files':audit.snapshot(root,['vendor/*']),'evidence':{'fixture-license.txt':audit.digest(license)}}],'artifacts':audit.snapshot(root,['plugin/vizcode/assets/*','plugin/vizcode/execution-assets/**/*']),'module_manifests':{str(module.relative_to(root)):audit.digest(module)}}
 i=baseline();assert not audit.validate(root,i)
 license.unlink();assert any('license' in e for e in audit.validate(root,i));license.write_text('Synthetic test license\n')
 i=baseline();i['components'][0]['status']='unresolved-permission';assert any('unresolved' in e for e in audit.validate(root,i))
 i=baseline();i['components'][0]['source_access']='';assert any('source evidence' in e for e in audit.validate(root,i))
 policy=root/audit.PRIVATE/'licensing/components.json';policy.parent.mkdir(parents=True);policy.write_text(json.dumps({'compatible_licenses':['MIT']}))
 i=baseline();i['components'][0]['license']='GPL-2.0-only';assert any('compatibility review' in e for e in audit.validate(root,i));policy.unlink()
 i=baseline();module.write_text(json.dumps({'packages':['node_modules/unlisted'],'files':[]}));assert any('Unlisted bundled dependency' in e for e in audit.validate(root,i));module.write_text(json.dumps({'packages':[],'files':[]}))
 i=baseline();source.write_text('modified');assert any('vendored source' in e for e in audit.validate(root,i));source.write_text('fixture\n')
 i=baseline();(root/'plugin/vizcode/execution-assets/unknown.wasm').write_bytes(b'new');assert any('Unlisted distribution asset' in e for e in audit.validate(root,i))
print('License gate: verified fixture, missing license, unresolved rights, unlisted dependency, vendored drift and unlisted binary passed.')
with tempfile.TemporaryDirectory() as directory:
 root=Path(directory);plugin=root/'plugin/vizcode';plugin.mkdir(parents=True)
 for name in ['LICENSE','COPYRIGHT.md','THIRD_PARTY_NOTICES.md','thirdpartylibs.xml']:(plugin/name).write_text('fixture '+name)
 import zipfile
 archive=root/'installer.zip'
 with zipfile.ZipFile(archive,'w') as z:
  for file in plugin.iterdir():z.write(file,'vizcode/'+file.name)
 assert not audit.validate_archive(root,archive)
 (plugin/'THIRD_PARTY_NOTICES.md').write_text('new notice')
 assert any('Stale installer' in e for e in audit.validate_archive(root,archive))
print('Stale installer notice test passed.')
