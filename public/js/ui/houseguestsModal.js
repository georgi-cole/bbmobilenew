// MODULE: houseguestsModal.js
// Modal/bottom sheet for displaying houseguests list and individual info cards
// Used in intro hub and can be reused for in-game avatar taps

(function(global) {
  'use strict';

  const g = global.game || (global.game = {});
  let modalContainer = null;
  let currentView = null; // 'list' or 'detail'
  let selectedHouseguest = null;
  let closeTimeout = null; // Track pending close timeout to prevent race condition
  const MYSTERY_WILDCARD_IDS = ['lia', 'ali', 'noa', 'pax', 'rey'];
  const AVATAR_FILE_OVERRIDES = { mimi: 'mimi_avatar.webp' };

  function assetUrl(path) {
    if (!path || /^(?:https?:|data:|blob:)/i.test(path)) return path || '';
    const base = typeof g.assetBase === 'string' && g.assetBase ? g.assetBase : '/';
    const cleanBase = base.endsWith('/') ? base : `${base}/`;
    return `${cleanBase}${path.replace(/^\.?\//, '')}`;
  }

  function avatarUrlFor(housemate) {
    if (housemate.avatarPath) return assetUrl(housemate.avatarPath);
    const id = String(housemate.id || housemate.name || '').toLowerCase();
    const file = AVATAR_FILE_OVERRIDES[id] || `${housemate.name}_avatar.webp`;
    return assetUrl(`assets/skins/${file}`);
  }

  function renderAvatar(avatar, housemate) {
    avatar.textContent = '';
    avatar.style.backgroundImage = '';
    avatar.style.backgroundColor = '';

    if (housemate.isLockedMystery) {
      avatar.classList.add('houseguests-list__avatar--mystery');
      avatar.textContent = '?';
      return;
    }

    avatar.classList.remove('houseguests-list__avatar--mystery');
    avatar.classList.add('houseguests-list__avatar--loading');
    const avatarUrl = avatarUrlFor(housemate);
    const img = new Image();
    img.onload = () => {
      avatar.classList.remove('houseguests-list__avatar--loading');
      avatar.style.backgroundImage = `url(${avatarUrl})`;
    };
    img.onerror = () => {
      avatar.classList.remove('houseguests-list__avatar--loading');
      avatar.classList.add('houseguests-list__avatar--unavailable');
      avatar.textContent = '?';
    };
    img.src = avatarUrl;
  }

  function getRosterEntries() {
    const regularHousemates = global.Houseguests ? global.Houseguests.getAll() : [];
    const profiles = Array.isArray(g.mysteryWildcards) ? g.mysteryWildcards : [];
    const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
    const twinShockUnlocked = g.twinShockConsumed === true;

    const mysteryHousemates = MYSTERY_WILDCARD_IDS.map((id, index) => {
      const profile = profilesById.get(id);
      const unlocked = (id === 'lia' || id === 'ali') && twinShockUnlocked && profile;
      if (!unlocked) {
        return {
          id: `mystery-${id}`,
          name: 'Unknown',
          fullName: 'Unknown',
          location: 'Mystery housemate',
          isLockedMystery: true,
          mysteryIndex: index + 1,
        };
      }

      return {
        ...profile,
        isMysteryWildcard: true,
        story: profile.introduction,
      };
    });

    return [...regularHousemates, ...mysteryHousemates];
  }

  /**
   * Build the modal container structure
   */
  function buildModal() {
    const modal = document.createElement('div');
    modal.id = 'houseguestsModal';
    modal.className = 'houseguests-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'houseguests-modal-title');

    // Modal backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'houseguests-modal__backdrop';
    backdrop.addEventListener('click', closeModal);

    // Modal content container (bottom sheet style)
    const content = document.createElement('div');
    content.className = 'houseguests-modal__content';

    // Header
    const header = document.createElement('div');
    header.className = 'houseguests-modal__header';

    const title = document.createElement('h2');
    title.id = 'houseguests-modal-title';
    title.className = 'houseguests-modal__title';
    title.textContent = 'Players';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'houseguests-modal__close-btn';
    closeBtn.setAttribute('aria-label', 'Back to Intro Hub');
    closeBtn.textContent = '↩';
    closeBtn.addEventListener('click', closeModal);

    header.appendChild(title);
    header.appendChild(closeBtn);

    // Body (will contain list or detail view)
    const body = document.createElement('div');
    body.className = 'houseguests-modal__body';

    content.appendChild(header);
    content.appendChild(body);

    modal.appendChild(backdrop);
    modal.appendChild(content);

    return modal;
  }

  /**
   * Render houseguests list view
   */
  function renderListView() {
    if (!modalContainer) return;

    const body = modalContainer.querySelector('.houseguests-modal__body');
    const title = modalContainer.querySelector('.houseguests-modal__title');
    
    title.textContent = 'Players';
    body.innerHTML = '';
    body.className = 'houseguests-modal__body houseguests-modal__body--list';

    // Get houseguests data
    const houseguests = getRosterEntries();

    if (houseguests.length === 0) {
      const emptyMsg = document.createElement('p');
      emptyMsg.className = 'houseguests-modal__empty';
      emptyMsg.textContent = 'No players available.';
      body.appendChild(emptyMsg);
      return;
    }

    // Create list container
    const list = document.createElement('div');
    list.className = 'houseguests-list';

    houseguests.forEach(houseguest => {
      const item = document.createElement('button');
      item.className = 'houseguests-list__item';
      if (houseguest.isLockedMystery) {
        item.classList.add('houseguests-list__item--mystery');
        item.disabled = true;
        item.setAttribute('aria-label', `Mystery housemate ${houseguest.mysteryIndex}, locked`);
      } else {
        item.setAttribute('aria-label', `View ${houseguest.fullName}`);
      }

      // Avatar (using avatar cache if available, fallback to direct loading)
      const avatar = document.createElement('div');
      avatar.className = 'houseguests-list__avatar';
      
      renderAvatar(avatar, houseguest);

      // Info
      const info = document.createElement('div');
      info.className = 'houseguests-list__info';

      const name = document.createElement('div');
      name.className = 'houseguests-list__name';
      name.textContent = houseguest.fullName || houseguest.name;

      const location = document.createElement('div');
      location.className = 'houseguests-list__location';
      location.textContent = houseguest.location;

      info.appendChild(name);
      info.appendChild(location);

      // Arrow icon
      const arrow = document.createElement('div');
      arrow.className = 'houseguests-list__arrow';
      arrow.textContent = houseguest.isLockedMystery ? '' : '›';

      item.appendChild(avatar);
      item.appendChild(info);
      item.appendChild(arrow);

      if (!houseguest.isLockedMystery) {
        item.addEventListener('click', () => {
          selectedHouseguest = houseguest;
          renderDetailView();
        });
      }

      list.appendChild(item);
    });

    body.appendChild(list);
    currentView = 'list';
  }

  /**
   * Render houseguest detail view
   */
  function renderDetailView() {
    if (!modalContainer || !selectedHouseguest) return;

    const body = modalContainer.querySelector('.houseguests-modal__body');
    const title = modalContainer.querySelector('.houseguests-modal__title');
    
    title.textContent = selectedHouseguest.fullName || selectedHouseguest.name;
    body.innerHTML = '';
    body.className = 'houseguests-modal__body houseguests-modal__body--detail';

    // Add back button
    const backBtn = document.createElement('button');
    backBtn.className = 'houseguests-detail__back-btn';
    backBtn.innerHTML = '↩ Back to Players';
    backBtn.addEventListener('click', renderListView);

    // Create detail card
    const card = document.createElement('div');
    card.className = 'houseguests-detail';

    // Avatar section
    const avatarSection = document.createElement('div');
    avatarSection.className = 'houseguests-detail__avatar-section';

    const avatar = document.createElement('div');
    avatar.className = 'houseguests-detail__avatar';
    renderAvatar(avatar, selectedHouseguest);

    const nameLabel = document.createElement('h3');
    nameLabel.className = 'houseguests-detail__name';
    nameLabel.textContent = selectedHouseguest.fullName || selectedHouseguest.name;

    avatarSection.appendChild(avatar);
    avatarSection.appendChild(nameLabel);

    // Basic Info section
    const basicSection = document.createElement('div');
    basicSection.className = 'houseguests-detail__section';

    const basicTitle = document.createElement('h4');
    basicTitle.className = 'houseguests-detail__section-title';
    basicTitle.textContent = 'Basic Info';

    const basicGrid = document.createElement('div');
    basicGrid.className = 'houseguests-detail__grid';

    const standardFields = [
      { label: 'Age', value: selectedHouseguest.age },
      { label: 'Sex', value: selectedHouseguest.sex },
      { label: 'Location', value: selectedHouseguest.location },
      { label: 'Sexuality', value: selectedHouseguest.sexuality },
      { label: 'Education', value: selectedHouseguest.education },
      { label: 'Profession', value: selectedHouseguest.profession },
      { label: 'Family Status', value: selectedHouseguest.familyStatus },
      { label: 'Kids', value: selectedHouseguest.kids },
      { label: 'Pets', value: selectedHouseguest.pets },
      { label: 'Zodiac Sign', value: selectedHouseguest.zodiacSign },
      { label: 'Religion', value: selectedHouseguest.religion },
      { label: 'Motto', value: selectedHouseguest.motto },
      { label: 'Fun Fact', value: selectedHouseguest.funFact },
      { 
        label: 'Allies', 
        value: (selectedHouseguest.allies && selectedHouseguest.allies.length > 0) 
          ? selectedHouseguest.allies.join(', ') 
          : 'None' 
      },
      { 
        label: 'Enemies', 
        value: (selectedHouseguest.enemies && selectedHouseguest.enemies.length > 0) 
          ? selectedHouseguest.enemies.join(', ') 
          : 'None' 
      }
    ];
    const wildcardFields = [
      { label: 'Age', value: selectedHouseguest.age },
      { label: 'Location', value: selectedHouseguest.location },
      { label: 'Profession', value: selectedHouseguest.profession },
      { label: 'Why They Want to Win', value: selectedHouseguest.prizePlan },
      { label: 'Private File', value: selectedHouseguest.privateDetail },
    ];
    const basicFields = selectedHouseguest.isMysteryWildcard ? wildcardFields : standardFields;

    basicFields.forEach(field => {
      const item = document.createElement('div');
      item.className = 'houseguests-detail__field';

      const label = document.createElement('div');
      label.className = 'houseguests-detail__field-label';
      label.textContent = field.label;

      const value = document.createElement('div');
      value.className = 'houseguests-detail__field-value';
      value.textContent = field.value || '—';

      item.appendChild(label);
      item.appendChild(value);
      basicGrid.appendChild(item);
    });

    basicSection.appendChild(basicTitle);
    basicSection.appendChild(basicGrid);

    // Advanced Info section (story)
    const advancedSection = document.createElement('div');
    advancedSection.className = 'houseguests-detail__section';

    const advancedTitle = document.createElement('h4');
    advancedTitle.className = 'houseguests-detail__section-title';
    advancedTitle.textContent = 'Their Story';

    const storyText = document.createElement('div');
    storyText.className = 'houseguests-detail__story';
    storyText.textContent = selectedHouseguest.story || 'No story available.';

    advancedSection.appendChild(advancedTitle);
    advancedSection.appendChild(storyText);

    // Assemble card
    card.appendChild(avatarSection);
    card.appendChild(basicSection);
    card.appendChild(advancedSection);

    body.appendChild(backBtn);
    body.appendChild(card);
    currentView = 'detail';
  }

  /**
   * Generate a color hash for a name (for fallback avatars)
   */
  function getColorForName(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash % 360);
    return `hsl(${hue}, 60%, 50%)`;
  }

  /**
   * Open the houseguests modal
   * @param {string} view - Initial view: 'list' or 'detail' (optional, defaults to 'list')
   * @param {object} houseguest - If view is 'detail', the houseguest to show (optional)
   */
  function openModal(view = 'list', houseguest = null) {
    // Cancel any pending close timeout to avoid removing a freshly-opened modal
    if (closeTimeout) {
      clearTimeout(closeTimeout);
      closeTimeout = null;
    }

    if (!modalContainer) {
      modalContainer = buildModal();
      document.body.appendChild(modalContainer);
    }

    if (view === 'detail' && houseguest) {
      selectedHouseguest = houseguest;
      renderDetailView();
    } else {
      renderListView();
    }

    // Show modal with animation
    requestAnimationFrame(() => {
      modalContainer.classList.add('houseguests-modal--visible');
      // Focus management
      const closeBtn = modalContainer.querySelector('.houseguests-modal__close-btn');
      if (closeBtn) closeBtn.focus();
    });

    // Prevent body scroll
    document.body.style.overflow = 'hidden';

    // ESC key to close
    document.addEventListener('keydown', handleEscKey);

    console.info('[houseguestsModal] Opened in', view, 'view');
  }

  /**
   * Close the houseguests modal
   */
  function closeModal() {
    if (!modalContainer) return;

    modalContainer.classList.remove('houseguests-modal--visible');
    document.body.style.overflow = '';
    document.removeEventListener('keydown', handleEscKey);

    // Capture the container at close-time; only remove it if it's still the same instance
    const containerToRemove = modalContainer;
    closeTimeout = setTimeout(() => {
      closeTimeout = null;
      if (containerToRemove && containerToRemove.parentNode) {
        containerToRemove.parentNode.removeChild(containerToRemove);
      }
      // Only clear module state if we're removing the current container
      if (modalContainer === containerToRemove) {
        modalContainer = null;
        currentView = null;
        selectedHouseguest = null;
      }
    }, 300);

    console.info('[houseguestsModal] Closed');
  }

  /**
   * Handle ESC key to close modal
   */
  function handleEscKey(e) {
    if (e.key === 'Escape') {
      closeModal();
    }
  }

  // Expose to global scope
  global.HouseguestsModal = {
    open: openModal,
    close: closeModal
  };

  console.info('[houseguestsModal] Module loaded');

})(window);
