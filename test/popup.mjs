import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source = (await readFile(new URL('../src/popup.js', import.meta.url), 'utf8')).replace(/^import .*;$/gm, '');
const routes = [
  [undefined, null], ['chrome://extensions/', null], ['https://example.com/', null],
  ['https://www.youtube.com/', null], ['https://www.youtube.com/watch', null],
  ['https://www.bilibili.com/', null], ['https://youtube.com.example.com/watch?v=abc', null],
  ['https://www.youtube.com/watch?v=abc', 'yt-abc'], ['https://www.youtube.com/shorts/xyz', 'yt-xyz'],
  ['https://www.bilibili.com/video/BV123/', 'bili-BV123']
];
const cases = [
  ...routes.map(([url, expected]) => ({ url, expected })),
  { noTab: true },
  { queryError: true, error: true },
  ...[undefined, {success:false,error:'Unavailable'}, {success:true}, {success:true,data:{}}, {success:true,data:[null]}]
    .map(response => ({url:'https://www.youtube.com/watch?v=abc',expected:'yt-abc',response,error:true})),
  {url:'https://www.youtube.com/watch?v=abc',expected:'yt-abc',messageError:true,error:true},
  {url:'https://www.youtube.com/watch?v=abc',expected:'yt-abc',response:{success:true,data:[{videoTitle:'Saved title'}]}}
];
for (const scenario of cases) {
  const {url, expected = null} = scenario;
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
    chrome: { tabs: { query: async () => {
      if(scenario.queryError) throw new Error('Tab closed');
      return scenario.noTab ? [] : [{url, title:'Video'}];
    }, create: args => opened.push(args.url) },
      runtime: { sendMessage: async msg => {
        requests.push(msg);
        if(scenario.messageError) throw new Error('Could not establish connection');
        return 'response' in scenario ? scenario.response : {success:true,data:[]};
      } } }
  };
  vm.runInNewContext(source, context);
  await init();
  assert.equal(requests[0]?.payload.videoId ?? null, expected);
  if (!expected || scenario.error) assert.equal(nodes.get('no-video-state').style.display, 'block');
  if (scenario.error) assert.equal(nodes.get('empty-state-title').textContent,'Connection Error');
  if (expected && !scenario.error) {
    assert.equal(nodes.get('current-video-section').style.display,'block');
    assert.equal(nodes.get('export-btn').disabled,!scenario.response?.data?.length);
  }
  for (const link of links) link.listeners.click({preventDefault() {}});
  assert.deepEqual(opened, links.map(link => link.href));
}
console.log('PASS: popup missing URLs/tabs, rejected tab queries, unavailable worker, malformed notes, video routing and platform shortcuts');
