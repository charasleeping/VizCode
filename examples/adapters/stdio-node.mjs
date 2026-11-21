// Same executable-adapter contract, implemented without any VizCode dependency.
let raw='';for await(const chunk of process.stdin){raw+=chunk;if(Buffer.byteLength(raw)>650000)throw Error('Request exceeds limit');}
try{const request=JSON.parse(raw);let total=0n;const events=[];for(const [index,text]of request.code.split('\n').entries()){
 if(!text.trim())continue;total+=BigInt(text.trim());events.push({kind:'step_line',location:{source:'answer',line:index+1},frames:[{id:'main',name:'main',locals:[{name:'total',value:{kind:'integer',value:String(total)}}]}],globals:[],objects:{},stdout:''});
}console.log(JSON.stringify({version:'1.0',code:request.code,events}));}catch(error){console.log(JSON.stringify({error:error.message}));}
