import { createServer } from 'node:http';
/** Browser regression checks using an isolated Chrome process and mock extension storage. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const profile = await mkdtemp(join(tmpdir(), 'kairos-companion-'));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required', 'about:blank'
], { stdio: ['ignore', 'ignore', 'pipe'] });
const server=createServer((req,res)=>res.end('<!doctype html><body>Storage test</body>'));
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let socket;
try {
  const endpoint = await new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error('Chrome startup timeout')), 15000);
    chrome.stderr.on('data', data => {
      output += data;
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timeout); resolve(match[1]); }
    });
    chrome.on('error', reject);
  });
  const pages = await (await fetch(`http://${new URL(endpoint).host}/json`)).json();
  socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => { socket.onopen = resolve; });
  let id = 0;
  const pending = new Map();
  socket.onmessage = event => {
    const data = JSON.parse(event.data);
    if (pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      data.error ? reject(data.error) : resolve(data.result);
    }
  };
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const run = async expression => {
    if (expression.startsWith('(await ')) expression = `(async()=>(${expression}))()`;
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await call('Emulation.setDeviceMetricsOverride',{width:1360,height:850,deviceScaleFactor:1,mobile:false});
  await call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/`});
  await run('new Promise(r=>setTimeout(r,100))');
  await run(`window.settings={aiProvider:'openai',aiModel:'gpt-6.1-terra',autoRefineNotes:false,uiLanguage:'zh'};window.local={};window.listeners=[];window.jobs=[];
    const area=name=>({get:async()=>({...window[name]}),set:async values=>{const changes={};for(const [key,value] of Object.entries(values)){changes[key]={oldValue:window[name][key],newValue:value};window[name][key]=value;}for(const listener of listeners)listener(changes,name==='settings'?'sync':'local');}});
    window.chrome={i18n:{getUILanguage:()=> 'zh-CN'},storage:{sync:area('settings'),local:area('local'),onChanged:{addListener:fn=>listeners.push(fn)}},runtime:{getURL:()=>'',onMessage:{addListener:fn=>window.handler=fn}}};window.Kairos={log:()=>{}};
    window.generateAI=(settings,options)=>new Promise((resolve,reject)=>jobs.push({options,resolve,reject}));`);
  await run((await readFile(new URL('../src/ai-providers.js',import.meta.url),'utf8')).replace(/^export /gm,''));
  await run((await readFile(new URL('../src/note-refinement.js',import.meta.url),'utf8')).replace(/^export /gm,''));
  const background=await readFile(new URL('../src/background.js',import.meta.url),'utf8');
  await run(background.slice(background.indexOf('const DB_NAME'),background.indexOf('// --- Gemini API Logic ---')));
  await run('chrome.runtime.sendMessage=(message,callback)=>handler(message,{},callback)');
  await run(await readFile(new URL('../src/content/storage.js',import.meta.url),'utf8'));
  await run('window.store=new Kairos.StorageManager()');
  const act = expression => run(`(async()=>{${expression}})()`);
  await run(`window.ask=(type,payload)=>new Promise((resolve,reject)=>handler({type,payload},{},r=>r.success?resolve(r.data):reject(Error(r.error))));
    window.waitFor=async predicate=>{for(let i=0;i<100;i++){if(await predicate())return;await new Promise(r=>setTimeout(r,20));}throw Error('Timed out waiting for note update');};
    window.note=(id,content='prism colors angle')=>({id,videoId:'test',videoTitle:'Light',videoUrl:'https://example.com/video',timestamp:138,timeLabel:'02:18',content,source:'user',context:'Different wavelengths bend at different angles.',createdAt:Date.now()});`);
  await run('store.saveNote(note("off"))');
  assert.equal(await run('jobs.length'),0,'AI off saves without any provider call');
  assert.equal(await run('(await ask("GET_NOTE",{id:"off"})).content'),'prism colors angle');
  await run('window.backgroundErrors=[];console.error=(...args)=>backgroundErrors.push(args.map(String));');
  assert.deepEqual(await run('ask("SET_AUTO_REFINE",{enabled:true})'),{status:'configuration_required'});
  assert.equal(await run('backgroundErrors.length'),0,'Missing configuration is not logged as a background error');
  assert.equal(await run('settings.autoRefineNotes'),false,'Missing configuration does not enable AI');
  await run('window.originalGet=chrome.storage.sync.get;chrome.storage.sync.get=async()=>{throw Error("Storage unavailable")};');
  assert.equal(await run('ask("SET_AUTO_REFINE",{enabled:true}).catch(e=>e.message)'),'Storage unavailable');
  assert.equal(await run('backgroundErrors.length'),1,'Real storage failures remain reported');
  await run('chrome.storage.sync.get=originalGet;backgroundErrors.length=0;');
  await act('settings.openaiApiKey="test-key";await ask("SET_AUTO_REFINE",{enabled:true});await store.saveNote(note("first"))');
  assert.equal(await run('(await ask("GET_NOTE",{id:"first"})).refinement.status'),'pending');
  assert.equal(await run('(await ask("GET_NOTE",{id:"first"})).content'),'prism colors angle','Original is committed before AI resolves');
  assert.ok(await run('jobs[0].options.prompt.includes("Different wavelengths")'));
  await act('jobs[0].resolve("A prism bends colors at different angles.");await waitFor(async()=> (await ask("GET_NOTE",{id:"first"})).refinement.status==="complete")');
  assert.deepEqual(await run('(()=>ask("GET_NOTE",{id:"first"}).then(n=>[n.originalContent,n.aiContent,n.content]))()'),['prism colors angle','A prism bends colors at different angles.','A prism bends colors at different angles.']);
  await act('await ask("ATTACH_NOTE_IMAGE",{id:"first",videoId:"test",imageUrl:"data:image/png;base64,AA=="})');
  assert.equal(await run('jobs.length'),1,'Late screenshots do not trigger a second refinement');
  assert.equal(await run('(await ask("GET_NOTE",{id:"first"})).originalContent'),'prism colors angle','Metadata patches preserve both versions');
  await act('await store.saveNote(note("first","second draft"));await store.saveNote(note("first","third draft"));jobs[1].resolve("Stale second result");await new Promise(r=>setTimeout(r,50))');
  assert.equal(await run('(await ask("GET_NOTE",{id:"first"})).content'),'third draft','A stale response cannot overwrite a newer save');
  await act('jobs[2].resolve("Third draft refined");await waitFor(async()=>(await ask("GET_NOTE",{id:"first"})).refinement.status==="complete")');
  assert.equal(await run('(await ask("GET_NOTE",{id:"first"})).versions[0].aiContent'),'A prism bends colors at different angles.');
  await act('await store.saveNote(note("deleted"));await ask("DELETE_NOTE",{id:"deleted"});jobs.at(-1).resolve("Must not resurrect");await new Promise(r=>setTimeout(r,50))');
  assert.equal(await run('ask("GET_NOTE",{id:"deleted"})'),null);
  await act('await store.saveNote(note("cancelled"));await ask("SET_AUTO_REFINE",{enabled:false});jobs.at(-1).resolve("Must not replace after off");await new Promise(r=>setTimeout(r,50))');
  assert.equal(await run('(await ask("GET_NOTE",{id:"cancelled"})).refinement.status'),'cancelled');
  assert.equal(await run('(await ask("GET_NOTE",{id:"cancelled"})).content'),'prism colors angle');
  await act('await ask("SET_AUTO_REFINE",{enabled:true});await store.saveNote(note("failed"));jobs.at(-1).reject(Error("Network down"));await waitFor(async()=>(await ask("GET_NOTE",{id:"failed"})).refinement.status==="error")');
  assert.equal(await run('(await ask("GET_NOTE",{id:"failed"})).originalContent'),'prism colors angle');
  await act('await mutateNote("interrupted",()=>({...note("interrupted"),revision:1,updatedAt:1,refinement:{status:"pending",token:"old-worker",startedAt:Date.now()-100000}}))');
  assert.equal(await run('(await ask("GET_NOTE",{id:"interrupted"})).refinement.status'),'error','Interrupted jobs recover instead of spinning forever');
  await act('await ask("SET_AUTO_REFINE",{enabled:false})');
  for (const name of ['i18n','refinement','delete_button','config','utils','markdown','capture','styles','companion','sidepanel','overlay']) {
    await run(await readFile(new URL('../src/content/'+name+'.js',import.meta.url),'utf8'));
  }
  await act(`await Kairos.I18n.init();await Kairos.Refinement.init();
    document.body.style.cssText='margin:0;background:#233440';
    document.body.innerHTML='<video muted style="position:absolute;left:20px;top:60px;width:880px;height:495px"></video>';
    const canvas=document.createElement('canvas');canvas.width=880;canvas.height=495;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#233440';ctx.fillRect(0,0,880,495);ctx.fillStyle='#b8d9e4';ctx.font='26px sans-serif';ctx.fillText('Light and colour',240,240);
    window.video=document.querySelector('video');video.srcObject=canvas.captureStream(10);await video.play();Object.defineProperty(video,'duration',{value:600});
    Kairos.Utils.getVideoInfo=()=>({videoId:'test',url:'https://example.com/video',title:'Light and colour'});
    window.side=new Kairos.SidePanelManager();side.currentVideoId='test';side.injectStyles();side.container=side.buildPanel();side.container.style.cssText='position:absolute;left:920px;top:60px;width:400px';document.body.appendChild(side.container);
    window.o=new Kairos.OverlayManager();o.sidePanel=side;o.subtitleManager={getContext:()=> 'A prism separates white light.'};await o.init();o.currentVideoId='test';o.updatePosition(video.getBoundingClientRect(),video);o.expandOrb();o.setIslandPinned(true,false);
    window.toggle=side.container.querySelector('.kairos-ai-toggle');window.islandToggle=o.shadowRoot.querySelector('.kairos-ai-toggle');`);
  assert.deepEqual(await run('[toggle.textContent,islandToggle.textContent]'),['AI 关闭','AI 关闭']);
  assert.equal(await run('!!toggle.closest(".kairos-sp-header-actions")'),true);
  await act('delete settings.openaiApiKey;window.openedTabs=[];chrome.tabs={create:async options=>openedTabs.push(options)};toggle.click();await waitFor(()=>openedTabs.length===1 && !toggle.disabled);');
  assert.equal(await run('openedTabs[0].url'),'/src/dashboard.html?tab=settings');
  assert.deepEqual(await run('[toggle.getAttribute("aria-pressed"),islandToggle.getAttribute("aria-pressed")]'),['false','false']);
  assert.equal(await run('toggle.title'),'请先在设置中配置 AI 提供商');
  assert.equal(await run('backgroundErrors.length'),0,'Configuration guidance does not emit background errors');
  await run('settings.openaiApiKey="test-key";');
  await act('toggle.click();await waitFor(()=>islandToggle.textContent==="AI 开启")');
  assert.equal(await run('settings.autoRefineNotes'),true);
  await act(`await o.handlePinCapture();window.uiPin=o.activePin;o.noteInput.value='prism, colors';o.noteInput.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await waitFor(()=>uiPin.savedToStorage && !o.isEditing);`);
  assert.equal(await run('video.paused'),false,'Enter resumes playback before AI completes');
  assert.equal(await run('side.notes.find(n=>n.id===uiPin.id).content'),'prism, colors');
  assert.equal(await run('o.islandList.querySelector(".kairos-island-note").children[1].textContent'),'prism, colors');
  assert.equal(await run('o.islandList.querySelector(".kairos-refinement-status").dataset.state'),'pending');
  assert.ok(await run('jobs.at(-1).options.image.startsWith("data:image/")'),'Captured frame reaches refinement request');
  await writeFile(join(profile,'refinement-pending.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await act('jobs.at(-1).resolve("A prism separates white light into colors.");await waitFor(()=>uiPin.aiContent && side.notes.find(n=>n.id===uiPin.id)?.aiContent);await new Promise(r=>setTimeout(r,350))');
  assert.equal(await run('o.islandList.querySelector(".kairos-island-note").children[1].textContent'),'A prism separates white light into colors.');
  assert.equal(await run('side.elements.notesList.querySelectorAll(".kairos-sp-note-item").length'),1,'Refinement replaces the same row');
  assert.equal(await run('o.islandList.querySelectorAll(".kairos-island-note-row").length'),1);
  await writeFile(join(profile,'refinement-complete.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await act('o.openNoteInput(uiPin,true);o.noteInput.value="new draft";await o.saveNote();o.openNoteInput(uiPin,true);o.noteInput.value="unsaved thought";jobs.at(-1).resolve("Revised saved draft");await waitFor(()=>!!uiPin.deferredRefinement)');
  assert.equal(await run('o.noteInput.value'),'unsaved thought','An in-flight result never overwrites the active editor');
  await run('o.cancelNote()');
  assert.equal(await run('uiPin.note'),'Revised saved draft','Closing the editor applies the deferred committed result');
  await act('o.openNoteInput(uiPin,true);o.noteInput.value="one more";await o.saveNote();o.currentVideoId="next";side.currentVideoId="next";o.pins=[];o.renderIslandNotes();jobs.at(-1).resolve("Previous video result");await waitFor(async()=> (await ask("GET_NOTE",{id:uiPin.id})).aiContent==="Previous video result")');
  assert.equal(await run('o.pins.length'),0,'Results from the previous video stay out of the new island');
  await act('islandToggle.click();await waitFor(()=>toggle.textContent==="AI 关闭")');
  assert.equal(await run('settings.autoRefineNotes'),false);
  console.log('PASS: committed originals, AI off/on, contextual request, versions, stale-edit/delete/off guards, failures/recovery, live panels, playback and editor protection');
  console.log('Screenshots: '+profile);

} finally {socket?.close();chrome.kill();server.close();}
