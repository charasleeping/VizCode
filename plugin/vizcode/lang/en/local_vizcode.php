<?php
// SPDX-License-Identifier: GPL-3.0-or-later
$string['pluginname'] = 'VizCode for CodeRunner';
$string['brokerurl'] = 'Isolated execution broker URL';
$string['brokerurl_desc'] = 'A separate origin serving the VizCode execution assets. HTTPS is required except on loopback development hosts.';
$string['javakey'] = 'Java tracing signing key';
$string['javakey_desc'] = 'A random secret shared only with the execution broker. Never place this key in a question or UI parameters.';
$string['gradingunavailable'] = 'The grading service could not complete this Check. Your answer has been retained; no additional grading penalty was applied.';
$string['privacy:metadata'] = 'VizCode uses native CodeRunner question attempts. Local debugger settings are stored in the browser; source is sent to the configured execution service for tracing.';

$string['privacy:source'] = 'Student source and local calls sent to the configured tracing service.';
$string['privacy:input'] = 'Input provided for live debugging.';
$string['privacy:user'] = 'A short-lived signed user identifier used for authorization and rate limiting.';
$string['privacy:execution'] = 'The configured isolated execution service processes debugging requests. It stores no permanent source history. Graded answers and best-answer metadata remain in native Moodle question attempts.';
