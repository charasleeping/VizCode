<?php
// SPDX-License-Identifier: GPL-3.0-or-later
defined('MOODLE_INTERNAL') || die();
function xmldb_local_vizcode_upgrade($oldversion) {
    if($oldversion<2026111800){
        if(!get_config('local_vizcode','tracekey') && get_config('local_vizcode','javakey'))set_config('tracekey',get_config('local_vizcode','javakey'),'local_vizcode');
        upgrade_plugin_savepoint(true,2026111800,'local','vizcode');
    }
    if($oldversion<2026112100){
        upgrade_plugin_savepoint(true,2026112100,'local','vizcode');
    }
    return true;
}
