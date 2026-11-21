<?php
// SPDX-License-Identifier: GPL-3.0-or-later
/** Shared lecture-question content; no tracer behaviour is changed. */
function vizcode_cpp_object_demo_definition(): array {
    $source = <<<'CPP'
struct FactorialState {
    int input;
    int total;
};

int print_factorial(int n) {
    FactorialState state{n, 1};
    FactorialState snapshot = state;
    FactorialState* worker = &state;
    FactorialState* observer = &state;

    for (int factor = 2; factor <= snapshot.input; ++factor) {
        worker->total *= factor;
    }

    return observer->total;
}
CPP;
    $text = <<<'HTML'
<h4>One object, two pointers, one independent copy</h4>
<p>Define <code>print_factorial(int n)</code> to return the factorial of a non-negative integer. The supplied implementation stores its running result in a <code>FactorialState</code> object.</p>
<p>For the visualization, enter <code>5</code> in the function's argument box and tick <code>print_factorial</code>. Step into the function, or set a breakpoint on <code>worker-&gt;total *= factor;</code>.</p>
<ul>
<li><code>state</code> is the original object. <code>worker</code> and <code>observer</code> both point to it; follow their arrows to the same object in Objects.</li>
<li><code>snapshot</code> is a separate copy. Predict whether its <code>total</code> changes as the loop updates <code>worker-&gt;total</code>.</li>
<li>Watch the original total become <code>2</code>, <code>6</code>, <code>24</code> and <code>120</code>. Inspect <code>__return__</code> when the function returns.</li>
</ul>
<p>These objects have local, automatic storage; appearing in Objects does not mean they were allocated with <code>new</code>. Inspect them while the function is active, before their lifetimes end. Return the result without printing extra text.</p>
HTML;
    return ['C++ object tracing','cpp_function',$source,'cout << print_factorial(5) << endl;','120',$text,
        '<p>Both pointers alias <code>state</code>, so a change through <code>worker</code> is visible through <code>observer</code>. <code>snapshot</code> is a value copy and keeps its initial total of 1. The returned factorial is 120 for input 5.</p>'];
}

/** Complete Java class using CodeRunner's native java_class template. */
function vizcode_java_object_demo_definition(): array {
    $source = <<<'JAVA'
class FactorialDemo {
    static class FactorialState {
        int total = 1;
        int[] products;

        FactorialState(int count) {
            products = new int[count];
        }

        void multiply(int factor) {
            total *= factor;
            products[factor - 2] = total;
        }
    }

    static int print_factorial(int n) {
        FactorialState state = new FactorialState(Math.max(0, n - 1));
        FactorialState observer = state;
        int[] history = state.products;

        for (int factor = 2; factor <= n; factor++) {
            state.multiply(factor);
        }

        return observer.total;
    }
}
JAVA;
    $text = <<<'HTML'
<h4>Shared references, an array and a method call</h4>
<p>Implement <code>FactorialDemo.print_factorial(int n)</code> to return the factorial of a non-negative integer. The supplied class stores its calculation in a <code>FactorialState</code> object and an array of intermediate products.</p>
<p>For the visualization, enter <code>5</code> in the argument box and tick <code>print_factorial</code>. Set a breakpoint on <code>state.multiply(factor);</code>, then step into the call.</p>
<ul>
<li><code>state</code> and <code>observer</code> refer to the same <code>FactorialState</code> object. Follow both arrows to it.</li>
<li><code>history</code> and the object's <code>products</code> field refer to the same array. Watch its zeroes become <code>[2, 6, 24, 120]</code>.</li>
<li>Inside <code>multiply</code>, inspect the extra stack frame and its <code>this</code> reference to that same object. Watch <code>total</code> change through <code>2</code>, <code>6</code>, <code>24</code> and <code>120</code>.</li>
<li>Inspect the returned <code>__return__</code> value when <code>print_factorial</code> finishes. Try <code>0</code> too: the empty array accompanies a result of <code>1</code>.</li>
</ul>
<p>The function-row argument is for local debugging only. Check uses the question's tests. Return the result without printing extra text.</p>
HTML;
    return ['Java object tracing','java_class',$source,'System.out.println(FactorialDemo.print_factorial(5));','120',$text,
        '<p>Assigning an object or array reference does not copy the object or array. Both object references observe the same total; both array references observe the same products. Each instance-method call has its own frame, with <code>this</code> referring to the shared object. Input 5 returns 120; input 0 returns 1.</p>'];
}

