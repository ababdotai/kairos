import { GoogleGenAI } from '@google/genai';

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

async function saveNote(note) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(note);
    request.onsuccess = () => resolve({ status: 'success' });
    request.onerror = (e) => reject(e.target.error);
  });
}

async function getNotes(videoId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('videoId');
    const request = index.getAll(videoId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function getAllNotes() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function deleteNote(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve({ status: 'deleted' });
    request.onerror = (e) => reject(e.target.error);
  });
}

// --- Message Listener ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Use async handler pattern
  (async () => {
    try {
      let response;
      switch (message.type) {
        case 'SAVE_NOTE':
          response = await saveNote(message.payload);
          break;
        case 'GET_NOTES':
          response = await getNotes(message.payload.videoId);
          break;
        case 'GET_ALL_NOTES':
          response = await getAllNotes();
          break;
        case 'DELETE_NOTE':
          response = await deleteNote(message.payload.id);
          break;
        case 'OPEN_DASHBOARD':
          chrome.tabs.create({ url: '/src/dashboard.html' });
          response = { status: 'opened' };
          break;
        case 'OPEN_SETTINGS':
          chrome.tabs.create({ url: '/src/dashboard.html?tab=settings' });
          response = { status: 'opened' };
          break;
        case 'ANALYZE_FRAME':
          response = await callGeminiAI(message.payload);
          break;
        case 'ANALYZE_SUBTITLES':
          response = await callGeminiForSubtitles(message.payload);
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
 * Calls the Google Gemini API to analyze a video frame and context
 * @param {Object} payload - Contains image (base64), text, and videoTitle
 * @returns {Promise<Object>} AI Response
 */
async function callGeminiAI(payload) {
  const { image, context, videoTitle } = payload;

  // 1. Get API Key and Language Preference from storage
  const settings = await chrome.storage.sync.get(['geminiApiKey', 'noteLanguage']);
  const apiKey = settings.geminiApiKey;
  const noteLanguage = settings.noteLanguage || 'auto';

  if (!apiKey) {
    throw new Error('Gemini API Key not found. Please configure it in Settings.');
  }

  // 2. Prepare language instruction
  const languageMap = {
    'en': 'English',
    'zh': 'Chinese (中文)',
    'ja': 'Japanese (日本語)',
    'es': 'Spanish (Español)',
    'fr': 'French (Français)'
  };

  let languageInstruction = '';
  if (noteLanguage !== 'auto') {
    languageInstruction = `\n- IMPORTANT: Generate the note in ${languageMap[noteLanguage]} language.`;
  } else {
    languageInstruction = '\n- Use the video\'s primary language (detected from title/subtitles).';
  }

  // 3. Prepare the prompt
  let systemPrompt = "You are Kairos, a minimalist AI video secretary. ";
  systemPrompt += "Analyze the video frame (visuals) and the recent transcript (audio context) to create a VERY CONCISE note. ";
  systemPrompt += "Rules:\n";
  systemPrompt += "- Synthesize the visual information on the slide with the speaker's explanation.\n";
  systemPrompt += "- Limit to 1-3 short bullet points or one single sentence.\n";
  systemPrompt += "- Use Markdown (bold key terms).\n";
  systemPrompt += "- Focus only on high-value info (code, facts, definitions).\n";
  systemPrompt += "- No conversational filler (no 'This video explains...')."
  systemPrompt += languageInstruction;

  if (videoTitle) systemPrompt += `\nVideo Title: ${videoTitle}`;
  if (context) systemPrompt += `\nTranscript (last 60s): "${context}"`;

  const userPrompt = "Generate note for this moment:";

  // 4. Initialize the new Gemini SDK Client
  const ai = new GoogleGenAI({ apiKey });
  const modelId = 'gemini-3-flash-preview'; // Recommended model for speed and multimodal

  // Strip base64 prefix if present
  const base64Data = image.split(',')[1] || image;

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: [
        {
          role: 'user',
          parts: [
            { text: systemPrompt + "\n\n" + userPrompt },
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: base64Data
              }
            }
          ]
        }
      ],
      config: {
        temperature: 0.4,
        maxOutputTokens: 512,
      }
    });

    console.log('Gemini API Response:', response.text.trim());
    return { text: response.text.trim() };
  } catch (error) {
    console.error('Gemini API Error:', error);
    throw new Error(error.message || 'AI Generation failed');
  }
}

/**
 * Calls Gemini to analyze subtitle text for smart highlights
 * @param {Object} payload - { context: string, videoTitle: string }
 * @returns {Promise<Object>} JSON { isKeyMoment, label, emoji }
 */
async function callGeminiForSubtitles(payload) {
  const { context, videoTitle } = payload;

  const settings = await chrome.storage.sync.get(['geminiApiKey']);
  const apiKey = settings.geminiApiKey;

  if (!apiKey) return { isKeyMoment: false };

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

  const ai = new GoogleGenAI({ apiKey });
  const modelId = 'gemini-3-flash-preview';

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        temperature: 0.2,
        responseMimeType: "application/json"
      }
    });

    return JSON.parse(response.text);
  } catch (e) {
    console.error('Smart Highlight Error:', e);
    return { isKeyMoment: false };
  }
}
