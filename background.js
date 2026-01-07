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
          chrome.tabs.create({ url: 'dashboard.html' });
          response = { status: 'opened' };
          break;
        case 'ANALYZE_FRAME':
          response = await callGeminiAI(message.payload);
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
  const { image, text, videoTitle, promptType } = payload;
  
  // 1. Get API Key from storage
  const settings = await chrome.storage.sync.get(['geminiApiKey']);
  const apiKey = settings.geminiApiKey;
  
  if (!apiKey) {
    throw new Error('Gemini API Key not found. Please configure it in Settings.');
  }

  // 2. Prepare the prompt
  // promptType can be 'auto' (automatic discovery) or 'manual' (user clicked Pin)
  let systemPrompt = "You are Kairos, a minimalist AI video notetaker. ";
  systemPrompt += "Analyze the video frame and context. Create a VERY CONCISE note. ";
  systemPrompt += "Rules:\n";
  systemPrompt += "- Limit to 1-3 short bullet points or one single sentence.\n";
  systemPrompt += "- Use Markdown (bold key terms).\n";
  systemPrompt += "- Focus only on high-value info (code, facts, definitions).\n";
  systemPrompt += "- No conversational filler (no 'This video explains...').";
  
  if (videoTitle) systemPrompt += `\nVideo Title: ${videoTitle}`;

  const userPrompt = text 
    ? `Context: "${text}"\n\nGenerate note:`
    : "Summarize this moment in 1-2 lines:";

  // 3. Construct Gemini API Request
  // Using gemini-3-flash-preview as requested
  const MODEL_ID = 'gemini-3-flash-preview';
  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent?key=${apiKey}`;

  // Strip base64 prefix if present
  const base64Data = image.split(',')[1] || image;

  const requestBody = {
    contents: [
      {
        parts: [
          { text: systemPrompt + "\n\n" + userPrompt },
          {
            inline_data: {
              mime_type: "image/jpeg",
              data: base64Data
            }
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.4,
      topP: 0.8,
      topK: 40,
      maxOutputTokens: 512,
    }
  };

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error?.message || `API Request failed: ${response.status}`);
  }

  const result = await response.json();
  
  // Extract text from Gemini response structure
  try {
    const aiText = result.candidates[0].content.parts[0].text;
    return { text: aiText.trim() };
  } catch (e) {
    console.error('Failed to parse Gemini response:', result);
    throw new Error('Invalid response format from AI');
  }
}
