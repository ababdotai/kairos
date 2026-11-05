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
  for (const name of ['i18n', 'refinement', 'delete_button', 'config', 'utils', 'storage', 'markdown', 'capture', 'styles', 'companion', 'sidepanel', 'overlay']) {
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

  await run('o.handlePinCapture()');
  await run('new Promise(r=>setTimeout(r,600))');
  const geometry = () => run(`(()=>{const n=o.noteWrapper.getBoundingClientRect(),v=video.getBoundingClientRect(),h=o.noteHandle.getBoundingClientRect();return {left:n.left,top:n.top,right:n.right,bottom:n.bottom,width:n.width,height:n.height,center:n.left+n.width/2,videoCenter:v.left+v.width/2,safeBottom:v.bottom-o.companionInput.captureBottom,handleBottom:h.bottom}})()`);
  let initial=await geometry();
  assert.ok(Math.abs(initial.center-initial.videoCenter)<1,'Editor defaults to horizontal center');
  assert.ok(Math.abs(initial.handleBottom-initial.safeBottom)<2,'Editor and handle sit above player controls');
  assert.ok(initial.top>300,'Default editor is in the lower video area');
  await run('o.noteInput.value="就是这个";o.adjustInputHeight()');
  await writeFile(join(profile,'note-default.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
  const drag = async (dx,dy) => {
    const pt=await run('(()=>{const r=o.noteHandle.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()');
    await call('Input.dispatchMouseEvent',{type:'mouseMoved',...pt});
    await call('Input.dispatchMouseEvent',{type:'mousePressed',...pt,button:'left',clickCount:1});
    for(let i=1;i<=4;i++) await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:pt.x+dx*i/4,y:pt.y+dy*i/4,button:'left',buttons:1});
    await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:pt.x+dx,y:pt.y+dy,button:'left',clickCount:1});
    await run('new Promise(r=>setTimeout(r,40))');
  };
  await drag(130,-110);
  const moved=await geometry();
  assert.ok(Math.abs(moved.left-initial.left-130)<2 && Math.abs(moved.top-initial.top+110)<2,'Native pointer drag moves the editor without a jump');
  assert.equal(await run('o.noteInput.value'),'就是这个','Dragging preserves the draft');
  assert.equal(await run('o.shadowRoot.activeElement===o.noteInput'),true,'IME input regains focus after dragging');
  assert.equal(await run('saved.length'),0,'Dragging does not save the draft');
  assert.deepEqual(await run('playerEvents'),[],'Drag does not activate player gestures');
  const preference=await run('localSettings.noteEditorAnchor');
  assert.ok(preference.x>.5 && preference.y<1,'Position is persisted relative to available video space');
  await run('o.closeNoteInput(true);o.currentVideoId="next-video";o.openNoteInput({timestamp:12,note:"Next video"},true);new Promise(r=>setTimeout(r,600))');
  const reopened=await geometry();
  assert.ok(Math.abs(reopened.left-moved.left)<2 && Math.abs(reopened.top-moved.top)<2,'New video reuses editor position');
  await run('o.noteInput.value="Long note\\n".repeat(30);o.adjustInputHeight();video.style.width="480px";video.style.height="270px";o.updatePosition(video.getBoundingClientRect(),video);new Promise(r=>setTimeout(r,600))');
  let small=await geometry();
  assert.ok(small.left>=52 && small.right<=508 && small.top>=112 && small.handleBottom<=small.safeBottom+1,'Small video and a growing note remain above controls');
  assert.deepEqual(await run('localSettings.noteEditorAnchor'),preference,'Temporary size constraints do not overwrite preference');
  await run('o.updateCapturePreview({region:{},imageUrl:chrome.runtime.getURL("icons/icon128.png")});o.alignNote();new Promise(r=>setTimeout(r,600))');
  const capture=await geometry();
  assert.ok(capture.top>=112 && capture.handleBottom<=capture.safeBottom+1,'Screenshot preview also fits a small video');
  await writeFile(join(profile,'note-capture-small.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await run('video.style.width="960px";video.style.height="540px";o.updatePosition(video.getBoundingClientRect(),video);o.closeNoteInput(true);o.destroy();window.o=new Kairos.OverlayManager();');
  await run('(async()=>{await o.init();o.updatePosition(video.getBoundingClientRect(),video);o.expandOrb();o.openNoteInput({timestamp:20,note:"Restored"},true);await new Promise(r=>setTimeout(r,600));})()');
  const restored=await geometry();
  assert.ok(Math.abs(restored.left-moved.left)<2 && Math.abs(restored.top-moved.top)<2,'A fresh overlay restores persisted placement');
  await drag(-1000,-600);
  const clamped=await geometry();
  assert.ok(clamped.left>=52 && clamped.top>=112,'Out-of-bounds dragging clamps inside video');
  await run('o.closeNoteInput(true);o.openNoteInput({timestamp:20,note:"Restored"},true);new Promise(r=>setTimeout(r,600))');
  assert.ok((await geometry()).left>=52,'Clamped placement survives reopening');
  const screenshotPath=join(profile,'note-placement.png');
  await writeFile(screenshotPath,Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));

  // Exercise the natural playback path, including legacy capture coordinates.
  await run(`(async()=>{o.closeNoteInput(true);o.clearAllSpatialMarkers();o.pins=[];o.noteAnchor={x:.5,y:1};await video.play();
    o.renderPin({id:'replay',videoId:'test',timestamp:video.currentTime,content:'哈哈，太搞笑',spatialX:10,spatialY:40,source:'user',createdAt:Date.now()});
    window.replay=o.pins[0];o.updatePosition(video.getBoundingClientRect(),video);await new Promise(r=>setTimeout(r,350));})()`);
  const replayGeometry=()=>run(`(()=>{const r=replay.spatialTooltip.getBoundingClientRect(),v=video.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height,cx:r.left+r.width/2,vx:v.left+v.width/2,safeBottom:v.bottom-o.companionInput.captureBottom}})()`);
  let replayBox=await replayGeometry();
  assert.ok(Math.abs(replayBox.cx-replayBox.vx)<1,'Natural playback centers notes instead of using legacy capture coordinates');
  assert.ok(Math.abs(replayBox.bottom-initial.bottom)<2,'Natural playback and editor share the same bottom boundary');
  assert.equal(await run('video.paused'),false,'Automatic playback preview never pauses the video');
  assert.equal(await run('o.activePin'),null,'Automatic preview does not open the editor');
  await writeFile(join(profile,'note-replay.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await run(`o.noteAnchor=${JSON.stringify(preference)};o.alignNote()`);
  replayBox=await replayGeometry();
  assert.ok(Math.abs((replayBox.left-52)/(960-replayBox.width-24)-preference.x)<.005,'Playback preview uses the dragged horizontal preference');
  assert.ok(Math.abs((replayBox.top-112)/(540-(640-replayBox.safeBottom)-32-replayBox.height-12)-preference.y)<.005,'Playback preview uses the dragged vertical preference');
  await run('replay.spatialTooltip.dispatchEvent(new PointerEvent("pointerenter"));o.updateSpatialMarkers(replay.timestamp+10);new Promise(r=>setTimeout(r,350))');
  assert.equal(await run('replay.spatialTooltip.style.opacity'),'1','Hover still holds a replay note beyond its timestamp');
  await run('replay.spatialTooltip.dispatchEvent(new PointerEvent("pointerleave"));new Promise(r=>setTimeout(r,350))');
  assert.equal(await run('replay.spatialTooltip'),null,'Leaving still fades and removes the note');
  await run('video.style.width="480px";video.style.height="270px";replay.note="很长的回放笔记".repeat(150);replay.region={};replay.imageUrl=chrome.runtime.getURL("icons/icon128.png");o.updatePosition(video.getBoundingClientRect(),video);o.updateSpatialMarkers(replay.timestamp);new Promise(r=>setTimeout(r,350))');
  replayBox=await replayGeometry();
  assert.ok(replayBox.left>=52 && replayBox.right<=508 && replayBox.top>=112 && replayBox.bottom+32<=replayBox.safeBottom+1,'Long screenshot previews fit a resized video above the controls');
  assert.equal(await run('getComputedStyle(replay.spatialTooltip).overflowY'),'auto');
  assert.deepEqual(await run('[replay.spatialX,replay.spatialY]'),[10,40],'Presentation changes preserve capture metadata');
  console.log('PASS: note placement, drag persistence, natural playback, legacy capture coordinates, resize bounds and hover/fade');
  console.log('Preview: '+screenshotPath);
} finally {
  socket?.close();
  chrome.kill();
}
