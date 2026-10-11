<?php
define('CLI_SCRIPT', true);
require(__DIR__ . '/../../../../config.php');
require_once($CFG->libdir . '/clilib.php');
[$options, $unrecognized] = cli_get_params(['run' => false, 'help' => false], ['h' => 'help']);
if ($options['help'] || !$options['run']) {
    echo "Migrate CoodleViz questions/settings to VizCode after installing qtype_vizcode.\n";
    echo "Back up Moodle first, enable maintenance mode, then run with --run.\n";
    exit(0);
}
if ($unrecognized || !get_config('core', 'maintenance_enabled')) {
    cli_error('Enable Moodle maintenance mode before migration.');
}
$manager = $DB->get_manager();
if (!$manager->table_exists('qtype_vizcode_options')) cli_error('Install qtype_vizcode first.');
if (!$manager->table_exists('qtype_coodleviz_options')) {
    if ($DB->record_exists('question', ['qtype' => 'coodleviz'])) cli_error('Legacy options table missing.');
    echo "No legacy data remains.\n";
    exit(0);
}
$tables = ['question_attempts', 'question_attempt_steps', 'question_attempt_step_data', 'quiz_attempts', 'quiz_grades'];
$fingerprint = function() use ($DB, $tables) {
    $result = [];
    foreach ($tables as $table) {
        $context = hash_init('sha256');
        $records = $DB->get_recordset($table, null, 'id');
        foreach ($records as $record) hash_update($context, json_encode($record));
        $records->close();
        $result[$table] = hash_final($context);
    }
    return $result;
};
$before = $fingerprint();
$transaction = $DB->start_delegated_transaction();
foreach ($DB->get_records('qtype_coodleviz_options') as $legacy) {
    $existing = $DB->get_record('qtype_vizcode_options', ['questionid' => $legacy->questionid]);
    if ($existing) {
        foreach (['mode', 'answerpreload', 'testsjson'] as $field) {
            if ($existing->$field !== $legacy->$field) cli_error('Conflicting destination question options.');
        }
    } else {
        unset($legacy->id);
        $DB->insert_record('qtype_vizcode_options', $legacy);
    }
}
foreach ($DB->get_records('config_plugins', ['plugin' => 'qtype_coodleviz']) as $setting) {
    if ($setting->name === 'version') continue;
    set_config($setting->name, $setting->value, 'qtype_vizcode');
}
$DB->set_field('question', 'qtype', 'vizcode', ['qtype' => 'coodleviz']);
if ($before !== $fingerprint()) cli_error('Attempt or grade data changed; migration aborted.');
$transaction->allow_commit();
purge_all_caches();
echo "Questions and settings migrated. Attempts, answers and marks are unchanged.\n";