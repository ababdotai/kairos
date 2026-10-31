import { summaryFingerprint, summaryShare } from './note-summary.js';
import { previewShareImage } from './share-image.js';

export async function mountSummary(panel, video) {
  const { t } = window.Kairos.I18n;
  const fingerprint = summaryFingerprint(video.notes);
  const key = `video-summary:${video.videoId}`;
  panel.innerHTML = `
    <div class="summary-heading"><strong>${t('Your notes, together')}</strong><div class="note-actions"><button class="action-btn" data-mode>${t('Edit text')}</button><button class="action-btn" data-close>${t('Close')}</button></div></div>
    <p class="summary-hint">${t('Summarizes saved text and transcript context using your AI provider. Screenshots are not sent. Review and edit before sharing.')}</p>
    <textarea class="summary-editor" aria-label="${t('Editable summary')}" placeholder="${t('Generating summary…')}"></textarea>
    <div class="summary-reading" hidden></div>
    <p class="summary-status" role="status"></p>
    <div class="note-actions"><button class="action-btn primary" data-image>${t('Create share image')}</button><button class="action-btn" data-share>${t('Copy to share')}</button><button class="action-btn" data-download>${t('Download summary')}</button><button class="action-btn" data-generate>${t('Regenerate')}</button></div>
    <p class="summary-hint">${t('A clean 1080px-wide PNG, ready to preview and save. Images are created locally from your edited text.')}</p>`;
  const editor = panel.querySelector('textarea');
  const status = panel.querySelector('[role=status]');
  const generate = panel.querySelector('[data-generate]');
  const share = panel.querySelector('[data-share]');
  const download = panel.querySelector('[data-download]');
  const imageButton = panel.querySelector('[data-image]');
  const modeButton = panel.querySelector('[data-mode]');
  const reading = panel.querySelector('.summary-reading');
  let editing = false;
  let renderingImage = false;
  let savedFingerprint = fingerprint;
  let busy = false;
  let saveQueue = Promise.resolve();
  const persist = () => {
    const record = { text: editor.value, fingerprint: savedFingerprint };
    saveQueue = saveQueue.catch(() => {}).then(() => chrome.storage.local.set({ [key]: record }));
    return saveQueue;
  };
  const update = () => {
    share.disabled = download.disabled = busy || !editor.value.trim();
    imageButton.disabled = renderingImage || busy || (!editor.value.trim() && !video.notes.some(n => n.content?.trim()));
    reading.innerHTML = window.Kairos.SimpleMarkdown.parse(editor.value);
    reading.hidden = editing || !editor.value.trim();
    editor.hidden = !reading.hidden;
    modeButton.disabled = busy || !editor.value.trim();
    modeButton.textContent = t(editing ? 'Read preview' : 'Edit text');
    modeButton.setAttribute('aria-pressed', String(editing));
  };
  modeButton.onclick = () => { editing = !editing; update(); if (editing) editor.focus(); };
  panel.querySelector('[data-close]').onclick = () => { panel.hidden = true; };
  editor.oninput = () => { update(); persist().catch(() => { status.textContent = t('Could not save summary locally.'); }); };
  async function summarize() {
    if (busy) return;
    busy = true; generate.disabled = true; editor.readOnly = true; update();
    status.textContent = t('Generating summary…');
    try {
      const response = await chrome.runtime.sendMessage({ type: 'SUMMARIZE_VIDEO_NOTES', payload: { videoId: video.videoId, language: window.Kairos.I18n.locale } });
      if (!panel.isConnected) return;
      if (!response?.success) throw new Error(response?.error || t('Could not generate summary. Check your AI settings and retry.'));
      if (response.data.fingerprint !== fingerprint) throw new Error(t('Notes changed. Reopen this video and try again.'));
      editor.value = response.data.text;
      savedFingerprint = fingerprint;
      await persist();
      status.textContent = t('Saved locally · Edit before sharing');
    } catch (error) { status.textContent = `${t('Could not generate summary. Check your AI settings and retry.')} ${error.message}`; }
    finally { busy = false; generate.disabled = false; editor.readOnly = false; update(); }
  }
  generate.onclick = summarize;
  imageButton.onclick = async () => {
    if (renderingImage) return;
    renderingImage = true; update(); imageButton.textContent = t('Creating image…');
    try {
      await previewShareImage({
        title: video.title, videoId: video.videoId, source: video.url, count: video.notes.length, t,
        text: editor.value.trim() || video.notes.filter(n => n.content?.trim()).map(n => `- [${n.timeLabel}] ${n.content}`).join('\n'),
        logoUrl: chrome.runtime.getURL('icons/icon128.png')
      });
    } catch (error) { status.textContent = error.message; }
    finally { renderingImage = false; imageButton.textContent = t('Create share image'); update(); }
  };
  const shareText = () => summaryShare(video.title, video.url, editor.value, t('AI-assisted summary of saved notes'));
  share.onclick = async () => {
    try { await navigator.clipboard.writeText(shareText()); status.textContent = t('Copied!'); }
    catch { status.textContent = t('Copy failed. Select the text or download the summary.'); }
  };
  download.onclick = () => {
    const url = URL.createObjectURL(new Blob([shareText()], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `Kairos-summary-${video.videoId}.md`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  update();
  try {
    const cached = (await chrome.storage.local.get(key))[key];
    if (!panel.isConnected) return;
    if (cached?.text) {
      editor.value = cached.text; savedFingerprint = cached.fingerprint;
      status.textContent = cached.fingerprint === fingerprint ? t('Saved locally · Edit before sharing') : t('Notes changed. Regenerate to include the latest notes.');
      update(); return;
    }
  } catch { /* Generation remains available if reading the local cache fails. */ }
  await summarize();
}
