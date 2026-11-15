<?php
namespace local_vizcode\external;
defined('MOODLE_INTERNAL') || die();
class configuration extends \core_external\external_api {
    public static function execute_parameters() { return new \core_external\external_function_parameters([]); }
    public static function execute() {
        self::validate_context(\context_system::instance());
        return ['brokerUrl'=>(string)get_config('local_vizcode','brokerurl')];
    }
    public static function execute_returns() { return new \core_external\external_single_structure(['brokerUrl'=>new \core_external\external_value(PARAM_URL,'Execution broker')]); }
}
