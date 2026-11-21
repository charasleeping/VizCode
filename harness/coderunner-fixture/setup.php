<?php
define('CLI_SCRIPT',true);require('/var/www/html/config.php');
$CFG->debug=DEBUG_DEVELOPER;$CFG->debugdisplay=1;
require_once($CFG->libdir.'/questionlib.php');
require_once($CFG->dirroot.'/user/lib.php');require_once($CFG->dirroot.'/course/lib.php');require_once($CFG->libdir.'/enrollib.php');require_once($CFG->dirroot.'/question/type/coderunner/questiontype.php');
set_config('jobe_host','jobe','qtype_coderunner');set_config('jobe_apikey','','qtype_coderunner');
set_config('enablegradecache',1,'qtype_coderunner');set_config('brokerurl','http://127.0.0.1:4102/live/broker.html','local_vizcode');
if(getenv('VIZCODE_JAVA_KEY'))set_config('javakey',getenv('VIZCODE_JAVA_KEY'),'local_vizcode');
set_config('tracekey',getenv('VIZCODE_TRACE_KEY')?:getenv('VIZCODE_JAVA_KEY'),'local_vizcode');
$DB->set_field('tool_usertours_tours','enabled',0);
set_config('passwordpolicy',0);set_config('enablecompletion',0);
$admin=get_admin();\core\session\manager::set_user($admin);
$course=$DB->get_record('course',['shortname'=>'VIZCODE_CR']);if(!$course)$course=create_course((object)['fullname'=>'VizCode CodeRunner','shortname'=>'VIZCODE_CR','category'=>1,'format'=>'topics','numsections'=>1]);
$context=context_course::instance($course->id);
$enrol=enrol_get_plugin('manual');$instances=enrol_get_instances($course->id,true);$instance=reset($instances);
if(!$instance){$enrol->add_instance($course);$instances=enrol_get_instances($course->id,true);$instance=reset($instances);}
// Demo accounts use non-deliverable addresses; enrol them without welcome mail.
$instance->customint1=ENROL_DO_NOT_SEND_EMAIL;
foreach([['student','LocalStudentOnly1!','student'],['student_chromium','LocalStudentOnly1!','student'],['student_firefox','LocalStudentOnly1!','student'],['student_webkit','LocalStudentOnly1!','student'],['teacher','LocalTeacherOnly1!','editingteacher']] as [$name,$password,$role]){
 $user=$DB->get_record('user',['username'=>$name]);if(!$user){$user=(object)['username'=>$name,'password'=>$password,'firstname'=>ucfirst($name),'lastname'=>'VizCode','email'=>$name.'@example.invalid','auth'=>'manual','confirmed'=>1,'mnethostid'=>$CFG->mnet_localhost_id];$user->id=user_create_user($user);}
 $enrol->enrol_user($instance,$user->id,$DB->get_field('role','id',['shortname'=>$role]));
}
$category=question_get_default_category($context->id);
if(!$category){$top=question_get_top_category($context->id,true);$category=(object)['contextid'=>$context->id,'parent'=>$top->id,'name'=>'VizCode','info'=>'','infoformat'=>FORMAT_HTML,'stamp'=>make_unique_id_code(),'sortorder'=>1];$category->id=$DB->insert_record('question_categories',$category);}
set_config('curlsecurityblockedhosts','');
$qtype=question_bank::get_qtype('coderunner');
$definitions=[
 ['Python factorial','python3','def print_factorial(n):\n    return 1 if n < 2 else n * print_factorial(n - 1)\n','print(print_factorial(5))','120'],
 ['C++ factorial','cpp_function','int print_factorial(int n) { return n < 2 ? 1 : n * print_factorial(n-1); }','cout << print_factorial(5) << endl;','120'],
 ['Java factorial','java_method','static int print_factorial(int n) { return n < 2 ? 1 : n * print_factorial(n-1); }','System.out.println(print_factorial(5));','120']
];
foreach($definitions as [$name,$type,$preload,$test,$expected]){
 if($existing=$DB->get_record('question',['name'=>$name])){
  $DB->set_field('question_coderunner_options','templateparams','{}',['questionid'=>$existing->id]);question_bank::notify_question_edited($existing->id);continue;
 }
 $form=(object)['category'=>$category->id.','.$context->id,'context'=>$context,'name'=>$name,'questiontext'=>['text'=>'Define a function print_factorial that returns the factorial of its argument.','format'=>FORMAT_HTML],
 'generalfeedback'=>['text'=>'','format'=>FORMAT_HTML],'defaultmark'=>1,'penalty'=>0,'qtype'=>'coderunner','coderunnertype'=>$type,'prototypetype'=>0,'allornothing'=>1,'penaltyregime'=>'0, 10, 20, ...',
 'answer'=>str_replace('\\n',"\n",$preload),'answerpreload'=>str_replace('\\n',"\n",$preload),'templateparams'=>'{}','templateparamslang'=>'twig','customise'=>1,'uiplugin'=>'vizcode','uiparameters'=>'{}','validateonsave'=>0,'testcode'=>[$test],'stdin'=>[''],'expected'=>[$expected],
 'extra'=>[''],'useasexample'=>[1],'display'=>['SHOW'],'mark'=>[1],'hiderestiffail'=>[0],'ordering'=>[0]];
 $question=(object)['qtype'=>'coderunner','category'=>$category->id,'contextid'=>$context->id];$saved=$qtype->save_question($question,$form);echo 'Created '.$name.' question '.$saved->id."\n";
}
echo 'CodeRunner fixture ready: http://localhost:4115/course/view.php?id='.$course->id."\n";

