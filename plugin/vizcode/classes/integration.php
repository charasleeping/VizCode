<?php
// SPDX-License-Identifier: GPL-3.0-or-later
namespace local_vizcode;
defined('MOODLE_INTERNAL') || die();
final class integration {
    public static function enabled($question): bool { return strtolower($question->uiplugin ?? '') === 'vizcode'; }
    public static function configuration(\question_attempt $qa, \question_display_options $options): string {
        global $PAGE, $USER;
        $q=$qa->get_question();
        $langs=empty($q->acelang)?[$q->language]:\qtype_coderunner_util::extract_languages($q->acelang)[0];
        return json_encode(['brokerUrl'=>(string)get_config('local_vizcode','brokerurl'),
            'userId'=>(int)$USER->id,'languages'=>$langs,'readOnly'=>(bool)$options->readonly,
            'usageid'=>$qa->get_usage_id(),'slot'=>$qa->get_slot(),'questiontype'=>$q->coderunnertype], JSON_THROW_ON_ERROR);
    }
    public static function feedback(\question_attempt $qa, string $html): string {
        $q=$qa->get_question();$checked=$qa->get_last_step_with_behaviour_var('_try');
        $language=$checked->get_qt_var('language') ?: $q->language;
        $labels=['python3'=>'Python','cpp'=>'C++','java'=>'Java'];
        $heading=\html_writer::tag('p','Answer checked in '.s($labels[strtolower($language)] ?? $language),['class'=>'vizcode-report-label']);
        $raw=$qa->get_last_behaviour_var('_vizcode_metrics');$metrics=$raw?json_decode($raw,true):[];
        $parts=[];
        foreach (['runtime_ms'=>['CPU time','ms'],'memory_mb'=>['Peak memory','MB']] as $name=>[$label,$unit]) {
            $v=$metrics[$name] ?? null;$parts[]=$label.': '.(is_numeric($v)?format_float((float)$v,2).' '.$unit:'unavailable');
        }
        return $heading.\html_writer::tag('p','Student — '.implode(' · ',$parts),['class'=>'vizcode-resources']).$html;
    }
    /** Only bounded public measurements cross the renderer boundary. */
    public static function measurement($response): void {
        foreach (['runtime_ms','memory_mb'] as $key) {
            $value=$response->$key ?? null;
            if (is_numeric($value) && is_finite((float)$value) && (float)$value >= 0) {
                $GLOBALS['local_vizcode_metrics'][$key][]=(float)$value;
            }
        }
    }
    public static function metrics(): array {
        $m=$GLOBALS['local_vizcode_metrics'] ?? [];
        return ['runtime_ms'=>empty($m['runtime_ms'])?null:array_sum($m['runtime_ms']),
            'memory_mb'=>empty($m['memory_mb'])?null:max($m['memory_mb'])];
    }
}
