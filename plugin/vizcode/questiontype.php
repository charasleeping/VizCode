<?php
defined('MOODLE_INTERNAL') || die();
require_once($CFG->libdir . '/questionlib.php');

class qtype_vizcode extends question_type {
    public function extra_question_fields() {
        return ['qtype_vizcode_options', 'mode', 'answerpreload', 'testsjson'];
    }

    public function save_question_options($question) {
        global $DB;
        \qtype_vizcode\local\test_cases::parse($question->testsjson);
        if (!in_array($question->mode, ['program', 'function'], true)) {
            throw new invalid_parameter_exception('Unsupported question mode');
        }
        $record = $DB->get_record('qtype_vizcode_options', ['questionid' => $question->id]);
        $record = $record ?: (object)['questionid' => $question->id];
        foreach (['mode', 'answerpreload', 'testsjson'] as $field) {
            $record->$field = $question->$field ?? '';
        }
        if (isset($record->id)) {
            $DB->update_record('qtype_vizcode_options', $record);
        } else {
            $DB->insert_record('qtype_vizcode_options', $record);
        }
        return null;
    }
}