<?php
namespace local_vizcode\external;
defined('MOODLE_INTERNAL') || die();
class check extends \core_external\external_api {
    public static function execute_parameters() {
        return new \core_external\external_function_parameters([
            'usageid'=>new \core_external\external_value(PARAM_INT,'Question usage'),
            'slot'=>new \core_external\external_value(PARAM_INT,'Question slot'),
            'sequence'=>new \core_external\external_value(PARAM_INT,'Sequence check'),
            'response'=>new \core_external\external_value(PARAM_RAW,'Native response JSON'),
            'action'=>new \core_external\external_value(PARAM_ALPHA,'check or precheck',VALUE_DEFAULT,'check')]);
    }
    public static function authorize($usageid,$slot) {
        global $DB,$USER,$CFG;
        require_once($CFG->libdir.'/questionlib.php');
        $usage=\question_engine::load_questions_usage_by_activity($usageid);
        self::validate_context($usage->get_owning_context());
        $attempt=$DB->get_record('quiz_attempts',['uniqueid'=>$usageid]);
        if ($attempt) {
            if ((int)$attempt->userid!==(int)$USER->id || $attempt->state!=='inprogress') throw new \invalid_parameter_exception('This attempt is not editable.');
        } else require_capability('moodle/question:useall',$usage->get_owning_context());
        $q=$usage->get_question_attempt($slot)->get_question();
        if (!($q instanceof \qtype_coderunner_question) || !\local_vizcode\integration::enabled($q)) throw new \invalid_parameter_exception('Not a VizCode CodeRunner question.');
        return [$usage,$attempt];
    }
    public static function execute($usageid,$slot,$sequence,$response,$action='check') {
        global $CFG,$DB,$PAGE;
        self::validate_parameters(self::execute_parameters(),compact('usageid','slot','sequence','response','action'));
        if (strlen($response)>250000 || !in_array($action,['check','precheck'],true)) throw new \invalid_parameter_exception('Invalid response.');
        $factory=\core\lock\lock_config::get_lock_factory('local_vizcode');
        $lock=$factory->get_lock('check:'.$usageid.':'.$slot,5);
        if (!$lock) throw new \moodle_exception('gradingunavailable','local_vizcode');
        try {
            [$usage,$attempt]=self::authorize($usageid,$slot);$qa=$usage->get_question_attempt($slot);
            if ($qa->get_sequence_check_count()!==$sequence) throw new \invalid_parameter_exception('The question changed. Reload before checking.');
            $data=json_decode($response,true,16,JSON_THROW_ON_ERROR);
            if (!is_array($data) || !is_string($data['answer'] ?? null) || strlen($data['answer'])>100000) throw new \invalid_parameter_exception('Invalid answer.');
            $expected=$qa->get_question()->get_expected_data();
            $native=array_intersect_key($data,$expected);$native[$action==='check'?'-submit':'-precheck']=1;
            $transaction=$DB->start_delegated_transaction();
            $post=['slots'=>(string)$slot,$qa->get_control_field_name('sequencecheck')=>$sequence];
            foreach ($native as $field=>$value) $post[str_starts_with($field,'-')?$qa->get_behaviour_field_name(substr($field,1)):$qa->get_qt_field_name($field)]=$value;
            if ($attempt) {
                require_once($CFG->dirroot.'/mod/quiz/locallib.php');
                $quiz=\mod_quiz\quiz_attempt::create($attempt->id);
                if (!$quiz->is_preview()) require_capability('mod/quiz:attempt',$usage->get_owning_context());
                $quiz->process_submitted_actions(time(),false,$post);
                $usage=\question_engine::load_questions_usage_by_activity($usageid);
                $html=$quiz->render_question($slot,false,$PAGE->get_renderer('mod_quiz'));
            } else {
                $usage->process_all_actions(time(),$post);\question_engine::save_questions_usage_by_activity($usage);
                $html=$usage->render_question($slot,new \question_display_options(),$slot);
            }
            $transaction->allow_commit();
            return ['html'=>$html,'sequence'=>$usage->get_question_attempt($slot)->get_sequence_check_count()];
        } finally {$lock->release();}
    }
    public static function execute_returns() {
        return new \core_external\external_single_structure(['html'=>new \core_external\external_value(PARAM_RAW,'Native feedback'),
            'sequence'=>new \core_external\external_value(PARAM_INT,'Saved sequence')]);
    }
}
