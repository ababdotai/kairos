import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import { resolveAI } from './ai-providers.js';

/** One capability-aware route for notes, subtitle highlights and summaries. */
export async function generateAI(settings, { prompt, image, maxTokens = 8192 }) {
  const { provider, config, model, apiKey } = resolveAI(settings);
  let media;
  if (image) {
    const match = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/s.exec(image);
    if (image.startsWith('data:') && !match) throw new Error('Unsupported screenshot format.');
    media = { mimeType: match?.[1] || 'image/jpeg', data: match?.[2] || image };
  }
  let text;
  if (provider === 'google') {
    const parts = [{ text: prompt }];
    if (media) parts.push({ inlineData: media });
    const response = await new GoogleGenAI({ apiKey }).models.generateContent({ model, contents: [{ role: 'user', parts }], config: { maxOutputTokens: maxTokens } });
    if (response.candidates?.[0]?.finishReason === 'MAX_TOKENS') throw new Error('AI output was too long. Please retry with fewer notes.');
    text = response.text;
  } else if (provider === 'anthropic') {
    const content = [{ type: 'text', text: prompt }];
    if (media) content.push({ type: 'image', source: { type: 'base64', media_type: media.mimeType, data: media.data } });
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: AbortSignal.timeout(90000),
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'user', content }] })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(`${config.name}: ${result.error?.message || response.status}`);
    if (result.stop_reason === 'max_tokens') throw new Error('AI output was too long. Please retry with fewer notes.');
    text = result.content?.filter(part => part.type === 'text').map(part => part.text).join('\n');
  } else {
    const content = [{ type: 'text', text: prompt }];
    if (media) content.push({ type: 'image_url', image_url: { url: `data:${media.mimeType};base64,${media.data}` } });
    const client = new OpenAI({ apiKey, baseURL: config.baseURL, dangerouslyAllowBrowser: true, timeout: 90000, maxRetries: 0 });
    const options = provider === 'openai' ? { max_completion_tokens: maxTokens, reasoning_effort: 'low' } : { max_tokens: maxTokens };
    if (provider === 'moonshot') options.reasoning_effort = 'low';
    if (provider === 'deepseek') options.thinking = { type: 'disabled' };
    const result = await client.chat.completions.create({ model, messages: [{ role: 'user', content }], ...options });
    if (result.choices?.[0]?.finish_reason === 'length') throw new Error('AI output was too long. Please retry with fewer notes.');
    text = result.choices?.[0]?.message?.content;
  }
  if (!text?.trim()) throw new Error('The AI returned no text. Please retry.');
  return text.trim();
}
