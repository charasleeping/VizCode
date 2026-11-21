<?php
// SPDX-License-Identifier: GPL-3.0-or-later
define('CLI_SCRIPT',true);require('/var/www/html/config.php');require_once($CFG->libdir.'/questionlib.php');
require_once($CFG->dirroot.'/question/type/coderunner/questiontype.php');require_once(__DIR__.'/object-demos.php');
\core\session\manager::set_user(get_admin());
$sql='SELECT q.id, v.questionbankentryid, e.questioncategoryid, c.contextid, z.course, qr.version AS pinnedversion
 FROM {quiz} z JOIN {course} course ON course.id=z.course JOIN {quiz_slots} slot ON slot.quizid=z.id
 JOIN {question_references} qr ON qr.itemid=slot.id AND qr.component=? AND qr.questionarea=?
 JOIN {question_versions} v ON v.questionbankentryid=qr.questionbankentryid
 JOIN {question} q ON q.id=v.questionid JOIN {question_coderunner_options} o ON o.questionid=q.id
 JOIN {question_bank_entries} e ON e.id=v.questionbankentryid JOIN {question_categories} c ON c.id=e.questioncategoryid
 WHERE z.name=? AND course.shortname=? AND o.coderunnertype IN (?, ?) AND q.name IN (?, ?) AND v.status=? ORDER BY v.version DESC';
foreach ([[vizcode_cpp_object_demo_definition(), 'cpp'], [vizcode_java_object_demo_definition(), 'java']] as [$definition, $language]) {
    $rows=$DB->get_records_sql($sql,['mod_quiz','slot','VizCode CodeRunner quiz','VIZCODE_CR',$definition[1],$language==='java' ? 'java_method' : $definition[1],$definition[0],$language==='java' ? 'Java factorial' : 'C++ factorial','ready'],0,1);
    if(!$rows)throw new Exception('The '.$language.' demo question was not found in the demonstration quiz.');
    $linked=reset($rows);
    if($linked->pinnedversion!==null)throw new Exception('The demo is pinned to a historical question version; it was left unchanged.');
    $old=question_bank::load_question_data($linked->id);
    $saved=$old;
    if($old->name!==$definition[0] || $old->options->answer!==$definition[2] || $old->questiontext!==$definition[5] || $old->options->answerpreload!==$definition[2] || $old->generalfeedback!==$definition[6]){
        $transaction=$DB->start_delegated_transaction();
        $history=serialize([$DB->get_record('question',['id'=>$old->id]),$DB->get_record('question_coderunner_options',['questionid'=>$old->id]),$DB->get_records('question_coderunner_tests',['questionid'=>$old->id],'id ASC'),$DB->get_fieldset_select('question_attempts','id','questionid=?',[$old->id])]);
        $saved=vizcode_save_object_demo($definition,(object)['id'=>$linked->questioncategoryid],context::instance_by_id($linked->contextid),$old);
        $question=question_bank::load_question($saved->id);$question->start_attempt(new question_attempt_step(),1);
        [$fraction]=$question->grade_response(['answer'=>$question->answer,'language'=>$language]);
        if((float)$fraction!==1.0)throw new Exception('The revised demonstration did not pass its existing CodeRunner tests.');
        $after=serialize([$DB->get_record('question',['id'=>$old->id]),$DB->get_record('question_coderunner_options',['questionid'=>$old->id]),$DB->get_records('question_coderunner_tests',['questionid'=>$old->id],'id ASC'),$DB->get_fieldset_select('question_attempts','id','questionid=?',[$old->id])]);
        if($history!==$after)throw new Exception('Historical question data changed; the update has been rolled back.');
        $transaction->allow_commit();
    }
    echo $definition[0].' ready: question '.$saved->id.' (previous question '.$old->id." retained)\n";
    echo $CFG->wwwroot.'/question/bank/previewquestion/preview.php?id='.$saved->id.'&courseid='.$linked->course."\n";
}
