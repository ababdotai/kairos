import './content/i18n.js';
const { t, localize } = window.Kairos.I18n;
document.addEventListener('DOMContentLoaded', async () => {
  await window.Kairos.I18n.init();
  document.documentElement.lang = window.Kairos.I18n.locale;
  localize();
  const currentVideoSection = document.getElementById('current-video-section');
  const noVideoState = document.getElementById('no-video-state');
  const emptyStateTitle = document.getElementById('empty-state-title');
  const emptyStateMsg = document.getElementById('empty-state-msg');
  const dashboardBtn = document.getElementById('dashboard-btn');
  const exportBtn = document.getElementById('export-btn');
  const videoTitleEl = document.getElementById('video-title');
  const noteCountEl = document.getElementById('note-count');

  // Dashboard Navigation
  dashboardBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: '/src/dashboard.html' });
  });

  document.querySelectorAll('.platform-link').forEach(link => {
    link.addEventListener('click', event => {
      event.preventDefault();
      chrome.tabs.create({ url: link.href });
    });
  });

  // Check current tab
  let tab;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch {
    showEmptyState(t("Connection Error"), t("Could not read the current tab. Please reopen Kairos."));
    return;
  }

  let url;
  try { url = new URL(tab?.url); } catch { /* Restricted tabs may omit their URL. */ }
  const isHost = domain => url && (url.hostname === domain || url.hostname.endsWith('.' + domain));
  if (!isHost('youtube.com') && !isHost('bilibili.com')) {
    showEmptyState(t("Not a Video Page"), t("Please navigate to YouTube or Bilibili to use Kairos."));
    return;
  }

  // Get Video ID from URL (Robust Logic)
  let videoId = null;
  if (isHost('youtube.com')) {
    if (url.pathname.startsWith('/shorts/')) {
      const id = url.pathname.split('/shorts/')[1].split('/')[0];
      videoId = id ? 'yt-' + id : null;
    } else if (url.pathname === '/watch' && url.searchParams.get('v')) {
      videoId = 'yt-' + url.searchParams.get('v');
    }
  } else if (isHost('bilibili.com')) {
    const bvid = url.pathname.split('/').find(p => p.startsWith('BV'));
    videoId = bvid ? 'bili-' + bvid : null;
  }

  if (!videoId) {
    showEmptyState(t("No Video Found"), t("Open YouTube or Bilibili to start capturing."));
    return;
  }

  // Request Data via Background
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_NOTES', payload: { videoId } });
    if (response?.success && Array.isArray(response.data) && response.data.every(note => note && typeof note === 'object')) {
      const notes = response.data;

      // Show video section even if 0 notes, so user knows it's connected
      currentVideoSection.style.display = 'block';
      noVideoState.style.display = 'none';
      
      // Use tab title as fallback if no notes yet
      videoTitleEl.textContent = (notes.length > 0 && notes[0].videoTitle) ? notes[0].videoTitle : (tab.title || 'Kairos');
      noteCountEl.textContent = t("{count} notes", { count: notes.length });

      if (notes.length > 0) {
        exportBtn.disabled = false;
        exportBtn.onclick = () => exportMarkdown(notes);
      } else {
        exportBtn.disabled = true;
      }

    } else {
      showEmptyState(t("Connection Error"), t("Could not retrieve notes. Please try refreshing the page."));
    }
  } catch {
    // MV3 workers can be unavailable while the extension reloads or updates.
    showEmptyState(t("Connection Error"), t("Could not retrieve notes. Please try refreshing the page."));
  }

  function showEmptyState(title, msg) {
    currentVideoSection.style.display = 'none';
    noVideoState.style.display = 'block';
    if (title) emptyStateTitle.textContent = title;
    if (msg) emptyStateMsg.textContent = msg;
  }
});

function exportMarkdown(notes) {
  if (!notes || notes.length === 0) return;

  const videoInfo = notes[0];
  const date = new Date().toLocaleDateString();

  let md = `# ${videoInfo.videoTitle}\n\n`;
  md += `**Source**: [${videoInfo.videoUrl}](${videoInfo.videoUrl})\n`;
  md += `**Captured**: ${date}\n\n`;
  md += `---\n\n`;

  // Sort by time
  notes.sort((a, b) => a.timestamp - b.timestamp);

  notes.forEach(note => {
    md += `### ${note.timeLabel}\n`;
    md += `${note.content}\n\n`;
  });

  // Trigger Download
  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Kairos-Notes-${videoInfo.videoId}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
