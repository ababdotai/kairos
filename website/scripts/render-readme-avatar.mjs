/** Export the existing hero's artwork and CSS motion for GitHub Markdown. */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const temporary = await mkdtemp(join(tmpdir(), 'kairos-avatar-'));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${temporary}/profile`,
  '--no-first-run', '--no-default-browser-check', 'about:blank'
], { stdio: ['ignore', 'ignore', 'pipe'] });
let socket;
try {
  const endpoint = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Chrome startup timeout')), 15000);
    let output = '';
    chrome.stderr.on('data', chunk => {
      output += chunk;
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timeout); resolve(match[1]); }
    });
    chrome.on('error', error => { clearTimeout(timeout); reject(error); });
  });
  const pages = await (await fetch(`http://${new URL(endpoint).host}/json`)).json();
  socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => { socket.onopen = resolve; });
  let id = 0;
  const pending = new Map();
  socket.onmessage = event => {
    const result = JSON.parse(event.data), callback = pending.get(result.id);
    if (!callback) return;
    pending.delete(result.id);
    result.error ? callback.reject(result.error) : callback.resolve(result.result);
  };
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  };
  const css = await readFile(new URL('public/style.css', root), 'utf8');
  const keyframes = css.match(/@keyframes avatar-breathe\{(?:[^{}]|\{[^{}]*\})*\}/)?.[0];
  if (!keyframes) throw new Error('Hero breathing keyframes not found');
  const bitmap = (await readFile(new URL('public/assets/avatar.png', root))).toString('base64');
  const html = `<style>body{margin:0;background:transparent;display:grid;place-items:center;width:160px;height:160px}img{width:128px;height:auto;animation:avatar-breathe 6s ease-in-out infinite}${keyframes}</style><img src="data:image/png;base64,${bitmap}" alt="Kairos">`;
  await call('Emulation.setDeviceMetricsOverride', { width: 160, height: 160, deviceScaleFactor: 2, mobile: false });
  await call('Emulation.setDefaultBackgroundColorOverride', { color: {r:0,g:0,b:0,a:0} });
  await evaluate(`document.open();document.write(${JSON.stringify(html)});document.close();document.querySelector('img').decode()`);
  await evaluate(`window.motion=document.querySelector('img').getAnimations()[0];motion.pause()`);
  for (let frame = 0; frame < 60; frame++) {
    await evaluate(`motion.currentTime=${frame * 100};new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);
    const shot = await call('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(temporary, `frame-${String(frame).padStart(3, '0')}.png`), Buffer.from(shot.data, 'base64'));
  }
  const destination = fileURLToPath(new URL('public/assets/avatar.gif', root));
  const result = spawnSync('ffmpeg', ['-v','error','-y','-framerate','10','-i',join(temporary,'frame-%03d.png'),
    '-filter_complex','split[a][b];[a]palettegen=reserve_transparent=1[p];[b][p]paletteuse=dither=sierra2_4a:alpha_threshold=128',
    '-loop','0',destination], { encoding: 'utf8' });
  if (result.error || result.status !== 0) throw result.error || new Error(result.stderr);
  console.log(`Rendered 60 frames / 6 seconds: ${destination}`);
} finally {
  socket?.close();
  chrome.kill();
  await new Promise(resolve => chrome.exitCode !== null ? resolve() : chrome.once('exit', resolve));
  await rm(temporary, { recursive: true, force: true });
}
