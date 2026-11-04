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
  await call('Emulation.setDeviceMetricsOverride', {width:1440,height:1100,deviceScaleFactor:1,mobile:false});
  await call('Page.navigate',{url:'http://127.0.0.1:4173/kairos/'});
  await new Promise(r=>setTimeout(r,1500));
  assert.equal(await run('document.documentElement.lang'),await run('/^zh/i.test(navigator.languages[0])?"zh-CN":"en"'),'Initial language follows browser');
  await run('KairosSite.set("language","zh");KairosSite.set("theme","light")');
  assert.equal(await run('document.title'),'Kairos — 一起看，随手记');
  assert.equal(await run('getComputedStyle(document.body).backgroundColor'),'rgb(255, 255, 255)');
  assert.equal(await run('document.documentElement.scrollWidth<=innerWidth'),true);
  for(const path of ['','style.css','app.js','preferences.js','locale.js','assets/avatar.png','assets/kairos.png','assets/avatar.gif','assets/text-note.png']) assert.equal((await fetch('http://127.0.0.1:4173/kairos/'+path)).status,200);
  await run('document.querySelector(".product-capture").scrollIntoView({behavior:"instant"});document.querySelector(".product-capture img").decode()');
  assert.equal(await run('document.querySelector(".product-capture img").naturalWidth'),3196,'Full-resolution authentic screenshot loads');
  await writeFile(join(profile,'website-real-product.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await run('scrollTo({top:0,behavior:"instant"})');
  assert.equal((await fetch('http://127.0.0.1:4173/kairos/missing')).status,404);
  await run('document.querySelectorAll(".demo-tabs [data-step]")[1].click()');
  assert.equal(await run('document.querySelector(".showcase").dataset.step'),'1');
  await new Promise(r=>setTimeout(r,500));
  assert.equal(await run('getComputedStyle(document.querySelector(".capture")).opacity'),'1');
  await run('document.querySelectorAll(".demo-tabs [data-step]")[2].click()');
  assert.equal(await run('document.querySelector("#island-feedback").textContent'),'正在输入');
  await new Promise(r=>setTimeout(r,3200));
  assert.equal(await run('document.querySelector("#island-feedback").textContent'),'已保存');
  await run('document.querySelector("#experience").scrollIntoView({behavior:"instant"})');
  await new Promise(r=>setTimeout(r,550));
  assert.equal(await run('document.querySelector(".header").classList.contains("is-compact")'),true,'Navigation contracts on scroll');
  assert.equal(await run('getComputedStyle(document.querySelector(".header")).position'),'fixed');
  assert.equal(await run('document.querySelector(".actions a:nth-child(2)").hash'),'#community');
  assert.equal(await run('!!document.querySelector("#community")'),true);
  await writeFile(join(profile,'website-product.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await run('scrollTo({top:0,behavior:"instant"})');
  await run('document.querySelectorAll(".demo-tabs [data-step]")[3].click()');
  assert.equal(await run('document.querySelector("#island-feedback").textContent'),'查看笔记');
  await run('document.querySelectorAll(".demo-tabs [data-step]")[0].click()');
  await new Promise(r=>setTimeout(r,4500));
  assert.equal(await run('document.querySelector(".showcase").dataset.step'),'0','Manual choice does not auto advance');
  await writeFile(join(profile,'website-desktop.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
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
  await run('document.querySelector("#play-demo").click()');
  assert.equal(await run('document.querySelector(".showcase").dataset.step'),'1');
  await run('document.querySelector("#language-choice").click();document.querySelector("#theme-choice").click();');
  assert.equal(await run('document.documentElement.lang'),'en');
  assert.equal(await run('document.querySelector(".english").textContent'),'Watch together. Remember more.');
  assert.equal(await run('document.querySelector("#demo-caption").textContent.includes("Drag")'),true);
  assert.equal(await run('getComputedStyle(document.body).backgroundColor'),'rgb(8, 8, 8)');
  assert.equal(await run('document.documentElement.scrollWidth<=innerWidth'),true);
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
  console.log('PASS: assets, desktop/mobile layout, demo, manual pause, FAQ, installation and reduced motion');
  console.log('Screenshots: '+profile);
} finally {socket?.close();chrome.kill();}
