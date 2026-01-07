/**
 * Kairos Storage Module
 * Proxy to Background Service Worker for IndexedDB operations
 */

(function () {
  'use strict';

  const { log } = window.Kairos;

  /**
   * StorageManager class - Proxy to Background Service Worker
   * Handles note persistence through message passing
   */
  class StorageManager {
    constructor() { }

    /**
     * Initializes the storage manager (no-op for proxy mode)
     * @returns {Promise<void>}
     */
    async init() {
      log('StorageManager initialized (Proxy Mode -> Background Worker)');
      return Promise.resolve();
    }

    /**
     * Saves a note to storage via background worker
     * @param {Object} note - Note data to save
     * @returns {Promise<Object>} Saved note data
     */
    async saveNote(note) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'SAVE_NOTE', payload: note }, (response) => {
          if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
          if (response && response.success) resolve(response.data);
          else reject(response ? response.error : 'Unknown error');
        });
      });
    }

    /**
     * Retrieves all notes for a specific video
     * @param {string} videoId - Video identifier
     * @returns {Promise<Array>} Array of notes
     */
    async getNotesForVideo(videoId) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'GET_NOTES', payload: { videoId } }, (response) => {
          if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
          if (response && response.success) resolve(response.data);
          else reject(response ? response.error : 'Unknown error');
        });
      });
    }

    /**
     * Deletes a note by ID
     * @param {string} id - Note identifier
     * @returns {Promise<void>}
     */
    async deleteNote(id) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'DELETE_NOTE', payload: { id } }, (response) => {
          if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
          if (response && response.success) resolve(response.data);
          else reject(response ? response.error : 'Unknown error');
        });
      });
    }
  }

  // Export to global namespace
  window.Kairos.StorageManager = StorageManager;

})();
