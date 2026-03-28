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

  // Resolve asset base path from the script's own src so that the correct
  // subdirectory is used regardless of whether the app is served from / or
  // from the configured Vite base path (e.g. /bbmobilenew/).
  var _scriptSrc = (document.currentScript || {}).src || '';
  var ASSET_BASE = '/';
  if (_scriptSrc) {
    var resolvedBase = _scriptSrc.replace(/js\/ui\/introHub\.js.*$/, '');
    // When served under /bbmobilenew/, static assets still live under /assets/ at the origin
    // root, not /bbmobilenew/assets/. In that case keep ASSET_BASE as '/' so that asset
    // URLs resolve to /assets/... instead of /bbmobilenew/assets/...
    if (resolvedBase.indexOf('/bbmobilenew/') === -1) {
      ASSET_BASE = resolvedBase;
    }
  }

  var SHELL_ASSETS = {
    normal:   ASSET_BASE + 'assets/side_utilities_button/side_utility_shell_normal.svg',
    hover:    ASSET_BASE + 'assets/side_utilities_button/side_utility_shell_hover.svg',
    pressed:  ASSET_BASE + 'assets/side_utilities_button/side_utility_shell_pressed.svg',
    disabled: ASSET_BASE + 'assets/side_utilities_button/side_utility_shell_disabled.svg',
  };

  var BADGE_ASSET = ASSET_BASE + 'assets/side_utilities_button/badge_alert_red.svg';

  var ICON_MAP = {
    houseguests:  'housemates_v2.svg',
    music:        'music_v2.svg',
    sounds:       'sound_v2.svg',
    settings:     'settings_v2.svg',
    share:        'share_v2.svg',
    feedback:     'feedback_v2.svg',
    news:         'news_v2.svg',
    achievements: 'achievements_v2.svg',
    store:        'shop_v2.svg',
    social:       'social_v2.svg',
  };

  // Chip definitions: { id, label, position }
  // Positions: top-left, top-right, bottom-left, bottom-right
  //   Suffixes -2 and -3 stack chips vertically within the same corner
  //   (e.g. top-right renders above top-right-2, which renders above top-right-3).
  //   Array order does not affect visual stacking — only the position class does.
  const CHIPS = [
    // Top-left corner (stacked top → bottom)
    { id: 'houseguests', label: 'Houseguests', position: 'top-left' },
    { id: 'music',       label: 'Music',       position: 'top-left-2' },
    { id: 'sounds',      label: 'Sounds',      position: 'top-left-3' },
    // Top-right corner (stacked top → bottom: settings, share, feedback)
    { id: 'settings',    label: 'Settings',    position: 'top-right' },
    { id: 'share',       label: 'Share',       position: 'top-right-2' },
    { id: 'feedback',    label: 'Feedback',    position: 'top-right-3' },
    // Bottom-left corner (stacked bottom → top)
    { id: 'news',        label: 'News',        position: 'bottom-left' },
    { id: 'achievements',label: 'Achievements',position: 'bottom-left-2' },
    // Bottom-right corner (stacked bottom → top: store, social)
    { id: 'store',       label: 'Store',       position: 'bottom-right' },
    { id: 'social',      label: 'Social',      position: 'bottom-right-2' },
  ];

  let chipElements = {}; // { id: Element }
  var shellElements = {}; // { id: img Element } — for dynamic shell src swapping

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

    // Shell image (provides button background; swapped on hover/press/disabled)
    const shell = document.createElement('img');
    shell.className = 'hub-chip__shell';
    shell.src = SHELL_ASSETS.normal;
    shell.alt = '';
    shell.setAttribute('aria-hidden', 'true');
    shell.draggable = false;
    shellElements[def.id] = shell;

    // Icon image (overlaid on shell)
    const iconFile = ICON_MAP[def.id] || 'housemates_v2.svg';
    const icon = document.createElement('img');
    icon.className = 'hub-chip__icon';
    icon.src = ASSET_BASE + 'assets/side_utilities_button/' + iconFile;
    icon.alt = '';
    icon.setAttribute('aria-hidden', 'true');
    icon.draggable = false;

    // Badge — uses SVG asset; visibility toggled via CSS class
    const badge = document.createElement('img');
    badge.className = 'hub-chip__badge';
    badge.src = BADGE_ASSET;
    badge.alt = '';
    badge.setAttribute('aria-hidden', 'true');
    badge.draggable = false;

    btn.appendChild(shell);
    btn.appendChild(icon);
    btn.appendChild(badge);

    // State helpers — update shell src based on interaction state
    function isInactive() {
      return btn.classList.contains('hub-chip--inactive');
    }
    function applyShell(state) {
      shell.src = SHELL_ASSETS[state] || SHELL_ASSETS.normal;
    }
    function resetShell() {
      applyShell(isInactive() ? 'disabled' : 'normal');
    }

    btn.addEventListener('mouseenter', function () {
      if (!isInactive()) applyShell('hover');
    });
    btn.addEventListener('mouseleave', function () { resetShell(); });
    btn.addEventListener('mousedown', function () {
      if (!isInactive()) applyShell('pressed');
    });
    btn.addEventListener('mouseup', function () {
      if (!isInactive()) applyShell('hover');
    });
    btn.addEventListener('touchstart', function () {
      if (!isInactive()) applyShell('pressed');
    }, { passive: true });
    btn.addEventListener('touchend', function () { resetShell(); });
    btn.addEventListener('touchcancel', function () { resetShell(); });
    btn.addEventListener('blur', function () { resetShell(); });

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
    console.debug('[introHub] chip tapped:', id);
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
   * Uses the hash router as the primary action (always reliable).
   * Also calls window.game.settings.open() if present for any additional setup.
   */
  function openSettings() {
    global.location.hash = '#/settings';
    if (g.settings && typeof g.settings.open === 'function') {
      g.settings.open();
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
    toggleChipVisual('music', !!global._introhubMusicOn);
  }

  /**
   * Toggle SFX on/off via window.toggleIntroHubSfx helper.
   * Updates chip inactive visual to reflect state.
   */
  function toggleSounds() {
    if (typeof global.toggleIntroHubSfx === 'function') {
      global.toggleIntroHubSfx();
    }
    toggleChipVisual('sounds', !!global._introhubSfxOn);
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
   * Toggle the inactive visual state of a chip.
   * @param {string} id     - Chip id (e.g. 'music', 'sounds')
   * @param {boolean} active - true = active (normal shell), false = inactive (disabled shell, dimmed)
   */
  function toggleChipVisual(id, active) {
    var el = chipElements[id];
    if (!el) return;
    var shellEl = shellElements[id];
    if (active) {
      el.classList.remove('hub-chip--inactive');
      if (shellEl) shellEl.src = SHELL_ASSETS.normal;
    } else {
      el.classList.add('hub-chip--inactive');
      if (shellEl) shellEl.src = SHELL_ASSETS.disabled;
    }
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
    shellElements = {};

    CHIPS.forEach(function (def) {
      const chip = buildChip(def);
      chipElements[def.id] = chip;
      container.appendChild(chip);
    });

    // Apply any pre-configured notifications
    refreshNotifications();

    // Apply persisted audio visual state so chips reflect current on/off status
    toggleChipVisual('music', !!global._introhubMusicOn);
    toggleChipVisual('sounds', !!global._introhubSfxOn);

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
    toggleChipVisual: toggleChipVisual,
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
