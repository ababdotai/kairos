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
  const runtimeErrors = [];
  let id = 0;
  const pending = new Map();
  socket.onmessage = event => {
    const data = JSON.parse(event.data);
    if (data.method === 'Runtime.exceptionThrown') runtimeErrors.push(data.params.exceptionDetails);
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
  await call('Runtime.enable');
  await call('Emulation.setDeviceMetricsOverride', {width:1440,height:1100,deviceScaleFactor:1,mobile:false});
  await call('Page.navigate',{url:'http://127.0.0.1:4173/kairos/'});
  await new Promise(r=>setTimeout(r,1500));
  assert.equal(await run('document.documentElement.lang'),await run('/^zh/i.test(navigator.languages[0])?"zh-CN":"en"'),'Initial language follows browser');
  await run('KairosSite.set("language","zh");KairosSite.set("theme","light")');
  assert.equal(await run('document.title'),'Kairos — 一起看，随手记');
  assert.equal(await run('getComputedStyle(document.body).backgroundColor'),'rgb(255, 255, 255)');
  assert.equal(await run('document.documentElement.scrollWidth<=innerWidth'),true);
  for(const path of ['','style.css','app.js','demos.css','assets/providers/openai.svg','preferences.js','locale.js','assets/avatar.png','assets/kairos.png','assets/avatar.gif','assets/text-note.png']) assert.equal((await fetch('http://127.0.0.1:4173/kairos/'+path)).status,200);
  await run('document.querySelector(".product-capture").scrollIntoView({behavior:"instant"});document.querySelector(".product-capture img").decode()');
  assert.equal(await run('document.querySelector(".product-capture img").naturalWidth'),3196,'Full-resolution authentic screenshot loads');
  await writeFile(join(profile,'website-real-product.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await run('scrollTo({top:0,behavior:"instant"})');
  assert.equal((await fetch('http://127.0.0.1:4173/kairos/missing')).status,404);
  await run('document.querySelector("#experience").scrollIntoView({behavior:"instant"})');
  await new Promise(r=>setTimeout(r,550));
  assert.equal(await run('document.querySelector(".header").classList.contains("is-compact")'),true,'Navigation contracts on scroll');
  assert.equal(await run('getComputedStyle(document.querySelector(".header")).position'),'fixed');
  assert.equal(await run('document.querySelector(".actions a:nth-child(2)").hash'),'#community');
  assert.equal(await run('!!document.querySelector("#community")'),true);
  await writeFile(join(profile,'website-product.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await run('scrollTo({top:0,behavior:"instant"})');
  await writeFile(join(profile,'website-desktop.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await run('document.querySelector(".workflow-demo").scrollIntoView({behavior:"instant",block:"center"})');
  await new Promise(r=>setTimeout(r,1800));
  assert.equal(await run('document.querySelector(".workflow-demo").dataset.polishPhase'),'draft');
  assert.equal(await run('document.querySelector("[data-workflow-text]").textContent'),'棱镜、颜色、角度不同');
  await new Promise(r=>setTimeout(r,600));
  assert.equal(await run('document.querySelector(".workflow-demo").dataset.polishPhase'),'enter');
  await new Promise(r=>setTimeout(r,1700));
  assert.equal(await run('document.querySelector(".workflow-demo").dataset.polishPhase'),'polish');
  await new Promise(r=>setTimeout(r,2600));
  assert.equal(await run('document.querySelector(".workflow-demo").dataset.polishPhase'),'done');
  assert.equal(await run('document.querySelector("[data-workflow-draft]").textContent'),'棱镜、颜色、角度不同');
  assert.ok(await run('document.querySelector("[data-workflow-text]").textContent.includes("白光")'));
  await writeFile(join(profile,'website-polish.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await new Promise(r=>setTimeout(r,3600));
  assert.equal(await run('document.querySelector(".workflow-demo").dataset.step'),'1','Walkthrough advances on viewport entry');
  for (const step of [0,1,2,3]) {
    await run(`document.querySelector('[data-workflow-step="${step}"]').click()`);
    assert.equal(await run('document.querySelector(".workflow-demo").dataset.step'),String(step));
    if (step === 0) await new Promise(r=>setTimeout(r,1700));
    assert.ok(await run('document.querySelector("[data-workflow-text]").textContent.length')>5);
  }
  await run('document.querySelector(".workflow-revisit").click()');
  assert.equal(await run('document.querySelector("[data-workflow-status]").textContent'),'查看笔记');
  assert.equal(await run('document.querySelector(".workflow-progress>span").textContent'),'02:18');
  await run(`document.querySelector('[data-workflow-step="2"]').click()`);
  await new Promise(r=>setTimeout(r,7500));
  assert.equal(await run('document.querySelector(".workflow-demo").dataset.step'),'2','Manual selection stays selected');
  await writeFile(join(profile,'website-workflow.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await run(`document.querySelector(".settings-demo").scrollIntoView({behavior:"instant",block:"center"});document.querySelector('[data-demo-provider="openai"]').click()`);
  assert.equal(await run('document.querySelector("#demo-model").value'),'gpt-6.1-terra');
  await run(`document.querySelector("#demo-model").value="gpt-6-astra";document.querySelector("#demo-model").dispatchEvent(new Event("change"));document.querySelector('[data-demo-provider="google"]').click();document.querySelector('[data-demo-provider="openai"]').click()`);
  assert.equal(await run('document.querySelector("#demo-model").value'),'gpt-6-astra','Model choice survives switching providers');
  await writeFile(join(profile,'website-settings.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await run('document.querySelector(".install-toggle").click();document.querySelector("details summary").click()');
  assert.equal(await run('document.querySelector("#install-guide").hidden'),false);
  assert.equal(await run('document.querySelector("details").open'),true);
  await run('document.querySelector(".install-toggle").click()');
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await run('scrollTo(0,0)');
  await new Promise(r=>setTimeout(r,300));
  assert.equal(await run('document.documentElement.scrollWidth<=innerWidth'),true,'No horizontal overflow on mobile');
  await writeFile(join(profile,'website-mobile.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await run('document.querySelector("#language-choice").click();document.querySelector("#theme-choice").click();');
  assert.equal(await run('document.documentElement.lang'),'en');
  assert.equal(await run('document.querySelector(".english").textContent'),'Watch together. Remember more.');
  assert.equal(await run('document.querySelectorAll(".hero-benefits li").length'),3);
  assert.ok(await run('document.querySelector(".hero-benefits").textContent.includes("Notes stored locally")'));
  assert.equal(await run('getComputedStyle(document.body).backgroundColor'),'rgb(8, 8, 8)');
  assert.equal(await run('document.documentElement.scrollWidth<=innerWidth'),true);
  await run('document.querySelector(".workflow-demo").scrollIntoView({behavior:"instant",block:"center"})');
  assert.equal(await run('document.querySelector("[data-workflow-kind]").textContent'),'AI note');
  assert.equal(await run('document.documentElement.scrollWidth<=innerWidth'),true);
  await writeFile(join(profile,'website-workflow-mobile.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await run(`document.querySelector('[data-workflow-step="0"]').click()`);
  assert.equal(await run('document.querySelector(".workflow-demo").dataset.polishPhase'),'done','Reduced motion shows before and after without animation');
  await writeFile(join(profile,'website-polish-mobile.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await run('document.querySelector(".settings-demo").scrollIntoView({behavior:"instant",block:"center"})');
  assert.equal(await run('document.documentElement.scrollWidth<=innerWidth'),true);
  await writeFile(join(profile,'website-settings-mobile.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await call('Page.reload');await new Promise(r=>setTimeout(r,500));
  assert.equal(await run('KairosSite.state.language'),'en','Manual language persists');
  assert.equal(await run('KairosSite.state.theme'),'dark','Manual theme persists');
  await run('KairosSite.set("theme","auto")');
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'}]});
  await new Promise(r=>setTimeout(r,150));
  assert.equal(await run('document.documentElement.dataset.theme'),'light');
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'}]});
  await new Promise(r=>setTimeout(r,150));
  assert.equal(await run('document.documentElement.dataset.theme'),'dark');
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
  await writeFile(join(profile,'website-dark-en.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
  assert.deepEqual(runtimeErrors, [], 'No browser script errors');
  console.log('PASS: assets, desktop/mobile layout, product screenshot, walkthrough autoplay/manual pause/revisit, model choices, FAQ, installation and preferences');
  console.log('Screenshots: '+profile);
} finally {socket?.close();chrome.kill();}
