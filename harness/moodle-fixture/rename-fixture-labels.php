<?php
define('CLI_SCRIPT', true);
require('/var/www/html/config.php');
$transaction = $DB->start_delegated_transaction();
foreach (['course' => ['fullname', 'shortname'], 'quiz' => ['name'],
        'question' => ['name'], 'question_categories' => ['name']] as $table => $fields) {
    foreach ($fields as $field) {
        foreach ($DB->get_records_select($table, $DB->sql_like($field, ':prefix'), ['prefix' => 'CoodleViz%']) as $record) {
            $DB->set_field($table, $field, str_replace('CoodleViz', 'VizCode', $record->$field), ['id' => $record->id]);
        }
    }
}
$transaction->allow_commit();
purge_all_caches();
echo "Fixture display labels renamed; IDs and attempts unchanged.\n";