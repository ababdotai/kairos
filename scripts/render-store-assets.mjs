/** Render original brand artwork, not product screenshots. No external assets or packages. */
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = join(root, 'release/store-assets');
await mkdir(out, { recursive: true });
const logo = 'data:image/png;base64,' + (await readFile(join(root, 'public/icons/icon.png'))).toString('base64');
const profile = await mkdtemp(join(tmpdir(), 'kairos-artwork-'));
const chrome = spawn(process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', 'about:blank'
], { stdio: ['ignore', 'ignore', 'pipe'] });
let socket;
try {
  const endpoint = await new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(Error('Chrome startup timeout')), 15000);
    chrome.stderr.on('data', data => {
      output += data;
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timeout); resolve(match[1]); }
    });
    chrome.on('error', error => { clearTimeout(timeout); reject(error); });
  });
  const pages = await (await fetch(`http://${new URL(endpoint).host}/json`)).json();
  socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => { socket.onopen = resolve; });
  let id = 0;
  const pending = new Map();
  socket.onmessage = event => {
    const data = JSON.parse(event.data);
    if (!pending.has(data.id)) return;
    const { resolve, reject } = pending.get(data.id);
    pending.delete(data.id);
    data.error ? reject(data.error) : resolve(data.result);
  };
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const run = async expression => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };

  for (const lang of ['en', 'zh']) for (const small of [true, false]) {
    const width = small ? 440 : 1400, height = small ? 280 : 560;
    const zh = lang === 'zh';
    const headline = zh ? '一起看，<br><em>随手记。</em>' : 'Watch together.<br><em>Remember more.</em>';
    // Promotional depth cue: back dots are occluded by the rail, front dots glow over it.
    // The shipping timeline uses a shallow sine wave; this is a stylized illustration.
    const wave = (compact = false) => {
      const points = [];
      for (const [start, span, count, phase] of [[22, 122, 23, 0], [350, 99, 18, 0.6]]) {
        for (let i = 0; i < count; i++) {
          const theta = phase + i / (count - 1) * Math.PI * 2.15;
          const depth = Math.cos(theta);
          const x = start + span * i / (count - 1);
          const y = 42 - Math.sin(theta) * (compact ? 13 : 12);
          points.push({ depth, svg: `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${(2.35 + (depth + 1) * .45).toFixed(2)}" fill="${depth > 0 ? '#c3f0ff' : '#80b4c9'}" opacity="${(.53 + (depth + 1) * .23).toFixed(2)}" ${depth > .15 ? 'filter="url(#glow)"' : ''}/>` });
        }
      }
      return `<svg viewBox="0 0 520 98" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Note markers curve around the playback timeline"><defs><linearGradient id="rail"><stop stop-color="#c0e3ef"/><stop offset="1" stop-color="#f1faff"/></linearGradient><filter id="glow" x="-150%" y="-150%" width="400%" height="400%"><feGaussianBlur stdDeviation="1.9" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>${points.filter(p=>p.depth<=0).map(p=>p.svg).join('')}<rect x="8" y="39" width="504" height="6" rx="3" fill="#53616a"/><rect x="8" y="39" width="273" height="6" rx="3" fill="url(#rail)"/>${points.filter(p=>p.depth>0).map(p=>p.svg).join('')}<path d="M273 24 L291 24 L282 38 Z" fill="#f0f8ff"/>${compact ? '' : '<g fill="#bdcdd6" font-size="16" font-family="-apple-system,BlinkMacSystemFont,sans-serif"><text x="22" y="88">1 · 01:32</text><text x="151" y="88">2 · 01:59</text><text x="280" y="88">3 · 02:03</text><text x="409" y="88">4 · 02:06</text></g>'}</svg>`;
    };
    const html = `<!doctype html><html lang="${zh ? 'zh-CN' : 'en'}"><meta charset="utf-8"><title>Kairos promotional artwork — ${lang}</title>
<style>
*{box-sizing:border-box}html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden}
body{font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue','PingFang SC',sans-serif;color:#e9f0f7;background:#111a22}
.art{position:relative;width:100%;height:100%;overflow:hidden;background:radial-gradient(ellipse at 85% 24%,#5c506522,transparent 47%),radial-gradient(ellipse at 65% 68%,#24596725,transparent 43%),linear-gradient(120deg,#111b24,#151f29 62%,#11181e)}
.copy{position:absolute;left:66px;top:47px;width:650px}.brand{display:flex;align-items:center;gap:12px;font-size:28px;font-weight:600;letter-spacing:.3px}.brand img{width:47px;height:49px;object-fit:contain;filter:drop-shadow(0 0 20px #74cdec25)}
h1{font-size:${zh ? 67 : 65}px;line-height:1.15;letter-spacing:${zh ? '-1' : '-2.5'}px;font-weight:550;margin:38px 0 0}em{font-style:normal;color:#d1e4ef}.subtitle{font-size:17px;color:#9fb9c6;margin:22px 0 0;line-height:1.5}
.philosophy{margin:28px 0 0;color:#91a6b7;font-family:Georgia,'Songti SC',serif;font-size:22px;font-style:italic;line-height:1.65}.philosophy strong{font-weight:normal;color:#c3d5e0}
.platform{position:absolute;left:66px;bottom:35px;color:#829cae;font-size:12px;letter-spacing:.5px}.platform b{font-weight:400;color:#b0c9d7}.separator{display:inline-block;width:4px;height:4px;background:#75909f;border-radius:50%;vertical-align:middle;margin:0 12px}
.scene{position:absolute;left:756px;top:53px;width:580px;height:454px}
.ambient{position:absolute;right:0;top:26px;width:240px;height:270px;border-radius:50%;background:radial-gradient(ellipse,#c69a1640,transparent 70%);filter:blur(14px)}
.panel{position:absolute;inset:0;border:1px solid #9ca7aa66;border-top:2px solid #c3c9ca8c;border-radius:31px;background:radial-gradient(ellipse at 94% 16%,#9e7c1338,transparent 49%),linear-gradient(128deg,#2b3236d9,#141a1fe8 50%,#0d141be8);box-shadow:inset 1px 1px 0 #ffffff1c,inset -1px -1px 0 #ffffff0a,0 25px 60px #0004;overflow:hidden}
.panel-header{height:79px;padding:0 24px;display:flex;align-items:center;gap:14px;border-bottom:1px solid #b7c8d13d;background:linear-gradient(90deg,#ffffff04,transparent)}.panel-brand{display:flex;align-items:center;gap:10px;font-weight:600;font-size:25px;letter-spacing:.5px;margin-right:auto}.panel-brand img{width:40px;height:42px;object-fit:contain}.live{width:8px;height:8px;border-radius:50%;background:#a2d9cc;box-shadow:0 0 12px #a2d9cc30;margin-left:4px}.pill{border:1px solid #c5d6da40;border-radius:25px;padding:10px 15px;color:#e8eff3;font-size:16px;background:#ffffff04;box-shadow:inset 0 1px #ffffff0c}.pill.active{color:#a7d9ed;background:#a4dbee13;border-color:#adddf95c}
.duration{margin:22px 27px 0;font-size:17px;letter-spacing:1px;color:#bbd8e4}.timeline{height:108px;margin:0 20px}.timeline svg{width:100%;height:auto;display:block}.rows{margin:0 27px;border-top:1px solid #b9cfda24}.row{display:flex;align-items:center;gap:19px;height:48px;border-bottom:1px solid #b9cfda21;font-size:15px;color:#d3dfe7}.row time{color:#a7dfef;font-size:16px;font-variant-numeric:tabular-nums}.row .mark{margin-left:auto;color:#839ba9;font-size:10px;letter-spacing:1px}.row:first-child{background:linear-gradient(90deg,#91d9f206,transparent)}
.promise{margin:19px 27px 0;display:flex;align-items:center;justify-content:space-between}.promise p{font-size:25px;line-height:1.3;letter-spacing:-.5px;margin:0;font-weight:500}.promise p span{color:#a9d9e9}.spark{font-size:30px;color:#a9d9e9;font-weight:200;padding-right:5px}.mini-wave,.small-only{display:none}
${small ? `.copy{left:26px;top:21px;width:390px}.brand{font-size:22px;gap:9px}.brand img{width:33px;height:35px}h1{font-size:${zh ? 37 : 37}px;line-height:1.12;letter-spacing:-1.2px;margin-top:19px}.subtitle,.scene{display:none}.philosophy{font-size:17px;margin-top:14px;line-height:1.3}.philosophy .first,.philosophy .second{display:none}.platform{left:27px;bottom:48px;font-size:10px}.platform .companion,.platform .separator{display:none}.platform .small-only{display:inline;color:#b0c9d7}.mini-wave{display:block;position:absolute;left:22px;right:22px;top:230px;height:42px}.mini-wave svg{display:block;width:100%;height:75px;position:absolute;top:-16px}.art{background:radial-gradient(ellipse at 94% 70%,#4e66762a,transparent 60%),linear-gradient(120deg,#111b24,#18232c)}` : ''}
</style><main class="art"><div class="copy"><div class="brand"><img src="${logo}" alt="">Kairos</div><h1>${headline}</h1><p class="subtitle">${zh ? '陪在视频旁边的 AI 笔记伙伴' : 'Your AI video note-taking companion.'}</p><div class="philosophy"><div class="first">${zh ? '听过，可能忘记。' : 'I hear and I forget.'}</div><div class="second">${zh ? '看过，留下印象。' : 'I see and I remember.'}</div><div><strong>${zh ? '记下，才有理解。' : 'I note and I understand.'}</strong></div></div></div><div class="platform"><span class="small-only">${zh ? 'AI 笔记伙伴 · ' : 'AI note-taking companion · '}</span><b>YouTube &amp; Bilibili</b><span class="separator"></span><span class="companion">${zh ? '你的时刻，你的理解。' : 'Your moments. Your understanding.'}</span></div>
<div class="scene" aria-label="Stylized promotional illustration based on the Kairos glass panel, not a product screenshot"><div class="ambient"></div><div class="panel"><div class="panel-header"><div class="panel-brand"><img src="${logo}" alt="">Kairos <i class="live"></i></div><div class="pill">${zh ? '笔记' : 'Note'}</div><div class="pill active">${zh ? '已展开' : 'Expanded'}</div></div><div class="duration">11:38 / 21:54</div><div class="timeline">${wave()}</div><div class="rows"><div class="row"><time>01:32</time><span>${zh ? '这个想法，值得留下。' : 'An idea worth keeping.'}</span><span class="mark">${zh ? '笔记' : 'NOTE'}</span></div><div class="row"><time>01:59</time><span>${zh ? '记下来，再想深一点。' : 'A note. A deeper understanding.'}</span><span class="mark">${zh ? '笔记' : 'NOTE'}</span></div></div><div class="promise"><p>${zh ? '你标记这一刻。<br><span>AI 帮你写，帮你润色。</span>' : 'You pin the note.<br><span>AI writes or polishes it.</span>'}</p><span class="spark">✧</span></div></div></div><div class="mini-wave">${wave(true)}</div></main></html>`;
    const name = `${small ? 'small-promo-440x280' : 'marquee-1400x560'}-${lang}`;
    await writeFile(join(out, name + '.html'), html);
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await run(`document.open();document.write(${JSON.stringify(html)});document.close();Promise.all(Array.from(document.images,img=>img.decode())).then(()=>document.fonts.ready).then(()=>true)`);
    const data = (await call('Page.captureScreenshot', { format: 'png' })).data;
    const png = Buffer.from(data, 'base64');
    // PNG IHDR: require exactly 8 bits per channel and truecolor without alpha.
    if (png.readUInt32BE(16) !== width || png.readUInt32BE(20) !== height || png[24] !== 8 || png[25] !== 2) throw Error('Unexpected PNG format');
    await writeFile(join(out, name + '.png'), png);
    console.log(`${name}.png: ${width}x${height}, RGB 24-bit, no alpha`);
  }
} finally {
  socket?.close();
  const exited = new Promise(resolve => chrome.once('exit', resolve));
  chrome.kill();
  await exited;
  await rm(profile, { recursive: true, force: true });
}
