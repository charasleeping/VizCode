<?php
defined('MOODLE_INTERNAL') || die();
require_once($CFG->dirroot . '/question/type/questionbase.php');

class qtype_vizcode_question extends question_graded_automatically {
    public $mode = 'program';
    public $answerpreload = '';
    public $testsjson = '[]';

    public function get_expected_data() { return ['answer' => PARAM_RAW]; }
    public function get_correct_response() { return null; }
    public function summarise_response(array $response) { return $response['answer'] ?? null; }
    public function un_summarise_response(string $summary) { return ['answer' => $summary]; }
    public function is_complete_response(array $response) { return trim($response['answer'] ?? '') !== ''; }
    public function get_validation_error(array $response) { return get_string('answerrequired', 'qtype_vizcode'); }
    public function is_same_response(array $previous, array $next) {
        return ($previous['answer'] ?? '') === ($next['answer'] ?? '');
    }

    public function grade_response(array $response) {
        $summary = $this->grade_summary($response['answer'] ?? '');
        $fraction = $summary['passed'] === $summary['total'] ? 1.0 : 0.0;
        return [$fraction, question_state::graded_state_for_fraction($fraction)];
    }

    public function grade_summary(string $answer): array {
        $cache = cache::make('qtype_vizcode', 'grading');
        $key = $this->grading_key($answer);
        $summary = $cache->get($key);
        if ($summary !== false) {
            return $summary;
        }
        $tests = \qtype_vizcode\local\test_cases::parse($this->testsjson);
        $client = new \qtype_vizcode\local\jobe_client();
        $summary = ['passed' => 0, 'total' => count($tests)];
        foreach ($tests as $test) {
            $source = $answer . ($this->mode === 'function' ? "\n" . $test['code'] : '');
            $result = $client->execute($source, $test['stdin']);
            if ($result['outcome'] === 15 &&
                    \qtype_vizcode\local\test_cases::normalize($result['stdout']) ===
                    \qtype_vizcode\local\test_cases::normalize($test['expected'])) {
                $summary['passed']++;
            }
        }
        $cache->set($key, $summary);
        return $summary;
    }

    public function cached_summary(string $answer) {
        return cache::make('qtype_vizcode', 'grading')->get($this->grading_key($answer));
    }

    private function grading_key(string $answer): string {
        return hash('sha256', json_encode([get_config('qtype_vizcode', 'version'), $this->id, $this->mode, $this->testsjson, $answer,
            get_config('qtype_vizcode', 'jobeurl'), get_config('qtype_vizcode', 'jobeapikey')]));
    }

    public function get_question_definition_for_external_rendering(question_attempt $qa, question_display_options $options) {
        return ['language' => 'python3', 'mode' => $this->mode];
    }
}