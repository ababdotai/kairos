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
