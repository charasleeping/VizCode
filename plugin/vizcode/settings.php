<?php
// SPDX-License-Identifier: GPL-3.0-or-later
defined('MOODLE_INTERNAL') || die();
if ($hassiteconfig) {
    $settings = new admin_settingpage('local_vizcode', get_string('pluginname', 'local_vizcode'));
    $ADMIN->add('localplugins', $settings);
    $settings->add(new admin_setting_configtext('local_vizcode/brokerurl',get_string('brokerurl','local_vizcode'),get_string('brokerurl_desc','local_vizcode'),'',PARAM_URL));
    $settings->add(new admin_setting_configpasswordunmask('local_vizcode/tracekey','Tracing signing key','Shared with the self-hosted execution service. Existing Java keys remain a compatibility fallback.',''));
}
