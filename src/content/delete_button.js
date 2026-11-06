/** Local two-step deletion; no browser modal or fullscreen transition. */
(function () {
  const { t } = window.Kairos.I18n;
  function deletionError(error) {
    const message = error?.message || String(error);
    if (/context invalidated|receiving end does not exist|could not establish connection/i.test(message)) {
      return t('Extension updated or disconnected. Refresh this video page and try again.');
    }
    return `${t('Could not delete the note:')} ${message}`;
  }
  function bindDeleteButton(button, remove, label = t('Delete note')) {
    let armed = false;
    const reset = () => {
      armed = false;
      button.classList.remove('is-confirming');
      button.title = button.hasAttribute('data-kairos-tip') ? '' : label;
      button.setAttribute('aria-label', label);
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('width', '16');
      svg.setAttribute('height', '16');
      svg.setAttribute('aria-hidden', 'true');
      const path = document.createElementNS(svg.namespaceURI, 'path');
      path.setAttribute('d', 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7M14 10v7');
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'currentColor');
      path.setAttribute('stroke-width', '1.6');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(path);
      button.replaceChildren(svg);
    };
    button.dataset.deleteConfirm = '';
    button.type = 'button';
    reset();
    button.addEventListener('blur', reset);
    button.addEventListener('kairos-cancel-delete', reset);
    button.addEventListener('keydown', event => {
      if (event.key === 'Escape' && armed) {
        event.preventDefault(); event.stopPropagation(); reset();
      }
    });
    button.addEventListener('click', async event => {
      event.stopPropagation();
      if (button.disabled) return;
      if (!armed) {
        armed = true;
        button.classList.add('is-confirming');
        button.textContent = t('Confirm delete');
        button.title = button.hasAttribute('data-kairos-tip') ? '' : t('Click again to delete · Esc to cancel');
        button.setAttribute('aria-label', t('Confirm delete'));
        button.focus({ preventScroll: true });
        return;
      }
      button.disabled = true;
      try { await remove(); }
      finally { button.disabled = false; reset(); }
    });
  }
  window.Kairos.bindDeleteButton = bindDeleteButton;
  window.Kairos.deletionError = deletionError;
})();
