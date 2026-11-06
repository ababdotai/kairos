/** Both player surfaces share one dismissal state. A visit expires on navigation. */
(function () {
  const { t } = window.Kairos.I18n;
  const changes = new EventTarget();
  const key = 'kairosDisabled';
  let globallyDisabled = false;
  let dismissedVisit = null;
  const disabled = () => globallyDisabled || dismissedVisit !== null;

  function visit() {
    const id = window.Kairos.Utils.getVideoId();
    const part = new URL(location.href).searchParams.get('p') || '1';
    return id && (id.startsWith('bili-') ? id + ':' + part : id);
  }

  function update(action) {
    const previous = disabled();
    action();
    if (previous !== disabled()) changes.dispatchEvent(new Event('change'));
  }

  async function init() {
    let changedDuringRead = false;
    chrome.storage.onChanged.addListener((delta, area) => {
      if (area !== 'local' || !delta[key]) return;
      changedDuringRead = true;
      update(() => { globallyDisabled = delta[key].newValue === true; });
    });
    const stored = await chrome.storage.local.get(key);
    if (!changedDuringRead) globallyDisabled = stored[key] === true;
    chrome.runtime.onMessage.addListener((message, sender, reply) => {
      if (message.type === 'RESTORE_KAIROS_VISIT') update(() => { dismissedVisit = null; });
      else if (message.type !== 'GET_KAIROS_AVAILABILITY') return;
      reply({ disabled: disabled() });
    });
  }

  function checkVisit() {
    if (dismissedVisit !== null && dismissedVisit !== visit()) update(() => { dismissedVisit = null; });
  }

  function createControl() {
    const wrapper = document.createElement('span');
    wrapper.className = 'kairos-disable-control';
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'kairos-disable-trigger';
    trigger.title = t('Disable Kairos');
    trigger.setAttribute('aria-label', trigger.title);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', 'M12 3v9m-4.8-7a8 8 0 1 0 9.6 0');
    svg.append(path);
    trigger.append(svg);
    const menu = document.createElement('div');
    menu.popover = 'auto';
    menu.className = 'kairos-disable-options';
    menu.setAttribute('role', 'group');
    menu.setAttribute('aria-label', trigger.title);
    trigger.popoverTargetElement = menu;
    menu.addEventListener('beforetoggle', event => {
      if (event.newState !== 'open') return;
      const rect = trigger.getBoundingClientRect();
      menu.style.left = Math.max(6, Math.min(rect.right - 190, innerWidth - 196)) + 'px';
      menu.style.top = rect.bottom + 88 <= innerHeight ? rect.bottom + 4 + 'px' : 'auto';
      menu.style.bottom = menu.style.top === 'auto' ? innerHeight - rect.top + 4 + 'px' : 'auto';
    });
    for (const [scope, label] of [['visit', 'Disable for this viewing'], ['global', 'Disable globally']]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = t(label);
      button.addEventListener('click', async event => {
        event.stopPropagation();
        if (scope === 'global') {
          try {
            await chrome.storage.local.set({ [key]: true });
          } catch {
            button.textContent = t('Could not save settings. Please try again.');
            return;
          }
        }
        if (menu.matches(':popover-open')) menu.hidePopover();
        update(() => {
          if (scope === 'visit') dismissedVisit = visit();
          else globallyDisabled = true;
        });
      });
      menu.append(button);
    }
    wrapper.append(trigger, menu);
    return wrapper;
  }

  const styles = `
    .kairos-disable-control { display:inline-flex; flex:none; align-items:center; }
    .kairos-disable-trigger { display:grid; place-items:center; width:26px; height:26px; padding:4px; border:0; border-radius:50%; background:transparent; color:inherit; opacity:.75; cursor:pointer; }
    .kairos-disable-trigger svg { width:16px; height:16px; fill:none; stroke:currentColor; stroke-width:1.7; stroke-linecap:round; }
    .kairos-disable-trigger:hover,.kairos-disable-trigger:focus-visible { opacity:1; background:#8498ab25; }
    .kairos-disable-options { position:fixed; inset:auto; margin:0; box-sizing:border-box; width:min(190px,calc(100vw - 12px)); padding:5px; border:1px solid #8897a64a; border-radius:12px; background:#242c34; color:#f2f5f8; box-shadow:0 5px 22px #0003; }
    .kairos-disable-options button { display:block; width:100%; padding:8px 10px; border:0; border-radius:7px; color:inherit; background:transparent; text-align:start; font:500 12px/1.4 system-ui,sans-serif; cursor:pointer; }
    .kairos-disable-options button:is(:hover,:focus-visible) { background:#8498ab25; }
    @media(prefers-color-scheme:light) { .kairos-disable-options { color:#293f50; background:#f5f8fb; } }
  `;
  window.Kairos.Availability = { init, disabled, checkVisit, createControl, styles,
    subscribe(listener) { changes.addEventListener('change', listener); }
  };
})();
