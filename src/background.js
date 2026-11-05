import { prepareNoteSave, refinementPrompt } from './note-refinement.js';
import { GoogleGenAI } from '@google/genai';
import { generateAI } from './ai-client.js';
import { AI_SETTINGS_KEYS, resolveAI } from './ai-providers.js';
import { summaryPrompt, summaryFingerprint } from './note-summary.js';

/**
 * Background Service Worker
 * Acts as the central data hub for Kairos using IndexedDB (Extension Origin).
 */

const DB_NAME = 'KairosDB';
const DB_VERSION = 1;
const STORE_NAME = 'notes';

// --- IndexedDB Helpers ---

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('videoId', 'videoId', { unique: false });
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

// Serialize each record update in IndexedDB; never recreate a deleted note on AI completion.
async function mutateNote(id, transform) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    let result;
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('Note transaction aborted')); };
    tx.onerror = () => {};
    const request = store.get(id);
    request.onsuccess = () => {
      try {
        const next = transform(request.result);
        result = { changed: next !== undefined, note: next === undefined ? request.result : next };
        if (next === null) store.delete(id);
        else if (next !== undefined) store.put(next);
      } catch (error) { tx.abort(); }
    };
  });
}

async function getNote(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(id);
    tx.oncomplete = () => { db.close(); resolve(request.result || null); };
    tx.onabort = () => { db.close(); reject(tx.error); };
  });
}

async function publishNote(note, deletedId) {
  // A small invalidation signal, never a second copy of screenshots or note text.
  try { await chrome.storage.local.set({ kairosNoteChange: { id: note?.id ?? deletedId, videoId: note?.videoId, event: crypto.randomUUID() } }); }
  catch { /* Persistence has already succeeded; readers can reload it later. */ }
}

let refinementEnabledOverride;
async function saveNote(input) {
  const settings = await chrome.storage?.sync?.get([...AI_SETTINGS_KEYS, 'autoRefineNotes']) || {};
  const { note } = await mutateNote(input.id, previous => prepareNoteSave(input, previous, refinementEnabledOverride ?? (settings.autoRefineNotes === true)));
  // Return the committed original immediately; refinement cannot delay playback.
  void publishNote(note);
  if (note.refinement?.status === 'pending') void refineNote(note, settings);
  return { status: 'success', note };
}

const refinementJobs = new Set();
async function refineNote(note, settings) {
  const token = note.refinement.token;
  refinementJobs.add(token);
  let timeout;
  // MV3 can suspend an idle worker while an API is slow. Keep only this bounded job alive.
  const keepAlive = setInterval(() => { chrome.storage.local.get('kairosNoteChange').catch(() => {}); }, 20000);
  let outcome;
  try {
    const { provider, model } = resolveAI(settings);
    const text = await Promise.race([
      generateAI(settings, { prompt: refinementPrompt(note, settings.noteLanguage || 'auto'), image: note.imageUrl, maxTokens: 2048 }),
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('REFINEMENT_TIMEOUT')), 90000); })
    ]);
    if (!text?.trim()) throw new Error('EMPTY_REFINEMENT');
    outcome = { status: 'complete', text: text.trim(), provider, model, completedAt: Date.now() };
  } catch {
    outcome = { status: 'error', completedAt: Date.now() };
  } finally {
    clearTimeout(timeout); clearInterval(keepAlive); refinementJobs.delete(token);
  }
  try {
    const { changed, note: updated } = await mutateNote(note.id, current => {
      if (!current || current.revision !== note.revision || current.refinement?.token !== token || current.refinement.status !== 'pending') return;
      const { text, ...metadata } = refinementEnabledOverride === false ? { status: 'cancelled', completedAt: Date.now() } : outcome;
      return { ...current, ...(text ? { content: text, aiContent: text } : {}), updatedAt: Math.max(Date.now(), current.updatedAt + 1), refinement: { ...current.refinement, ...metadata } };
    });
    if (changed) await publishNote(updated);
  } catch (error) { console.error('Could not persist refined note:', error); }
}

