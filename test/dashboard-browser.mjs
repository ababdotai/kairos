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
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  const html = (await readFile(new URL('../src/dashboard.html', import.meta.url), 'utf8')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  await run(`document.open();document.write(${JSON.stringify(html)});document.close()`);
  await run(`window.cache={};window.requests=[];window.failSummary=false;
    const canvas=document.createElement('canvas');canvas.width=480;canvas.height=320;
    const c=canvas.getContext('2d');c.fillStyle='#476c79';c.fillRect(0,0,480,320);c.fillStyle='#fff';c.font='24px sans-serif';c.fillText('Video snapshot',40,160);
    window.notes=[{id:'one',videoId:'a',videoTitle:'学习如何做出更好的决定',videoUrl:'https://example.com/video',timestamp:92,timeLabel:'01:32',content:'不要只看结果，还要看当时的信息与选择。',source:'user',imageUrl:canvas.toDataURL(),createdAt:1},{id:'two',videoId:'a',videoTitle:'学习如何做出更好的决定',videoUrl:'https://example.com/video',timestamp:119,timeLabel:'01:59',content:'先记录判断依据，再回头检查。',source:'user',createdAt:1},{id:'three',videoId:'b',videoTitle:'Second video',timestamp:0,timeLabel:'00:00',content:'Other video',createdAt:0}];
    window.chrome={storage:{sync:{get:async(keys,cb)=>{const result={uiLanguage:'zh',providerModels:{openai:'gpt-5.4-nano'}};if(cb)setTimeout(()=>cb(result),0);return result;},set:async()=>{}},local:{get:async k=>({[k]:cache[k]}),set:async v=>Object.assign(cache,v)}},runtime:{sendMessage:async(msg,cb)=>{requests.push(msg);if(cb){setTimeout(()=>cb({success:true,data:notes}),0);return;}if(failSummary)return {success:false,error:'Test provider unavailable'};return {success:true,data:{text:'## 我的观看收获\\n\\n- [01:32] 判断过程和结果同样重要。\\n- [01:59] 记录依据，留待复盘。',fingerprint:summaryFingerprint(notes.filter(n=>n.videoId===msg.payload.videoId))}};}}};
    Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.copied=text;}}});`);
  for (const file of ['src/provider-icons.js','src/ai-providers.js','src/content/i18n.js','src/content/markdown.js','src/content/refinement.js','src/note-summary.js','src/share-image.js','src/dashboard-summary.js','src/dashboard.js']) {
    let code = await readFile(new URL('../'+file,import.meta.url),'utf8');
    code=code.replace(/^import .*;\s*$/gm,'').replace(/^export /gm,'');
    await run(code);
  }
  const icon = 'data:image/png;base64,' + (await readFile(new URL('../public/icons/icon128.png', import.meta.url))).toString('base64');
  await run(`chrome.runtime.getURL=()=>${JSON.stringify(icon)};document.querySelectorAll('img.logo,img.welcome-logo').forEach(img=>img.src=${JSON.stringify(icon)})`);
  await run('document.dispatchEvent(new Event("DOMContentLoaded"));new Promise(r=>setTimeout(r,100))');
  await run('document.querySelector(".video-item").click()');
  assert.equal(await run('document.querySelector("#btnSummary").textContent'),'总结与分享');
  await run(`window.dispatchEvent(new CustomEvent('kairos-note-updated',{detail:{id:'one',note:{...notes[0],updatedAt:2,originalContent:'结果、信息、选择',aiContent:notes[0].content,refinement:{status:'complete'},versions:[{originalContent:'旧关键词',aiContent:'先前的整理版'}]}}}));`);
  assert.equal(await run('document.querySelector("#note-one .note-version-original .version-text").textContent.trim()'),'结果、信息、选择');
  assert.ok(await run('document.querySelector("#note-one .note-versions").textContent.includes("不要只看结果")'));
  assert.ok(await run('document.querySelector("#note-one .note-version-history").textContent.includes("先前的整理版")'));
  await writeFile(join(profile,'dashboard-versions.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));

  assert.equal(await run('getComputedStyle(document.querySelector(".note-body.user-note .content")).fontSize'),'18px');
  assert.equal(await run('document.querySelector(".note-screenshot-container").getBoundingClientRect().width<=300'),true,'Screenshot no longer spans the full page with empty sidebars');
  await run('document.querySelector(".note-screenshot").click()');
  assert.equal(await run('document.querySelector("dialog").open'),true,'Screenshot can be enlarged');
  assert.equal(await run('(()=>{const dialog=document.querySelector(".snapshot-dialog").getBoundingClientRect(),button=document.querySelector(".snapshot-close").getBoundingClientRect();return button.left>dialog.left+dialog.width/2&&button.top<dialog.top+30})()'),true,'Close button sits in the upper right');
  assert.equal(await run('getComputedStyle(document.querySelector(".snapshot-dialog img")).cursor'),'zoom-out');
  await run('document.querySelector(".snapshot-dialog img").click();document.querySelector(".snapshot-dialog img").click();new Promise(r=>setTimeout(r,300))');
  assert.equal(await run('document.querySelector(".snapshot-dialog")'),null,'Clicking the expanded image shrinks it back, including during the opening animation');
  assert.equal(await run('document.activeElement.classList.contains("note-screenshot")'),true,'Closing restores thumbnail focus');
  await run('document.querySelector(".note-screenshot").click();document.querySelector(".snapshot-close").click();new Promise(r=>setTimeout(r,300))');
  assert.equal(await run('document.querySelector(".snapshot-dialog")'),null,'Top-right close uses the same animated dismissal');
  await call('Emulation.setEmulatedMedia', { features: [{name:'prefers-reduced-motion',value:'reduce'}] });
  await run('document.querySelector(".note-screenshot").click();document.querySelector(".snapshot-dialog").dispatchEvent(new Event("cancel",{cancelable:true}));new Promise(r=>setTimeout(r,20))');
  assert.equal(await run('document.querySelector(".snapshot-dialog")'),null,'Escape dismissal respects reduced motion');
  await call('Emulation.setEmulatedMedia', { features: [] });
  await run('document.querySelector("#btnSummary").click();new Promise(r=>setTimeout(r,100))');
  assert.equal(await run('requests.filter(r=>r.type==="SUMMARIZE_VIDEO_NOTES").length'),1);
  assert.equal(await run('document.querySelector(".summary-editor").value.includes("01:32")'),true);
  assert.equal(await run('document.querySelector(".summary-editor").hidden'),true,'Summary opens as formatted reading view');
  await run('document.querySelector("[data-mode]").click()');
  assert.equal(await run('document.querySelector(".summary-editor").hidden'),false,'Edit toggle reveals editable text');
  await run('document.querySelector(".summary-editor").value="Edited summary";document.querySelector(".summary-editor").dispatchEvent(new Event("input"));new Promise(r=>setTimeout(r,20))');
  await run('document.querySelector("[data-share]").click();new Promise(r=>setTimeout(r,20))');
  assert.equal(await run('copied.includes("Edited summary")&&copied.includes("https://example.com/video")'),true);
  await run('document.querySelector(".video-item").click();document.querySelector("#btnSummary").click();new Promise(r=>setTimeout(r,30))');
  assert.equal(await run('document.querySelector(".summary-editor").value'),'Edited summary','Edited summary survives reopening');
  assert.equal(await run('requests.filter(r=>r.type==="SUMMARIZE_VIDEO_NOTES").length'),1,'Cache avoids redundant model calls');
  await run('failSummary=true;document.querySelector("[data-generate]").click();new Promise(r=>setTimeout(r,30))');
  assert.equal(await run('document.querySelector(".summary-editor").value'),'Edited summary','Generation failure keeps prior edits');
  assert.equal(await run('document.querySelector(".summary-status").textContent.includes("Test provider unavailable")'),true);
  await run('notes[0].content="Changed note";document.querySelector(".video-item").click();document.querySelector("#btnSummary").click();new Promise(r=>setTimeout(r,30))');
  assert.equal(await run('document.querySelector(".summary-status").textContent.includes("笔记已更新")'),true);
  await run('failSummary=false;document.querySelector("[data-generate]").click();new Promise(r=>setTimeout(r,30))');
  await run('(async()=>{document.querySelector("[data-image]").click();for(let i=0;i<100;i++){if(document.querySelector(".share-image-dialog")?.open && document.querySelector(".share-image-scroll img")?.naturalWidth)return;await new Promise(r=>setTimeout(r,30));}throw Error("Image preview did not load");})()');
  assert.equal(await run('document.querySelector(".share-image-dialog").open'),true,'Image preview opens in a dialog');
  assert.equal(await run('document.querySelector(".share-image-scroll img").naturalWidth'),1080,'Download preview uses 1080px raster output');
  assert.equal(await run('document.querySelector(".share-image-scroll img").naturalHeight>=1080'),true,'Image is square or portrait, growing with content');
  const imageData=await run('(async()=>{const blob=await (await fetch(document.querySelector(".share-image-scroll img").src)).blob();return await new Promise(r=>{const reader=new FileReader();reader.onload=()=>r(reader.result.split(",")[1]);reader.readAsDataURL(blob);});})()');
  await writeFile(join(profile,'share-image.png'),Buffer.from(imageData,'base64'));
  await run('window.downloads=[];HTMLAnchorElement.prototype.click=function(){downloads.push({href:this.href,name:this.download})};document.querySelector(".share-image-toolbar .primary").click()');
  assert.equal(await run('downloads.at(-1).name'),'Kairos-a-notes.png','Download exports a PNG for the selected video');
  assert.equal(await run('downloads.at(-1).href===document.querySelector(".share-image-scroll img").src'),true,'Preview and download use the same image');
  await run('document.querySelector(".share-image-dialog").close()');
  assert.equal(await run('document.querySelector(".share-image-dialog")'),null,'Closing removes preview');
  const longImage = await run(`(async()=>{const image=await renderShareImage({title:'中文标题 / English title',text:Array.from({length:30},(_,i)=>'- ['+i+':00] A useful observation with enough context to wrap naturally. 学到的重点要保留。').join('\\n'),source:'https://example.com/video',count:30,t:Kairos.I18n.t,logoUrl:chrome.runtime.getURL()});return {height:image.height,type:image.blob.type,size:image.blob.size};})()`);
  assert.ok(longImage.height>1440 && longImage.height<16000,'Long notes grow the canvas instead of clipping');
  assert.equal(longImage.type,'image/png');
  const oversized = await run(`renderShareImage({title:'Long',text:'- A note\\n'.repeat(400),count:400,t:Kairos.I18n.t}).then(()=>false,error=>error.message)`);
  assert.equal(typeof oversized,'string','Oversized exports report an error instead of returning a clipped image');
  const screenshot=await call('Page.captureScreenshot',{format:'png'});
  await writeFile(join(profile,'dashboard-summary.png'),Buffer.from(screenshot.data,'base64'));
  await run('document.querySelectorAll(".video-item")[1].click();document.querySelector("#btnSummary").click();new Promise(r=>setTimeout(r,30))');
  assert.equal(await run('requests.at(-1).payload.videoId'),'b','Summary requests stay scoped to selected video');
  await run('Kairos.I18n.setPreference("en");document.querySelector(".video-item").click();document.querySelector("#btnSummary").click();new Promise(r=>setTimeout(r,30))');
  assert.equal(await run('document.querySelector("#btnSummary").textContent'),'Summarize & share');
  assert.equal(await run('document.querySelector("[data-share]").textContent'),'Copy to share');
  await call('Emulation.setDeviceMetricsOverride', { width: 800, height: 900, deviceScaleFactor: 1, mobile: false });
  assert.equal(await run('getComputedStyle(document.querySelector(".note-body")).gridTemplateColumns.split(" ").length'),1,'Narrow windows stack screenshots below text');
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  for (const scheme of ['dark', 'light', 'dark']) {
    await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
    assert.equal(await run('getComputedStyle(document.documentElement).colorScheme'),scheme,'Dashboard responds live to system theme');
    assert.equal(await run('getComputedStyle(document.body).color'),scheme==='light'?'rgb(32, 47, 63)':'rgb(237, 242, 247)');
  }
  await run('document.querySelector(".nav-item[data-tab=settings]").click();document.querySelector("#brandHome").click()');
  assert.equal(await run('document.querySelector("#settingsView").style.display'),'none','Logo returns from settings to welcome');
  assert.equal(await run('document.querySelector(".welcome-tagline").textContent'),'Watch together. Remember more.');
  assert.equal(await run('document.querySelectorAll(".video-item.active").length'),0,'Welcome clears selected video');
  await run('Kairos.I18n.setPreference("zh");Kairos.I18n.localize();document.querySelector(".video-item").click();document.querySelector("#brandHome").click()');
  assert.equal(await run('document.querySelector(".welcome-tagline").textContent'),'一起看，随手记','Logo also restores localized welcome from notes');
  assert.equal(await run('document.querySelector(".brand-tagline").textContent'),'一起看，随手记');
  await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  await writeFile(join(profile,'dashboard-welcome-light.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await run('document.querySelector(".nav-item[data-tab=settings]").click()');
  assert.equal(await run('document.querySelectorAll(".provider-card").length'),6);
  await run(`document.querySelector('input[value="openai"]').click()`);
  assert.equal(await run('document.querySelector("#modelSelect").value'),'gpt-6-luna','Settings migrates legacy nano consistently with API routing');
  assert.deepEqual(await run('[...document.querySelector("#modelSelect").options].map(o=>o.value)'),['gpt-6.1-terra','gpt-6-astra','gpt-6.1-sol','gpt-6-luna'],'Settings offers the current OpenAI family');

  await run(`window.savedSettings={};chrome.storage.sync.set=async(updates,cb)=>{Object.assign(savedSettings,updates);cb?.();};
    document.querySelector('input[value="openai"]').click();document.querySelector('#apiKeyInput').value='sk-openai-test';document.querySelector('#modelSelect').value='gpt-6-astra';
    document.querySelector('input[value="anthropic"]').click();document.querySelector('#apiKeyInput').value='sk-ant-test';
    document.querySelector('input[value="openai"]').click();`);
  assert.equal(await run('document.querySelector("#apiKeyInput").value'),'sk-openai-test');
  assert.equal(await run('document.querySelector("#modelSelect").value'),'gpt-6-astra');
  await run('document.querySelector("#saveSettingsBtn").click()');
  assert.equal(await run('savedSettings.anthropicApiKey'),'sk-ant-test');
  assert.equal(await run('savedSettings.providerModels.openai'),'gpt-6-astra');
  await writeFile(join(profile,'providers-light.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'}]});
  await writeFile(join(profile,'providers-dark.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
  console.log('PASS: dashboard layout, image viewer, summary generation/edit/cache/copy/error/staleness and video isolation');
  console.log('Preview: '+join(profile,'dashboard-summary.png'));
} finally { socket?.close();chrome.kill(); }
