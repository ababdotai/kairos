document.addEventListener('DOMContentLoaded', async () => {
    const videoListEl = document.getElementById('videoList');
    const mainContentEl = document.getElementById('mainContent');

    // Load Data via Background
    loadVideoList();

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

        mainContentEl.innerHTML = `
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
                    <div class="note-entry">
                        <div class="timestamp-dot"></div>
                        <span class="timestamp">${note.timeLabel}</span>
                        <div class="content">${note.content}</div>
                    </div>
                `).join('')}
            </div>
        `;

        document.getElementById('btnExport').onclick = () => exportMarkdown(video);
        document.getElementById('btnDelete').onclick = () => deleteVideoNotes(video.videoId, video.notes);
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
                    mainContentEl.innerHTML = `
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
