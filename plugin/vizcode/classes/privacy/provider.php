<?php
namespace local_vizcode\privacy;
defined('MOODLE_INTERNAL') || die();
final class provider implements \core_privacy\local\metadata\provider {
    public static function get_metadata(\core_privacy\local\metadata\collection $collection): \core_privacy\local\metadata\collection {
        return $collection->add_external_location_link('execution',[
            'source'=>'privacy:source','input'=>'privacy:input','user'=>'privacy:user'], 'privacy:execution');
    }
}
