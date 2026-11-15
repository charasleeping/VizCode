import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { prepare, traceCpp } from '../../plugin/vizcode/execution-assets/cpp/runner.mjs';
const realFetch = globalThis.fetch;
globalThis.fetch = async url => new URL(url).protocol === 'file:' ? new Response(await readFile(url)) : realFetch(url);
const cases = [
 ['#include <iostream>\n#include <stdexcept>\nint main(){try{throw std::runtime_error("expected");}catch(const std::exception&e){std::cout<<e.what()<<"\\n";}}','expected\n'],
 ['#include <iostream>\nint main(){int n;std::cin>>n;std::cout<<n*2<<"\\n";}', '10\n'],
 ['#include <iostream>\n#include <vector>\nstruct B{std::vector<int> values;};int main(){B b{{1,2}};b.values.push_back(3);std::cout<<b.values.size()<<"\\n";}', '3\n'],
 ['#include <iostream>\nstruct B{int x;};int main(){auto p=new B{7};std::cout<<p->x<<"\\n";delete p;}', '7\n'],
 ['#include <iostream>\nint g=4;int main(){std::cout<<g<<"\\n";}', '4\n'],
 ['#include <iostream>\ntemplate<class T>T twice(T x){return x+x;}int main(){std::cout<<twice(3)<<"\\n";}', '6\n'],
 ['#include <iostream>\nint main(){int x=3;auto f=[x](int y){return x+y;};std::cout<<f(4)<<"\\n";}', '7\n'],
 ['#include <iostream>\nint main(){int x; x=3;std::cout<<x<<"\\n";}', '3\n'],
];
for (const [code, expected] of cases) {
 await prepare();const result=JSON.parse(await traceCpp({code,scratchCode:'',stdin:'5\n'}));
 assert.equal(result.trace.at(-1)?.stdout,expected,code+'\n'+JSON.stringify(result.trace.at(-1)));
 assert.ok(!result.trace.at(-1)?.exception_msg,code);
 assert.ok(result.trace.length>1);
}
console.log('C++ execution/trace contracts passed');
