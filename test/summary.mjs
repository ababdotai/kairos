import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { summaryPrompt, summaryFingerprint, summaryShare } from '../src/note-summary.js';
const notes = [{ timestamp: 20, timeLabel: '00:20', content: 'My observation', source: 'user', imageUrl: 'SECRET_IMAGE', videoTitle: 'Example' }, { timestamp: 5, timeLabel: '00:05', content: 'AI note', source: 'ai' }];
const prompt = summaryPrompt('Example', notes, 'zh');
assert.ok(!prompt.includes('SECRET_IMAGE'));
assert.ok(prompt.indexOf('00:05') < prompt.indexOf('00:20'));
assert.ok(prompt.includes('NOT the full video'));
assert.notEqual(summaryFingerprint(notes), summaryFingerprint([{ ...notes[0], content: 'Edited' }, notes[1]]));
assert.ok(summaryShare('Video', 'https://example.com', 'My summary').includes('https://example.com'));
assert.throws(() => summaryPrompt('Title', [{ content: 'x'.repeat(100001) }], 'en'), /too long/);
const source = await readFile(new URL('../src/background.js', import.meta.url), 'utf8');
let settings = {}, seen, requestedVideo;
const context = vm.createContext({
  summaryPrompt, summaryFingerprint, AI_SETTINGS_KEYS: [],
  generateAI: async (settings, {prompt}) => { if (!settings.googleApiKey && !settings.moonshotApiKey) throw new Error('API key missing'); seen = {contents:prompt}; return settings.aiProvider === 'moonshot' ? 'Kimi summary' : '## Summary'; },
  getNotes: async id => { requestedVideo = id; return notes; },
  chrome: { storage: { sync: { get: async () => settings } } },
  GoogleGenAI: class { models = { generateContent: async args => { seen = args; return { text: '## Summary' }; } }; },
  OpenAI: class { chat = { completions: { create: async args => { seen = args; return { choices: [{ message: { content: 'Kimi summary' } }] }; } } }; }
});
vm.runInContext(source.slice(source.indexOf('async function summarizeVideoNotes')), context);
await assert.rejects(vm.runInContext('summarizeVideoNotes({videoId:"a"})', context), /API key/);
settings = { googleApiKey: 'test-key', noteLanguage: 'zh' };
const result = await vm.runInContext('summarizeVideoNotes({videoId:"a",language:"en"})', context);
assert.equal(requestedVideo, 'a'); assert.equal(result.text, '## Summary'); assert.ok(seen.contents.includes('Write in zh'));
settings = { aiProvider: 'moonshot', moonshotApiKey: 'test-key' };
assert.equal((await vm.runInContext('summarizeVideoNotes({videoId:"b"})', context)).text, 'Kimi summary');
assert.ok(!JSON.stringify(seen).includes('SECRET_IMAGE'));
console.log('PASS: summary provenance, exact timestamps, image exclusion, limits, provider routing and missing credentials');

const { shareBlocks } = await import('../src/share-image.js');
assert.deepEqual(shareBlocks('## Heading\n\n- **First** [01:32]\n---\n[Source](https://example.com)'), [
  {text:'Heading',kind:'heading'}, {text:'First [01:32]',kind:'bullet'}, {text:'Source',kind:'body'}
]);
console.log('PASS: share image removes Markdown syntax and preserves timestamps');
