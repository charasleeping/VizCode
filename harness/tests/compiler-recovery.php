<?php
/** Recovery is bounded, ignores source excerpts and never returns a crash as a failure. */
define('MOODLE_INTERNAL',true);
class moodle_exception extends Exception {public function __construct(...$args){parent::__construct($args[0]);}}
require __DIR__.'/../../plugin/vizcode/classes/compiler_recovery.php';
use local_vizcode\compiler_recovery;
function verify($condition){if(!$condition)throw new Exception('Compiler recovery contract failed');}
$crash=['outcome'=>11,'cmpinfo'=>"Segmentation fault\n"];$pass=['outcome'=>15,'stdout'=>'120'];
$calls=0;verify(compiler_recovery::execute(function()use(&$calls,$crash,$pass){return ++$calls===1?$crash:$pass;})===$pass && $calls===2);
$calls=0;try{compiler_recovery::execute(function()use(&$calls,$crash){$calls++;return $crash;});throw new Exception('Crash accepted');}catch(moodle_exception $e){verify($calls===2);}
foreach([['outcome'=>11,'cmpinfo'=>'SyntaxError: invalid syntax'],['outcome'=>11,'cmpinfo'=>"  File prog.py\nSegmentation fault\nSyntaxError: invalid syntax"],['outcome'=>12,'stderr'=>'Segmentation fault'],['outcome'=>15,'stdout'=>'Segmentation fault']]as$result){$calls=0;verify(compiler_recovery::execute(function()use(&$calls,$result){$calls++;return $result;})===$result && $calls===1);}
echo "Compiler crashes retry once; persistent crashes stay ungraded; syntax/runtime failures stay failures\n";
$gcc=['outcome'=>11,'cmpinfo'=>"g++: internal compiler error: Segmentation fault signal terminated program collect2\nPlease submit a full bug report, with preprocessed source (by using -freport-bug).\nSee <file:///usr/share/doc/gcc-15/README.Bugs> for instructions.\n"];
$calls=0;verify(compiler_recovery::execute(function()use(&$calls,$gcc,$pass){return ++$calls===1?$gcc:$pass;})===$pass && $calls===2);
$calls=0;try{compiler_recovery::execute(function()use(&$calls,$gcc){$calls++;return $gcc;});throw new Exception('GCC crash accepted');}catch(moodle_exception $e){verify($calls===2);}
$syntax=['outcome'=>11,'cmpinfo'=>"prog.cpp:1:2: error: #error g++: internal compiler error: Segmentation fault\nPlease submit a full bug report\n"];
$calls=0;verify(compiler_recovery::execute(function()use(&$calls,$syntax){$calls++;return $syntax;})===$syntax && $calls===1);
echo "Captured GCC collect2 crash retries; persistent compiler crashes remain ungraded\n";
