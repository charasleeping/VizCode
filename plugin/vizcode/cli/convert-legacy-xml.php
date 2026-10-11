<?php
define('CLI_SCRIPT', true);
require(__DIR__ . '/../../../../config.php');
require_once($CFG->libdir . '/clilib.php');
[$options, $unrecognized] = cli_get_params(['input' => null, 'output' => null], []);
if ($unrecognized || !$options['input'] || !$options['output'] || file_exists($options['output'])) {
    cli_error('Provide --input=old.xml --output=new.xml; output must not already exist.');
}
$document = new DOMDocument();
if (!$document->load($options['input'], LIBXML_NONET) || $document->doctype) {
    cli_error('Invalid question XML.');
}
foreach ($document->getElementsByTagName('question') as $question) {
    if ($question->getAttribute('type') === 'coodleviz') $question->setAttribute('type', 'vizcode');
}
if (!$document->save($options['output'])) cli_error('Could not save converted XML.');
echo "Question type converted; source and tests are retained.\n";