/** Local, deterministic PNG rendering. No notes are sent to an image service. */
export function shareBlocks(text) {
  return text.split(/\r?\n/).map(line => {
    const value = line.trim();
    if (!value || /^[-*_]{3,}$/.test(value)) return null;
    const heading = /^#{1,6}\s/.test(value);
    const bullet = /^(?:[-*+]\s|\d+[.)]\s)/.test(value);
    const clean = value.replace(/^#{1,6}\s+/, '').replace(/^(?:[-*+]\s+|\d+[.)]\s+)/, '')
      .replace(/^>\s?/, '').replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\*\*|__|`/g, '');
    return { text: clean, kind: heading ? 'heading' : bullet ? 'bullet' : 'body' };
  }).filter(Boolean);
}

function wrap(ctx, text, width) {
  const lines = [];
  let line = '';
  for (const char of Array.from(text)) {
    if (line && ctx.measureText(line + char).width > width) {
      const space = line.lastIndexOf(' ');
      if (space > line.length * .4) { lines.push(line.slice(0, space)); line = line.slice(space + 1) + char; }
      else { lines.push(line); line = char; }
    }
    else line += char;
  }
  if (line) lines.push(line);
  return lines;
}

export async function renderShareImage({ title, text, source, count, t, logoUrl }) {
  await document.fonts.ready;
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(t('Could not create the image. Please try again.'));
  const family = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';
  const font = (size, weight = 400) => { ctx.font = `${weight} ${size}px ${family}`; };
  font(56, 650);
  const titleLines = wrap(ctx, title, 920);
  let y = 228 + titleLines.length * 78 + 80;
  const blocks = shareBlocks(text).map(block => {
    const heading = block.kind === 'heading';
    const indent = block.kind === 'bullet' ? 32 : 0;
    const size = heading ? 37 : 32;
    font(size, heading ? 600 : 400);
    const lines = wrap(ctx, block.text, 920 - indent);
    const top = y;
    y += lines.length * 54 + (heading ? 24 : 32);
    return { ...block, lines, top, indent, size };
  });
  font(23);
  const sourceLines = wrap(ctx, source || '', 920);
  const footerTop = y + 20;
  canvas.height = Math.max(1080, footerTop + 220 + sourceLines.length * 34);
  // Fail explicitly rather than silently cutting off the user's text.
  if (canvas.height > 16000) throw new Error(t('This image is too long. Shorten the summary and try again.'));
  const gradient = ctx.createLinearGradient(0, 0, 1080, canvas.height);
  gradient.addColorStop(0, '#202b38'); gradient.addColorStop(.35, '#151b24'); gradient.addColorStop(1, '#10151c');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1080, canvas.height);
  const glow = ctx.createRadialGradient(980, 0, 0, 980, 0, 700);
  glow.addColorStop(0, '#9fdce518'); glow.addColorStop(1, '#9fdce500');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, 1080, canvas.height);
  ctx.strokeStyle = '#ffffff26'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(24, 24, 1032, canvas.height - 48, 40); ctx.stroke();
  // Use the product's existing orb, not a generated replacement logo.
  let logo;
  try {
    logo = new Image(); logo.src = logoUrl; await logo.decode();
    ctx.drawImage(logo, 80, 74, 60, 60);
  } catch { logo = null; }
  font(35, 650); ctx.fillStyle = '#f4f7fb'; ctx.fillText('Kairos', logo ? 156 : 80, 117);
  font(24); ctx.fillStyle = '#a7bbc9'; ctx.textAlign = 'right'; ctx.fillText(t('Viewing notes'), 1000, 115); ctx.textAlign = 'left';
  font(56, 650); ctx.fillStyle = '#f4f7fb';
  titleLines.forEach((line, i) => ctx.fillText(line, 80, 228 + i * 78));
  const metaY = 228 + titleLines.length * 78;
  font(24); ctx.fillStyle = '#abc6d6'; ctx.fillText(t('{count} notes', { count }), 80, metaY + 10);
  ctx.strokeStyle = '#ffffff24'; ctx.beginPath(); ctx.moveTo(80, metaY + 40); ctx.lineTo(1000, metaY + 40); ctx.stroke();
  for (const block of blocks) {
    font(block.size, block.kind === 'heading' ? 600 : 400);
    ctx.fillStyle = block.kind === 'heading' ? '#b9deea' : '#e1e8ef';
    if (block.kind === 'bullet') {
      ctx.beginPath(); ctx.arc(87, block.top - 11, 4, 0, Math.PI * 2); ctx.fill();
    }
    block.lines.forEach((line, i) => ctx.fillText(line, 80 + block.indent, block.top + i * 54));
  }
  const bottom = Math.max(footerTop, canvas.height - 220 - sourceLines.length * 34);
  ctx.strokeStyle = '#ffffff24'; ctx.beginPath(); ctx.moveTo(80, bottom); ctx.lineTo(1000, bottom); ctx.stroke();
  font(29, 500); ctx.fillStyle = '#e1e8ef'; ctx.fillText(t('Watch together. Remember more.'), 80, bottom + 58);
  font(23); ctx.fillStyle = '#99acbb'; ctx.fillText(t('Personal viewing notes · Made with Kairos'), 80, bottom + 104);
  sourceLines.forEach((line, i) => ctx.fillText(line, 80, bottom + 146 + i * 34));
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error(t('Could not create the image. Please try again.'));
  return { blob, width: canvas.width, height: canvas.height };
}

export async function previewShareImage(options) {
  const { t } = options;
  const result = await renderShareImage(options);
  const url = URL.createObjectURL(result.blob);
  const dialog = document.createElement('dialog');
  dialog.className = 'share-image-dialog';
  dialog.setAttribute('aria-label', t('Share image preview'));
  const toolbar = document.createElement('div'); toolbar.className = 'share-image-toolbar';
  const label = document.createElement('strong'); label.textContent = t('Share image preview');
  const download = document.createElement('button'); download.className = 'action-btn primary'; download.textContent = t('Download PNG');
  download.onclick = () => {
    const a = document.createElement('a'); a.href = url; a.download = `Kairos-${options.videoId}-notes.png`; a.click();
  };
  const close = document.createElement('button'); close.className = 'action-btn'; close.textContent = t('Close'); close.onclick = () => dialog.close();
  toolbar.append(label, download, close);
  const scroll = document.createElement('div'); scroll.className = 'share-image-scroll';
  const img = document.createElement('img'); img.src = url; img.alt = options.title;
  img.width = result.width; img.height = result.height;
  scroll.append(img); dialog.append(toolbar, scroll);
  dialog.addEventListener('close', () => { URL.revokeObjectURL(url); dialog.remove(); });
  document.body.append(dialog); dialog.showModal(); download.focus();
  return dialog;
}
