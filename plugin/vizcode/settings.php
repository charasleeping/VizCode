<?php
defined('MOODLE_INTERNAL') || die();
if ($ADMIN->fulltree) {
    $settings->add(new admin_setting_configtext('qtype_vizcode/jobeurl',
        get_string('jobeurl', 'qtype_vizcode'), '', '', PARAM_URL));
    $settings->add(new admin_setting_configpasswordunmask('qtype_vizcode/jobeapikey',
        get_string('jobeapikey', 'qtype_vizcode'), '', ''));
    $settings->add(new admin_setting_configtext('qtype_vizcode/brokerurl',
        get_string('brokerurl', 'qtype_vizcode'), '', '', PARAM_URL));
}