<?php
define('CLI_SCRIPT',true);require('/var/www/html/config.php');$CFG->debug=DEBUG_DEVELOPER;$CFG->debugdisplay=1;
require_once($CFG->libdir.'/questionlib.php');require_once($CFG->dirroot.'/question/type/coderunner/questiontype.php');
\core\session\manager::set_user(get_admin());
require_once(__DIR__.'/object-demos.php');
function ensure($value,$message){if(!$value)throw new Exception($message);}
foreach(['Python factorial','C++ object tracing','Java object tracing'] as $name){
 $id=vizcode_demo_question_id($name);$q=question_bank::load_question($id);$q->start_attempt(new question_attempt_step(),1);
 $GLOBALS['local_vizcode_metrics']=[];[$fraction,$state]=$q->grade_response(['answer'=>$q->answer,'language'=>$q->language]);
 ensure((float)$fraction===1.0,$name.' failed: '.json_encode([$fraction,$state,$q->answer]));echo $name." native grading passed\n";
}
$q=question_bank::load_question($DB->get_field('question','id',['name'=>'Python factorial']));
$q->penaltyregime='0, 10, 20, ...';$good=$q->answer."\n# student check";$bad='def print_factorial(n): return 0';
function make_usage($q){$u=question_engine::make_questions_usage_by_activity('core_question_preview',context_system::instance());$u->set_preferred_behaviour('adaptive');$slot=$u->add_question(clone $q);$u->start_all_questions();return [$u,$slot];}
foreach([
 [$good,$bad,$good],[$bad,$good,$good],[$good,$good."\n# later",$good."\n# later"]
] as [$first,$second,$winner]){
 [$u,$slot]=make_usage($q);
 $u->process_action($slot,['answer'=>$first,'language'=>'python3','-submit'=>1]);
 $firstscore=$u->get_question_attempt($slot)->get_fraction();
 question_engine::save_questions_usage_by_activity($u);$usageid=$u->get_id();$u=question_engine::load_questions_usage_by_activity($usageid);
 ensure(get_class($u->get_question_attempt($slot)->get_behaviour(true))==='qbehaviour_adaptive_adapted_for_coderunner','Native behaviour component did not restore');
 $u->process_action($slot,['answer'=>$second,'language'=>'python3','-submit'=>1]);
 $u->finish_all_questions();$qa=$u->get_question_attempt($slot);
 // Equal raw scores with a later penalty are not equal earned scores.
$expected=$winner;
 ensure($qa->get_last_qt_var('answer')===$expected,'Best source mismatch: '.$qa->get_last_qt_var('answer'));
 question_engine::save_questions_usage_by_activity($u);$restored=question_engine::load_questions_usage_by_activity($usageid);
 ensure($restored->get_question_attempt($slot)->get_last_qt_var('answer')===$expected,'Best source did not persist');
 question_engine::delete_questions_usage_by_activity($usageid);
}
echo "Native penalties, correct/incorrect sequences, best-source finish and persisted attempts passed\n";
[$u,$slot]=make_usage($q);$u->process_action($slot,['answer'=>$good,'language'=>'python3','-submit'=>1]);
$u->process_action($slot,['answer'=>$bad,'language'=>'python3']);$u->finish_all_questions();
ensure($u->get_question_attempt($slot)->get_last_qt_var('answer')===$good,'Unchecked final edit replaced best answer');
echo "Unchecked final changes retain native grading and best source\n";
$q->uiplugin='ace';[$u,$slot]=make_usage($q);$u->process_action($slot,['answer'=>$good,'language'=>'python3','-submit'=>1]);
ensure(!$u->get_question_attempt($slot)->get_last_behaviour_var('_vizcode_best'),'Ordinary CodeRunner question received VizCode snapshots');
echo "Ordinary CodeRunner behaviour remains unchanged\n";
$q=question_bank::load_question($DB->get_field('question','id',['name'=>'Python factorial']));$q->penaltyregime='0';$q->precheck=2;
[$u,$slot]=make_usage($q);$u->process_action($slot,['answer'=>$good,'language'=>'python3','-precheck'=>1]);
ensure(!$u->get_question_attempt($slot)->get_last_behaviour_var('_vizcode_best'),'Precheck became a best answer');
$u->process_action($slot,['answer'=>$good,'language'=>'python3','-submit'=>1]);$tries=$u->get_question_attempt($slot)->get_last_behaviour_var('_try');
$u->process_action($slot,['answer'=>$good,'language'=>'python3','-submit'=>1]);ensure($u->get_question_attempt($slot)->get_last_behaviour_var('_try')===$tries,'Unchanged Check created a penalty');
$u->process_action($slot,['answer'=>$good."\n# equal earned",'language'=>'python3','-submit'=>1]);$u->finish_all_questions();
ensure(str_ends_with($u->get_question_attempt($slot)->get_last_qt_var('answer'),'# equal earned'),'Latest equal earned score did not win');
echo "Prechecks, unchanged Checks and latest equal earned scores passed\n";
[$u,$slot]=make_usage($q);$u->process_action($slot,['answer'=>$good,'language'=>'python3','-submit'=>1]);
$tries=$u->get_question_attempt($slot)->get_last_behaviour_var('_try');
$u->process_action($slot,['answer'=>$bad,'language'=>'python3']);
$u->process_action($slot,['answer'=>$good,'language'=>'python3','-submit'=>1]);$qa=$u->get_question_attempt($slot);
ensure($qa->get_state()===question_state::$complete,'Cached Check did not restore completion after an intervening draft');
ensure($qa->get_last_qt_var('answer')===$good,'Cached Check left the intervening draft active');
ensure($qa->get_last_behaviour_var('_try')===$tries,'Cached Check added another try/penalty');
echo "Restoring a previously checked answer restores its completion and feedback without another try\n";
$q->precheck=0;$q->allornothing=0;$second=clone $q->testcases[0];$second->testcode='print(print_factorial(3))';$second->expected='6';$second->useasexample=0;$q->testcases[]=$second;
[$u,$slot]=make_usage($q);$u->process_action($slot,['answer'=>$good,'language'=>'python3','-submit'=>1]);
$u->process_action($slot,['answer'=>'def print_factorial(n): return 120','language'=>'python3','-submit'=>1]);$u->finish_all_questions();
ensure($u->get_question_attempt($slot)->get_last_qt_var('answer')===$good,'Partial answer replaced the native best response');
echo "Native per-test partial credit and correct-to-partial best-source submission passed\n";
$q->testcases[0]->mark=1.00001;$q->testcases[1]->mark=1.0;
[$u,$slot]=make_usage($q);$slightlybetter='def print_factorial(n): return 120 if n==5 else 0';
$u->process_action($slot,['answer'=>$slightlybetter,'language'=>'python3','-submit'=>1]);
$u->process_action($slot,['answer'=>'def print_factorial(n): return 6 if n==3 else 0','language'=>'python3','-submit'=>1]);$u->finish_all_questions();
ensure($u->get_question_attempt($slot)->get_last_qt_var('answer')===$slightlybetter,'A lower score within native correctness tolerance replaced the best source');
echo "Exact native earned-score ordering retains the truly highest answer
";
$q->sandboxparams='{"jobeserver":"127.0.0.1:9"}';[$u,$slot]=make_usage($q);$before=$u->get_question_attempt($slot)->get_num_steps();
try{$u->process_action($slot,['answer'=>$good."\n# uncached outage",'language'=>'python3','-submit'=>1]);throw new Exception('Outage committed');}
catch(moodle_exception $e){ensure($e->errorcode==='gradingunavailable','Unexpected outage error');}
ensure($u->get_question_attempt($slot)->get_num_steps()===$before,'Outage added an attempt step');
echo "Grading outage commits no grading step, best snapshot or penalty\n";
$q=question_bank::load_question($DB->get_field('question','id',['name'=>'VizCode multilingual program']));
$q->penaltyregime='0';[$u,$slot]=make_usage($q);
$sources=[['python3','print(120) # checked'],['cpp','#include <iostream>' . "\n" . 'int main(){std::cout<<120<<"\n";}'],['java','public class Main {public static void main(String[] args){System.out.println(120);}}']];
foreach($sources as [$language,$answer]){$u->process_action($slot,compact('language','answer')+['-submit'=>1]);ensure((float)$u->get_question_attempt($slot)->get_fraction()===1.0,'Multilingual native grading failed for '.$language);}
$u->process_action($slot,['language'=>'python3','answer'=>'print(0)']);$u->finish_all_questions();
ensure($u->get_question_attempt($slot)->get_last_qt_var('language')==='java','Cross-language best language changed');
ensure($u->get_question_attempt($slot)->get_last_qt_var('answer')===$sources[2][1],'Cross-language best source changed');
echo "Native multilingual grading across three languages and cross-language best submission passed\n";
