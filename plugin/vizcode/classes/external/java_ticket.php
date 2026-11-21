<?php
namespace local_vizcode\external;
defined('MOODLE_INTERNAL') || die();
class java_ticket extends \core_external\external_api {
    public static function execute_parameters() {return new \core_external\external_function_parameters([
        'usageid'=>new \core_external\external_value(PARAM_INT,'Usage'),'slot'=>new \core_external\external_value(PARAM_INT,'Slot'),
        'sourcehash'=>new \core_external\external_value(PARAM_ALPHANUM,'Trace request SHA256')]);}
    public static function execute($usageid,$slot,$sourcehash) {
        global $USER;
        self::validate_parameters(self::execute_parameters(),compact('usageid','slot','sourcehash'));
        [$usage]=check::authorize($usageid,$slot);
        $question=$usage->get_question_attempt($slot)->get_question();
        $languages=empty($question->acelang)?[$question->language]:\qtype_coderunner_util::extract_languages($question->acelang)[0];
        if (!in_array('java',array_map('strtolower',$languages),true)) throw new \invalid_parameter_exception('Java is not supported by this question.');
        $key=(string)(get_config('local_vizcode','javakey')?:get_config('local_vizcode','tracekey'));
        if (strlen($key)<32 || !preg_match('/^[a-f0-9]{64}$/D',$sourcehash)) throw new \invalid_parameter_exception('Java tracing is not configured.');
        $encode=fn($s)=>rtrim(strtr(base64_encode($s),'+/','-_'),'=');
        $body=$encode(json_encode(['exp'=>time()+120,'nonce'=>bin2hex(random_bytes(16)),'user'=>(int)$USER->id,'hash'=>$sourcehash],JSON_THROW_ON_ERROR));
        return ['ticket'=>$body.'.'.$encode(hash_hmac('sha256',$body,$key,true))];
    }
    public static function execute_returns() {return new \core_external\external_single_structure(['ticket'=>new \core_external\external_value(PARAM_RAW,'Short-lived trace ticket')]);}
}
