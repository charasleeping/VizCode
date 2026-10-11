<?php
define('CLI_SCRIPT', true);
require('/var/www/html/config.php');
require_once($CFG->libdir . '/questionlib.php');
require_once($CFG->dirroot . '/question/format/xml/format.php');
require_once($CFG->libdir . '/testing/generator/lib.php');
set_config('jobeurl', 'http://jobe/jobe/index.php/restapi', 'qtype_vizcode');
set_config('brokerurl', 'http://127.0.0.1:4101/live/broker.html', 'qtype_vizcode');
set_config('curlsecurityblockedhosts', '');
\core\session\manager::set_user(get_admin());
$generator = new testing_data_generator();
$course = $DB->get_record('course', ['shortname' => 'VizCode-independent']);
if (!$course) {
    $course = $generator->create_course(['shortname' => 'VizCode-independent', 'fullname' => 'VizCode Python']);
}
$context = context_course::instance($course->id);
$category = $DB->get_record('question_categories', ['contextid' => $context->id, 'name' => 'VizCode']);
if (!$category) {
    $category = (object)['contextid' => $context->id, 'name' => 'VizCode', 'info' => '',
        'infoformat' => FORMAT_HTML, 'stamp' => make_unique_id_code(), 'parent' => 0, 'sortorder' => 1];
    $category->id = $DB->insert_record('question_categories', $category);
}
if (!$DB->record_exists('question', ['qtype' => 'vizcode', 'name' => 'VizCode factorial program'])) {
    $format = new qformat_xml();
    $format->setCategory($category);
    $format->setContexts([$context]);
    $format->setCourse($course);
    $format->setFilename('/fixture/vizcode-questions.xml');
    $format->setRealfilename('vizcode-questions.xml');
    $format->setStoponerror(true);
    $format->importpreprocess();
    $format->importprocess();
    $format->importpostprocess();
}
$student = $DB->get_record('user', ['username' => 'student']);
if (!$student) {
    $student = $generator->create_user(['username' => 'student', 'password' => 'LocalStudentOnly1!',
        'firstname' => 'Fixture', 'lastname' => 'Student', 'email' => 'student@example.invalid']);
}
$generator->enrol_user($student->id, $course->id, 'student');
$quiz = $DB->get_record('quiz', ['course' => $course->id, 'name' => 'VizCode independent quiz']);
if (!$quiz) {
    $quiz = $generator->get_plugin_generator('mod_quiz')->create_instance(['course' => $course->id,
        'name' => 'VizCode independent quiz', 'preferredbehaviour' => 'adaptive', 'questionsperpage' => 0]);
    foreach ($DB->get_records('question', ['qtype' => 'vizcode'], 'id') as $question) {
        quiz_add_quiz_question($question->id, $quiz);
    }
}
\mod_quiz\quiz_settings::create($quiz->id)->get_grade_calculator()->recompute_quiz_sumgrades();
$cm = get_coursemodule_from_instance('quiz', $quiz->id, $course->id);
echo 'VizCode student quiz: ' . $CFG->wwwroot . '/mod/quiz/view.php?id=' . $cm->id . "\n";
foreach ($DB->get_records('question', ['qtype' => 'vizcode'], 'id') as $question) {
    echo $question->name . ': question id ' . $question->id . "\n";
    $definition = question_bank::load_question($question->id);
    $answer = $definition->mode === 'program' ? 'import math; print(math.factorial(int(input())))' :
        'def factorial(n): return 1 if n < 2 else n * factorial(n - 1)';
    [$correct] = $definition->grade_response(['answer' => $answer]);
    [$incorrect] = $definition->grade_response(['answer' => 'print(0)']);
    if ($correct !== 1.0 || $incorrect !== 0.0) { throw new Exception('Independent grading test failed'); }
    echo "Correct/incorrect Jobe grading passed\n";
    $data = question_bank::load_question_data($question->id);
    $format = new qformat_xml();
    $xml = $format->writequestion($data);
    $roundtrip = $format->readquestions(['<quiz>' . $xml . '</quiz>']);
    if (count($roundtrip) !== 1 || $roundtrip[0]->testsjson !== $definition->testsjson ||
            $roundtrip[0]->answerpreload !== $definition->answerpreload) {
        throw new Exception('Question XML round-trip failed');
    }
    echo "Question XML round-trip passed\n";
}
$previous = get_config('qtype_vizcode', 'jobeurl');
try {
    set_config('jobeurl', 'http://127.0.0.1:9/restapi', 'qtype_vizcode');
    try {
        $definition->grade_response(['answer' => 'print(999)']);
        throw new Exception('Backend outage was incorrectly graded');
    } catch (moodle_exception $error) {
        if ($error->errorcode !== 'gradingunavailable') throw $error;
        echo "Backend outage remains ungraded\n";
    }
} finally {
    set_config('jobeurl', $previous, 'qtype_vizcode');
}
if (getenv('VIZCODE_BACKUP_TEST')) {
    require_once($CFG->dirroot . '/backup/util/includes/backup_includes.php');
    require_once($CFG->dirroot . '/backup/util/includes/restore_includes.php');
    $backup = new backup_controller(backup::TYPE_1COURSE, $course->id, backup::FORMAT_MOODLE,
        backup::INTERACTIVE_NO, backup::MODE_GENERAL, get_admin()->id);
    $backup->get_plan()->get_setting('users')->set_value(false);
    $backup->execute_plan();
    $backupid = $backup->get_backupid();
    $results = $backup->get_results();
    $directory = $CFG->tempdir . '/backup/' . $backupid;
    $packer = get_file_packer('application/vnd.moodle.backup');
    $packer->extract_to_pathname($results['backup_destination'], $directory);
    $target = $generator->create_course(['fullname' => 'VizCode restore verification',
        'shortname' => 'VizCode-restore-' . uniqid()]);
    $restore = new restore_controller($backupid, $target->id, backup::INTERACTIVE_NO,
        backup::MODE_GENERAL, get_admin()->id, backup::TARGET_NEW_COURSE);
    if (!$restore->execute_precheck()) throw new Exception('Restore precheck failed');
    $restore->execute_plan();
    $contextid = context_course::instance($target->id)->id;
    $restored = $DB->get_records_sql('SELECT options.* FROM {qtype_vizcode_options} options
        JOIN {question_versions} versions ON versions.questionid = options.questionid
        JOIN {question_bank_entries} entries ON entries.id = versions.questionbankentryid
        JOIN {question_categories} categories ON categories.id = entries.questioncategoryid
        WHERE categories.contextid = ?', [$contextid]);
    if (count($restored) !== 2) throw new Exception('Restored question configuration missing');
    foreach ($restored as $options) {
        if (count(\qtype_vizcode\local\test_cases::parse($options->testsjson)) !== 2) {
            throw new Exception('Restored private tests changed');
        }
    }
    $restore->destroy();
    $backup->destroy();
    delete_course($target, false);
    echo "Native Moodle backup/restore passed\n";
}