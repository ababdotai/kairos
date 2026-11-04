import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { AI_PROVIDERS, resolveAI, resolveModel } from '../src/ai-providers.js';
let seen, endpoint, finish, empty = false, httpOK = true;
const context = vm.createContext({ resolveAI, AbortSignal,
  GoogleGenAI: class { models = { generateContent: async args => {seen=args;return {text:empty?'':'answer', candidates:[{finishReason:finish}]};} }; },
  OpenAI: class { constructor(options) {endpoint=options.baseURL;} chat={completions:{create:async args=>{seen=args;return {choices:[{message:{content:empty?'':'answer'},finish_reason:finish}]};}}}; },
  fetch: async (url, options) => {endpoint=url;seen=JSON.parse(options.body);return {ok:httpOK,json:async()=>({content:[{type:'thinking',thinking:'hidden'},{type:'text',text:empty?'':'answer'}],stop_reason:finish,error:{message:'Unauthorized'}})};}
});
vm.runInContext((await readFile(new URL('../src/ai-client.js',import.meta.url),'utf8')).replace(/^import .*;\s*$/gm,'').replace(/^export /gm,''),context);
const invoke=(settings,payload)=>{context.settings=settings;context.payload=payload;return vm.runInContext('generateAI(settings,payload)',context)};
for (const [id,p] of Object.entries(AI_PROVIDERS)) {
 for (const model of p.models) {
  const settings={aiProvider:id,aiModel:model,[p.keyField]:'test-key'};
  assert.equal(await invoke(settings,{prompt:'note',image:'data:image/png;base64,aGVsbG8='}),'answer');
  assert.equal(seen.model,model);
  assert.ok(JSON.stringify(seen).includes('aGVsbG8='));
  assert.ok(JSON.stringify(seen).includes('image/png'));
  if(id==='openai') { assert.equal(seen.max_completion_tokens,8192);assert.equal(seen.reasoning_effort,'low');assert.ok(!('max_tokens' in seen));assert.ok(!('temperature' in seen)); }
  if(id==='moonshot') {assert.equal(seen.reasoning_effort,'low');assert.ok(!seen.thinking);}
  await invoke(settings,{prompt:'summary'});
  assert.ok(!JSON.stringify(seen).includes('image'));
 }
 await assert.rejects(invoke({aiProvider:id},{prompt:'note'}),/API key/);
}
assert.equal(resolveAI({aiProvider:'moonshot',aiModel:'kimi-k2.5',moonshotApiKey:'test'}).model,'kimi-k3.1-pro');
assert.equal(resolveAI({aiProvider:'moonshot',providerModels:{moonshot:'kimi-k3.1-pro-highspeed'},moonshotApiKey:'test'}).model,'kimi-k3.1-pro');
assert.equal(resolveModel('moonshot','kimi-k3'),'kimi-k3');
assert.equal(resolveAI({geminiApiKey:'legacy'}).apiKey,'legacy');
assert.equal(resolveAI({aiProvider:'openai',aiModel:'kimi-k3.1-pro',openaiApiKey:'test'}).model,'gpt-6.1-terra');
for (const [oldModel, newModel] of [['gpt-5.4-mini','gpt-6.1-terra'], ['gpt-5.4-nano','gpt-6-luna']]) {
 assert.equal(resolveModel('openai',oldModel),newModel);
 await invoke({aiProvider:'openai',aiModel:oldModel,openaiApiKey:'test'},{prompt:'migrated note'});
 assert.equal(seen.model,newModel,'Old global preferences migrate in the request path');
 assert.equal(resolveAI({aiProvider:'openai',aiModel:'gpt-6-astra',providerModels:{openai:oldModel},openaiApiKey:'test'}).model,newModel,'Provider preference takes priority during migration');
}
await assert.rejects(invoke({aiProvider:'unknown'},{prompt:'test'}),/Unsupported/);
httpOK=false;await assert.rejects(invoke({aiProvider:'anthropic',anthropicApiKey:'test'},{prompt:'test'}),/Unauthorized/);httpOK=true;
empty=true;await assert.rejects(invoke({openaiApiKey:'test',aiProvider:'openai'},{prompt:'test'}),/no text/);empty=false;
finish='length';await assert.rejects(invoke({openaiApiKey:'test',aiProvider:'openai'},{prompt:'test'}),/too long/);
console.log('PASS: every curated model routes image/text correctly; key isolation, migration, failures, truncation and reasoning parameters');
