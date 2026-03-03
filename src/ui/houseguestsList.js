// MODULE: houseguestsList.js
// Wire up houseguest cards with hover and tap handlers for profile popup
// Attaches event listeners to guest cards with data-guest-id attributes
// Works with GuestProfilePopup to show profile information on hover/tap

(function(global) {
  'use strict';

  let initialized = false;
  let hoverDebounceTimeout = null;
  const HOVER_DEBOUNCE_DELAY = 200; // ms delay before showing popup on hover
  const initializedCards = new WeakSet(); // Track initialized cards without memory leaks

  /**
   * Initialize houseguest card event handlers
   * Finds all elements with data-guest-id and attaches hover/tap handlers
   */
  function init() {
    if (initialized) {
      console.info('[houseguestsList] Already initialized, skipping');
      return;
    }

    const cards = document.querySelectorAll('[data-guest-id]');
    
    if (cards.length === 0) {
      console.warn('[houseguestsList] No guest cards found with data-guest-id attribute');
      return;
    }

    cards.forEach(card => {
      attachHandlers(card);
    });

    initialized = true;
    console.info('[houseguestsList] Initialized with', cards.length, 'guest cards');
  }

  /**
   * Attach event handlers to a single guest card
   * @param {HTMLElement} card - Card element with data-guest-id attribute
   */
  function attachHandlers(card) {
    const guestId = card.getAttribute('data-guest-id');
    if (!guestId) return;

    // Desktop hover handlers
    card.addEventListener('mouseenter', (e) => handleMouseEnter(e, guestId));
    card.addEventListener('mouseleave', handleMouseLeave);

    // Mobile/touch tap handler
    card.addEventListener('click', (e) => handleClick(e, guestId));

    // Keyboard accessibility
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `View profile for ${guestId}`);
    
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleClick(e, guestId);
      }
    });
  }

  /**
   * Handle mouse enter on guest card (desktop hover)
   * @param {MouseEvent} e - Mouse event
   * @param {string} guestId - Guest stable ID
   */
  function handleMouseEnter(e, guestId) {
    // Debounce to avoid showing popup on quick mouse passes
    clearTimeout(hoverDebounceTimeout);
    
    hoverDebounceTimeout = setTimeout(() => {
      if (global.GuestProfilePopup && typeof global.GuestProfilePopup.openById === 'function') {
        global.GuestProfilePopup.cancelHide();
        global.GuestProfilePopup.openById(guestId, e.currentTarget);
      } else {
        console.warn('[houseguestsList] GuestProfilePopup not available');
      }
    }, HOVER_DEBOUNCE_DELAY);
  }

  /**
   * Handle mouse leave on guest card (desktop hover out)
   */
  function handleMouseLeave() {
    clearTimeout(hoverDebounceTimeout);
    
    if (global.GuestProfilePopup && typeof global.GuestProfilePopup.scheduleHide === 'function') {
      global.GuestProfilePopup.scheduleHide();
    }
  }

  /**
   * Handle click/tap on guest card (mobile and fallback)
   * @param {MouseEvent|TouchEvent} e - Click event
   * @param {string} guestId - Guest stable ID
   */
  function handleClick(e, guestId) {
    // Don't handle if we're in a drag operation or if target is a button
    if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
      return;
    }

    if (global.GuestProfilePopup && typeof global.GuestProfilePopup.openById === 'function') {
      global.GuestProfilePopup.openById(guestId, e.currentTarget);
    } else {
      console.warn('[houseguestsList] GuestProfilePopup not available');
    }
  }

  /**
   * Refresh/reinitialize handlers on dynamically added cards
   * Call this after DOM updates that add new guest cards
   */
  function refresh() {
    // Find cards that don't have handlers attached yet
    const cards = document.querySelectorAll('[data-guest-id]');
    
    cards.forEach(card => {
      // Check if handlers are already attached using WeakSet
      if (!initializedCards.has(card)) {
        attachHandlers(card);
        initializedCards.add(card);
      }
    });

    console.info('[houseguestsList] Refreshed handlers for', cards.length, 'cards');
  }

  /**
   * Create a guest card element with proper attributes
   * @param {object} guest - Houseguest data object
   * @returns {HTMLElement} Card element with data-guest-id
   */
  function createCard(guest) {
    if (!guest || !guest.id) {
      console.error('[houseguestsList] Cannot create card without guest.id');
      return null;
    }

    const card = document.createElement('div');
    card.className = 'houseguests-list__item';
    card.setAttribute('data-guest-id', guest.id);

    // Avatar
    const avatar = document.createElement('div');
    avatar.className = 'houseguests-list__avatar';
    
    const AvatarCache = global.AvatarCache || window.AvatarCache;
    let avatarUrl = null;
    
    if (AvatarCache && typeof AvatarCache.getUrl === 'function') {
      avatarUrl = AvatarCache.getUrl(guest);
    } else if (global.resolveAvatar) {
      avatarUrl = global.resolveAvatar(guest);
    } else {
      avatarUrl = `avatars/${guest.name}.png`;
    }
    
    avatar.style.backgroundImage = `url(${avatarUrl})`;

    // Info
    const info = document.createElement('div');
    info.className = 'houseguests-list__info';

    const name = document.createElement('div');
    name.className = 'houseguests-list__name';
    name.textContent = guest.fullName || guest.name;

    const location = document.createElement('div');
    location.className = 'houseguests-list__location';
    location.textContent = guest.location || '';

    info.appendChild(name);
    info.appendChild(location);

    // Arrow
    const arrow = document.createElement('div');
    arrow.className = 'houseguests-list__arrow';
    arrow.textContent = '›';

    card.appendChild(avatar);
    card.appendChild(info);
    card.appendChild(arrow);

    // Attach handlers and track initialization
    attachHandlers(card);
    initializedCards.add(card);

    return card;
  }

  // Expose to global scope
  global.HouseguestsList = {
    init,
    refresh,
    createCard
  };

  // Auto-initialize when DOM is ready if cards already exist
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(init, 100); // Small delay to ensure other modules are loaded
    });
  } else {
    setTimeout(init, 100);
  }

  console.info('[houseguestsList] Module loaded');

})(window);
