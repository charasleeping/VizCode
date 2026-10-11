<?php
defined('MOODLE_INTERNAL') || die();
function xmldb_qtype_vizcode_upgrade($oldversion) {
    if ($oldversion < 2026101101) {
        upgrade_plugin_savepoint(true, 2026101101, 'qtype', 'vizcode');
    }
    return true;
}