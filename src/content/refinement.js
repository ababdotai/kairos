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
  function setHint(button, hint) {
    button.dataset.kairosTip = hint;
    button.setAttribute('aria-label', `${button.textContent} · ${hint}`);
  }
  function refreshButtons() {
    for (const button of buttons) {
      if (button.wasConnected && !button.isConnected) { buttons.delete(button); continue; }
      button.wasConnected ||= button.isConnected;
      button.querySelector('.kairos-ai-state').textContent = t(enabled ? 'AI on' : 'AI off');
      button.setAttribute('aria-pressed', String(enabled));
      setHint(button, enabled ? t('Automatically refine new notes · Click to turn off') : t('Refine new notes using the frame and subtitles · Click to turn on'));
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
    button.title = '';
    const state = document.createElement('span');
    state.className = 'kairos-ai-state';
    const track = document.createElement('span');
    track.className = 'kairos-ai-track';
    track.setAttribute('aria-hidden', 'true');
    button.append(state, track);
    buttons.add(button); refreshButtons();
    button.addEventListener('click', async event => {
      event.stopPropagation();
      button.disabled = true;
      try {
        const result = await request('SET_AUTO_REFINE', { enabled: !enabled });
        if (result.status === 'configuration_required') {
          setHint(button, t('Configure an AI provider first'));
          await request('OPEN_SETTINGS');
          return;
        }
        enabled = result.enabled; refreshButtons();
      } catch (error) {
        setHint(button, error.message === 'AI_NOT_CONFIGURED' ? t('Configure an AI provider first') : t('Could not save settings. Please try again.'));
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
    .kairos-ai-toggle { display:inline-flex; position:relative; align-items:center; gap:4px; flex:none; height:26px; padding:0 5px; border:0; border-radius:7px; background:transparent; color:inherit; cursor:pointer; }
    .kairos-ai-toggle::before { content:"AI"; font:600 10px/1 system-ui,sans-serif; letter-spacing:.02em; }
    .kairos-ai-state { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); }
    .kairos-ai-track { position:relative; width:23px; height:14px; box-sizing:border-box; border-radius:9px; background:#8797a647; box-shadow:inset 0 0 0 1px #8498a642; transition:background .2s; }
    .kairos-ai-track::after { content:""; position:absolute; left:3px; top:3px; width:8px; height:8px; border-radius:50%; background:currentColor; transition:transform .24s cubic-bezier(.2,.8,.2,1); }
    .kairos-ai-toggle[aria-pressed=true] .kairos-ai-track { background:#52879f; }
    .kairos-ai-toggle[aria-pressed=true] .kairos-ai-track::after { background:white; transform:translateX(9px) rotate(90deg); clip-path:polygon(50% 0,66% 35%,100% 50%,66% 65%,50% 100%,34% 65%,0 50%,34% 35%); }
    .kairos-ai-toggle:hover { background:#8498ab20; }
    .kairos-ai-toggle:focus-visible { outline:2px solid currentColor; outline-offset:2px; }
    .kairos-ai-toggle:disabled { opacity:.55; }
    @media(prefers-reduced-motion:reduce) { .kairos-ai-track,.kairos-ai-track::after { transition:none; } }
    .kairos-refinement-status{display:inline-flex;align-items:center;gap:4px;max-width:100%;font:10px/1.4 -apple-system,BlinkMacSystemFont,sans-serif;color:inherit;opacity:.68;white-space:nowrap;vertical-align:middle}.kairos-refinement-status[hidden]{display:none}
    .kairos-refinement-icon{display:inline-block;font-size:13px}.kairos-refinement-status[data-state=pending] .kairos-refinement-icon{animation:kairos-refine-spin 2.5s linear infinite}
    .kairos-island-note-row .kairos-refinement-status[data-state=complete] .kairos-refinement-label{display:none}
    @keyframes kairos-refine-spin{to{transform:rotate(360deg)}}
    @media(prefers-reduced-motion:reduce){.kairos-refinement-icon{animation:none!important}}
  `;
  window.Kairos.Refinement = { init, createToggle, status, replaceText, styles, request, track };
})();