async function setAutoRefine(enabled) {
  if (typeof enabled !== 'boolean') throw new Error('Invalid AI preference');
  if (enabled) {
    // Missing configuration is an expected user action, not a worker failure.
    // Read storage outside this guard so genuine storage errors remain visible.
    const settings = await chrome.storage.sync.get(AI_SETTINGS_KEYS);
    try { resolveAI(settings); }
    catch { return { status: 'configuration_required' }; }
  }
  const previous = refinementEnabledOverride;
  refinementEnabledOverride = enabled;
  try { await chrome.storage.sync.set({ autoRefineNotes: enabled }); }
  catch (error) { refinementEnabledOverride = previous; throw error; }
  if (!enabled) await cancelPendingRefinements();
  return { enabled };
}

async function cancelPendingRefinements() {
  for (const note of await getAllNotes()) {
    if (note.refinement?.status !== 'pending') continue;
    const result = await mutateNote(note.id, current => {
      if (current?.refinement?.token !== note.refinement.token || current.refinement.status !== 'pending') return;
      return { ...current, refinement: { ...current.refinement, status: 'cancelled' }, updatedAt: Math.max(Date.now(), current.updatedAt + 1) };
    });
    if (result.changed) await publishNote(result.note);
  }
}
chrome.storage?.onChanged?.addListener((changes, area) => {
  if (area !== 'sync' || !changes.autoRefineNotes) return;
  refinementEnabledOverride = changes.autoRefineNotes.newValue === true;
  if (!refinementEnabledOverride) void cancelPendingRefinements().catch(console.error);
});

// A browser/worker restart must not leave an eternal activity indicator.
async function recoverRefinements(notes) {
  return Promise.all(notes.map(async note => {
    if (note.refinement?.status !== 'pending' || refinementJobs.has(note.refinement.token) || Date.now() - note.refinement.startedAt < 95000) return note;
    const result = await mutateNote(note.id, current => {
      if (current?.refinement?.token !== note.refinement.token || current.refinement.status !== 'pending') return;
      return { ...current, refinement: { ...current.refinement, status: 'error' }, updatedAt: Math.max(Date.now(), current.updatedAt + 1) };
    });
    if (result.changed) void publishNote(result.note);
    return result.note;
  }));
}

async function getNotes(videoId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('videoId');
    const request = index.getAll(videoId);
    request.onsuccess = () => { db.close(); resolve(request.result); };
    request.onerror = (e) => reject(e.target.error);
  });
}

async function getAllNotes() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => { db.close(); resolve(request.result); };
    request.onerror = (e) => reject(e.target.error);
  });
}

async function deleteNote(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    // Report success only after the transaction commits, not just the request.
    tx.oncomplete = () => { db.close(); resolve({ status: 'deleted' }); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('Delete transaction aborted')); };
    tx.onerror = () => { /* onabort reports the final transaction outcome. */ };
    try { store.delete(id); }
    catch (error) { db.close(); reject(error); }
  });
}

