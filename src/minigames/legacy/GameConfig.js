// MODULE: minigames/GameConfig.js
// Central game configuration and registry for debug/test mode

(function(g){
  'use strict';

  // Win probability constant exported for reference
  const PLAYER_WIN_CHANCE = 0.25;

  /**
   * Available games registry for debug screen
   * Each entry contains metadata for game selection and rendering
   */
  const AVAILABLE_GAMES = [
    {
      id: 'memoryMatch',
      key: 'memoryMatch',
      name: 'Memory Colors',
      description: 'Watch and repeat a sequence of colored blocks',
      module: 'memory-match.js',
      type: 'memory',
      supportsDebugMode: true
    },
    {
      id: 'patternMatch',
      key: 'patternMatch',
      name: 'Pattern Match',
      description: 'Memorize and match a pattern of shapes',
      module: 'pattern-match.js',
      type: 'memory',
      supportsDebugMode: true
    },
    {
      id: 'sequenceMemory',
      key: 'sequenceMemory',
      name: 'Sequence Memory',
      description: 'Remember the sequence of items shown',
      module: 'sequence-memory.js',
      type: 'memory',
      supportsDebugMode: true
    },
    {
      id: 'quickTap',
      key: 'quickTap',
      name: 'Quick Tap Race',
      description: 'Tap as many times as possible within time limit',
      module: 'quick-tap.js',
      type: 'reaction',
      supportsDebugMode: true
    },
    {
      id: 'reactionRoyale',
      key: 'reactionRoyale',
      name: 'Reaction Royale',
      description: 'Multi-round reaction time challenge',
      module: 'reaction-royale.js',
      type: 'reaction',
      supportsDebugMode: true
    },
    {
      id: 'countHouse',
      key: 'countHouse',
      name: 'Count House',
      description: 'Count objects appearing on screen',
      module: 'count-house.js',
      type: 'puzzle',
      supportsDebugMode: true
    },
    {
      id: 'mathBlitz',
      key: 'mathBlitz',
      name: 'Math Blitz',
      description: 'Solve math problems quickly',
      module: 'math-blitz.js',
      type: 'puzzle',
      supportsDebugMode: true
    },
    {
      id: 'timingBar',
      key: 'timingBar',
      name: 'Timing Bar',
      description: 'Stop the bar at the right moment',
      module: 'timing-bar.js',
      type: 'reaction',
      supportsDebugMode: true
    },
    {
      id: 'wordAnagram',
      key: 'wordAnagram',
      name: 'Word Anagram',
      description: 'Unscramble the letters to form words',
      module: 'word-anagram.js',
      type: 'puzzle',
      supportsDebugMode: true
    },
    {
      id: 'targetPractice',
      key: 'targetPractice',
      name: 'Target Practice',
      description: 'Hit as many targets as possible',
      module: 'target-practice.js',
      type: 'reaction',
      supportsDebugMode: true
    },
    {
      id: 'memoryPairs',
      key: 'memoryPairs',
      name: 'Memory Pairs',
      description: 'Find matching pairs of cards',
      module: 'memory-pairs.js',
      type: 'memory',
      supportsDebugMode: true
    },
    {
      id: 'estimationGame',
      key: 'estimationGame',
      name: 'Estimation Game',
      description: 'Estimate quantities and measurements',
      module: 'estimation-game.js',
      type: 'puzzle',
      supportsDebugMode: true
    },
    {
      id: 'reactionTimer',
      key: 'reactionTimer',
      name: 'Reaction Timer',
      description: 'Test your reaction speed',
      module: 'reaction-timer.js',
      type: 'reaction',
      supportsDebugMode: true
    },
    {
      id: 'triviaPulse',
      key: 'triviaPulse',
      name: 'Trivia Pulse',
      description: 'Time-pressured Big Brother trivia',
      module: 'trivia-pulse.js',
      type: 'trivia',
      supportsDebugMode: true
    }
  ];

  /**
   * Get game configuration by ID or key
   * @param {string} idOrKey - Game ID or key
   * @returns {Object|null} Game configuration or null if not found
   */
  function getGame(idOrKey){
    return AVAILABLE_GAMES.find(game => 
      game.id === idOrKey || game.key === idOrKey
    ) || null;
  }

  /**
   * Get all available games
   * @param {Object} options - Filter options
   * @returns {Array} Array of game configurations
   */
  function getAllGames(options = {}){
    let games = [...AVAILABLE_GAMES];
    
    if(options.type){
      games = games.filter(g => g.type === options.type);
    }
    
    if(options.supportsDebugMode){
      games = games.filter(g => g.supportsDebugMode);
    }
    
    return games;
  }

  /**
   * Get games grouped by type
   * @returns {Object} Games grouped by type
   */
  function getGamesByType(){
    const grouped = {};
    
    AVAILABLE_GAMES.forEach(game => {
      if(!grouped[game.type]){
        grouped[game.type] = [];
      }
      grouped[game.type].push(game);
    });
    
    return grouped;
  }

  // Export API
  g.GameConfig = {
    PLAYER_WIN_CHANCE,
    AVAILABLE_GAMES,
    getGame,
    getAllGames,
    getGamesByType
  };

  console.info('[GameConfig] Module loaded -', AVAILABLE_GAMES.length, 'games registered');

})(window);
