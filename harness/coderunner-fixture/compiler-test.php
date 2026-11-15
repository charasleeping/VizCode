<?php
// Exercises the real patched CodeRunner sandbox against deterministic Jobe replies.
define('CLI_SCRIPT',true);require('/var/www/html/config.php');
require_once($CFG->libdir.'/questionlib.php');
\core\session\manager::set_user(get_admin());
$directory=make_request_directory();$state=$directory.'/state.json';$router=$directory.'/router.php';
file_put_contents($router,'<?php $file='.var_export($state,true).'; $s=json_decode(file_get_contents($file),true); header("Content-Type: application/json"); if(str_ends_with($_SERVER["REQUEST_URI"],"languages")){echo json_encode([["python3","3"],["cpp","17"]]);return;} $s["count"]++;file_put_contents($file,json_encode($s)); echo json_encode($s["replies"][min($s["count"]-1,count($s["replies"])-1)]);');
$socket=stream_socket_server('tcp://127.0.0.1:0',$errno,$error);$address=stream_socket_get_name($socket,false);fclose($socket);
// This CLI process alone may contact its controlled ephemeral loopback server.
// No site settings are changed and browser requests retain native URL protection.
$CFG->curlsecurityblockedhosts='';$CFG->curlsecurityallowedport=substr(strrchr($address,':'),1);
$pipes=[];$process=proc_open([PHP_BINARY,'-S',$address,$router],[0=>['pipe','r'],1=>['file',$directory.'/server.log','a'],2=>['file',$directory.'/server.log','a']],$pipes);
fclose($pipes[0]);
$originalcache=get_config('qtype_coderunner','enablegradecache');
$pass=['outcome'=>15,'stdout'=>"120\n",'stderr'=>'','cmpinfo'=>'','runtime_ms'=>1.25,'memory_mb'=>12.0];
$python=['outcome'=>11,'stdout'=>'','stderr'=>'','cmpinfo'=>"Segmentation fault\n"];
$gcc=$python;$gcc['cmpinfo']="g++: internal compiler error: Segmentation fault signal terminated program collect2\nPlease submit a full bug report, with preprocessed source (by using -freport-bug).\nSee <file:///usr/share/doc/gcc-15/README.Bugs> for instructions.\n";
function replies($items){global $state;file_put_contents($state,json_encode(['count'=>0,'replies'=>$items]));}
function calls(){global $state;return json_decode(file_get_contents($state),true)['count'];}
function check($condition,$message){if(!$condition)throw new Exception($message);}
try {
 replies([$pass]);for($i=0;$i<50;$i++){if($s=@stream_socket_client('tcp://'.$address,$errno,$error,.1)){fclose($s);break;}usleep(20000);}
 set_config('enablegradecache',1,'qtype_coderunner');
 foreach(['python3'=>$python,'cpp'=>$gcc] as $language=>$crash){
  $sandbox=new qtype_coderunner_jobesandbox();$source='unique-'.random_string(20);$params=['jobeserver'=>$address];
  replies([$crash,$pass]);$GLOBALS['local_vizcode_active']=true;
  $result=$sandbox->execute($source,$language,'',null,$params);
  check($result->result===15 && calls()===2,'Captured crash did not retry exactly once: '.json_encode([$result,calls()]));
  $sandbox->execute($source,$language,'',null,$params);check(calls()===2,'Successful retry did not cache');
  // Simulate a crash cached before VizCode was enabled for the question.
  $source.='-old-cache';replies([$crash,$pass]);$GLOBALS['local_vizcode_active']=false;
  $sandbox->execute($source,$language,'',null,$params);$GLOBALS['local_vizcode_active']=true;
  $result=$sandbox->execute($source,$language,'',null,$params);
  check($result->result===15 && calls()===2,'Old captured crash was not evicted');
  $source.='-persistent';replies([$crash]);
  for($attempt=0;$attempt<2;$attempt++){
   try{$sandbox->execute($source,$language,'',null,$params);throw new Exception('Persistent crash accepted');}
   catch(moodle_exception $e){check($e->errorcode==='gradingunavailable','Wrong service failure');}
   check(calls()===2*($attempt+1),'Persistent crash entered grading cache');
  }
 }
 $q=question_bank::load_question($DB->get_field('question','id',['name'=>'Python factorial']));$q->sandboxparams=json_encode(['jobeserver'=>$address]);
 $usage=question_engine::make_questions_usage_by_activity('core_question_preview',context_system::instance());$usage->set_preferred_behaviour('adaptive');$slot=$usage->add_question($q);$usage->start_all_questions();
 $before=$usage->get_question_attempt($slot)->get_num_steps();replies([$python]);
 try{$usage->process_action($slot,['answer'=>'def print_factorial(n): return n # '.random_string(12),'-submit'=>1]);throw new Exception('Crash grading committed');}
 catch(moodle_exception $e){check($e->errorcode==='gradingunavailable','Wrong grading failure');}
 check($usage->get_question_attempt($slot)->get_num_steps()===$before && calls()===2,'Crash changed native grading history');
 echo "Native Python/GCC retry, cache recovery and persistent-crash no-penalty contracts passed\n";
} finally {
 unset($GLOBALS['local_vizcode_active']);set_config('enablegradecache',$originalcache,'qtype_coderunner');proc_terminate($process);proc_close($process);
}
