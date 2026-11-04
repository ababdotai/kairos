const t = text => window.KairosSite.t(text);
const demo = document.querySelector('.showcase');
const tabs = [...document.querySelectorAll('.demo-tabs [data-step]')];
const captions = ['藏在视频里的一颗小胶囊。需要时出现，专注时退后。','左键拖动，框住值得记下的画面。留住细节，不必离开视频。','直接打字，留下自己的理解。笔记保存后，视频继续播放。','点击笔记回到原处。让每一次回看，都接得上当时的思路。'];
const feedback = ['陪你一起看','正在截图','已保存','查看笔记'];
let step=0, timer, visible=false, manuallyPaused=false;
const play=document.querySelector('#play-demo');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let typingTimer;
const noteText = '不是光变了，是不同颜色折射的角度不同。';
function refreshDynamic(){
 document.querySelector('#demo-caption').textContent=t(captions[step]);
 document.querySelector('#island-feedback').textContent=t(step===2&&!demo.classList.contains('note-complete')?'正在输入':feedback[step]);
 document.querySelector('#typed-note').textContent=t(noteText);
 const expanded=document.querySelector('.install-toggle').getAttribute('aria-expanded')==='true';
 document.querySelector('[data-install-label]').textContent=t(expanded?'收起安装步骤':'查看安装步骤');
}
function select(index){
 clearInterval(typingTimer);step=index;demo.dataset.step=String(step);demo.classList.remove('note-complete');
 tabs.forEach((tab,i)=>{tab.setAttribute('aria-selected',String(i===step));tab.tabIndex=i===step?0:-1;});
 document.querySelector('#island').classList.toggle('saved',step===2);
 document.querySelector('#demo-time').textContent=step===3?'02:18':step===2?'02:20':'01:46';
 refreshDynamic();
 if(step===2&&!reduced.matches){let count=0;const text=t(noteText);const target=document.querySelector('#typed-note');target.textContent='';typingTimer=setInterval(()=>{target.textContent=text.slice(0,++count);if(count>=text.length){clearInterval(typingTimer);demo.classList.add('note-complete');document.querySelector('#island-feedback').textContent=t('已保存');}},45);}
 else if(step===2){demo.classList.add('note-complete');refreshDynamic();}
}
function updatePlayback(){clearInterval(timer);timer=null;const running=visible&&!document.hidden&&!manuallyPaused&&!reduced.matches;play.innerHTML='<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8">'+(running?'<path d="M9 5v14M15 5v14"/>':'<path d="m8 5 11 7-11 7Z"/>')+'</svg>';play.setAttribute('aria-label',t(running?'暂停演示':'播放演示'));if(running)timer=setInterval(()=>select((step+1)%4),6000);}
tabs.forEach((tab,index)=>{tab.addEventListener('click',()=>{manuallyPaused=true;select(index);updatePlayback()});tab.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?3:(index+(event.key==='ArrowRight'?1:3))%4;tabs[next].click();tabs[next].focus()})});
play.addEventListener('click',()=>{if(reduced.matches){select((step+1)%4);return;}manuallyPaused=!!timer;updatePlayback()});
new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;updatePlayback()},{threshold:.25}).observe(demo);
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInterval(typingTimer);demo.classList.add('note-complete');refreshDynamic();}updatePlayback();});reduced.addEventListener('change',()=>{select(step);updatePlayback()});window.addEventListener('kairos-preference',()=>{clearInterval(typingTimer);demo.classList.add('note-complete');refreshDynamic();updatePlayback()});
document.querySelector('.install-toggle').addEventListener('click',event=>{const button=event.currentTarget;const expanded=button.getAttribute('aria-expanded')!=='true';button.setAttribute('aria-expanded',String(expanded));document.querySelector('#install-guide').hidden=!expanded;document.querySelector('[data-install-label]').textContent=t(expanded?'收起安装步骤':'查看安装步骤')});
document.querySelector('#year').textContent=new Date().getFullYear();select(0);

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