/** Save a fresh native question version, keeping the old version and marking rules. */
function vizcode_save_object_demo(array $definition, stdClass $category, context $context, ?stdClass $previous = null): stdClass {
    global $DB;
    [$name,$type,$source,$test,$expected,$text,$feedback] = $definition;
    $form = $previous ? clone $DB->get_record('question_coderunner_options',['questionid'=>$previous->id],'*',MUST_EXIST) : new stdClass();
    unset($form->id, $form->questionid);
    $defaults = ['defaultmark'=>1,'penalty'=>0,'prototypetype'=>0,'allornothing'=>1,'penaltyregime'=>'0, 10, 20, ...',
        'templateparams'=>'{}','templateparamslang'=>'twig','uiplugin'=>'vizcode','uiparameters'=>'{}'];
    foreach($defaults as $key=>$value)if(!property_exists($form,$key))$form->$key=$value;
    $form->category=$category->id.','.$context->id;$form->context=$context;$form->qtype='coderunner';
    $form->name=$name;$form->coderunnertype=$type;$form->customise=1;$form->validateonsave=0;
    $form->questiontext=['text'=>$text,'format'=>FORMAT_HTML];$form->generalfeedback=['text'=>$feedback,'format'=>FORMAT_HTML];
    $form->answer=$source;$form->answerpreload=$source;
    if($previous){$form->defaultmark=$previous->defaultmark;$form->penalty=$previous->penalty;$form->idnumber=$previous->idnumber;}
    $cases=$previous && $previous->options->coderunnertype===$type ? $DB->get_records('question_coderunner_tests',['questionid'=>$previous->id],'id ASC') : [];
    if(!$cases)$cases=[(object)['testcode'=>$test,'stdin'=>'','expected'=>$expected,'extra'=>'','testtype'=>0,'useasexample'=>1,'display'=>'SHOW','hiderestiffail'=>0,'mark'=>1]];
    foreach(['testcode','stdin','expected','extra','testtype','useasexample','display','hiderestiffail','mark'] as $field)$form->$field=array_values(array_map(fn($case)=>$case->$field,$cases));
    $form->ordering=range(0,count($cases)-1);
    $record=(object)['qtype'=>'coderunner','category'=>$category->id,'contextid'=>$context->id];
    if($previous)$record->id=$previous->id;
    return question_bank::get_qtype('coderunner')->save_question($record,$form);
}

/** Find the latest named question in the demo course, excluding restored test courses. */
function vizcode_demo_question_id(string $name): int {
    global $DB;
    $rows = $DB->get_records_sql('SELECT q.id FROM {question} q
        JOIN {question_versions} v ON v.questionid=q.id
        JOIN {question_bank_entries} e ON e.id=v.questionbankentryid
        JOIN {question_categories} category ON category.id=e.questioncategoryid
        JOIN {context} ctx ON ctx.id=category.contextid
        JOIN {course} course ON course.id=ctx.instanceid
        WHERE q.name=? AND q.qtype=? AND ctx.contextlevel=? AND course.shortname=? AND v.status=?
        ORDER BY v.version DESC, q.id DESC', [$name, 'coderunner', CONTEXT_COURSE, 'VIZCODE_CR', 'ready'], 0, 1);
    if (!$rows) {
        throw new Exception('Demo question not found: '.$name);
    }
    return (int)reset($rows)->id;
}
