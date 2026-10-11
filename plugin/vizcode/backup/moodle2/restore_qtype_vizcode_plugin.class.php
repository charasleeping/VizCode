<?php
defined('MOODLE_INTERNAL') || die();
class restore_qtype_vizcode_plugin extends restore_qtype_extrafields_plugin {
	public function process_vizcode($data) {
		$this->really_process_extra_question_fields($data);
	}
}