/**
 * legacySpectatorAdapter — window.Spectator.show() compatibility shim.
 *
 * Legacy minigame code can call:
 *   window.Spectator.show({ competitorIds: ['p1','p2'], winnerId: 'p1' })
 *
 * This dispatches a 'spectator:show' CustomEvent which SpectatorView listens
 * for. No legacy files need to be modified — the adapter ships independently.
 *
 * Additionally, when the minigame is complete, legacy code should emit:
 *   window.Spectator.end({ winnerId: 'p1' })
 * which dispatches the 'minigame:end' CustomEvent that SpectatorView uses to
 * reconcile to the authoritative winner.
 */

(function installSpectatorAdapter() {
  if (typeof window === 'undefined') return;

  window.Spectator = window.Spectator || {
    /**
     * Show the React spectator overlay.
     * @param {Object} options
     * @param {string[]} options.competitorIds   - player IDs competing
     * @param {string}  [options.variant]        - 'holdwall' | 'trivia' | 'maze'
     * @param {string}  [options.minigameId]     - optional identifier
     * @param {string}  [options.winnerId]       - authoritative winner if already known
     */
    show: function (options) {
      var opts = options || {};
      window.dispatchEvent(
        new CustomEvent('spectator:show', {
          detail: {
            competitorIds: opts.competitorIds || [],
            variant: opts.variant || 'holdwall',
            minigameId: opts.minigameId || null,
            winnerId: opts.winnerId || null,
          },
        }),
      );
    },

    /**
     * Signal to the spectator overlay that the authoritative result is known.
     * @param {Object} options
     * @param {string} options.winnerId - the authoritative winner player ID
     */
    end: function (options) {
      var opts = options || {};
      window.dispatchEvent(
        new CustomEvent('minigame:end', {
          detail: {
            winnerId: opts.winnerId || null,
          },
        }),
      );
    },
  };

  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
    console.log('[legacySpectatorAdapter] window.Spectator installed');
  }
})();
