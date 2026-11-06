/** Shared fast hints for controls in the island and the video sidebar. */
(function () {
  function install(container) {
    const tip = document.createElement('div');
    tip.className = 'kairos-action-tip';
    tip.popover = 'manual';
    tip.setAttribute('role', 'tooltip');
    container.append(tip);
    let anchor, timer, frame;
    function hide() {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      if (tip.matches(':popover-open')) tip.hidePopover();
      anchor = null;
    }
    function position() {
      if (!anchor?.isConnected || !anchor.getClientRects().length) return hide();
      const label = anchor.dataset.kairosTip || anchor.getAttribute('aria-label');
      if (tip.textContent !== label) tip.textContent = label;
      const box = anchor.getBoundingClientRect();
      const x = Math.max(6, Math.min(innerWidth - tip.offsetWidth - 6, box.left + (box.width - tip.offsetWidth) / 2));
      const above = box.top - tip.offsetHeight - 6;
      const y = above >= 6 ? above : Math.min(innerHeight - tip.offsetHeight - 6, box.bottom + 6);
      const transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      if (tip.style.transform !== transform) tip.style.transform = transform;
      frame = requestAnimationFrame(position);
    }
    function reveal(event) {
      if (event.pointerType === 'touch') return;
      const button = event.target.closest?.('[data-kairos-tip]');
      if (button === anchor) return;
      hide();
      if (!button || (event.type === 'focusin' && !button.matches(':focus-visible'))) return;
      anchor = button;
      timer = setTimeout(() => {
        if (!anchor.isConnected) return hide();
        tip.showPopover();
        position();
      }, event.type === 'focusin' ? 0 : 140);
    }
    function leave(event) {
      if (anchor && !anchor.contains(event.relatedTarget)) hide();
    }
    container.addEventListener('pointerover', reveal);
    container.addEventListener('pointerout', leave);
    container.addEventListener('focusin', reveal);
    container.addEventListener('focusout', leave);
    container.addEventListener('click', hide, true);
    container.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });
    return hide;
  }

  window.Kairos.ActionTips = { install, styles: `
      .kairos-action-tip {
        box-sizing: border-box; position: fixed; inset: 0 auto auto 0; margin: 0; width: max-content;
        max-width: min(240px, calc(100vw - 12px)); padding: 6px 10px; border-radius: 8px;
        border: 1px solid #ffffff28; background: #212831f5; color: #f7f9fb;
        font: 500 12px/1.4 system-ui, sans-serif; text-shadow: none;
        pointer-events: none; box-shadow: 0 2px 8px #0003; overflow-wrap: anywhere;
      }
  ` };
})();