// --- Message Listener ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Use async handler pattern
  (async () => {
    try {
      let response;
      switch (message.type) {
        case 'SUMMARIZE_VIDEO_NOTES':
          response = await summarizeVideoNotes(message.payload);
          break;
        case 'SET_AUTO_REFINE':
          response = await setAutoRefine(message.payload.enabled);
          break;
        case 'GET_NOTE': {
          const note = await getNote(message.payload.id);
          response = note ? (await recoverRefinements([note]))[0] : null;
          break;
        }
        case 'ATTACH_NOTE_IMAGE': {
          const { id, videoId, imageUrl } = message.payload;
          if (typeof imageUrl !== 'string' || !imageUrl.startsWith('data:image/')) throw new Error('Invalid captured image');
          const result = await mutateNote(id, current => {
            if (!current || current.videoId !== videoId || current.imageUrl) return;
            return { ...current, imageUrl, updatedAt: Math.max(Date.now(), current.updatedAt + 1) };
          });
          if (result.changed) void publishNote(result.note);
          response = result.note || null;
          break;
        }
        case 'SAVE_NOTE':
          response = await saveNote(message.payload);
          break;
        case 'GET_NOTES':
          response = (await recoverRefinements(await getNotes(message.payload.videoId))).filter(Boolean);
          break;
        case 'GET_ALL_NOTES':
          response = (await recoverRefinements(await getAllNotes())).filter(Boolean);
          break;
        case 'DELETE_NOTE':
          response = await deleteNote(message.payload.id);
          void publishNote(null, message.payload.id);
          break;
        case 'OPEN_DASHBOARD':
          chrome.tabs.create({ url: '/src/dashboard.html' });
          response = { status: 'opened' };
          break;
        case 'OPEN_SETTINGS':
          await chrome.tabs.create({ url: '/src/dashboard.html?tab=settings' });
          response = { status: 'opened' };
          break;
        case 'ANALYZE_FRAME':
          response = await callGeminiAI(message.payload);
          break;
        case 'ANALYZE_SUBTITLES':
          response = await callGeminiForSubtitles(message.payload);
          break;
        case 'GENERATE_HUD_SCRIPT':
          response = await callGeminiForHUD(message.payload);
          break;
        default:
          throw new Error('Unknown message type');
      }
      sendResponse({ success: true, data: response });
    } catch (error) {
      console.error('Background Error:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  return true; // Keep channel open for async response
});

// --- Gemini API Logic ---

/**
 * Calls the AI API (Gemini or Moonshot) to analyze a video frame and context
 * @param {Object} payload - Contains image (base64), text, and videoTitle
 * @returns {Promise<Object>} AI Response
 */
async function callGeminiAI(payload) {
  const { image, context, videoTitle } = payload;

  const settings = await chrome.storage.sync.get(AI_SETTINGS_KEYS);
  // 2. Prepare language instruction
  const languageMap = {
    'en': 'English',
    'zh': 'Chinese (中文)',
    'ja': 'Japanese (日本語)',
    'es': 'Spanish (Español)',
    'fr': 'French (Français)'
  };

  const noteLanguage = settings.noteLanguage || 'auto';
  let languageInstruction = '';
  if (noteLanguage !== 'auto') {
    languageInstruction = `\n- IMPORTANT: Output the note in ${languageMap[noteLanguage]} language.`;
  } else {
    languageInstruction = '\n- Use the video\'s primary language (detected from title/subtitles).';
  }

  // 3. Prepare the prompt
  let systemPrompt = "You are Kairos, an intelligent video learning assistant. ";
  systemPrompt += "Analyze the provided video frame (visuals) and transcript context (audio) to create a high-quality, structured note. ";
  systemPrompt += "\nRules for Note Generation:";
  systemPrompt += "\n1. **Capture the Core Idea**: Synthesize the visual information (slides, code, diagrams) with the speaker's explanation.";
  systemPrompt += "\n2. **Structured Format**: Use a clear structure (e.g., a short Title/Concept followed by bullet points).";
  systemPrompt += "\n3. **Concise but Complete**: Be brief, but ensure sentences are grammatically complete and thoughts are finished. Do not cut off mid-sentence.";
  systemPrompt += "\n4. **No Internal Monologue**: Do NOT output internal thoughts, self-corrections, or meta-commentary (e.g., 'The prompt asks for...'). Output ONLY the final note content.";
  systemPrompt += "\n5. **No Filler**: Avoid phrases like 'This video shows...', 'The speaker says...'. Go straight to the information.";
  systemPrompt += languageInstruction;

  if (videoTitle) systemPrompt += `\nVideo Title: ${videoTitle}`;
  if (context) systemPrompt += `\nTranscript (last 60s): "${context}"`;

  const userPrompt = "Generate a structured note for this moment:";

  return { text: await generateAI(settings, { prompt: systemPrompt + "\n\n" + userPrompt, image }) };
}

/**
 * Calls AI to analyze subtitle text for smart highlights
 * @param {Object} payload - { context: string, videoTitle: string }
 * @returns {Promise<Object>} JSON { isKeyMoment, label, emoji }
 */
async function callGeminiForSubtitles(payload) {
  const { context, videoTitle } = payload;

  const settings = await chrome.storage.sync.get(AI_SETTINGS_KEYS);

  // Prompt Construction
  let prompt = `You are an expert video editor. Analyze the transcript from the video "${videoTitle || 'Unknown'}".
    
FULL TRANSCRIPT (Current Session):
"${context}"

Task: Based on the FULL CONTEXT above, determine if the MOST RECENT lines (last 15-30 seconds) contain a KEY INSIGHT, DEFINITION, or CORE CONCEPT that is worth highlighting NOW.
Context Usage: Use the earlier parts of the transcript to resolve pronouns, understand the arc, and ensure the highlight is meaningful, but ONLY highlight if the *newest* information is the "punchline" or key takeaway.
Ignore: filler talk, intro/outro, casual conversation, housekeeping, incomplete thoughts.

Return a JSON object with:
- "isKeyMoment": boolean
- "label": string (Max 3-5 words, essentially a title for this moment)
- "emoji": string (1 char, relevant emoji)
- "reason": string (Why is this important in the context of the whole video?)

JSON ONLY. No markdown.`;

  try {
    const text = await generateAI(settings, { prompt });
    return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch (e) {
    console.error('Smart Highlight Error:', e);
    return { isKeyMoment: false };
  }
}

/**
 * Calls AI to generate a visual HUD script from subtitles
 * @param {Object} payload - { context: string, videoTitle: string }
 * @returns {Promise<Array>} Array of HUD events
 */
async function callGeminiForHUD(payload) {
  const { videoUrl, videoTitle } = payload;

  const settings = await chrome.storage.sync.get(AI_SETTINGS_KEYS);
  const { provider, apiKey, model: modelId } = resolveAI(settings);
  if (provider !== 'google') throw new Error('Video URL analysis requires Google Gemini. Screenshot notes and summaries work with every provider.');

  const systemPrompt = `You are a Visual Information Designer. Your task is to transform a video into a "Heads-Up Display" (HUD) visual script.
    
    The video is: "${videoTitle}"
    URL: ${videoUrl}
    
    TASK:
    Analyze the video content (via the URL provided) to create a comprehensive visual timeline of key visual events.
    Focus on:
    1. Chapter/Section headers when topics change.
    2. Key data points/charts when numbers are mentioned.
    3. "Quote Cards" for impactful statements.
    4. Technical term definitions when new concepts are introduced.
    
    PROCESSING PARAMETERS:
    - Resolution: Low (360p analysis is sufficient)
    - FPS: 1 (Sample 1 frame per second)
    
    OUTPUT FORMAT (Strict JSON Array):
    [
      {
        "start": number (start time in seconds. e.g. 120.5),
        "duration": number (duration in seconds, 3-8s recommended),
        "position": "bottom-left" | "bottom-right" | "top-left" | "top-right" | "center-top",
        "html": "String (Raw HTML for the card content. Use Tailwind-like classes or inline styles. Wrap in <div class='k-hud-card'>)",
        "css": "String (Optional custom CSS for this specific component)"
      }
    ]
    
    VISUAL STYLE GUIDE:
    - Use <div class='k-hud-card'> as the container.
    - Keep text high-contrast (white text on dark glass background).
    - Use colors for emphasis: #00f2ff (cyan) for info, #00ff9d (green) for success/growth, #ff0095 (pink) for emphasis.
    - Icons (Emojis) are encouraged.
    
    JSON ONLY. NO MARKDOWN. NO EXPLANATION.`;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: modelId,
      contents: [
        {
          role: 'user',
          parts: [
            {
              fileData: {
                mimeType: 'video/mp4',
                fileUri: videoUrl,
                videoMetadata: { fps: 5 }
              }
            },
            {
              text: systemPrompt
            }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
        mediaResolution: 'MEDIA_RESOLUTION_LOW',
      }
    });
    
    const result = JSON.parse(response.text);
    return Array.isArray(result) ? result : [];
  } catch (e) {
    console.error('HUD Script Generation Error:', e);
    return [];
  }
}

/** Summarize only this video's persisted notes, using the configured provider. */
async function summarizeVideoNotes({ videoId, language } = {}) {
  if (!videoId || typeof videoId !== 'string') throw new Error('Invalid video ID');
  const notes = await getNotes(videoId);
  if (!notes.length) throw new Error('No saved notes to summarize.');
  const settings = await chrome.storage.sync.get(AI_SETTINGS_KEYS);
  const prompt = summaryPrompt(notes[0].videoTitle || '', notes, settings.noteLanguage && settings.noteLanguage !== 'auto' ? settings.noteLanguage : language);
  const text = await generateAI(settings, { prompt });
  return { text: text.trim(), fingerprint: summaryFingerprint(notes) };
}
