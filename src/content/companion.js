/** Direct typing and freehand region capture for an active video session. */
(function () {
  'use strict';
  const { t } = window.Kairos.I18n;

  class CompanionInput {
    /** Registers removable capture-phase listeners before page handlers. */
    constructor(overlay) {
      this.overlay = overlay;
      this.listeners = [];
      this.suppressClickUntil = 0;
      this.surface = document.createElement('div');
      this.surface.className = 'kairos-capture-surface';
      this.surface.title = t("Drag to capture · Click to play/pause");
      overlay.overlayElement.prepend(this.surface);
      for (const [type, method] of Object.entries({
        keydown: 'keydown', pointerdown: 'pointerdown', pointermove: 'pointermove',
        pointerup: 'pointerup', pointercancel: 'cancel', blur: 'cancel',
        click: 'click', dblclick: 'click', dragstart: 'dragstart',
        mousedown: 'mouse', mousemove: 'mouse', mouseup: 'mouse',
        wheel: 'wheel', lostpointercapture: 'lostcapture'
      })) {
        const listener = event => this[method](event);
        window.addEventListener(type, listener, { capture: true, passive: false });
        this.listeners.push([type, listener]);
      }
    }

    /** Keeps native editors, controls, links and extension UI interactive. */
    isControl(event, pointer = false) {
      if (event.composedPath().includes(this.surface)) return false;
      return event.composedPath().some(node => node instanceof Element && (
        node === this.overlay.container || node.isContentEditable ||
        node.matches('input, textarea, select, button, a, [role="slider"], [role="textbox"], .ytp-chrome-bottom, .bpx-player-control-wrap') ||
        (node.matches('[role="button"]') && !(pointer && node.contains(this.overlay.videoElement)))
      ));
    }

    /** Stops a handled event from reaching the video page. */
    consume(event) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }

    /** Opens the editor synchronously so subsequent typing and IME reach it. */
    keydown(event) {
      const o = this.overlay;
      if (!o.isActive || !o.videoElement) return;
      if (event.key === 'Escape' && this.gesture) {
        this.consume(event);
        this.cancel();
        return;
      }
      if (this.isControl(event) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'Escape') {
        this.consume(event);
        if (o.activePin) o.cancelNote();
        else o.collapseOrb();
        return;
      }
      const rect = o.videoElement.getBoundingClientRect();
      if (rect.bottom <= 0 || rect.top >= window.innerHeight || this.gesture) return;
      const composing = event.isComposing || event.key === 'Process' || event.keyCode === 229;
      if (!composing && (event.key.length !== 1 || event.key === ' ')) return;
      if (o.activePin) o.switchToEditMode();
      else o.handlePinCapture();
      if (composing) {
        // Let the native IME deliver composition to the newly focused textarea.
        event.stopImmediatePropagation();
      } else {
        this.consume(event);
        o.noteInput.setRangeText(event.key, o.noteInput.selectionStart, o.noteInput.selectionEnd, 'end');
        o.adjustInputHeight();
      }
    }

    /** Starts a freehand selection only on the video image, away from controls. */
    pointerdown(event) {
      const o = this.overlay;
      if (this.gesture || !o.isActive || o.isEditing || !o.videoElement || event.button !== 0 ||
          event.pointerType === 'touch' || event.metaKey || event.ctrlKey || event.altKey || this.isControl(event, true)) return;
      const rect = o.videoElement.getBoundingClientRect();
      const x = event.clientX - rect.left, y = event.clientY - rect.top;
      if (x < 0 || x > rect.width || y < 0 || y > rect.height - 48) return;
      // Claim the press before the player starts its own mouse/drag gesture.
      this.consume(event);
      this.surface.classList.add('capturing');
      this.gesture = { id: event.pointerId, rect, points: [[x, y]], video: o.videoElement, url: location.href };
      if (event.isTrusted) this.surface.setPointerCapture(event.pointerId);
    }

    /** Draws an ink trail after a movement threshold, preserving ordinary clicks. */
    pointermove(event) {
      const g = this.gesture;
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
        g.path = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        g.svg.appendChild(g.path);
        this.overlay.overlayElement.appendChild(g.svg);
      }
      g.points.push([x, y]);
      g.path.setAttribute('points', g.points.map(point => point.join(',')).join(' '));
    }

    /** Saves the circled region immediately and opens its optional caption. */
    async pointerup(event) {
      const g = this.gesture;
      if (!g || event.pointerId !== g.id || event.button !== 0) return;
      this.consume(event);
      this.release(g);
      if (!g.svg) {
        this.gesture = null;
        // The transparent surface replaces the player's click target.
        if (g.url === location.href && this.overlay.isActive) {
          if (g.video.paused) g.video.play().catch(() => {});
          else g.video.pause();
        }
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
      if (event.button === 0 && (Date.now() < this.suppressClickUntil ||
          event.composedPath().includes(this.surface))) this.consume(event);
    }

    /** Blocks compatibility mouse events, including the post-pointerup mouseup. */
    mouse(event) {
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
    }

    /** Releases all listeners when the overlay is destroyed. */
    destroy() {
      this.cancel();
      for (const [type, listener] of this.listeners) window.removeEventListener(type, listener, true);
      this.surface.remove();
    }
  }

  window.Kairos.CompanionInput = CompanionInput;
})();
