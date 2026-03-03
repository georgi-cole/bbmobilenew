// MODULE: introHub.js
// Intro Hub UI — rounded chip navigation overlay
//
// Chips: Houseguests, Music, Sounds (top-left), Settings, Share, Feedback (top-right),
//        News, Achievements (bottom-left), Store (bottom-right)
//
// Notification dots are driven by window.game.hubNotifications (object keyed by chip id).
// Runtime API: window.game.hub.setNotification(id, bool) / window.game.hub.refreshNotifications()
//
// The Houseguests chip calls window.game.houseguests.openPanel() if present;
// otherwise opens a placeholder panel.

(function (global) {
  'use strict';

  const g = global.game || (global.game = {});

  // Chip definitions: { id, label, icon, position }
  // Positions: top-left, top-right, bottom-left, bottom-right
  //   Suffixes -2 and -3 stack chips vertically within the same corner
  //   (e.g. top-right renders above top-right-2, which renders above top-right-3).
  //   Array order does not affect visual stacking — only the position class does.
  const CHIPS = [
    // Top-left corner (stacked top → bottom)
    { id: 'houseguests', label: 'Houseguests', icon: '👥', position: 'top-left' },
    { id: 'music',       label: 'Music',       icon: '🎵', position: 'top-left-2' },
    { id: 'sounds',      label: 'Sounds',      icon: '🔊', position: 'top-left-3' },
    // Top-right corner (stacked top → bottom: settings, share, feedback)
    { id: 'settings',    label: 'Settings',    icon: '⚙️',  position: 'top-right' },
    { id: 'share',       label: 'Share',       icon: '↗️',  position: 'top-right-2' },
    { id: 'feedback',    label: 'Feedback',    icon: '💬', position: 'top-right-3' },
    // Bottom-left corner (stacked bottom → top)
    { id: 'news',        label: 'News',        icon: '📰', position: 'bottom-left' },
    { id: 'achievements',label: 'Achievements',icon: '🎖️', position: 'bottom-left-2' },
    // Bottom-right corner (stacked bottom → top: store, social)
    { id: 'store',       label: 'Store',       icon: '🛒', position: 'bottom-right' },
    { id: 'social',      label: 'Social',      icon: '🔗', position: 'bottom-right-2' },
  ];

  let chipElements = {}; // { id: Element }

  /**
   * Build a single chip element.
   * @param {object} def - Chip definition
   * @returns {HTMLElement}
   */
  function buildChip(def) {
    const btn = document.createElement('button');
    btn.className = `hub-chip hub-chip--${def.position}`;
    btn.setAttribute('data-hub-id', def.id);
    btn.setAttribute('aria-label', def.label);
    btn.setAttribute('type', 'button');

    const icon = document.createElement('span');
    icon.className = 'hub-chip__icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = def.icon;

    const badge = document.createElement('span');
    badge.className = 'hub-chip__badge';
    badge.setAttribute('aria-label', 'New notification');

    btn.appendChild(icon);
    btn.appendChild(badge);

    btn.addEventListener('click', function () {
      handleChipClick(def.id);
    });

    return btn;
  }

  /**
   * Handle chip click events.
   * @param {string} id - Chip identifier
   */
  function handleChipClick(id) {
    switch (id) {
      case 'houseguests':
        openHouseguests();
        break;
      case 'music':
        toggleMusic();
        break;
      case 'sounds':
        toggleSounds();
        break;
      case 'settings':
        openSettings();
        break;
      case 'news':
        openPlaceholder('News', '📰');
        break;
      case 'achievements':
        openPlaceholder('Achievements', '🎖️');
        break;
      case 'store':
        openPlaceholder('Store', '🛒');
        break;
      case 'share':
        openPlaceholder('Share', '↗️');
        break;
      case 'feedback':
        openPlaceholder('Feedback', '💬');
        break;
      case 'social':
        openPlaceholder('Social', '🔗');
        break;
      default:
        console.warn('[introHub] Unknown chip id:', id);
    }
  }

  /**
   * Open the Houseguests panel.
   * Uses window.game.houseguests.openPanel() if available,
   * otherwise uses window.HouseguestsModal.open() if loaded,
   * otherwise shows a placeholder.
   */
  function openHouseguests() {
    if (g.houseguests && typeof g.houseguests.openPanel === 'function') {
      g.houseguests.openPanel();
    } else if (global.HouseguestsModal && typeof global.HouseguestsModal.open === 'function') {
      global.HouseguestsModal.open('list');
    } else {
      openPlaceholder('Houseguests', '👥');
    }
  }

  /**
   * Open the Settings panel.
   * Uses window.game.settings.open() if available,
   * otherwise navigates to the settings route via the hash router.
   */
  function openSettings() {
    if (g.settings && typeof g.settings.open === 'function') {
      g.settings.open();
    } else {
      global.location.hash = '#/settings';
    }
  }

  /**
   * Toggle music on/off via window.toggleIntroHubMusic helper.
   * Updates chip inactive visual to reflect state.
   */
  function toggleMusic() {
    if (typeof global.toggleIntroHubMusic === 'function') {
      global.toggleIntroHubMusic();
    }
    var on = !!global._introhubMusicOn;
    var el = chipElements['music'];
    if (el) {
      if (!on) {
        el.classList.add('hub-chip--inactive');
      } else {
        el.classList.remove('hub-chip--inactive');
      }
    }
  }

  /**
   * Toggle SFX on/off via window.toggleIntroHubSfx helper.
   * Updates chip inactive visual to reflect state.
   */
  function toggleSounds() {
    if (typeof global.toggleIntroHubSfx === 'function') {
      global.toggleIntroHubSfx();
    }
    var on = global._introhubSfxOn !== false;
    var el = chipElements['sounds'];
    if (el) {
      if (!on) {
        el.classList.add('hub-chip--inactive');
      } else {
        el.classList.remove('hub-chip--inactive');
      }
    }
  }

  /**
   * Show a simple placeholder panel for unimplemented chips.
   * @param {string} title - Panel title
   * @param {string} icon  - Emoji icon
   */
  function openPlaceholder(title, icon) {
    // Remove any existing placeholder
    const existing = document.getElementById('hub-placeholder-panel');
    if (existing) existing.remove();

    const panel = document.createElement('div');
    panel.id = 'hub-placeholder-panel';
    Object.assign(panel.style, {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      background: 'linear-gradient(180deg, #1a1f2e 0%, #0f1419 100%)',
      border: '1px solid rgba(255,255,255,0.15)',
      borderRadius: '20px',
      padding: '40px 32px',
      zIndex: '10200',
      minWidth: '260px',
      textAlign: 'center',
      color: '#fff',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      fontFamily: 'inherit',
    });

    panel.innerHTML = `
      <div style="font-size:48px;margin-bottom:12px">${icon}</div>
      <h3 style="margin:0 0 8px;font-size:20px;font-weight:700">${title}</h3>
      <p style="margin:0 0 24px;color:rgba(255,255,255,0.6);font-size:14px">Coming soon</p>
      <button id="hub-placeholder-close" style="
        padding:10px 28px;border-radius:999px;border:1px solid rgba(255,255,255,0.25);
        background:rgba(255,255,255,0.1);color:#fff;font-size:14px;font-weight:600;
        cursor:pointer;font-family:inherit;
      ">Close</button>
    `;

    document.body.appendChild(panel);

    // Backdrop
    const backdrop = document.createElement('div');
    backdrop.id = 'hub-placeholder-backdrop';
    Object.assign(backdrop.style, {
      position: 'fixed',
      top: '0', left: '0', width: '100%', height: '100%',
      background: 'rgba(0,0,0,0.45)',
      zIndex: '10199',
      cursor: 'pointer',
    });
    backdrop.addEventListener('click', closePlaceholder);
    document.body.insertBefore(backdrop, panel);

    document.getElementById('hub-placeholder-close').addEventListener('click', closePlaceholder);
  }

  function closePlaceholder() {
    const panel = document.getElementById('hub-placeholder-panel');
    const backdrop = document.getElementById('hub-placeholder-backdrop');
    if (panel) panel.remove();
    if (backdrop) backdrop.remove();
  }

  /**
   * Set or clear a notification dot on a chip.
   * @param {string} id    - Chip id (e.g. 'news')
   * @param {boolean} show - true to show dot, false to hide
   */
  function setNotification(id, show) {
    // Always persist to hubNotifications map regardless of whether chip is rendered yet
    if (!g.hubNotifications) g.hubNotifications = {};
    g.hubNotifications[id] = !!show;

    const el = chipElements[id];
    if (!el) return;
    if (show) {
      el.classList.add('hub-chip--has-notification');
    } else {
      el.classList.remove('hub-chip--has-notification');
    }
  }

  /**
   * Re-read window.game.hubNotifications and apply dots to all chips.
   */
  function refreshNotifications() {
    const map = g.hubNotifications || {};
    Object.keys(chipElements).forEach(function (id) {
      const el = chipElements[id];
      if (map[id]) {
        el.classList.add('hub-chip--has-notification');
      } else {
        el.classList.remove('hub-chip--has-notification');
      }
    });
  }

  /**
   * Initialize the intro hub inside the given container element.
   * @param {HTMLElement} container - The #intro-hub element
   */
  function init(container) {
    // Clear existing chips to make init idempotent
    container.innerHTML = '';
    chipElements = {};

    CHIPS.forEach(function (def) {
      const chip = buildChip(def);
      chipElements[def.id] = chip;
      container.appendChild(chip);
    });

    // Apply any pre-configured notifications
    refreshNotifications();

    console.info('[introHub] Initialized with', CHIPS.length, 'chips');
  }

  /**
   * Auto-initialize when #intro-hub is present in the DOM.
   */
  function autoInit() {
    const container = document.getElementById('intro-hub');
    if (container) {
      init(container);
    }
  }

  // Expose runtime API
  g.hub = {
    setNotification: setNotification,
    refreshNotifications: refreshNotifications,
    init: init,
  };

  // Expose houseguests panel hook (can be overridden before this module loads)
  if (!g.houseguests) {
    g.houseguests = {};
  }

  // Auto-initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }

  console.info('[introHub] Module loaded');

})(window);
