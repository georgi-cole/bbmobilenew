// MODULE: houseguestSheet.js
// Mobile bottom sheet for displaying houseguest profiles
// Features:
// - Canonical lookup using houseguestLookup utility
// - Real-time ally/enemy updates via event bus
// - Graceful fallback for missing data

/**
 * Local implementation of getProfileByKey.
 * Resolves a houseguest profile from window.game.houseguests
 * using id, slug, or name (case-insensitive).
 * This replaces the original ../utils/houseguestLookup.js import.
 */
function getProfileByKey(key) {
  if (key === null || key === undefined) return null;
  if (typeof window === 'undefined') return null;

  const game = window.game;
  if (!game || !Array.isArray(game.houseguests)) return null;

  const keyStr = String(key).toLowerCase();

  const match = game.houseguests.find((profile) => {
    if (!profile) return false;
    if (profile.id === key) return true;
    if (profile.id !== null && profile.id !== undefined) {
      if (String(profile.id) === String(key)) return true;
    }
    if (profile.slug && String(profile.slug).toLowerCase() === keyStr) return true;
    if (profile.name && String(profile.name).toLowerCase() === keyStr) return true;
    return false;
  });

  return match || null;
}

export const HouseguestSheet = (() => {
  let openProfileId = null;

  /**
   * Build allies list from profile relationships
   * Uses canonical lookup to resolve target names
   */
  function buildAlliesList(profile) {
    if (!profile) return [];
    
    // Check for allies array (populated by social-relations.js)
    const alliesIds = profile.allies || [];
    if (alliesIds.length === 0) return [];
    
    return alliesIds.map(targetId => {
      const ally = getProfileByKey(targetId);
      return {
        id: ally ? ally.id : targetId,
        name: ally ? ally.name : `Player ${targetId}`
      };
    }).filter(a => a.id !== null && a.id !== undefined);
  }

  /**
   * Build enemies list from profile relationships
   * Uses canonical lookup to resolve target names
   */
  function buildEnemiesList(profile) {
    if (!profile) return [];
    
    // Check for enemies array (populated by social-relations.js)
    const enemiesIds = profile.enemies || [];
    if (enemiesIds.length === 0) return [];
    
    return enemiesIds.map(targetId => {
      const enemy = getProfileByKey(targetId);
      return {
        id: enemy ? enemy.id : targetId,
        name: enemy ? enemy.name : `Player ${targetId}`
      };
    }).filter(e => e.id !== null && e.id !== undefined);
  }

  /**
   * Render profile content into sheet
   */
  function render(profile) {
    const el = document.querySelector('#houseguest-sheet .content');
    if (!el) {
      console.warn('[HouseguestSheet] Sheet content element not found');
      return;
    }
    
    if (!profile) {
      el.innerHTML = '<div class="empty">Profile not found</div>';
      return;
    }

    const allies = buildAlliesList(profile);
    const alliesHtml = allies.length
      ? allies.map(a => `<li data-id="${a.id}">${a.name}</li>`).join('')
      : '<li class="none">None</li>';

    const enemies = buildEnemiesList(profile);
    const enemiesHtml = enemies.length
      ? enemies.map(e => `<li data-id="${e.id}">${e.name}</li>`).join('')
      : '<li class="none">None</li>';

    const bio = profile.bio || profile.story || 'No bio available.';
    const name = profile.fullName || profile.name || 'Guest';
    
    // Build basic info section with available fields
    let basicInfoHtml = '';
    const basicFields = [
      { key: 'age', label: 'Age' },
      { key: 'location', label: 'Location' },
      { key: 'profession', label: 'Profession' },
      { key: 'occupation', label: 'Occupation' }
    ];
    
    const availableFields = basicFields.filter(field => {
      const value = profile[field.key];
      return value !== undefined && value !== null && String(value).trim() !== '';
    });
    
    if (availableFields.length > 0) {
      basicInfoHtml = '<section class="basic-info"><h3>Info</h3><ul class="info-list">';
      availableFields.forEach(field => {
        basicInfoHtml += `<li><span class="label">${field.label}:</span> ${profile[field.key]}</li>`;
      });
      basicInfoHtml += '</ul></section>';
    }

    el.innerHTML = `
      <div class="profile">
        <h2>${name}</h2>
        <p class="bio">${bio}</p>
        ${basicInfoHtml}
        <section class="social">
          <h3>Allies</h3>
          <ul class="allies">${alliesHtml}</ul>
          <h3>Enemies</h3>
          <ul class="enemies">${enemiesHtml}</ul>
        </section>
      </div>
    `;
  }

  /**
   * Open sheet with profile for given key (id, slug, or name)
   */
  function open(key) {
    const profile = getProfileByKey(key);
    if (!profile) {
      console.warn('[HouseguestSheet] Profile not found for key:', key);
      render(null);
      // Still show sheet even if profile not found
      const sheet = document.getElementById('houseguest-sheet');
      if (sheet) sheet.classList.add('open');
      return;
    }
    
    openProfileId = profile.id;
    render(profile);
    
    const sheet = document.getElementById('houseguest-sheet');
    if (sheet) {
      sheet.classList.add('open');
      console.info('[HouseguestSheet] Opened sheet for:', profile.name);
    } else {
      console.warn('[HouseguestSheet] Sheet element not found (#houseguest-sheet)');
    }
  }

  /**
   * Close sheet
   */
  function close() {
    openProfileId = null;
    const sheet = document.getElementById('houseguest-sheet');
    if (sheet) {
      sheet.classList.remove('open');
      console.info('[HouseguestSheet] Closed sheet');
    }
  }

  /**
   * Handle social update event - refresh if sheet is open
   */
  function onSocialUpdate() {
    if (!openProfileId) return;
    
    const profile = getProfileByKey(openProfileId);
    render(profile);
    console.info('[HouseguestSheet] Refreshed sheet after social update');
  }

  // Subscribe to social update events
  // Using both possible event names for compatibility
  if (window.game && window.game.bus && typeof window.game.bus.on === 'function') {
    window.game.bus.on('social:updated', onSocialUpdate);
    window.game.bus.on('social.relation.changed', onSocialUpdate);
    window.game.bus.on('social.relations.synced', onSocialUpdate);
    console.info('[HouseguestSheet] Subscribed to social update events');
  } else {
    console.warn('[HouseguestSheet] Event bus not available - social updates will not refresh sheet');
  }

  return { open, close };
})();
