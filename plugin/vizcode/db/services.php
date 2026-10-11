<?php
defined('MOODLE_INTERNAL') || die();
$functions = ['qtype_vizcode_check' => [
    'classname' => 'qtype_vizcode\external\check', 'methodname' => 'execute',
    'description' => 'Prepare authoritative grading for an authorized question attempt.',
    'type' => 'read', 'ajax' => true, 'loginrequired' => true,
]];