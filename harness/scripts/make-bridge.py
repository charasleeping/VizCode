"""Regenerate the reviewed bridge from the exact pinned upstream checkout."""
from pathlib import Path
import hashlib,json
root=Path(__file__).resolve().parents[2];up=root/'harness/upstream-coderunner';out=root/'plugin/vizcode/bridge'
patches=[]
def patch(path,replacements,source=up,prefix="question/type/coderunner/"):
 before=(source/path).read_text();after=before
 for old,new in replacements:
  if after.count(old)!=1:raise RuntimeError(f'Unexpected anchor in {path}: {old[:80]}')
  after=after.replace(old,new)
 patches.append({'path':prefix+path,'sha256':hashlib.sha256(before.encode()).hexdigest(),
 'patched_sha256':hashlib.sha256(after.encode()).hexdigest(),'replacements':replacements})
patch('question.php',[
 ('    public function grade_response(array $response, bool $isprecheck = false, $isvalidationrun = false, $usecache = true) {',
  '''    public function grade_response(array $response, bool $isprecheck = false, $isvalidationrun = false, $usecache = true) {
        $previous = $GLOBALS['local_vizcode_active'] ?? false;
        $GLOBALS['local_vizcode_active'] = class_exists('\\local_vizcode\\integration') && \\local_vizcode\\integration::enabled($this);
        try { return $this->vizcode_original_grade_response($response, $isprecheck, $isvalidationrun, $usecache); }
        finally { $GLOBALS['local_vizcode_active'] = $previous; }
    }
    private function vizcode_original_grade_response(array $response, bool $isprecheck = false, $isvalidationrun = false, $usecache = true) {''')])
patch('renderer.php',[
 ("        $qtext .= html_writer::tag('textarea', s($currentanswer), $taattributes);",'''        if (class_exists('\\local_vizcode\\integration') && \\local_vizcode\\integration::enabled($question)) {
            $taattributes['data-vizcode'] = \\local_vizcode\\integration::configuration($qa, $options);
        }
        $qtext .= html_writer::tag('textarea', s($currentanswer), $taattributes);'''),
 ('        return format_text($fb, FORMAT_HTML, $formatoptions);', '''        $formatted = format_text($fb, FORMAT_HTML, $formatoptions);
        if (class_exists('\\local_vizcode\\integration') && \\local_vizcode\\integration::enabled($q)) return \\local_vizcode\\integration::feedback($qa, $formatted);
        return $formatted;''')])
patch('classes/jobesandbox.php',[
 ("            $runresult = $cache->get($key);  // Unserializes the returned value :) false if not found.",
  """            $runresult = $cache->get($key);  // Unserializes the returned value :) false if not found.
            if (!empty($GLOBALS['local_vizcode_active']) && $runresult && \\local_vizcode\\compiler_recovery::is_crash([
                    'outcome' => $runresult['result'] ?? null, 'cmpinfo' => $runresult['cmpinfo'] ?? ''])) {
                $cache->delete($key); $runresult = false;
            }"""),
 ("        $this->response = $response;\n        return $returncode;",'''        if (!empty($GLOBALS['local_vizcode_active']) && $returncode === 200 && is_object($response)) {
            $response = (object)\\local_vizcode\\compiler_recovery::execute(function() use (&$response, &$returncode, $job, $curl) {
                if ($response !== null) { $value = (array)$response; $response = null; return $value; }
                [$returncode, $again] = $this->http_request('runs', self::HTTP_POST, $job, $curl);
                if ($returncode !== 200 || !is_object($again)) throw new moodle_exception('gradingunavailable', 'local_vizcode');
                return (array)$again;
            });
        }
        $this->response = $response;
        return $returncode;'''),
 ("                $runresult['cmpinfo'] = $this->response->cmpinfo;",'''                $runresult['cmpinfo'] = $this->response->cmpinfo;
                foreach (['runtime_ms', 'memory_mb'] as $metric) {
                    if (isset($this->response->$metric)) $runresult[$metric] = $this->response->$metric;
                }'''),
 ('        return (object) $runresult;', '''        if (!empty($GLOBALS['local_vizcode_active'])) \\local_vizcode\\integration::measurement((object)$runresult);
        return (object) $runresult;''')])
patch('behaviour.php',[
 ('class qbehaviour_adaptive_adapted_for_coderunner extends qbehaviour_adaptive {',
  'class qbehaviour_adaptive_adapted_for_coderunner_base extends qbehaviour_adaptive {')
],source=root/'harness/upstream-behaviour',prefix='question/behaviour/adaptive_adapted_for_coderunner/')
# Keep Moodle's persisted behaviour component name native on new and restored attempts.
footer="""\n// VizCode bridge: optional response recording; scoring stays in the native base.\nif (class_exists('\\local_vizcode\\best_behaviour')) {\n    class qbehaviour_adaptive_adapted_for_coderunner extends \\local_vizcode\\best_behaviour {}\n} else {\n    class qbehaviour_adaptive_adapted_for_coderunner extends qbehaviour_adaptive_adapted_for_coderunner_base {}\n}\n"""
item=patches[-1]
original=(root/'harness/upstream-behaviour/behaviour.php').read_text()
last=original[original.rfind('\n}'):]
item['replacements'].append([last,last+footer])
patched=original
for old,new in item['replacements']:patched=patched.replace(old,new)
item['patched_sha256']=hashlib.sha256(patched.encode()).hexdigest()
proxy="define(['local_vizcode/ui'], function(UI) { return UI; });\n"
adds=[{'path':'question/type/coderunner/amd/src/ui_vizcode.js','content':proxy},
 {'path':'question/type/coderunner/amd/build/ui_vizcode.min.js','content':proxy.replace('define([','define("qtype_coderunner/ui_vizcode",[')},
 {'path':'question/type/coderunner/amd/src/ui_vizcode.json','content':json.dumps({'description':'VizCode editor and debugger','parameters':{}},indent=2)+'\n'}]
(out/'manifest.json').write_text(json.dumps({'version':1,'coderunner':2026110201,'behaviour':2026092401,
 'patches':patches,'additions':adds},indent=2)+'\n')
