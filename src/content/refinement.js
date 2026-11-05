/** Shared preference, per-note status and gentle replacement motion for both panels. */
(function () {
  const { t } = window.Kairos.I18n;
  const buttons = new Set();
  const pending = new Map();
  let enabled = false;
  let ready;
  function request(type, payload) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage({ type, payload }, response => {
          if (chrome.runtime.lastError || !response?.success) reject(new Error(chrome.runtime.lastError?.message || response?.error || 'No response'));
          else resolve(response.data);
        });
      } catch (error) { reject(error); }
    });
  }
  function refreshButtons() {
    for (const button of buttons) {
      if (button.wasConnected && !button.isConnected) { buttons.delete(button); continue; }
      button.wasConnected ||= button.isConnected;
      button.textContent = t(enabled ? 'AI on' : 'AI off');
      button.setAttribute('aria-pressed', String(enabled));
      button.title = enabled ? t('Automatically refine new notes · Click to turn off') : t('Refine new notes using the frame and subtitles · Click to turn on');
      button.setAttribute('aria-label', `${button.textContent} · ${button.title}`);
    }
  }
  async function fetchNote(id) {
    try {
      const note = await request('GET_NOTE', { id });
      window.dispatchEvent(new CustomEvent('kairos-note-updated', { detail: { id, note } }));
      track(note, id);
    } catch { /* A later update or reload retries; no disruptive error toast. */ }
  }
  function track(note, id = note?.id) {
    if (!id) return;
    clearTimeout(pending.get(id)); pending.delete(id);
    if (note?.refinement?.status === 'pending') pending.set(id, setTimeout(() => fetchNote(id), Math.max(1000, 96000 - (Date.now() - note.refinement.startedAt))));
  }
  function init() {
    return ready ||= (async () => {
      const settings = await chrome.storage.sync.get('autoRefineNotes').catch(() => ({}));
      enabled = settings.autoRefineNotes === true;
      refreshButtons();
      chrome.storage.onChanged?.addListener((changes, area) => {
        if (area === 'sync' && changes.autoRefineNotes) { enabled = changes.autoRefineNotes.newValue === true; refreshButtons(); }
        if (area === 'local' && changes.kairosNoteChange?.newValue) void fetchNote(changes.kairosNoteChange.newValue.id);
      });
    })();
  }
  function createToggle() {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'kairos-ai-toggle';
    buttons.add(button); refreshButtons();
    button.addEventListener('click', async event => {
      event.stopPropagation();
      button.disabled = true;
      try {
        const result = await request('SET_AUTO_REFINE', { enabled: !enabled });
        if (result.status === 'configuration_required') {
          button.title = t('Configure an AI provider first');
          button.setAttribute('aria-label', `${button.textContent} · ${button.title}`);
          await request('OPEN_SETTINGS');
          return;
        }
        enabled = result.enabled; refreshButtons();
      } catch (error) {
        button.title = error.message === 'AI_NOT_CONFIGURED' ? t('Configure an AI provider first') : t('Could not save settings. Please try again.');
        if (error.message === 'AI_NOT_CONFIGURED') chrome.runtime.sendMessage({ type: 'OPEN_SETTINGS' });
      } finally { button.disabled = false; }
    });
    return button;
  }
  function status(note) {
    track(note);
    const state = note.refinement?.status;
    const badge = document.createElement('span');
    badge.className = 'kairos-refinement-status';
    badge.dataset.state = state || '';
    const labels = { pending: 'Refining…', complete: 'AI refined', error: 'Original saved', cancelled: 'Original saved' };
    const titles = { pending: 'Original saved · Refining with the frame and subtitles', complete: 'AI refined · Original available in Dashboard', error: 'AI refinement unavailable · Your original is saved', cancelled: 'AI turned off · Your original is saved' };
    badge.hidden = !labels[state];
    if (labels[state]) {
      const icon = document.createElement('span'); icon.className = 'kairos-refinement-icon'; icon.textContent = state === 'pending' ? '◌' : state === 'complete' ? '✦' : '·'; icon.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span'); label.className = 'kairos-refinement-label'; label.textContent = t(labels[state]);
      badge.append(icon, label); badge.title = t(titles[state]); badge.setAttribute('aria-label', badge.title);
    }
    return badge;
  }
  function replaceText(element, update, animate) {
    if (!animate || !element.isConnected || matchMedia('(prefers-reduced-motion: reduce)').matches) { update(); return; }
    // Keep the new text selectable immediately; animate a noninteractive snapshot out.
    const parent = element.parentElement;
    const rect = element.getBoundingClientRect();
    const bounds = parent.getBoundingClientRect();
    const previous = element.cloneNode(true);
    previous.removeAttribute('id'); previous.setAttribute('aria-hidden', 'true');
    previous.style.cssText = `position:absolute;pointer-events:none;left:${rect.left - bounds.left}px;top:${rect.top - bounds.top}px;width:${rect.width}px;margin:0;z-index:1`;
    parent.style.position = 'relative';
    parent.appendChild(previous);
    previous.animate([{ opacity: .7, transform: 'translateX(0)' }, { opacity: 0, transform: 'translateX(12px)' }], { duration: 160, easing: 'ease-out' }).finished.then(() => previous.remove(), () => previous.remove());
    update();
    element.animate([{ opacity: 0, transform: 'translateX(-8px)' }, { opacity: 1, transform: 'translateX(0)' }], { duration: 260, easing: 'cubic-bezier(.22,1,.36,1)' });
  }
  const styles = `
    .kairos-island-note .kairos-island-note-copy{min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
    .kairos-ai-toggle{font:500 11px/1.3 -apple-system,BlinkMacSystemFont,sans-serif;border:1px solid #8ca6b340;border-radius:20px;padding:5px 9px;white-space:nowrap;color:inherit;background:transparent;cursor:pointer;transition:background .2s,border-color .2s}
    .kairos-ai-toggle[aria-pressed=true]{background:#8eb4c51a;border-color:#8eb4c580;color:inherit}.kairos-ai-toggle:hover{background:#8eb4c525}.kairos-ai-toggle:focus-visible{outline:2px solid #8eb4c5;outline-offset:2px}.kairos-ai-toggle:disabled{opacity:.55}
    .kairos-refinement-status{display:inline-flex;align-items:center;gap:4px;max-width:100%;font:10px/1.4 -apple-system,BlinkMacSystemFont,sans-serif;color:inherit;opacity:.68;white-space:nowrap;vertical-align:middle}.kairos-refinement-status[hidden]{display:none}
    .kairos-refinement-icon{display:inline-block;font-size:13px}.kairos-refinement-status[data-state=pending] .kairos-refinement-icon{animation:kairos-refine-spin 2.5s linear infinite}
    .kairos-island-note-row .kairos-refinement-status[data-state=complete] .kairos-refinement-label{display:none}
    @keyframes kairos-refine-spin{to{transform:rotate(360deg)}}
    @media(prefers-reduced-motion:reduce){.kairos-refinement-icon{animation:none!important}}
  `;
  window.Kairos.Refinement = { init, createToggle, status, replaceText, styles, request, track };
})();
