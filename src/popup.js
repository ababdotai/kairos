document.addEventListener('DOMContentLoaded', async () => {
  const currentVideoSection = document.getElementById('current-video-section');
  const noVideoState = document.getElementById('no-video-state');
  const dashboardBtn = document.getElementById('dashboard-btn');
  const exportBtn = document.getElementById('export-btn');
  const videoTitleEl = document.getElementById('video-title');
  const noteCountEl = document.getElementById('note-count');

  // My Notes & Settings
  dashboardBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: '/src/dashboard.html' });
  });

  // Check current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || (!tab.url.includes('youtube.com') && !tab.url.includes('bilibili.com'))) {
    noVideoState.style.display = 'block';
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
    noVideoState.style.display = 'block';
    return;
  }

  // Request Data via Background
  chrome.runtime.sendMessage({ type: 'GET_NOTES', payload: { videoId } }, (response) => {
    if (response && response.success) {
      const notes = response.data;

      if (notes && notes.length > 0) {
        currentVideoSection.style.display = 'block';
        videoTitleEl.textContent = notes[0].videoTitle || tab.title;
        noteCountEl.textContent = `${notes.length} note${notes.length === 1 ? '' : 's'} collected`;

        // Setup Export
        exportBtn.onclick = () => exportMarkdown(notes);
      } else {
        noVideoState.style.display = 'block';
        noVideoState.textContent = 'No notes found for this video.';
      }
    } else {
      console.error('Failed to fetch notes:', response ? response.error : 'Unknown');
      noVideoState.style.display = 'block';
      noVideoState.textContent = 'Error loading data.';
    }
  });
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