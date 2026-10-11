<?php
namespace qtype_vizcode\external;
defined('MOODLE_INTERNAL') || die();

use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_value;
use core_external\external_single_structure;

final class check extends external_api {
    public static function execute_parameters() {
        return new external_function_parameters([
            'usageid' => new external_value(PARAM_INT, 'Question usage'),
            'slot' => new external_value(PARAM_INT, 'Question slot'),
            'answer' => new external_value(PARAM_RAW, 'Current source'),
        ]);
    }
    public static function execute($usageid, $slot, $answer) {
        global $CFG, $DB, $USER;
        require_once($CFG->libdir . '/questionlib.php');
        self::validate_parameters(self::execute_parameters(), compact('usageid', 'slot', 'answer'));
        $usage = \question_engine::load_questions_usage_by_activity($usageid);
        self::validate_context($usage->get_owning_context());
        $attempt = $DB->get_record('quiz_attempts', ['uniqueid' => $usageid]);
        if ($attempt) {
            if ((int)$attempt->userid !== (int)$USER->id || $attempt->state !== 'inprogress') {
                throw new \required_capability_exception($usage->get_owning_context(), 'mod/quiz:attempt', 'nopermissions', '');
            }
        } else {
            require_capability('moodle/question:useall', $usage->get_owning_context());
        }
        $question = $usage->get_question_attempt($slot)->get_question();
        if (!($question instanceof \qtype_vizcode_question) || strlen($answer) > 100000) {
            throw new \invalid_parameter_exception('Invalid VizCode answer');
        }
        $question->grade_summary($answer);
        return ['ready' => true];
    }
    public static function execute_returns() {
        return new external_single_structure(['ready' => new external_value(PARAM_BOOL, 'Server grading available')]);
    }
}