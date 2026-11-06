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
  await call('Emulation.setDeviceMetricsOverride', { width: 1100, height: 800, deviceScaleFactor: 1, mobile: false });
  const icon = 'data:image/png;base64,' + (await readFile(new URL('../public/icons/icon48.png', import.meta.url))).toString('base64');
  await run(`
    document.body.innerHTML = '<input id="search"><video muted style="position:absolute;left:40px;top:100px;width:960px;height:540px;object-fit:contain"></video>';
    document.body.style.background = '#202424';
    document.body.style.minHeight = '2000px';
    const player = document.createElement('div');
    player.className = 'bpx-player-video-area'; player.setAttribute('role','button');
    document.body.appendChild(player); player.appendChild(document.querySelector('video'));
    window.playerEvents = []; window.playerDragging = false;
    window.playerWheelEvents = 0;
    document.addEventListener('wheel', () => {
      playerWheelEvents++;
      document.querySelector('video').volume = 0.3;
    }, {capture:true, passive:false});
    // Register before Kairos, as a real site does. Both pointer and mouse streams matter.
    for (const type of ['pointerdown','mousedown','pointermove','mousemove','pointerup','mouseup','click','wheel']) {
      window.addEventListener(type, event => {
        if (event.button === 0 && player.contains(event.target) && (type.endsWith('down') || type === 'click')) {
          playerEvents.push(type); if (type.endsWith('down')) playerDragging = true;
        }
        if (playerDragging && type.endsWith('move')) {
          playerEvents.push(type); document.querySelector('video').volume = 0.25;
        }
        if (type.endsWith('up')) playerDragging = false;
      },true);
    }
    const controls = document.createElement('button'); controls.className='bpx-player-control-wrap';
    controls.style='position:absolute;left:700px;top:590px;width:160px;height:40px';
    controls.textContent='Player controls';controls.onclick=()=>window.controlClicks=(window.controlClicks||0)+1;
    player.appendChild(controls);
    window.saved = []; window.localSettings = {};
    window.chrome = { runtime: {getURL: p => p, sendMessage: (message, callback) => {
      if (message.type === 'SAVE_NOTE') saved.push(message.payload);
      callback({success:true,data:[]});
    }}, storage: {local: {get: async () => ({...localSettings}),set: async values => Object.assign(localSettings,values)}, sync: {get: async () => ({})}}};
  `);
  await run(`chrome.runtime.getURL = () => ${JSON.stringify(icon)}`);
  await run(`chrome.i18n = { getUILanguage: () => ${JSON.stringify(process.env.KAIROS_TEST_LANGUAGE || 'zh-CN')} }`);
  for (const name of ['i18n', 'action_tips', 'availability', 'refinement', 'delete_button', 'config', 'utils', 'storage', 'markdown', 'capture', 'styles', 'companion', 'sidepanel', 'overlay']) {
    await run(await readFile(new URL('../src/content/' + name + '.js', import.meta.url), 'utf8'));
  }
  await run(`(async () => {
    const canvas = document.createElement('canvas'); canvas.width=960; canvas.height=540;
    const c=canvas.getContext('2d'); c.fillStyle='#284f65';c.fillRect(0,0,960,540);
    c.fillStyle='#fff';c.font='32px sans-serif';c.fillText('Gradient descent · learning rate',100,180);
    window.video=document.querySelector('video');video.srcObject=canvas.captureStream(10);await video.play();
    Object.defineProperty(video,'duration',{value:600});
    Kairos.Utils.getVideoInfo = () => ({videoId:'test',url:'https://example.com/video',title:'Learning demo'});
    window.side=new Kairos.SidePanelManager();side.injectStyles();side.container=side.buildPanel();
    side.container.style.cssText='position:absolute;left:1020px;top:100px;width:60px;overflow:hidden;max-height:600px';
    document.body.appendChild(side.container);
    window.o=new Kairos.OverlayManager();o.sidePanel=side;await o.init();o.currentVideoId='test';
    o.updatePosition(video.getBoundingClientRect(),video);o.expandOrb();
  })()`);


  await run(await readFile(new URL('../src/content/tracker.js',import.meta.url),'utf8'));
  for(const [url,id] of [
    ['https://www.bilibili.com/',null],['https://www.bilibili.com/opus/123456',null],['https://www.bilibili.com/space/123',null],
    ['https://www.bilibili.com/?next=/video/BV123',null],['https://www.bilibili.com/video/BV123?p=2','bili-BV123'],
    ['https://www.bilibili.com/video/av123/','bili-/video/av123/'],['https://www.bilibili.com/bangumi/play/ep123','bili-/bangumi/play/ep123'],
    ['https://www.youtube.com/',null],['https://www.youtube.com/results?v=abc',null],['https://www.youtube.com/watch',null],
    ['https://www.youtube.com/watch?v=abc-123','yt-abc-123'],['https://www.youtube.com/shorts/abc-123/?feature=share','yt-abc-123'],
    ['https://notyoutube.com/watch?v=abc',null],['https://www.bilibili.com.evil.test/video/BV123',null]
  ])assert.equal(await run(`Kairos.Utils.getVideoId(${JSON.stringify(url)})`),id,url);
  await run(`window.pageUrl='https://www.bilibili.com/';window.identify=Kairos.Utils.getVideoId;
    Kairos.Utils.getVideoId=()=>identify(pageUrl);Kairos.Utils.getVideoInfo=()=>({videoId:identify(pageUrl),url:pageUrl,title:'Fixture'});
    video.parentElement.classList.add('bpx-player-container');
    window.preview=document.createElement('video');preview.style='position:absolute;left:0;top:0;width:1000px;height:700px';document.body.appendChild(preview);
    window.tracker=new Kairos.VideoTracker('video');window.events=[];
    tracker.start((rect,video)=>{events.push(!!video);o.updatePosition(rect,video);if(!Kairos.Utils.getVideoId())side.injectPanel();});window.tick=()=>{tracker.stop();tracker.update();tracker.stop();};`);
  await run('new Promise(r=>setTimeout(r,50))');
  assert.equal(await run('tracker.videoElement'),null,'Home feed previews are not playback videos');
  assert.equal(await run('getComputedStyle(o.container).display'),'none');
  assert.equal(await run('document.querySelector("#kairos-sidepanel")'),null,'Home route removes the sidebar');
  assert.equal(await run('o.isActive'),false,'Leaving playback deactivates capture and typing');
  await run('pageUrl="https://www.bilibili.com/opus/123";tick();new Promise(r=>setTimeout(r,50))');
  assert.equal(await run('tracker.videoElement'),null,'Opus route ignores embedded videos even inside a player-shaped container');
  await run('pageUrl="https://www.bilibili.com/video/BV123";tick();new Promise(r=>setTimeout(r,100))');
  assert.equal(await run('tracker.videoElement===video'),true,'Playback route selects main player over larger preview');
  assert.notEqual(await run('getComputedStyle(o.container).display'),'none','SPA entry restores the overlay');
  // Real pointer down/up catches the hover menu collapsing between the two events.
  const point = expression => run(`(()=>{const r=(${expression}).getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
  async function clickControl(expression) {
    const pos = await point(expression);
    await call('Input.dispatchMouseEvent', { type:'mouseMoved', ...pos });
    for (const type of ['mousePressed','mouseReleased']) {
      await call('Input.dispatchMouseEvent', { type, ...pos, button:'left', clickCount:1 });
    }
  }
  await run('o.setIslandPinned(false,false)');
  await call('Input.dispatchMouseEvent', {type:'mouseMoved', ...await point('o.orbElement')});
  await run('new Promise(r=>setTimeout(r,450))');
  await clickControl("o.shadowRoot.querySelector('.kairos-disable-trigger')");
  assert.equal(await run("!!o.shadowRoot.querySelector('.kairos-disable-options:popover-open')"),true);
  await clickControl("o.shadowRoot.querySelector('.kairos-disable-options button')");
  assert.equal(await run('Kairos.Availability.disabled()'),true,'Selecting visit dismissal from a hover-expanded island');
  await run('pageUrl="https://www.bilibili.com/video/BV456";Kairos.Availability.checkVisit()');
  assert.equal(await run('Kairos.Availability.disabled()'),false);
  await run('o.expandOrb();video.style.display="none";tick();new Promise(r=>setTimeout(r,60))');
  assert.equal(await run('tracker.videoElement'),null,'Hidden main player is invalid even while connected');
  assert.equal(await run('getComputedStyle(o.container).display'),'none','No stale overlay remains at the previous rectangle');
  await run('video.style.display="";tick();new Promise(r=>setTimeout(r,60))');
  assert.equal(await run('tracker.videoElement===video'),true);
  await run('pageUrl="https://www.youtube.com/watch?v=abc";video.parentElement.className="html5-video-player";tick();new Promise(r=>setTimeout(r,60))');
  assert.equal(await run('tracker.videoElement===video'),true,'YouTube watch player remains supported');
  await run('video.parentElement.id="inline-player";tick();new Promise(r=>setTimeout(r,60))');
  assert.equal(await run('tracker.videoElement'),null,'Inline previews are excluded even on watch pages');
  await run('video.parentElement.id="";pageUrl="https://www.youtube.com/shorts/abc";tick();new Promise(r=>setTimeout(r,60))');
  assert.equal(await run('tracker.videoElement===video'),true,'Shorts playback remains supported');
  await run('o.expandOrb();pageUrl="https://www.youtube.com/";tick();new Promise(r=>setTimeout(r,60))');
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'h',text:'h'});
  await call('Input.dispatchKeyEvent',{type:'keyUp',key:'h'});
  assert.equal(await run('o.isEditing'),false,'Homepage typing is not captured after SPA navigation');
  assert.equal(await run('o.videoElement'),null);
  await run('tracker.stop();o.destroy();window.fresh=new Kairos.OverlayManager();');
  await run('fresh.init()');
  assert.equal(await run('getComputedStyle(fresh.container).display'),'none','Initial island stays hidden before any valid video is found');
  await run('fresh.destroy()');
  console.log('PASS: playback-only routes, homepage/opus previews, main-player filtering, stale-video removal, SPA exit/re-entry, and disabled input capture');
} finally { socket?.close();chrome.kill(); }
