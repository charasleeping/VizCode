<?php
// SPDX-License-Identifier: GPL-3.0-or-later
define('CLI_SCRIPT',true);require('/var/www/html/config.php');require_once($CFG->libdir.'/questionlib.php');
require_once($CFG->dirroot.'/question/type/coderunner/questiontype.php');
\core\session\manager::set_user(get_admin());
$question=question_bank::load_question($DB->get_field('question','id',['name'=>'Java factorial'],MUST_EXIST));
$usage=question_engine::make_questions_usage_by_activity('core_question_preview',context_system::instance());
$usage->set_preferred_behaviour('adaptive');$slot=$usage->add_question($question);$usage->start_all_questions();question_engine::save_questions_usage_by_activity($usage);
// Forced settings apply to this PHP process only. Live browser keys are untouched.
$saved=$CFG->forced_plugin_settings['local_vizcode'] ?? null;
try {
    foreach(['','legacy-fixture-key-12345678901234567890'] as $legacy){
        $generic='generic-fixture-key-1234567890123456789';
        $CFG->forced_plugin_settings['local_vizcode']=array_merge($saved ?? [],['javakey'=>$legacy,'tracekey'=>$generic]);
        $hash=hash('sha256','source-bound fixture');
        $result=\local_vizcode\external\java_ticket::execute($usage->get_id(),$slot,$hash);
        [$body,$signature]=explode('.',$result['ticket']);
        $expected=rtrim(strtr(base64_encode(hash_hmac('sha256',$body,$legacy?:$generic,true)),'+/','-_'),'=');
        if(!hash_equals($expected,$signature))throw new Exception('Legacy Java signing-key selection failed');
        $claim=json_decode(base64_decode(strtr($body,'-_','+/')),true);
        if($claim['hash']!==$hash || $claim['user']!==(int)$USER->id)throw new Exception('Java ticket lost source/user binding');
    }
    echo "Moodle legacy Java ticket uses the generic tracing key when needed and retains user/source binding\n";
} finally {
    if($saved===null)unset($CFG->forced_plugin_settings['local_vizcode']);else $CFG->forced_plugin_settings['local_vizcode']=$saved;
    question_engine::delete_questions_usage_by_activity($usage->get_id());
}
