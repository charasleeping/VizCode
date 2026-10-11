<?php
defined('MOODLE_INTERNAL') || die();

class qtype_vizcode_edit_form extends question_edit_form {
    protected function definition_inner($mform) {
        $mform->addElement('select', 'mode', get_string('mode', 'qtype_vizcode'), [
            'program' => get_string('program', 'qtype_vizcode'),
            'function' => get_string('function', 'qtype_vizcode'),
        ]);
        $mform->addElement('textarea', 'answerpreload', get_string('answerpreload', 'qtype_vizcode'), ['rows' => 8]);
        $mform->setType('answerpreload', PARAM_RAW);
        $mform->addElement('textarea', 'testsjson', get_string('testsjson', 'qtype_vizcode'), ['rows' => 12]);
        $mform->setType('testsjson', PARAM_RAW);
        $mform->addHelpButton('testsjson', 'testsjson', 'qtype_vizcode');
        $mform->addRule('testsjson', null, 'required', null, 'client');
        $mform->setDefault('testsjson', '[{"stdin":"5\n","expected":"120\n","hidden":false}]');
    }

    protected function data_preprocessing($question) {
        $question = parent::data_preprocessing($question);
        if (isset($question->options)) {
            foreach (['mode', 'answerpreload', 'testsjson'] as $field) {
                $question->$field = $question->options->$field;
            }
        }
        return $question;
    }

    public function validation($data, $files) {
        $errors = parent::validation($data, $files);
        try { \qtype_vizcode\local\test_cases::parse($data['testsjson'] ?? ''); }
        catch (\Throwable $error) { $errors['testsjson'] = get_string('invalidtests', 'qtype_vizcode'); }
        return $errors;
    }

    public function qtype() { return 'vizcode'; }
}