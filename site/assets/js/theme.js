/* SF6 NEWS PORTAL — display settings (font size / accent color theme).
   Applies choices to <html> and persists them in localStorage so they carry
   across pages and future visits. Runs once partials (masthead) are injected. */
(function () {
  const FS_KEY = 'dn:fontSize';
  const COLOR_KEY = 'dn:accentColor';
  const FS_CLASS = { small: '', standard: 'fs-standard', large: 'fs-large' };

  function applyFontSize(value) {
    document.documentElement.classList.remove('fs-standard', 'fs-large');
    const cls = FS_CLASS[value];
    if (cls) document.documentElement.classList.add(cls);
  }

  // スウォッチ自身のbackground-color(CSSで固定色を定義済み)をそのまま
  // --accent/--accent-rgbへ反映する。色の定義箇所を1か所(CSS)に保つため
  function applyColorFromSwatch(swatchEl) {
    const rgbStr = getComputedStyle(swatchEl).backgroundColor;
    const m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(rgbStr);
    if (!m) return;
    document.documentElement.style.setProperty('--accent', rgbStr);
    document.documentElement.style.setProperty('--accent-rgb', `${m[1]}, ${m[2]}, ${m[3]}`);
  }

  function markOn(container, value) {
    container.querySelectorAll('[data-value]').forEach((btn) => {
      btn.classList.toggle('on', btn.getAttribute('data-value') === value);
    });
  }

  function init() {
    const btn = document.getElementById('displaySettingsBtn');
    const panel = document.getElementById('displaySettingsPanel');
    if (!btn || !panel) return;

    const fsGroup = panel.querySelector('[data-ds="fontsize"]');
    const colorGroup = panel.querySelector('[data-ds="color"]');

    const savedFs = localStorage.getItem(FS_KEY) || 'standard';
    applyFontSize(savedFs);
    if (fsGroup) markOn(fsGroup, savedFs);

    const savedColorKey = localStorage.getItem(COLOR_KEY);
    if (savedColorKey && colorGroup) {
      const sw = colorGroup.querySelector(`[data-value="${savedColorKey}"]`);
      if (sw) {
        applyColorFromSwatch(sw);
        markOn(colorGroup, savedColorKey);
      }
    }

    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!open));
      panel.hidden = open;
    });

    document.addEventListener('click', (e) => {
      if (!panel.hidden && !panel.contains(e.target) && !btn.contains(e.target)) {
        panel.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
      }
    });

    if (fsGroup) {
      fsGroup.querySelectorAll('[data-value]').forEach((b) => {
        b.addEventListener('click', () => {
          const value = b.getAttribute('data-value');
          applyFontSize(value);
          markOn(fsGroup, value);
          localStorage.setItem(FS_KEY, value);
        });
      });
    }

    if (colorGroup) {
      colorGroup.querySelectorAll('[data-value]').forEach((b) => {
        b.addEventListener('click', () => {
          applyColorFromSwatch(b);
          markOn(colorGroup, b.getAttribute('data-value'));
          localStorage.setItem(COLOR_KEY, b.getAttribute('data-value'));
        });
      });
    }
  }

  document.addEventListener('dn:partials-loaded', init);
})();
