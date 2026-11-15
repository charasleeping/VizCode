import assert from 'node:assert/strict';
import {discover,buildCalls} from '../../plugin/vizcode/execution-assets/function-discovery.mjs';
for(const [language,source]of [
 ['python3','import math\nN=1\ndef first(x,y=2):\n print(x+y)\ndef second():\n return 3'],
 ['cpp','#include <iostream>\nconst int N=1;\nvoid first(int x,int y=2){std::cout<<x+y;}\nint second(){return 3;}']]){
 const d=discover(source,language);assert.ok(d.valid && !d.locked);assert.equal(d.rows.length,2);assert.equal(d.rows[0].parameters[1].optional,true);
 assert.equal(buildCalls(source,language).source,'');d.rows[0].checked=true;d.rows[0].args[0]='5';d.rows[1].checked=true;d.rows.reverse();
 const c=buildCalls(source,language,{version:1,rows:d.rows});assert.ok(c.source.startsWith('second('));assert.ok(c.source.includes('first('));
 const program=source+(language==='python3'?'\nprint(1)':language==='cpp'?'\nint main(){return 0;}':'\nconsole.log(1);');
 assert.ok(discover(program,language).locked);assert.equal(buildCalls(program,language,{version:1,rows:d.rows}).source,'');
 assert.equal(discover(source+'\n???',language).valid,false);
}
assert.equal(discover('def f(x):\n def nested(): pass\n return x','python3').rows.length,1);
assert.ok(discover('x=f()\ndef f(): pass','python3').locked);
console.log('Parser-only discovery, defaults, sequential calls, locked programs and nested exclusions passed');


const javaSource='class A { static int first(int x){return x;} static int second(){return 2;} int instance(){return 3;} }';
const java=discover(javaSource,'java');assert.ok(java.valid&&!java.locked);assert.equal(java.rows.length,3);assert.ok(java.rows[2].reason);
java.rows[0].checked=true;java.rows[0].args[0]='new int[]{5}[0]';java.rows[1].checked=true;java.rows.reverse();
assert.ok(buildCalls(javaSource,'java',{version:1,rows:java.rows}).source.startsWith('A.second('));
assert.ok(discover(javaSource.replace('int instance()','public static void main(String[] args)'),'java').locked);
assert.ok(discover('class A { static int x = helper(); static int helper(){return 1;} }','java').locked);
assert.equal(discover('static int f(int n){return n;}','java').rows[0].name,'VizAnswer.f');
assert.ok(discover('class A { static int f(int x){return x;} static int f(String x){return 2;} }','java').rows.every(r=>r.reason));
assert.match(discover('class A { private static int f(){return 2;} }','java').rows[0].reason,/private/);
console.log('Java fragments/classes, static calls, expressions, instance restrictions, overloads and main/initializer locking passed');

assert.throws(()=>discover('console.log(1)','nodejs'),/Unsupported language/);
assert.throws(()=>discover('console.log(1)','javascript'),/Unsupported language/);
