<?php
defined('MOODLE_INTERNAL') || die();

class qtype_vizcode_renderer extends qtype_renderer {
    public function formulation_and_controls(question_attempt $qa, question_display_options $options) {
        global $CFG, $USER;
        $question = $qa->get_question();
        $answer = $qa->get_last_qt_var('answer', $question->answerpreload);
        $id = $qa->get_qt_field_name('answer');
        $html = $question->format_questiontext($qa);
        foreach (\qtype_vizcode\local\test_cases::parse($question->testsjson) as $test) {
            if (!$test['hidden']) {
                $html .= html_writer::tag('pre', s($test['stdin'] . "\n" . $test['expected']), ['class' => 'vizcode-example']);
            }
        }
        $html .= html_writer::tag('label', get_string('answer', 'qtype_vizcode'), ['for' => $id]);
        $attributes = ['id' => $id, 'name' => $id, 'rows' => 14, 'class' => 'vizcode-answer'];
        if ($options->readonly) { $attributes['readonly'] = 'readonly'; }
        $html .= html_writer::tag('textarea', s($answer), $attributes);
        $this->page->requires->js_call_amd('qtype_vizcode/answer', 'init', [$id,
            $CFG->wwwroot . '/question/type/vizcode/assets/widget.js?v=' . (int)get_config('qtype_vizcode', 'version'),
            (string)get_config('qtype_vizcode', 'brokerurl'), (string)$USER->id]);
        return $html;
    }

    public function specific_feedback(question_attempt $qa) {
        $answer = $qa->get_last_qt_var('answer', '');
        if ($answer === '') { return ''; }
        try {
            $summary = $qa->get_question()->cached_summary($answer);
            if ($summary === false) { return ''; }
            return html_writer::tag('p', get_string('testsummary', 'qtype_vizcode', (object)$summary));
        } catch (moodle_exception $error) {
            return html_writer::tag('p', get_string('gradingunavailable', 'qtype_vizcode'));
        }
    }
}