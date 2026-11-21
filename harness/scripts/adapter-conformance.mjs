// Check an adapter's JSON output without installing a language-specific SDK.
import {readFile} from 'node:fs/promises';
import {validateDocument} from '../../plugin/vizcode/frontend/src/widget/protocol.mjs';
const file=process.argv[2];if(!file)throw Error('Usage: node harness/scripts/adapter-conformance.mjs trace.json');
const result=validateDocument(JSON.parse(await readFile(file,'utf8')));
console.log('Valid VizCode '+result.version+' trace: '+result.events.length+' events');
