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
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/`});
  await run('new Promise(r=>setTimeout(r,100))');
  await run('window.chrome={runtime:{onMessage:{addListener:fn=>window.handler=fn}}};window.Kairos={log:()=>{}}');
  const background=await readFile(new URL('../src/background.js',import.meta.url),'utf8');
  await run(background.slice(background.indexOf('const DB_NAME'),background.indexOf('// --- Gemini API Logic ---')));
  await run('chrome.runtime.sendMessage=(message,callback)=>handler(message,{},callback)');
  await run(await readFile(new URL('../src/content/storage.js',import.meta.url),'utf8'));
  await run('window.store=new Kairos.StorageManager()');
  for (const id of ['note-string', 1234]) {
    await run(`store.saveNote({id:${JSON.stringify(id)},videoId:'test',content:'Delete me'})`);
    assert.equal((await run('store.getNotesForVideo("test")')).length,1);
    await run(`store.deleteNote(${JSON.stringify(id)})`);
    assert.equal((await run('store.getNotesForVideo("test")')).length,0,'Committed deletion persists on read');
  }
  await run(await readFile(new URL('../src/content/i18n.js',import.meta.url),'utf8'));
  await run(await readFile(new URL('../src/content/delete_button.js',import.meta.url),'utf8'));
  await run('chrome.runtime.sendMessage=()=>{throw Error("Extension context invalidated.")}');
  const error=await run('store.deleteNote("test").catch(e=>Kairos.deletionError(e))');
  assert.equal(error,await run('Kairos.I18n.t("Extension updated or disconnected. Refresh this video page and try again.")'),'Invalidated context gives recovery instructions');
  console.log('PASS: real IndexedDB save/delete/read through background message handler and stale-context recovery message');
} finally {
  socket?.close();
  chrome.kill();
  server.close();
}