require_once($CFG->libdir.'/testing/generator/lib.php');
$generator=new testing_data_generator();
$quiz=$DB->get_record('quiz',['course'=>$course->id,'name'=>'VizCode CodeRunner quiz']);
if(!$quiz){
 $quiz=$generator->get_plugin_generator('mod_quiz')->create_instance(['course'=>$course->id,'name'=>'VizCode CodeRunner quiz','preferredbehaviour'=>'adaptive','questionsperpage'=>0]);
 foreach($definitions as [$name]){$q=$DB->get_record('question',['qtype'=>'coderunner','name'=>$name]);quiz_add_quiz_question($q->id,$quiz);}
}
\mod_quiz\quiz_settings::create($quiz->id)->get_grade_calculator()->recompute_quiz_sumgrades();
$cm=get_coursemodule_from_instance('quiz',$quiz->id,$course->id);
echo 'Student quiz: '.$CFG->wwwroot.'/mod/quiz/view.php?id='.$cm->id."\n";
$name='VizCode multilingual program';$multi=$DB->get_record('question',['qtype'=>'coderunner','name'=>$name]);
if(!$multi){
 $form=(object)['category'=>$category->id.','.$context->id,'context'=>$context,'name'=>$name,
 'generalfeedback'=>['text'=>'','format'=>FORMAT_HTML],'defaultmark'=>1,'penalty'=>0,'qtype'=>'coderunner','prototypetype'=>0,'allornothing'=>1,
 'templateparams'=>'{}','templateparamslang'=>'twig','customise'=>1,'uiplugin'=>'vizcode','uiparameters'=>'{}','validateonsave'=>0,
 'stdin'=>[''],'extra'=>[''],'useasexample'=>[1],'display'=>['SHOW'],'mark'=>[1],'hiderestiffail'=>[0],'ordering'=>[0]];
 $form->coderunnertype='multilanguage';$form->acelang='python3,cpp,java';$form->answer='print(120)';$form->answerpreload='print(120)';
 $form->questiontext=['text'=>'Write a complete program that prints 120 in your selected language.','format'=>FORMAT_HTML];$form->testcode=[''];$form->expected=['120'];$form->penaltyregime='0';
 $multi=$qtype->save_question((object)['qtype'=>'coderunner','category'=>$category->id,'contextid'=>$context->id],$form);
}
$multiquiz=$DB->get_record('quiz',['course'=>$course->id,'name'=>'VizCode multilingual quiz']);
if(!$multiquiz){$multiquiz=$generator->get_plugin_generator('mod_quiz')->create_instance(['course'=>$course->id,'name'=>'VizCode multilingual quiz','preferredbehaviour'=>'adaptive','questionsperpage'=>0]);quiz_add_quiz_question($multi->id,$multiquiz);}
\mod_quiz\quiz_settings::create($multiquiz->id)->get_grade_calculator()->recompute_quiz_sumgrades();
$cm=get_coursemodule_from_instance('quiz',$multiquiz->id,$course->id);echo 'Multilingual quiz: '.$CFG->wwwroot.'/mod/quiz/view.php?id='.$cm->id."\n";

purge_all_caches();
