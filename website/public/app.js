const t = text => window.KairosSite.t(text);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
function refreshInstallLabel() {
  const expanded = document.querySelector('.install-toggle').getAttribute('aria-expanded') === 'true';
  document.querySelector('[data-install-label]').textContent = t(expanded ? '收起源码安装步骤' : '查看源码安装步骤');
}
window.addEventListener('kairos-preference', refreshInstallLabel);
refreshInstallLabel();
document.querySelector('.install-toggle').addEventListener('click',event=>{const button=event.currentTarget;const expanded=button.getAttribute('aria-expanded')!=='true';button.setAttribute('aria-expanded',String(expanded));document.querySelector('#install-guide').hidden=!expanded;document.querySelector('[data-install-label]').textContent=t(expanded?'收起源码安装步骤':'查看源码安装步骤')});
document.querySelector('#year').textContent=new Date().getFullYear();

// Keep the original brand art crisp; move its wrapper, never morph the bitmap.
const avatar=document.querySelector('#hero-avatar');
const avatarMotion=avatar.querySelector('.avatar-motion');
const hero=document.querySelector('.hero');
hero.addEventListener('pointermove',event=>{
 if(reduced.matches||event.pointerType==='touch')return;
 const rect=avatar.getBoundingClientRect();
 const x=Math.max(-1,Math.min(1,(event.clientX-rect.left-rect.width/2)/300));
 const y=Math.max(-1,Math.min(1,(event.clientY-rect.top-rect.height/2)/250));
 avatar.style.setProperty('--look-x',`${x*5}px`);avatar.style.setProperty('--look-y',`${y*4}px`);
});
hero.addEventListener('pointerleave',()=>{avatar.style.setProperty('--look-x','0px');avatar.style.setProperty('--look-y','0px')});
new IntersectionObserver(entries=>{avatarMotion.style.animationPlayState=entries[0].isIntersecting&&!document.hidden?'running':'paused'}).observe(hero);
document.addEventListener('visibilitychange',()=>avatarMotion.style.animationPlayState=document.hidden?'paused':'running');

// Keep layout stable while the navigation contracts into a floating glass bar.
const siteHeader = document.querySelector('.header');
let headerFrame = 0;
function updateHeader() {
  headerFrame = 0;
  const compact = siteHeader.classList.contains('is-compact');
  siteHeader.classList.toggle('is-compact', scrollY > (compact ? 40 : 80));
}
addEventListener('scroll', () => {
  if (!headerFrame) headerFrame = requestAnimationFrame(updateHeader);
}, { passive: true });
updateHeader();

