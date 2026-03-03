// MODULE: houseguestsModal.js
// Modal/bottom sheet for displaying houseguests list and individual info cards
// Used in intro hub and can be reused for in-game avatar taps

(function(global) {
  'use strict';

  const g = global.game || (global.game = {});
  let modalContainer = null;
  let currentView = null; // 'list' or 'detail'
  let selectedHouseguest = null;

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
    title.textContent = 'Houseguests';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'houseguests-modal__close-btn';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.textContent = '✕';
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
    
    title.textContent = 'Houseguests';
    body.innerHTML = '';
    body.className = 'houseguests-modal__body houseguests-modal__body--list';

    // Get houseguests data
    const houseguests = global.Houseguests ? global.Houseguests.getAll() : [];

    if (houseguests.length === 0) {
      const emptyMsg = document.createElement('p');
      emptyMsg.className = 'houseguests-modal__empty';
      emptyMsg.textContent = 'No houseguests available.';
      body.appendChild(emptyMsg);
      return;
    }

    // Create list container
    const list = document.createElement('div');
    list.className = 'houseguests-list';

    houseguests.forEach(houseguest => {
      const item = document.createElement('button');
      item.className = 'houseguests-list__item';
      item.setAttribute('aria-label', `View ${houseguest.fullName}`);

      // Avatar (using avatar cache if available, fallback to direct loading)
      const avatar = document.createElement('div');
      avatar.className = 'houseguests-list__avatar';
      
      // Try to get avatar from cache first
      const AvatarCache = global.AvatarCache || window.AvatarCache;
      let avatarUrl = null;
      
      if (AvatarCache && typeof AvatarCache.getUrl === 'function') {
        avatarUrl = AvatarCache.getUrl(houseguest);
      } else if (global.resolveAvatar) {
        avatarUrl = global.resolveAvatar(houseguest);
      } else {
        // Direct fallback to avatars folder
        avatarUrl = `avatars/${houseguest.name}.png`;
      }
      
      // Check if avatar is already cached
      const cached = AvatarCache && AvatarCache.has(houseguest);
      
      if (cached) {
        // Use cached image immediately
        avatar.style.backgroundImage = `url(${avatarUrl})`;
      } else {
        // Show placeholder while loading
        avatar.classList.add('houseguests-list__avatar--loading');
        avatar.style.backgroundColor = getColorForName(houseguest.name);
        avatar.textContent = houseguest.name.charAt(0);
        
        // Load image in background
        const img = new Image();
        img.onload = () => {
          avatar.classList.remove('houseguests-list__avatar--loading');
          avatar.style.backgroundImage = `url(${avatarUrl})`;
          avatar.textContent = '';
          avatar.style.backgroundColor = '';
        };
        img.onerror = () => {
          // Keep placeholder on error
          avatar.classList.remove('houseguests-list__avatar--loading');
        };
        img.src = avatarUrl;
      }

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
      arrow.textContent = '›';

      item.appendChild(avatar);
      item.appendChild(info);
      item.appendChild(arrow);

      item.addEventListener('click', () => {
        selectedHouseguest = houseguest;
        renderDetailView();
      });

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
    backBtn.innerHTML = '‹ Back to List';
    backBtn.addEventListener('click', renderListView);

    // Create detail card
    const card = document.createElement('div');
    card.className = 'houseguests-detail';

    // Avatar section
    const avatarSection = document.createElement('div');
    avatarSection.className = 'houseguests-detail__avatar-section';

    const avatar = document.createElement('div');
    avatar.className = 'houseguests-detail__avatar';
    
    // Try to get avatar from cache first
    const AvatarCache = global.AvatarCache || window.AvatarCache;
    let avatarUrl = null;
    
    if (AvatarCache && typeof AvatarCache.getUrl === 'function') {
      avatarUrl = AvatarCache.getUrl(selectedHouseguest);
    } else if (global.resolveAvatar) {
      avatarUrl = global.resolveAvatar(selectedHouseguest);
    } else {
      // Direct fallback to avatars folder
      avatarUrl = `avatars/${selectedHouseguest.name}.png`;
    }
    
    // Check if avatar is already cached
    const cached = AvatarCache && AvatarCache.has(selectedHouseguest);
    
    if (cached) {
      // Use cached image immediately
      avatar.style.backgroundImage = `url(${avatarUrl})`;
    } else {
      // Show placeholder while loading
      avatar.style.backgroundColor = getColorForName(selectedHouseguest.name);
      avatar.textContent = selectedHouseguest.name.charAt(0);
      
      // Load image in background
      const img = new Image();
      img.onload = () => {
        avatar.style.backgroundImage = `url(${avatarUrl})`;
        avatar.textContent = '';
        avatar.style.backgroundColor = '';
      };
      img.onerror = () => {
        // Keep placeholder on error
      };
      img.src = avatarUrl;
    }

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

    const basicFields = [
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

    // Clean up after animation
    setTimeout(() => {
      if (modalContainer && modalContainer.parentNode) {
        modalContainer.parentNode.removeChild(modalContainer);
      }
      modalContainer = null;
      currentView = null;
      selectedHouseguest = null;
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
