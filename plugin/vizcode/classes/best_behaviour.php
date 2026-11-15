<?php
// SPDX-License-Identifier: GPL-3.0-or-later
namespace local_vizcode;
defined('MOODLE_INTERNAL') || die();
/** Records native CodeRunner earned scores; never substitutes a scoring policy. */
class best_behaviour extends \qbehaviour_adaptive_adapted_for_coderunner_base {
    public function process_submit(\question_attempt_pending_step $pendingstep, $isprecheck=false) {
        if (!integration::enabled($this->question)) return parent::process_submit($pendingstep,$isprecheck);
        $tries=(int)$this->qa->get_last_behaviour_var('_try',0);
        $GLOBALS['local_vizcode_metrics']=[];
        $status=parent::process_submit($pendingstep,$isprecheck);
        if ($status===\question_attempt::KEEP && $pendingstep->get_state()===\question_state::$invalid && $pendingstep->has_qt_var('_testoutcome')) throw new \moodle_exception('gradingunavailable','local_vizcode','',null,$this->question->get_validation_error($pendingstep->get_qt_data()));
        if ($isprecheck && $status===\question_attempt::KEEP && $pendingstep->has_qt_var('_testoutcome')) $pendingstep->set_behaviour_var('_vizcode_metrics',json_encode(integration::metrics(),JSON_THROW_ON_ERROR));
        if (!$isprecheck && $status===\question_attempt::KEEP && $pendingstep->has_behaviour_var('_rawfraction') &&
                $pendingstep->get_state()!==\question_state::$invalid) {
            $this->remember($pendingstep,$this->adjusted_fraction((float)$pendingstep->get_behaviour_var('_rawfraction'),$tries));
        }
        return $status;
    }
    private function best(): ?array {
        $value=$this->qa->get_last_behaviour_var('_vizcode_best');
        if (!$value) return null;
        $best=json_decode($value,true,64,JSON_THROW_ON_ERROR);
        // Rehydrate native response-file objects from their recorded attempt step,
        // never from JSON supplied by the browser or a serialized arbitrary class.
        if (isset($best['step']) && $best['step']<$this->qa->get_num_steps()) {
            $response=[];foreach($this->qa->get_step_iterator() as $index=>$step) {
                foreach($step->get_qt_data() as $key=>$data)$response[$key]=$data;
                if($index===$best['step'])break;
            }
            $best['response']=$response;
        }
        return $best;
    }
    private function remember(\question_attempt_pending_step $step,float $earned):array {
        $best=$this->best();
        if (!$best || $earned >= $best['earned']) {
            $response=$this->qa->get_last_qt_data();
            foreach ($step->get_qt_data() as $key=>$value) $response[$key]=$value;
            $metrics=integration::metrics();
            if ($metrics['runtime_ms']===null && $metrics['memory_mb']===null && $best && $this->question->is_same_response($response,$best['response'])) $metrics=$best['metrics'];
            $best=['earned'=>$earned,'response'=>$response,'raw'=>$step->get_behaviour_var('_rawfraction'),
                'step'=>$this->qa->get_num_steps(),'metrics'=>$metrics];
        }
        $stored=$best;$stored['response']=array_filter($best['response'],fn($value)=>is_scalar($value)||$value===null);
        $step->set_behaviour_var('_vizcode_best',json_encode($stored,JSON_THROW_ON_ERROR));
        $step->set_behaviour_var('_vizcode_metrics',json_encode(integration::metrics(),JSON_THROW_ON_ERROR));
        return $best;
    }
    public function process_finish(\question_attempt_pending_step $pendingstep) {
        if (!integration::enabled($this->question)) return parent::process_finish($pendingstep);
        if ($this->qa->get_state()->is_finished()) return \question_attempt::DISCARD;
        $tries=(int)$this->qa->get_last_behaviour_var('_try',0);
        $last=$this->qa->get_last_step();
        if ($last->has_behaviour_var('_try')) $tries--;
        $GLOBALS['local_vizcode_metrics']=[];
        $status=parent::process_finish($pendingstep);
        if ($pendingstep->get_state()===\question_state::$invalid && $pendingstep->has_qt_var('_testoutcome')) throw new \moodle_exception('gradingunavailable','local_vizcode','',null,$this->question->get_validation_error($pendingstep->get_qt_data()));
        $best=$this->best();
        if ($pendingstep->has_behaviour_var('_rawfraction')) {
            $best=$this->remember($pendingstep,$this->adjusted_fraction((float)$pendingstep->get_behaviour_var('_rawfraction'),max(0,$tries)));
        }
        if (!$best) return $status;
        $data=$pendingstep->get_all_data();
        foreach ($best['response'] as $key=>$value) $data[$key]=$value instanceof \question_file_loader ? $value->get_question_file_saver() : $value;
        $fraction=$pendingstep->get_fraction();
        $pendingstep->__construct($data,$pendingstep->get_timecreated(),$pendingstep->get_user_id(),$pendingstep->get_id());
        $pendingstep->set_fraction($fraction);
        $stored=$best;$stored['response']=array_filter($best['response'],fn($value)=>is_scalar($value)||$value===null);
        $pendingstep->set_behaviour_var('_vizcode_best',json_encode($stored,JSON_THROW_ON_ERROR));
        $pendingstep->set_behaviour_var('_vizcode_metrics',json_encode($best['metrics'],JSON_THROW_ON_ERROR));
        $pendingstep->set_behaviour_var('_rawfraction',$best['raw']);
        $pendingstep->set_state(\question_state::graded_state_for_fraction($best['raw']));
        $pendingstep->set_new_response_summary($this->question->summarise_response($best['response']));
        return $status;
    }
}