// Local illustrations only: no credentials, storage or AI requests.
const workflow = document.querySelector('.workflow-demo');
const workflowSteps = [...workflow.querySelectorAll('[data-workflow-step]')];
const workflowPlay = workflow.querySelector('.workflow-play');
const workflowCopy = [
  { status: '正在输入', kind: '我的笔记', text: '不同颜色的光经过棱镜时，折射角度不同，所以白光会分散成彩色光谱。', hint: '按 Enter 整理', caption: '关键词 → 完整表达 · 开启 AI 后自动润色' },
  { status: '正在截图', kind: '截图笔记', text: '把这个实验留作参考。', hint: '画面和想法，一起保存', caption: '拖出一个矩形，截取画面，再添上自己的理解。' },
  { status: '正在整理', kind: 'AI 笔记', text: '白光由不同波长的光组成。经过棱镜时，各种颜色偏折的角度不同，于是形成色散。', hint: '结合画面与字幕', caption: '空白输入时按 Enter，让 AI 帮你理解选中的内容。' },
  { status: '已保存', kind: '回到此刻', text: '白光由不同波长的光组成。经过棱镜时，各种颜色偏折的角度不同，于是形成色散。', hint: '02:18 · 已连到视频时刻', caption: '保存后继续播放；点击笔记，随时回到这一刻。' }
];
let workflowStep = 0, workflowElapsed = 0, workflowVisible = false, workflowManual = false, workflowHold = false, workflowTimer = null;
const workflowDuration = () => workflowStep === 0 ? 10000 : 7200;
function renderWorkflow() {
  const copy = workflowCopy[workflowStep];
  const text = t(copy.text);
  const delay = workflowStep === 1 ? 1500 : workflowStep === 2 ? 900 : 400;
  const progress = workflowHold || reduced.matches || workflowStep === 3 ? 1 : Math.max(0, Math.min(1, (workflowElapsed - delay) / 2700));
  workflow.querySelector('[data-workflow-text]').textContent = text.slice(0, Math.floor(text.length * progress));
  workflow.querySelector('[data-workflow-status]').textContent = t(workflow.classList.contains('workflow-revisited') ? '查看笔记' : workflowStep === 2 && progress === 1 ? '整理完成' : copy.status);
  workflow.querySelector('.workflow-progress>span').textContent = workflowStep === 3 && !workflow.classList.contains('workflow-revisited') ? '02:22' : '02:18';
  workflow.querySelector('[data-workflow-kind]').textContent = t(copy.kind);
  workflow.querySelector('[data-workflow-hint]').textContent = t(copy.hint);
  workflow.querySelector('[data-workflow-caption]').textContent = t(copy.caption);
  workflow.classList.toggle('workflow-complete', progress === 1);
  workflow.querySelector('.workflow-save').textContent = workflowStep === 3 ? '✓' : '↵';
  // Preserve the before/after context in the illustration: retain the original keywords beside the contextual rewrite.
  if (workflowStep === 0) {
    const elapsed = reduced.matches ? 10000 : workflowElapsed;
    const draft = t('棱镜、颜色、角度不同');
    const phase = elapsed < 2100 ? 'draft' : elapsed < 2800 ? 'enter' : elapsed < 3600 ? 'context' : elapsed < 6200 ? 'polish' : 'done';
    workflow.dataset.polishPhase = phase;
    workflow.querySelector('[data-workflow-draft]').textContent = draft;
    const output = elapsed < 2800 ? draft.slice(0, Math.floor(draft.length * Math.min(1, elapsed / 1400))) : elapsed < 3600 ? draft : text.slice(0, Math.floor(text.length * Math.min(1, (elapsed - 3600) / 2600)));
    workflow.querySelector('[data-workflow-text]').textContent = output;
    workflow.querySelector('[data-workflow-status]').textContent = t(elapsed < 2800 ? '正在输入' : elapsed < 6200 ? '结合上下文润色' : '整理完成');
    workflow.querySelector('[data-workflow-kind]').textContent = t(elapsed < 2800 ? '我的笔记' : 'AI 辅助润色');
    workflow.querySelector('[data-workflow-hint]').textContent = t(elapsed < 2800 ? '按 Enter 整理' : elapsed < 6200 ? '结合画面与字幕' : '保留你的意思，补全表达');
    workflow.querySelector('.workflow-save').textContent = elapsed < 2800 ? '↵ Enter' : elapsed < 6200 ? '···' : '✓';
    workflow.classList.toggle('workflow-complete', phase === 'done');
  } else {
    delete workflow.dataset.polishPhase;
  }

}
function selectWorkflow(index) {
  workflowStep = index;
  workflow.classList.remove('workflow-revisited');
  workflowElapsed = 0;
  workflow.dataset.step = String(index);
  workflowSteps.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
  renderWorkflow();
}
function updateWorkflowPlayback() {
  clearInterval(workflowTimer);
  workflowTimer = null;
  const running = workflowVisible && !document.hidden && !workflowManual && !reduced.matches && (!workflowHold || (workflowStep === 0 && workflowElapsed < workflowDuration()));
  workflowPlay.textContent = running ? 'Ⅱ' : '▷';
  workflowPlay.setAttribute('aria-label', t(running ? '暂停演示' : '播放演示'));
  if (running) {
    let last = performance.now();
    workflowTimer = setInterval(() => {
      const now = performance.now();
      workflowElapsed += now - last;
      last = now;
      if (workflowElapsed >= workflowDuration()) {
        if (workflowHold) { workflowElapsed = workflowDuration(); renderWorkflow(); updateWorkflowPlayback(); }
        else selectWorkflow((workflowStep + 1) % workflowCopy.length);
      } else renderWorkflow();
    }, 60);
  }
}
workflowSteps.forEach((button, index) => button.addEventListener('click', () => {
  workflowHold = true;
  workflowManual = false;
  selectWorkflow(index);
  updateWorkflowPlayback();
}));
workflow.querySelector('.workflow-revisit').addEventListener('click', () => {
  workflowManual = true;
  workflow.classList.add('workflow-revisited');
  renderWorkflow();
  updateWorkflowPlayback();
});
workflowPlay.addEventListener('click', () => {
  if (reduced.matches) { workflowManual = true; selectWorkflow((workflowStep + 1) % workflowCopy.length); }
  else if (workflowTimer) { workflowManual = true; }
  else { workflowManual = false; workflowHold = false; selectWorkflow(workflowStep); }
  updateWorkflowPlayback();
});
new IntersectionObserver(entries => {
  workflowVisible = entries[0].isIntersecting;
  updateWorkflowPlayback();
}, { threshold: .3 }).observe(workflow);
document.addEventListener('visibilitychange', updateWorkflowPlayback);
reduced.addEventListener('change', () => { renderWorkflow(); updateWorkflowPlayback(); });
window.addEventListener('kairos-preference', () => { renderWorkflow(); updateWorkflowPlayback(); });
selectWorkflow(0);

// Illustrative model options mirrored from the extension catalog.
const demoModels = {
  "google": [
    "gemini-3.1-flash-lite",
    "gemini-3.8-flash"
  ],
  "openai": [
    "gpt-6.1-terra",
    "gpt-6-astra",
    "gpt-6.1-sol",
    "gpt-6-luna"
  ],
  "anthropic": [
    "claude-haiku-5-5",
    "claude-sonnet-5-5"
  ],
  "deepseek": [
    "deepseek-flash"
  ],
  "moonshot": [
    "kimi-k3.1-pro",
    "kimi-k3"
  ],
  "openrouter": [
    "openai/gpt-5.4-mini",
    "anthropic/claude-sonnet-5.5"
  ]
};
const providerButtons = [...document.querySelectorAll('[data-demo-provider]')];
const modelSelect = document.querySelector('#demo-model');
const demoSelections = new Map();
let demoProvider = 'google';
function selectDemoProvider(provider) {
  demoProvider = provider;
  providerButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.demoProvider === provider)));
  modelSelect.replaceChildren(...demoModels[provider].map(model => new Option(model, model)));
  modelSelect.value = demoSelections.get(provider) || demoModels[provider][0];
}
providerButtons.forEach(button => button.addEventListener('click', () => selectDemoProvider(button.dataset.demoProvider)));
modelSelect.addEventListener('change', () => demoSelections.set(demoProvider, modelSelect.value));
selectDemoProvider('google');
