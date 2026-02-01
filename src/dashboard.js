import './content/markdown.js';

document.addEventListener('DOMContentLoaded', async () => {
    const videoListEl = document.getElementById('videoList');
    const libraryViewEl = document.getElementById('libraryView');
    const settingsViewEl = document.getElementById('settingsView');
    const navItems = document.querySelectorAll('.nav-item');
    const apiKeyInput = document.getElementById('apiKeyInput');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const statusMessageEl = document.getElementById('statusMessage');
    const toggleKeyVisibilityBtn = document.getElementById('toggleKeyVisibility');
    const languageOptions = document.querySelectorAll('.radio-option[data-lang]');
    const highlightOptions = document.querySelectorAll('.radio-option[data-highlight]');

    // State
    let currentTab = 'library';

    // Check URL params for tab
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    if (tabParam && ['library', 'settings'].includes(tabParam)) {
        currentTab = tabParam;
    }

    // Init
    loadVideoList();
    loadSettings();
    setupNavigation();
    switchTab(currentTab); // Apply initial tab state

    function setupNavigation() {
        navItems.forEach(item => {
            item.addEventListener('click', () => {
                const tab = item.dataset.tab;
                switchTab(tab);
            });
        });

        toggleKeyVisibilityBtn.addEventListener('click', () => {
            const type = apiKeyInput.type === 'password' ? 'text' : 'password';
            apiKeyInput.type = type;
        });

        // Language option selection
        languageOptions.forEach(option => {
            option.addEventListener('click', () => {
                const radio = option.querySelector('input[type="radio"]');
                radio.checked = true;

                // Update UI
                languageOptions.forEach(opt => opt.classList.remove('selected'));
                option.classList.add('selected');
            });
        });

        // Highlight option selection
        highlightOptions.forEach(option => {
            option.addEventListener('click', () => {
                const radio = option.querySelector('input[type="radio"]');
                radio.checked = true;

                // Update UI
                highlightOptions.forEach(opt => opt.classList.remove('selected'));
                option.classList.add('selected');
            });
        });

        saveSettingsBtn.addEventListener('click', saveSettings);
    }

    function switchTab(tab) {
        currentTab = tab;

        // Update Nav UI
        navItems.forEach(item => {
            if (item.dataset.tab === tab) item.classList.add('active');
            else item.classList.remove('active');
        });

        // Update View UI
        if (tab === 'library') {
            libraryViewEl.style.display = 'block';
            settingsViewEl.style.display = 'none';
            videoListEl.style.display = 'block'; // Show sidebar list
        } else {
            libraryViewEl.style.display = 'none';
            settingsViewEl.style.display = 'block';
            videoListEl.style.display = 'none'; // Hide sidebar list for cleaner look
        }
    }

    // --- Settings Logic ---

    /**
     * Loads saved settings from chrome.storage.sync
     */
    function loadSettings() {
        chrome.storage.sync.get(['geminiApiKey', 'noteLanguage', 'autoHighlightMode'], (result) => {
            // Load API Key
            if (result.geminiApiKey) {
                apiKeyInput.value = result.geminiApiKey;
            }

            // Load Language Preference
            const savedLang = result.noteLanguage || 'auto';
            const targetLangRadio = document.querySelector(`input[name="noteLanguage"][value="${savedLang}"]`);
            if (targetLangRadio) {
                targetLangRadio.checked = true;
                // Update visuals
                languageOptions.forEach(opt => opt.classList.remove('selected'));
                targetLangRadio.closest('.radio-option').classList.add('selected');
            }

            // Load Highlight Mode
            const savedHighlight = result.autoHighlightMode || 'basic';
            const targetHighlightRadio = document.querySelector(`input[name="autoHighlightMode"][value="${savedHighlight}"]`);
            if (targetHighlightRadio) {
                targetHighlightRadio.checked = true;
                // Update visuals
                highlightOptions.forEach(opt => opt.classList.remove('selected'));
                targetHighlightRadio.closest('.radio-option').classList.add('selected');
            }
        });
    }

    /**
     * Saves settings to chrome.storage.sync
     */
    function saveSettings() {
        const apiKey = apiKeyInput.value.trim();
        const selectedLangInput = document.querySelector('input[name="noteLanguage"]:checked');
        const selectedHighlightInput = document.querySelector('input[name="autoHighlightMode"]:checked');

        const selectedLang = selectedLangInput ? selectedLangInput.value : 'auto';
        // Default to 'basic' if not found (element might be commented out in HTML)
        const selectedHighlight = selectedHighlightInput ? selectedHighlightInput.value : 'basic';

        if (!apiKey) {
            showStatus('Please enter a valid API Key', 'error');
            return;
        }

        if (!apiKey.startsWith('AIza')) {
            showStatus('Warning: Key typically starts with "AIza". Check if correct.', 'error');
            // We don't block it, just warn
        }

        chrome.storage.sync.set({
            geminiApiKey: apiKey,
            noteLanguage: selectedLang,
            autoHighlightMode: selectedHighlight
        }, () => {
            showStatus('Settings saved successfully!', 'success');
            setTimeout(() => {
                statusMessageEl.textContent = '';
            }, 3000);
        });
    }

    function showStatus(msg, type) {
        statusMessageEl.textContent = msg;
        statusMessageEl.className = 'status-message ' + type;
    }

    // --- Library Logic ---

    function loadVideoList() {
        chrome.runtime.sendMessage({ type: 'GET_ALL_NOTES' }, (response) => {
            if (response && response.success) {
                const notes = response.data;
                processNotes(notes);
            } else {
                console.error('Failed to load notes:', response ? response.error : 'Unknown');
            }
        });
    }

    function processNotes(notes) {
        if (!notes || notes.length === 0) return;

        // Group notes by videoId
        const videos = {};
        notes.forEach(note => {
            if (!videos[note.videoId]) {
                videos[note.videoId] = {
                    videoId: note.videoId,
                    title: note.videoTitle || 'Untitled Video',
                    url: note.videoUrl,
                    notes: [],
                    lastUpdated: 0
                };
            }
            videos[note.videoId].notes.push(note);
            if (note.createdAt > videos[note.videoId].lastUpdated) {
                videos[note.videoId].lastUpdated = note.createdAt;
            }
        });

        // Render List
        videoListEl.innerHTML = '';
        Object.values(videos)
            .sort((a, b) => b.lastUpdated - a.lastUpdated) // Recent first
            .forEach(video => {
                const item = document.createElement('div');
                item.className = 'video-item';
                item.innerHTML = `
                    <div class="video-item-title">${video.title}</div>
                    <div class="video-item-meta">
                        <span>${video.notes.length} notes</span>
                        <span>${new Date(video.lastUpdated).toLocaleDateString()}</span>
                    </div>
                `;
                item.addEventListener('click', () => {
                    // Switch to library tab if not active
                    if (currentTab !== 'library') switchTab('library');

                    // Highlight active
                    document.querySelectorAll('.video-item').forEach(i => i.classList.remove('active'));
                    item.classList.add('active');
                    renderNotes(video);
                });
                videoListEl.appendChild(item);
            });
    }

    function renderNotes(video) {
        // Sort notes by timestamp
        video.notes.sort((a, b) => a.timestamp - b.timestamp);

        libraryViewEl.innerHTML = `
            <div class="note-header">
                <div class="note-meta" style="color: #aaa; font-size: 13px; margin-bottom: 8px;">
                    <a href="${video.url}" target="_blank" style="color: inherit; text-decoration: none; border-bottom: 1px dotted #aaa;">View Source Video ↗</a>
                </div>
                <div class="note-title">${video.title}</div>
                <div class="note-actions">
                    <button class="action-btn primary" id="btnExport">Export Markdown</button>
                    <button class="action-btn" id="btnDelete" style="color: #ff4d4d;">Delete All</button>
                </div>
            </div>
            <div class="timeline">
                ${video.notes.map(note => `
                    <div class="note-entry" id="note-${note.id}">
                        <div class="timestamp-dot"></div>
                        
                        <div class="note-header-row">
                             <div class="timestamp-group">
                                <span class="timestamp">${note.timeLabel}</span>
                             </div>
                             <button class="btn-copy-note" data-note-id="${note.id}" title="Copy note text">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                Copy
                             </button>
                        </div>

                        <div class="content">${Kairos.SimpleMarkdown.parse(note.content)}</div>
                        ${renderExtras(note)}
                    </div>
                `).join('')}
            </div>
        `;

        document.getElementById('btnExport').onclick = () => exportMarkdown(video);
        document.getElementById('btnDelete').onclick = () => deleteVideoNotes(video.videoId, video.notes);

        // Bind Copy Buttons
        document.querySelectorAll('.btn-copy-note').forEach(btn => {
            btn.addEventListener('click', () => {
                const noteId = btn.dataset.noteId;
                const note = video.notes.find(n => n.id == noteId);
                if (note) {
                    copyToClipboard(note.content, btn);
                }
            });
        });
    }

    function renderExtras(note) {
        if (!note.imageUrl && !note.context) return '';

        let html = '<div class="extras-grid">';

        if (note.imageUrl) {
            html += `
                <div class="extra-item">
                    <div class="extra-header">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                        Visual Snapshot
                    </div>
                    <div class="note-screenshot-container">
                        <img src="${note.imageUrl}" class="note-screenshot" loading="lazy" alt="Visual Snapshot">
                    </div>
                </div>
            `;
        }

        if (note.context) {
            html += `
                <div class="extra-item">
                     <div class="extra-header">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
                        Audio Transcript
                     </div>
                    <div class="note-context-text">"${note.context}"</div>
                </div>
            `;
        }

        html += '</div>';
        return html;
    }

    function copyToClipboard(text, btnElement) {
        navigator.clipboard.writeText(text).then(() => {
            const originalHTML = btnElement.innerHTML;
            btnElement.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!`;
            btnElement.style.color = 'var(--accent)';
            btnElement.style.borderColor = 'var(--accent)';
            
            setTimeout(() => {
                btnElement.innerHTML = originalHTML;
                btnElement.style.color = '';
                btnElement.style.borderColor = '';
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy: ', err);
        });
    }

    function exportMarkdown(video) {
        const date = new Date().toLocaleDateString();
        let md = `# ${video.title}\n\n`;
        md += `**Source**: [${video.url}](${video.url})\n`;
        md += `**Captured**: ${date}\n\n`;
        md += `---\n\n`;

        video.notes.forEach(note => {
            md += `### ${note.timeLabel}\n`;
            md += `${note.content}\n\n`;

            if (note.context) {
                md += `> **Transcript**: "${note.context}"\n\n`;
            }
        });

        const blob = new Blob([md], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Kairos-${video.videoId}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    function deleteVideoNotes(videoId, notes) {
        if (!confirm('Are you sure you want to delete all notes for this video? This cannot be undone.')) return;

        // Delete each note via message passing
        let deletedCount = 0;
        notes.forEach(note => {
            chrome.runtime.sendMessage({ type: 'DELETE_NOTE', payload: { id: note.id } }, () => {
                deletedCount++;
                if (deletedCount === notes.length) {
                    loadVideoList(); // Refresh sidebar
                    libraryViewEl.innerHTML = `
                        <div class="empty-state">
                            <svg viewBox="0 0 24 24"><path d="M19 5v14H5V5h14m0-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/></svg>
                            <p>Notes deleted.</p>
                        </div>
                    `;
                }
            });
        });
    }
});
