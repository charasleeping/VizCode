<?php
// SPDX-License-Identifier: GPL-3.0-or-later
namespace local_vizcode\external;
defined('MOODLE_INTERNAL') || die();
class trace_ticket extends \core_external\external_api {
    public static function execute_parameters() {return new \core_external\external_function_parameters([
        'usageid'=>new \core_external\external_value(PARAM_INT,'Usage'),'slot'=>new \core_external\external_value(PARAM_INT,'Slot'),
        'sourcehash'=>new \core_external\external_value(PARAM_ALPHANUM,'Complete trace request SHA256'),
        'adapter'=>new \core_external\external_value(PARAM_RAW_TRIMMED,'Installed adapter identifier'),
        'language'=>new \core_external\external_value(PARAM_NOTAGS,'CodeRunner language')]);}
    public static function execute($usageid,$slot,$sourcehash,$adapter,$language) {
        global $USER;
        self::validate_parameters(self::execute_parameters(),compact('usageid','slot','sourcehash','adapter','language'));
        [$usage]=check::authorize($usageid,$slot);$q=$usage->get_question_attempt($slot)->get_question();
        $languages=empty($q->acelang)?[$q->language]:\qtype_coderunner_util::extract_languages($q->acelang)[0];
        $canonical=fn($l)=>['python'=>'python3','c++'=>'cpp','c_cpp'=>'cpp'][strtolower($l)]??strtolower($l);
        if(!in_array($canonical($language),array_map($canonical,$languages),true))throw new \invalid_parameter_exception('This language is not supported by the question.');
        $key=(string)(get_config('local_vizcode','tracekey')?:get_config('local_vizcode','javakey'));
        if(strlen($key)<32||!preg_match('/^[a-f0-9]{64}$/D',$sourcehash)||!preg_match('/^[a-z][a-z0-9._+-]{0,79}$/D',$adapter))throw new \invalid_parameter_exception('Tracing is not configured.');
        $encode=fn($s)=>rtrim(strtr(base64_encode($s),'+/','-_'),'=');
        $body=$encode(json_encode(['exp'=>time()+120,'nonce'=>bin2hex(random_bytes(16)),'user'=>(int)$USER->id,'hash'=>$sourcehash,'adapter'=>$adapter,'language'=>$language],JSON_THROW_ON_ERROR));
        return ['ticket'=>$body.'.'.$encode(hash_hmac('sha256',$body,$key,true))];
    }
    public static function execute_returns(){return new \core_external\external_single_structure(['ticket'=>new \core_external\external_value(PARAM_RAW,'Single-use source-bound trace ticket')]);}
}
