import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source = (await readFile(new URL('../src/popup.js', import.meta.url), 'utf8')).replace(/^import .*;$/gm, '');
for (const [url, expected] of [
  [undefined, null], ['chrome://extensions/', null], ['https://example.com/', null],
  ['https://www.youtube.com/', null], ['https://www.youtube.com/watch', null],
  ['https://www.bilibili.com/', null], ['https://youtube.com.example.com/watch?v=abc', null],
  ['https://www.youtube.com/watch?v=abc', 'yt-abc'], ['https://www.youtube.com/shorts/xyz', 'yt-xyz'],
  ['https://www.bilibili.com/video/BV123/', 'bili-BV123']
]) {
  let init;
  const make = () => ({ style: {}, listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; } });
  const nodes = new Map();
  const links = ['https://www.bilibili.com/', 'https://www.youtube.com/'].map(href => Object.assign(make(), {href}));
  const requests = [], opened = [];
  const context = {
    URL, console,
    window: { Kairos: { I18n: { t: key => key, localize() {}, init: async () => {}, locale: 'en' } } },
    document: { documentElement: {}, addEventListener: (_, fn) => { init = fn; },
      getElementById(id) { if (!nodes.has(id)) nodes.set(id, make()); return nodes.get(id); },
      querySelectorAll: () => links },
    chrome: { tabs: { query: async () => [{url, title:'Video'}], create: args => opened.push(args.url) },
      runtime: { sendMessage: (msg, cb) => { requests.push(msg); cb({success:true,data:[]}); } } }
  };
  vm.runInNewContext(source, context);
  await init();
  assert.equal(requests[0]?.payload.videoId ?? null, expected);
  if (!expected) assert.equal(nodes.get('no-video-state').style.display, 'block');
  for (const link of links) link.listeners.click({preventDefault() {}});
  assert.deepEqual(opened, links.map(link => link.href));
}
console.log('PASS: popup non-video routing, valid video IDs and platform shortcuts');
