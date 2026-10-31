import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../src/content/i18n.js', import.meta.url), 'utf8');
function load(browserLanguage, systemLanguage = 'en-US') {
  const context = { navigator: { language: systemLanguage } };
  if (browserLanguage) context.chrome = { i18n: { getUILanguage: () => browserLanguage } };
  vm.runInNewContext(source, context);
  return context.Kairos.I18n;
}
assert.equal(load('zh-CN').t('Settings'), '设置');
assert.equal(load('zh-TW').t('Enable'), '启用');
assert.equal(load('en-US', 'zh-CN').t('Enable'), 'Enable');
assert.equal(load(undefined, 'zh-CN').t('My Notes'), '我的笔记');
assert.equal(load('fr-FR').locale, 'en');
assert.equal(load('zh-CN').t('Delete {time} note', { time: '01:20' }), '删除 01:20 的笔记');
assert.equal(load('en-US').t('{count} notes', { count: 1 }), '1 note');
assert.equal(load('en-US').t('{count} notes', { count: 2 }), '2 notes');
assert.equal(load('zh-CN').t('Unregistered message'), 'Unregistered message');
console.log('PASS: UI language priority, Chinese variants, English fallback and interpolation');
for (const [saved, expected] of [['en', 'en'], ['zh', 'zh-CN'], ['auto', 'zh-CN'], ['invalid', 'zh-CN']]) {
  const context = { chrome: { i18n: { getUILanguage: () => 'zh-CN' }, storage: { sync: { get: async () => ({ uiLanguage: saved, noteLanguage: 'ja' }) } } } };
  vm.runInNewContext(source, context);
  await context.Kairos.I18n.init();
  assert.equal(context.Kairos.I18n.locale, expected);
  context.Kairos.I18n.setPreference('en');
  assert.equal(context.Kairos.I18n.t('Settings'), 'Settings');
  context.Kairos.I18n.setPreference('auto');
  assert.equal(context.Kairos.I18n.t('Settings'), '设置');
}
console.log('PASS: persisted overrides, invalid preference fallback and live switching');
