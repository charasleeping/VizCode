<?php
define('CLI_SCRIPT',true);require('/var/www/html/config.php');require_once($CFG->libdir.'/questionlib.php');
require_once($CFG->dirroot.'/question/format/xml/format.php');require_once($CFG->libdir.'/testing/generator/lib.php');
require_once($CFG->dirroot.'/backup/util/includes/backup_includes.php');require_once($CFG->dirroot.'/backup/util/includes/restore_includes.php');
\core\session\manager::set_user(get_admin());
$course=$DB->get_record('course',['shortname'=>'VIZCODE_CR'], '*', MUST_EXIST);
foreach(['Python factorial','C++ factorial','Java factorial'] as $name){
 $data=question_bank::load_question_data($DB->get_field('question','id',['name'=>$name]));$format=new qformat_xml();$xml=$format->writequestion($data);$roundtrip=$format->readquestions(['<quiz>'.$xml.'</quiz>']);
 if(count($roundtrip)!==1 || $roundtrip[0]->uiplugin!=='vizcode' || $roundtrip[0]->coderunnertype!==$data->options->coderunnertype)throw new Exception('XML round trip changed native configuration');
}
echo "Three-language native XML round trips passed\n";
$originaluis=$DB->get_fieldset_sql('SELECT opts.uiplugin FROM {question_coderunner_options} opts JOIN {question_versions} v ON v.questionid=opts.questionid JOIN {question_bank_entries} e ON e.id=v.questionbankentryid JOIN {question_categories} c ON c.id=e.questioncategoryid WHERE c.contextid=?',[context_course::instance($course->id)->id]);sort($originaluis);
$backup=new backup_controller(backup::TYPE_1COURSE,$course->id,backup::FORMAT_MOODLE,backup::INTERACTIVE_NO,backup::MODE_GENERAL,get_admin()->id);
$backup->get_plan()->get_setting('users')->set_value(false);$backup->execute_plan();$id=$backup->get_backupid();$results=$backup->get_results();
$directory=$CFG->tempdir.'/backup/'.$id;get_file_packer('application/vnd.moodle.backup')->extract_to_pathname($results['backup_destination'],$directory);
$generator=new testing_data_generator();$target=$generator->create_course(['shortname'=>'VizCode-restore-'.uniqid(),'fullname'=>'Temporary CodeRunner restore verification']);
try{
 $restore=new restore_controller($id,$target->id,backup::INTERACTIVE_NO,backup::MODE_GENERAL,get_admin()->id,backup::TARGET_NEW_COURSE);
 if(!$restore->execute_precheck())throw new Exception('Restore precheck failed');$restore->execute_plan();
 $options=$DB->get_records_sql('SELECT opts.* FROM {question_coderunner_options} opts JOIN {question_versions} v ON v.questionid=opts.questionid JOIN {question_bank_entries} e ON e.id=v.questionbankentryid JOIN {question_categories} c ON c.id=e.questioncategoryid WHERE c.contextid=?',[context_course::instance($target->id)->id]);
 $restoredais=array_map(fn($o)=>$o->uiplugin,array_values($options));sort($restoredais);if($restoredais!==$originaluis)throw new Exception('Restored question interfaces changed');
 $restore->destroy();echo "Native course backup/restore retains CodeRunner questions and VizCode selection\n";
}finally{$backup->destroy();delete_course($target,false);}
