(()=>{
 const read=key=>{try{return localStorage.getItem('kairos-site-'+key)||'auto'}catch{return 'auto'}};
 const write=(key,value)=>{try{localStorage.setItem('kairos-site-'+key,value)}catch{}};
 const dark=matchMedia('(prefers-color-scheme: dark)');
 const state={theme:['auto','light','dark'].includes(read('theme'))?read('theme'):'auto',language:['auto','zh','en'].includes(read('language'))?read('language'):'auto'};
 function apply(){document.documentElement.dataset.theme=state.theme==='auto'?(dark.matches?'dark':'light'):state.theme;state.locale=state.language==='auto'?(/^zh/i.test(navigator.languages?.[0]||navigator.language)?'zh':'en'):state.language;document.documentElement.lang=state.locale==='zh'?'zh-CN':'en';window.dispatchEvent(new Event('kairos-preference'));}
 window.KairosSite={state,set(key,value){state[key]=value;write(key,value);apply()}};
 dark.addEventListener('change',apply);window.addEventListener('languagechange',apply);apply();
})();
