<?php
// SPDX-License-Identifier: GPL-3.0-or-later
defined('MOODLE_INTERNAL') || die();
$functions=[];
foreach (['check'=>'write','configuration'=>'read','java_ticket'=>'read'] as $name=>$type) {
    $functions['local_vizcode_'.$name]=['classname'=>'local_vizcode\\external\\'.$name,'methodname'=>'execute',
        'description'=>'Authorized VizCode '.$name,'type'=>$type,'ajax'=>true,'loginrequired'=>true];
}
