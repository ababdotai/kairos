// Curated for screenshot notes and text summaries; OpenAI and Kimi refreshed from official docs 2026-11-04.
export const AI_PROVIDERS = {
  google: { name: 'Google Gemini', color: '#648be8', description: 'Read slides, screenshots and subtitles together.', keyHelpLink: 'https://aistudio.google.com/apikey', keyHelpText: 'Google AI Studio', keyPlaceholder: 'AIza…', keyField: 'googleApiKey', models: ['gemini-3.1-flash-lite', 'gemini-3.8-flash'], labels: ['Quick everyday notes', 'More detailed understanding'] },
  openai: { name: 'OpenAI', color: '#55a58c', description: 'Turn screenshots and ideas into clear notes.', keyHelpLink: 'https://platform.openai.com/api-keys', keyHelpText: 'OpenAI Platform', keyPlaceholder: 'sk-…', keyField: 'openaiApiKey', baseURL: 'https://api.openai.com/v1', models: ['gpt-6.1-terra', 'gpt-6-astra', 'gpt-6.1-sol', 'gpt-6-luna'], labels: ['Visual understanding and clear notes', 'Deep reasoning for complex content', 'Balanced for everyday use', 'Quick everyday notes'] },
  anthropic: { name: 'Anthropic Claude', color: '#cc9478', description: 'Organize explanations and longer notes clearly.', keyHelpLink: 'https://platform.claude.com/settings/keys', keyHelpText: 'Claude Console', keyPlaceholder: 'sk-ant-…', keyField: 'anthropicApiKey', models: ['claude-haiku-5-5', 'claude-sonnet-5-5'], labels: ['Quick everyday notes', 'More detailed understanding'] },
  deepseek: { name: 'DeepSeek', color: '#648be8', description: 'Read screenshots and summarize key ideas.', keyHelpLink: 'https://platform.deepseek.com/api_keys', keyHelpText: 'DeepSeek Platform', keyPlaceholder: 'sk-…', keyField: 'deepseekApiKey', baseURL: 'https://api.deepseek.com', models: ['deepseek-flash'], labels: ['Balanced for everyday use'] },
  moonshot: { name: 'Kimi', color: '#9294ed', description: 'Connect screenshots with longer explanations.', keyHelpLink: 'https://platform.moonshot.cn/console/api-keys', keyHelpText: 'Kimi Platform', keyPlaceholder: 'sk-…', keyField: 'moonshotApiKey', baseURL: 'https://api.moonshot.cn/v1', models: ['kimi-k3.1-pro', 'kimi-k3'], labels: ['More detailed understanding', 'Deep reasoning for complex content'] },
  openrouter: { name: 'OpenRouter', color: '#ab90cf', description: 'Try different AI brands with one account.', keyHelpLink: 'https://openrouter.ai/settings/keys', keyHelpText: 'OpenRouter', keyPlaceholder: 'sk-or-…', keyField: 'openrouterApiKey', baseURL: 'https://openrouter.ai/api/v1', models: ['openai/gpt-5.4-mini', 'anthropic/claude-sonnet-5.5'], labels: ['Balanced for everyday use', 'More detailed understanding'] }
};
export const AI_SETTINGS_KEYS = ['aiProvider', 'aiModel', 'providerModels', 'geminiApiKey', 'noteLanguage', ...Object.values(AI_PROVIDERS).map(p => p.keyField)];
export function resolveModel(provider, saved) {
  const config = AI_PROVIDERS[provider];
  if (!config) throw new Error('Unsupported AI provider. Please choose a provider in Settings.');
  const upgrades = { openai: { 'gpt-5.4-mini': 'gpt-6.1-terra', 'gpt-5.4-nano': 'gpt-6-luna' } };
  const model = upgrades[provider]?.[saved] || saved;
  const legacy = { google: ['gemini-3-flash-preview'] };
  return [...config.models, ...(legacy[provider] || [])].includes(model) ? model : config.models[0];
}
export function resolveAI(settings) {
  const provider = settings.aiProvider || 'google';
  const config = AI_PROVIDERS[provider];
  if (!config) throw new Error('Unsupported AI provider. Please choose a provider in Settings.');
  const saved = settings.providerModels?.[provider] || settings.aiModel;
  const model = resolveModel(provider, saved);
  const apiKey = settings[config.keyField] || (provider === 'google' ? settings.geminiApiKey : '');
  if (!apiKey) throw new Error(`Configure your ${config.name} API key in Settings.`);
  return { provider, config, model, apiKey };
}
