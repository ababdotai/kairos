/** Direct typing and freehand region capture for an active video session. */
(function () {
  'use strict';
  const { t } = window.Kairos.I18n;

  // Menus may be children of the control bar or separate popups in the player.
  const playerControls = [
    '.bpx-player-control-wrap', '.bpx-player-control-bottom', '.bpx-player-progress-wrap',
    '.bpx-player-ctrl-btn', '.bpx-player-ctrl-playbackrate-menu', '.bpx-player-ctrl-quality-menu',
    '.bpx-player-ctrl-setting-box', '.bilibili-player-video-control',
    '.ytp-chrome-bottom', '.ytp-popup', '.ytp-settings-menu',
    '[role="menu"]', '[role="menuitem"]', '[role="menuitemradio"]', '[role="listbox"]', '[role="option"]'
  ].join(',');

  class CompanionInput {
    /** Registers removable capture-phase listeners before page handlers. */
    constructor(overlay) {
      this.overlay = overlay;
      this.listeners = [];
      this.suppressClickUntil = 0;
      this.overPlayerControl = false;
      this.surface = document.createElement('div');
      this.surface.className = 'kairos-capture-surface';
      this.surface.title = t("Drag to capture · Click to play/pause");
      overlay.overlayElement.prepend(this.surface);
      for (const [type, method] of Object.entries({
        keydown: 'keydown', pointerover: 'updateControlHover', pointerdown: 'pointerdown', pointermove: 'pointermove',
        pointerup: 'pointerup', pointercancel: 'cancel', blur: 'cancel',
        click: 'click', dblclick: 'click', dragstart: 'dragstart',
        mousedown: 'mouse', mousemove: 'mouse', mouseup: 'mouse',
        wheel: 'wheel', lostpointercapture: 'lostcapture', focusout: 'scheduleTyping', focus: 'windowFocus'
      })) {
        const listener = event => this[method](event);
        window.addEventListener(type, listener, { capture: true, passive: false });
        this.listeners.push([type, listener]);
      }
    }

    /** Reserve the player's bottom controls, even while auto-hidden. */
    updateSafeArea(rect = this.overlay.videoElement?.getBoundingClientRect()) {
      if (!rect?.height) return;
      const video = this.overlay.videoElement;
      const player = video.closest('.bpx-player-container, .bilibili-player, .html5-video-player') || video.parentElement;
      let bottom = Math.max(80, Math.min(144, rect.height * .16));
      for (const control of player?.querySelectorAll('.bpx-player-control-wrap, .bpx-player-control-bottom, .bpx-player-progress-wrap, .bilibili-player-video-control, .ytp-chrome-bottom') || []) {
        const bounds = control.getBoundingClientRect();
        if (bounds.width && bounds.height && bounds.top >= rect.top + rect.height * .5 &&
            bounds.top < rect.bottom && bounds.right > rect.left && bounds.left < rect.right) {
          bottom = Math.max(bottom, rect.bottom - bounds.top + 12);
        }
      }
      this.captureBottom = Math.min(rect.height, bottom);
      this.surface.style.bottom = `${this.captureBottom}px`;
    }

    // Yield hit testing as soon as the pointer enters native controls. The
    // upward trip into a hover menu must stay in the player's DOM, including
    // the very first pointerover, or the player closes the menu on mouseleave.
    updateControlHover(event) {
      if (this.gesture || !this.overlay.isActive) return;
      const target = event.composedPath()[0];
      let control = target instanceof Element && target.closest(playerControls);
      if (!control && target === this.surface && event.type === 'pointerover') {
        // Also cover a menu opened by keyboard or positioned outside its bar.
        const underneath = document.elementsFromPoint(event.clientX, event.clientY)
          .find(element => element !== this.overlay.container);
        control = underneath?.closest(playerControls);
      }
      if (this.overPlayerControl === Boolean(control)) return;
      this.overPlayerControl = Boolean(control);
      this.surface.style.pointerEvents = control ? 'none' : '';
      if (!control && this.overlay.shadowRoot.elementFromPoint(event.clientX, event.clientY) === this.surface) {
        this.prepareTyping();
      }
    }

    /** Keeps native editors, controls, links and extension UI interactive. */
    isControl(event, pointer = false) {
      if (event.composedPath().includes(this.surface)) return false;
      return event.composedPath().some(node => node instanceof Element && (
        node === this.overlay.container || node.isContentEditable || node.matches(playerControls) ||
        node.matches('input, textarea, select, button, a, [role="slider"], [role="textbox"], .ytp-chrome-bottom, .bpx-player-control-wrap') ||
        (node.matches('[role="button"]') && !(pointer && node.contains(this.overlay.videoElement)))
      ));
    }

    /** Stops a handled event from reaching the video page. */
    consume(event) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }

    /** Give the OS a real text target before the first IME keystroke. */
    prepareTyping(activating = false) {
      const o = this.overlay;
      if (this.destroyed || !o.isActive || o.isEditing || o.activePin || this.gesture || (!activating && !document.hasFocus())) return;
      if (o.shadowRoot.activeElement === o.noteInput) return;
      let active = document.activeElement;
      while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
      if (active && active !== o.container) {
        if (active.isContentEditable || active.matches('input, textarea, select')) return;
        if (active.closest(playerControls) && (this.overPlayerControl || active.matches(':focus-visible'))) return;
      }
      o.noteInput.classList.remove('hidden');
      o.noteInput.value = '';
      o.noteInput.focus({ preventScroll: true });
    }

    /** Recover idle focus after page/video blur without taking focus from controls. */
    scheduleTyping() {
      clearTimeout(this.typingTimer);
      this.typingTimer = setTimeout(() => {
        let active = document.activeElement;
        while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
        if (active && active !== this.overlay.noteInput && !this.overlay.noteWrapper.contains(active) &&
            (active.closest(playerControls) || active.isContentEditable || active.matches('input, textarea, select, button, a, [role="slider"], [role="textbox"]'))) return;
        this.prepareTyping();
      }, 0);
    }

    windowFocus(event) {
      if (event.target === window) this.scheduleTyping();
    }

    /** Reveal the same editor and let native input/IME insert text. */
    keydown(event) {
      const o = this.overlay;
      const confirming = event.composedPath().find(node => node instanceof Element && node.matches('[data-delete-confirm].is-confirming'));
      if (event.key === 'Escape' && confirming) {
        this.consume(event);
        confirming.dispatchEvent(new Event('kairos-cancel-delete'));
        return;
      }
      if (!o.isActive || !o.videoElement) return;
      if (event.key === 'Escape' && this.gesture) {
        this.consume(event);
        this.cancel();
        return;
      }
      const prepared = !o.isEditing && !o.activePin && event.composedPath().includes(o.noteInput);
      if ((!prepared && this.isControl(event)) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'Escape') {
        this.consume(event);
        if (o.activePin) o.cancelNote();
        else o.collapseOrb();
        return;
      }
      const rect = o.videoElement.getBoundingClientRect();
      if (rect.bottom <= 0 || rect.top >= window.innerHeight || this.gesture) return;
      const composing = event.isComposing || event.key === 'Process' || event.keyCode === 229;
      if (prepared && event.key === ' ' && !composing) {
        this.consume(event);
        if (o.videoElement.paused) o.videoElement.play().catch(() => {});
        else o.videoElement.pause();
        return;
      }
      if (!composing && (event.key.length !== 1 || event.key === ' ')) return;
      if (o.activePin) o.switchToEditMode();
      else o.handlePinCapture();
      // Never synthesize the first letter: that bypasses the operating system IME.
      event.stopImmediatePropagation();
    }

    /** Starts a rectangular selection on the video image, away from controls. */
    pointerdown(event) {
      const o = this.overlay;
      if (this.gesture || this.overPlayerControl || !o.isActive || o.isEditing || !o.videoElement || event.button !== 0 ||
          event.pointerType === 'touch' || event.metaKey || event.ctrlKey || event.altKey || this.isControl(event, true)) return;
      const rect = o.videoElement.getBoundingClientRect();
      this.updateSafeArea(rect);
      const x = event.clientX - rect.left, y = event.clientY - rect.top;
      if (x < 0 || x > rect.width || y < 32 || y >= rect.height - this.captureBottom) return;
      // Claim the press before the player starts its own mouse/drag gesture.
      this.consume(event);
      this.surface.classList.add('capturing');
      this.gesture = { id: event.pointerId, rect, points: [[x, y]], video: o.videoElement, url: location.href };
      if (event.isTrusted) this.surface.setPointerCapture(event.pointerId);
    }

    /** Draws the rectangle between press and current pointer, preserving clicks. */
    pointermove(event) {
      const g = this.gesture;
      if (!g) {
        if (this.overPlayerControl && event.composedPath()[0] !== this.surface) this.updateControlHover(event);
        if (!this.overPlayerControl && event.composedPath().includes(this.surface)) this.prepareTyping();
      }
      if (!g || event.pointerId !== g.id) return;
      if (!this.overlay.isActive || location.href !== g.url) return this.cancel();
      this.consume(event);
      const x = Math.max(0, Math.min(g.rect.width, event.clientX - g.rect.left));
      const y = Math.max(0, Math.min(g.rect.height, event.clientY - g.rect.top));
      if (!g.svg && Math.hypot(x - g.points[0][0], y - g.points[0][1]) < 10) return;
      this.consume(event);
      if (!g.svg) {
        g.wasPlaying = !g.video.paused;
        g.video.pause();
        g.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        g.svg.setAttribute('viewBox', `0 0 ${g.rect.width} ${g.rect.height}`);
        g.svg.setAttribute('class', 'kairos-ink-layer');
        g.path = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        g.svg.appendChild(g.path);
        this.overlay.overlayElement.appendChild(g.svg);
      }
      g.points[1] = [x, y];
      g.path.setAttribute('x', Math.min(g.points[0][0], x));
      g.path.setAttribute('y', Math.min(g.points[0][1], y));
      g.path.setAttribute('width', Math.abs(x - g.points[0][0]));
      g.path.setAttribute('height', Math.abs(y - g.points[0][1]));
    }

    /** Saves the rectangle immediately and opens its optional caption. */
    async pointerup(event) {
      const g = this.gesture;
      if (!g || event.pointerId !== g.id || event.button !== 0) return;
      if (g.svg) this.pointermove(event);
      this.consume(event);
      this.release(g);
      if (!g.svg) {
        this.gesture = null;
        // The transparent surface replaces the player's click target.
        if (g.url === location.href && this.overlay.isActive) {
          if (g.video.paused) g.video.play().catch(() => {});
          else g.video.pause();
        }
        this.prepareTyping();
        return;
      }
      this.suppressClickUntil = Date.now() + 500;
      const xs = g.points.map(p => p[0]), ys = g.points.map(p => p[1]);
      const left = Math.min(...xs), top = Math.min(...ys);
      const width = Math.max(...xs) - left, height = Math.max(...ys) - top;
      if (width < 24 || height < 24 || location.href !== g.url) return this.cancel();
      g.svg.remove();
      this.gesture = null;
      await this.overlay.handlePinCapture({
        region: { x: left / g.rect.width, y: top / g.rect.height, width: width / g.rect.width, height: height / g.rect.height },
        spatialX: (left + width / 2) / g.rect.width * 100,
        spatialY: (top + height / 2) / g.rect.height * 100,
        wasPlaying: g.wasPlaying
      });
    }

    /** Prevents a completed drawing from toggling playback or closing its note. */
    click(event) {
      if (this.isControl(event, true)) return;
      if (event.button === 0 && (Date.now() < this.suppressClickUntil ||
          event.composedPath().includes(this.surface))) this.consume(event);
    }

    /** Blocks compatibility mouse events, including the post-pointerup mouseup. */
    mouse(event) {
      if (!this.gesture && this.isControl(event, true)) return;
      if (this.gesture || (event.button === 0 && event.composedPath().includes(this.surface)) ||
          (event.button === 0 && Date.now() < this.suppressClickUntil && event.type === 'mouseup')) this.consume(event);
    }

    /** Own wheel events over our UI before the player's document handlers see them. */
    wheel(event) {
      if (this.gesture) { this.consume(event); return; }
      const o = this.overlay;
      const path = event.composedPath();
      const island = path.includes(o.islandContainer);
      const sidebar = o.sidePanel?.container && path.includes(o.sidePanel.container);
      if (!island && !sidebar) return;
      this.consume(event);
      if (island && (path.includes(o.islandList) || path.includes(o.islandMoments))) {
        o.islandFollowPaused = true;
      }
      // Preventing the page handler also prevents native scrolling; apply the
      // delta to the nearest owned scroll area, including at its boundaries.
      const scroller = path.find(node => node instanceof Element &&
        (node === o.islandMoments || /auto|scroll/.test(getComputedStyle(node).overflowY)) &&
        (o.islandContainer.contains(node) || o.sidePanel?.container?.contains(node)));
      if (!scroller) return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? scroller.clientHeight : 1;
      if (scroller === o.islandMoments) scroller.scrollLeft += (event.deltaX || event.deltaY) * unit;
      else {
        scroller.scrollTop += event.deltaY * unit;
        scroller.scrollLeft += event.deltaX * unit;
      }
    }

    /** Releases capture explicitly on completion, cancellation or deactivation. */
    release(gesture) {
      this.surface.classList.remove('capturing');
      if (this.surface.hasPointerCapture(gesture.id)) this.surface.releasePointerCapture(gesture.id);
    }

    /** Cancels only the pointer whose capture was unexpectedly lost. */
    lostcapture(event) {
      if (this.gesture?.id === event.pointerId) this.cancel();
    }

    /** Prevents native dragging while selecting the video. */
    dragstart(event) {
      if (this.gesture) this.consume(event);
    }

    /** Discards unfinished ink and restores playback when appropriate. */
    cancel() {
      if (!this.overlay.isActive) {
        this.overPlayerControl = false;
        this.surface.style.pointerEvents = '';
      }
      const g = this.gesture;
      this.gesture = null;
      if (g) {
        this.suppressClickUntil = Date.now() + 500;
        this.release(g);
      }
      if (g?.svg) {
        g.svg.remove();
        this.suppressClickUntil = Date.now() + 500;
        if (g.wasPlaying) g.video.play().catch(() => {});
      }
      this.gesture = null;
      this.scheduleTyping();
    }

    /** Releases all listeners when the overlay is destroyed. */
    destroy() {
      this.destroyed = true;
      this.cancel();
      clearTimeout(this.typingTimer);
      for (const [type, listener] of this.listeners) window.removeEventListener(type, listener, true);
      this.surface.remove();
    }
  }

  window.Kairos.CompanionInput = CompanionInput;
})();
