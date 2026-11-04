import { PROVIDER_ICONS } from './provider-icons.js';
import { AI_PROVIDERS, AI_SETTINGS_KEYS, resolveModel } from './ai-providers.js';
import './content/i18n.js';
const { t, localize } = window.Kairos.I18n;
import './content/markdown.js';
import { mountSummary } from './dashboard-summary.js';

document.addEventListener('DOMContentLoaded', async () => {
  await window.Kairos.I18n.init();
  document.documentElement.lang = window.Kairos.I18n.locale;
  localize();
    const videoListEl = document.getElementById('videoList');
    const libraryViewEl = document.getElementById('libraryView');
    const welcomeMarkup = libraryViewEl.innerHTML;
    document.getElementById('brandHome').addEventListener('click', () => {
        switchTab('library');
        libraryViewEl.innerHTML = welcomeMarkup;
        localize(libraryViewEl);
        videoListEl.querySelectorAll('.video-item.active').forEach(item => item.classList.remove('active'));
        document.getElementById('mainContent').scrollTop = 0;
    });
    const settingsViewEl = document.getElementById('settingsView');
    const navItems = document.querySelectorAll('.nav-item');
    const apiKeyInput = document.getElementById('apiKeyInput');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const statusMessageEl = document.getElementById('statusMessage');
    const toggleKeyVisibilityBtn = document.getElementById('toggleKeyVisibility');
    const languageOptions = document.querySelectorAll('.radio-option[data-lang]');
    const highlightOptions = document.querySelectorAll('.radio-option[data-highlight]');
    const uiLanguageGroup = document.getElementById('uiLanguageGroup');
    const uiLanguageInputs = [...uiLanguageGroup.querySelectorAll('input')];
    const syncUILanguage = () => uiLanguageInputs.forEach(input => {
        input.checked = input.value === window.Kairos.I18n.preference;
        input.closest('.radio-option').classList.toggle('selected', input.checked);
    });
    syncUILanguage();
    uiLanguageGroup.addEventListener('change', async event => {
        const value = event.target.value;
        if (!['auto', 'zh', 'en'].includes(value)) return;
        uiLanguageInputs.forEach(input => { input.disabled = true; });
        try {
            await chrome.storage.sync.set({ uiLanguage: value });
            window.Kairos.I18n.setPreference(value);
            document.documentElement.lang = window.Kairos.I18n.locale;
            localize();
            const selectedProvider = document.querySelector('input[name="provider"]:checked').value;
            tempKeys[selectedProvider] = apiKeyInput.value.trim();
            tempModels[selectedProvider] = document.getElementById('modelSelect').value;
            updateProviderUI(selectedProvider);
            const provider = providerConfig[selectedProvider];
            apiKeyInput.placeholder = t('Paste your {provider} API Key ({example})', { provider: provider.name, example: provider.keyPlaceholder });
            statusMessageEl.textContent = '';
        } catch {
            showStatus(t('Could not save interface language. Please try again.'), 'error');
        } finally {
            syncUILanguage();
            uiLanguageInputs.forEach(input => { input.disabled = false; });
        }
    });

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

    const providerConfig = AI_PROVIDERS;
    const tempKeys = {};
    const tempModels = {};
    document.getElementById('providerGroup').innerHTML = Object.entries(providerConfig).map(([id, config]) => `
      <label class="radio-option provider-card" data-provider="${id}">
        <input type="radio" name="provider" value="${id}">
        <span class="provider-icon" style="--provider-color:${config.color}" aria-hidden="true">${PROVIDER_ICONS[id]}</span>
        <span class="radio-content"><span class="radio-title">${config.name}</span>
        <span class="radio-desc" data-i18n="${config.description}">${t(config.description)}</span></span>
      </label>`).join('');
    loadSettings();

    function setupSettingsListeners() {
        const providerRadios = document.querySelectorAll('input[name="provider"]');
        providerRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                // Save current input to temp before switching
                const currentKey = apiKeyInput.value.trim();
                const previousProvider = document.querySelector('.radio-option[data-provider].selected')?.dataset.provider;
                if (previousProvider) {
                    tempKeys[previousProvider] = currentKey;
                    tempModels[previousProvider] = document.getElementById('modelSelect').value;
                }

                updateProviderUI(e.target.value);
            });
        });
    }

    /**
     * Updates the UI (Model dropdown, Key Input) based on selected provider
     */
    function updateProviderUI(provider) {
        const config = providerConfig[provider];
        if (!config) return;

        // Update Visual Selection
        document.querySelectorAll('.radio-option[data-provider]').forEach(opt => {
            if (opt.dataset.provider === provider) {
                opt.classList.add('selected');
                opt.querySelector('input').checked = true;
            } else {
                opt.classList.remove('selected');
            }
        });

        // Update Model Dropdown
        const modelSelect = document.getElementById('modelSelect');
        modelSelect.innerHTML = config.models.map((m, index) =>
            `<option value="${m}">${m} · ${t(config.labels[index])}</option>`
        ).join('');
        
        // Select default or saved model (if applicable logic exists, for now default)
        const saved = tempModels[provider];
        if (saved && !config.models.includes(saved)) {
            const option = document.createElement('option');
            option.value = saved; option.textContent = saved + ' · ' + t('Previously selected');
            modelSelect.append(option);
        }
        modelSelect.value = saved || config.models[0];

        // Update API Key Input
        apiKeyInput.value = tempKeys[provider] || '';
        apiKeyInput.placeholder = t("Paste your {provider} API Key ({example})", { provider: config.name, example: config.keyPlaceholder });
        
        // Update Help Link
        const helpLink = document.querySelector('#apiKeyHelp a');
        helpLink.href = config.keyHelpLink;
        helpLink.textContent = config.keyHelpText;
    }

    /**
     * Loads saved settings from chrome.storage.sync
     */
    function loadSettings() {
        chrome.storage.sync.get(AI_SETTINGS_KEYS, (result) => {
            
            // 1. Determine Provider
            let currentProvider = providerConfig[result.aiProvider] ? result.aiProvider : 'google';
            
            // 2. Load Keys
            for (const [id, config] of Object.entries(providerConfig)) {
                tempKeys[id] = result[config.keyField] || (id === 'google' ? result.geminiApiKey : '') || '';
                const saved = result.providerModels?.[id] || (id === currentProvider ? result.aiModel : '');
                tempModels[id] = resolveModel(id, saved);
            }
            updateProviderUI(currentProvider);

            // 5. Load Language Preference
            const savedLang = result.noteLanguage || 'auto';
            const targetLangRadio = document.querySelector(`input[name="noteLanguage"][value="${savedLang}"]`);
            if (targetLangRadio) {
                targetLangRadio.checked = true;
                // Update visuals
                languageOptions.forEach(opt => opt.classList.remove('selected'));
                targetLangRadio.closest('.radio-option').classList.add('selected');
            }
            
            // Setup listeners after loading initial state
            setupSettingsListeners();
        });
    }

    /**
     * Saves settings to chrome.storage.sync
     */
    function saveSettings() {
        const currentProvider = document.querySelector('input[name="provider"]:checked').value;
        const currentModel = document.getElementById('modelSelect').value;
        const currentKey = apiKeyInput.value.trim();
        const selectedLang = document.querySelector('input[name="noteLanguage"]:checked').value;

        if (!currentKey) {
            showStatus(t("Please enter a valid API Key"), 'error');
            return;
        }

        // Update temp storage
        tempKeys[currentProvider] = currentKey;

        tempModels[currentProvider] = currentModel;
        const updates = {
            aiProvider: currentProvider,
            aiModel: currentModel,
            providerModels: { ...tempModels },
            noteLanguage: selectedLang
        };
        for (const [id, key] of Object.entries(tempKeys)) updates[providerConfig[id].keyField] = key;

        chrome.storage.sync.set(updates, () => {
            if (chrome.runtime.lastError) {
                showStatus(t('Could not save settings. Please try again.'), 'error');
                return;
            }
            showStatus(t("Settings saved successfully!"), 'success');
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
                        <span>${t("{count} notes", { count: video.notes.length })}</span>
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
                    <a href="${video.url}" target="_blank" style="color: inherit; text-decoration: none; border-bottom: 1px dotted #aaa;">${t("View Source Video \u2197")}</a>
                </div>
                <div class="note-title">${video.title}</div>
                <div class="note-actions">
                    <button class="action-btn primary" id="btnSummary">${t('Summarize & share')}</button>
                    <button class="action-btn" id="btnExport">${t("Export Markdown")}</button>
                    <button class="action-btn" id="btnDelete" style="color: #ff4d4d;">${t("Delete All")}</button>
                </div>
            </div>
            <section class="summary-panel" hidden></section>
            <div class="timeline">
                ${video.notes.map(note => `
                    <div class="note-entry" id="note-${note.id}">
                        <div class="timestamp-dot"></div>
                        
                        <div class="note-header-row">
                             <div class="timestamp-group">
                                <span class="timestamp">${note.timeLabel}</span>
                                <span class="note-badge ${note.source === 'ai' ? 'ai' : 'user'}">${note.source === 'ai' ? 'AI' : t("You")}</span>
                             </div>
                             <button class="btn-copy-note" data-note-id="${note.id}" title="${t('Copy note text')}">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                ${t("Copy")}
                             </button>
                        </div>

                        <div class="note-body ${note.source === 'ai' ? 'ai-note' : 'user-note'}">
                            <div class="content">${Kairos.SimpleMarkdown.parse(note.content || t('Screenshot'))}</div>
                            ${renderExtras(note)}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;

        document.getElementById('btnExport').onclick = () => exportMarkdown(video);
        const summaryPanel = libraryViewEl.querySelector('.summary-panel');
        document.getElementById('btnSummary').onclick = () => {
            summaryPanel.hidden = false;
            if (!summaryPanel.dataset.initialized) {
                summaryPanel.dataset.initialized = 'true';
                mountSummary(summaryPanel, video);
            }
        };
        document.getElementById('btnDelete').onclick = () => deleteVideoNotes(video.videoId, video.notes);
        libraryViewEl.querySelectorAll('.note-screenshot').forEach(image => {
            image.tabIndex = 0;
            image.setAttribute('role', 'button');
            const open = () => {
                if (document.querySelector('.snapshot-dialog')) return;
                const dialog = document.createElement('dialog');
                dialog.className = 'snapshot-dialog';
                dialog.setAttribute('aria-label', t('Visual Snapshot'));
                const close = document.createElement('button');
                close.type = 'button';
                close.className = 'action-btn snapshot-close'; close.textContent = t('Close');
                const enlarged = image.cloneNode();
                enlarged.loading = 'eager';
                enlarged.setAttribute('aria-label', t('Close'));
                enlarged.title = t('Close');
                let animation;
                let closing = false;
                const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
                const thumbnailTransform = () => {
                    const from = image.getBoundingClientRect();
                    const to = enlarged.getBoundingClientRect();
                    if (!image.isConnected || !from.width || !to.width) return 'scale(.96)';
                    return `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`;
                };
                const dismiss = () => {
                    if (closing) return;
                    closing = true;
                    if (reducedMotion()) { dialog.close(); return; }
                    // Start from the current frame, even when closing mid-expansion.
                    const current = getComputedStyle(enlarged).transform;
                    animation?.cancel();
                    const target = thumbnailTransform();
                    dialog.classList.add('is-closing');
                    animation = enlarged.animate([{ transform: current }, { transform: target }], {
                        duration: 240, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards'
                    });
                    animation.finished.then(() => { if (dialog.open) dialog.close(); }).catch(() => {});
                };
                close.onclick = dismiss;
                enlarged.onclick = dismiss;
                enlarged.onkeydown = event => {
                    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); dismiss(); }
                };
                dialog.addEventListener('cancel', event => { event.preventDefault(); dismiss(); });
                dialog.append(close, enlarged);
                dialog.addEventListener('close', () => {
                    animation?.cancel(); dialog.remove();
                    if (image.isConnected) image.focus({ preventScroll: true });
                });
                document.body.append(dialog); dialog.showModal();
                if (!reducedMotion()) {
                    animation = enlarged.animate([{ transform: thumbnailTransform() }, { transform: 'none' }], {
                        duration: 320, easing: 'cubic-bezier(.22,1,.36,1)'
                    });
                }
            };
            image.onclick = open;
            image.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } };
        });

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
                        ${t("Visual Snapshot")}
                    </div>
                    <div class="note-screenshot-container">
                        <img src="${note.imageUrl}" class="note-screenshot" loading="lazy" alt="${t('Visual Snapshot')}">
                    </div>
                </div>
            `;
        }

        if (note.context) {
            html += `
                <div class="extra-item">
                     <div class="extra-header">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
                        ${t("Audio Transcript")}
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
            btnElement.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> ${t("Copied!")}`;
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
        if (!confirm(t("Are you sure you want to delete all notes for this video? This cannot be undone."))) return;

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
                            <p>${t("Notes deleted.")}</p>
                        </div>
                    `;
                }
            });
        });
    }
});
