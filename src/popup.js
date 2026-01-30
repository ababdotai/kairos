document.addEventListener('DOMContentLoaded', async () => {
  const currentVideoSection = document.getElementById('current-video-section');
  const noVideoState = document.getElementById('no-video-state');
  const emptyStateTitle = document.getElementById('empty-state-title');
  const emptyStateMsg = document.getElementById('empty-state-msg');
  const dashboardBtn = document.getElementById('dashboard-btn');
  const exportBtn = document.getElementById('export-btn');
  const refreshBtn = document.getElementById('refresh-btn');
  const videoTitleEl = document.getElementById('video-title');
  const noteCountEl = document.getElementById('note-count');

  // Dashboard Navigation
  dashboardBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: '/src/dashboard.html' });
  });

  // Refresh Button Logic
  refreshBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      chrome.tabs.reload(tab.id);
      window.close(); // Close popup after action
    }
  });

  // Check current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || (!tab.url.includes('youtube.com') && !tab.url.includes('bilibili.com'))) {
    showEmptyState('Not a Video Page', 'Please navigate to YouTube or Bilibili to use Kairos.');
    return;
  }

  // Get Video ID from URL (Robust Logic)
  let videoId = null;
  const url = new URL(tab.url);
  if (url.hostname.includes('youtube.com')) {
    if (url.pathname.startsWith('/shorts/')) {
      videoId = 'yt-' + url.pathname.split('/shorts/')[1];
    } else {
      videoId = 'yt-' + url.searchParams.get('v');
    }
  } else if (url.hostname.includes('bilibili.com')) {
    const bvid = url.pathname.split('/').find(p => p.startsWith('BV'));
    videoId = bvid ? 'bili-' + bvid : null;
  }

  if (!videoId) {
    showEmptyState('No Video Found', 'We couldn\'t detect a video on this page. Try refreshing.');
    return;
  }

  // Request Data via Background
  chrome.runtime.sendMessage({ type: 'GET_NOTES', payload: { videoId } }, (response) => {
    if (response && response.success) {
      const notes = response.data;

      // Show video section even if 0 notes, so user knows it's connected
      currentVideoSection.style.display = 'block';
      noVideoState.style.display = 'none';
      
      // Use tab title as fallback if no notes yet
      videoTitleEl.textContent = (notes.length > 0 && notes[0].videoTitle) ? notes[0].videoTitle : tab.title;
      noteCountEl.textContent = `${notes.length} note${notes.length === 1 ? '' : 's'}`;

      if (notes.length > 0) {
        exportBtn.disabled = false;
        exportBtn.onclick = () => exportMarkdown(notes);
      } else {
        exportBtn.disabled = true;
      }

    } else {
      console.error('Failed to fetch notes:', response ? response.error : 'Unknown');
      showEmptyState('Connection Error', 'Could not retrieve notes. Please try refreshing the page.');
    }
  });

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