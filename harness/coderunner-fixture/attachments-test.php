<?php
define('CLI_SCRIPT',true);require('/var/www/html/config.php');require_once($CFG->libdir.'/questionlib.php');
\core\session\manager::set_user(get_admin());
$course=$DB->get_record('course',['shortname'=>'VIZCODE_CR']);$ctx=context_course::instance($course->id);$cat=question_get_default_category($ctx->id);
$form=(object)['category'=>$cat->id.','.$ctx->id,'context'=>$ctx,'name'=>'Temporary attachment compatibility '.uniqid(),'questiontext'=>['text'=>'Read value.txt','format'=>FORMAT_HTML],
 'generalfeedback'=>['text'=>'','format'=>FORMAT_HTML],'defaultmark'=>1,'penalty'=>0,'qtype'=>'coderunner','coderunnertype'=>'python3','prototypetype'=>0,'allornothing'=>1,'penaltyregime'=>'0',
 'answer'=>'print(open("value.txt").read().strip())','answerpreload'=>'','templateparams'=>'{}','customise'=>1,'uiplugin'=>'vizcode','uiparameters'=>'{}','validateonsave'=>0,
 'template'=>'{{ STUDENT_ANSWER }}','iscombinatortemplate'=>0,'attachments'=>1,'attachmentsrequired'=>1,'maxfilesize'=>102400,
 'testcode'=>[''],'stdin'=>[''],'expected'=>['120'],'extra'=>[''],'useasexample'=>[0],'display'=>['SHOW'],'mark'=>[1],'hiderestiffail'=>[0],'ordering'=>[0]];
$record=question_bank::get_qtype('coderunner')->save_question((object)['qtype'=>'coderunner','category'=>$cat->id,'contextid'=>$ctx->id],$form);
$usage=question_engine::make_questions_usage_by_activity('core_question_preview',$ctx);$usage->set_preferred_behaviour('adaptive');$slot=$usage->add_question(question_bank::load_question($record->id));$usage->start_all_questions();question_engine::save_questions_usage_by_activity($usage);$id=$usage->get_id();
$drafts=[];
try{
 foreach(["120\n","0\n"] as $text){
  $draft=file_get_unused_draft_itemid();$drafts[]=$draft;get_file_storage()->create_file_from_string(['contextid'=>context_user::instance($USER->id)->id,'component'=>'user','filearea'=>'draft','itemid'=>$draft,'filepath'=>'/','filename'=>'value.txt'],$text);
  $usage=question_engine::load_questions_usage_by_activity($id);$seq=$usage->get_question_attempt($slot)->get_sequence_check_count();
  $result=\local_vizcode\external\check::execute($id,$slot,$seq,json_encode(['answer'=>$form->answer,'attachments'=>(string)$draft]));
  if(!str_contains($result['html'],'coderunner-test-results'))throw new Exception('Preview did not return native feedback');
 }
 $usage=question_engine::load_questions_usage_by_activity($id);$usage->finish_all_questions();question_engine::save_questions_usage_by_activity($usage);$usage=question_engine::load_questions_usage_by_activity($id);
 $qa=$usage->get_question_attempt($slot);$files=$qa->get_last_qt_var('attachments')->get_files();
 if(count($files)!==1 || reset($files)->get_content()!=="120\n" || (float)$qa->get_fraction()!==1.0)throw new Exception('Best attachments failed to survive final save/reload');
 echo "Native preview Check, attachment transfer and best-file final save/reload passed\n";
}finally{
 question_engine::delete_questions_usage_by_activity($id);question_delete_question($record->id);
 foreach($drafts as $draft)get_file_storage()->delete_area_files(context_user::instance($USER->id)->id,'user','draft',$draft);
}
