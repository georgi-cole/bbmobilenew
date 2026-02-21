// MODULE: minigames/gameUtils.js
// Unified game utilities for win probability, competition results, and anti-cheat measures
//
// EVALUATION ORDER (evaluateOutcome):
// 1. Check debug override (cfg.debugAlwaysWin) - if true, always win
// 2. Check failure state - if failed, cheated, score becomes 0 and cannot win
// 3. Apply skip penalty if used
// 4. Check eligibility threshold (>= 60% of maxScore)
// 5. Roll win probability (20% chance) for eligible players

(function(g){
  'use strict';

  // Win probability constant - human players win ~20% of the time when eligible (new golden rule)
  const PLAYER_WIN_CHANCE = 0.20;
  const PLAYER_WIN_CHANCE_POV = 0.22; // POV tuned lower so AI wins more often
  
  // Default win chances by phase
  const DEFAULT_WIN_CHANCES = {
    hoh: 0.20,
    pov: 0.22
  };
  
  // New outcome logic constants
  const SKIP_PENALTY = 10;        // Score penalty for using Skip action
  const MIN_ELIGIBLE_PCT = 0.60;  // 60% of maxScore required to be eligible for win
  const LOSS_FLOOR = 30;          // Minimum score when forcing success to loss
  const LOSS_SPAN = 25;           // Range for forced loss scores (30-55)

  /**
   * [LEGACY] Determine game result with win probability bias
   * DEPRECATED: Use evaluateOutcome() for new implementations.
   * In competition mode, player win chance depends on phase (HOH=20%, POV=30% by default)
   * In debug/test mode, actual success is shown without bias
   * 
   * @param {boolean} playerSucceeded - Whether the player completed the game successfully
   * @param {string|boolean} phaseOrDebugMode - Phase string ('hoh'/'pov') or legacy debugMode boolean
   * @param {Object} options - Additional options (for phase-aware calls)
   * @returns {boolean} Whether the player should be shown as winner
   */
  function determineGameResult(playerSucceeded, phaseOrDebugMode = false, options = {}){
    // If player failed, they never win
    if(!playerSucceeded){
      return false;
    }
    
    // Handle legacy boolean debugMode parameter
    let debugMode = false;
    let phase = 'hoh';
    
    if(typeof phaseOrDebugMode === 'boolean'){
      // Legacy call: determineGameResult(success, debugMode)
      debugMode = phaseOrDebugMode;
    } else if(typeof phaseOrDebugMode === 'string'){
      // New call: determineGameResult(success, 'hoh'/'pov', options)
      phase = phaseOrDebugMode;
      debugMode = options.debugMode || false;
    }
    
    const cfg = (g.game && g.game.cfg) || g.cfg || {};
    
    // In debug mode, show actual result
    if(debugMode || cfg.debugAlwaysWin === true){
      return true;
    }
    
    // Get phase-specific win chance from config
    const winChances = cfg.playerWinChances || DEFAULT_WIN_CHANCES;
    const winChance = winChances[phase] || DEFAULT_WIN_CHANCES.hoh;
    
    // Apply win probability
    const rng = g.rng || Math.random;
    return rng() < winChance;
  }

  /**
   * Evaluate minigame/competition outcome with new golden rule logic
   * 
   * Golden rule: Player has 20% chance of winning when eligible (score >= 60% of maxScore)
   * 
   * @param {number} rawScore - Player's raw score before penalties
   * @param {number} maxScore - Maximum possible score (typically 100)
   * @param {Object} options - Evaluation options
   * @param {boolean} [options.usedSkip=false] - Whether player used Skip action (-10 penalty)
   * @param {boolean} [options.failed=false] - Whether player failed the challenge (score -> 0)
   * @param {boolean} [options.cheated=false] - Whether anti-cheat flagged cheating (score -> 0)
   * @returns {Object} Result object with { finalScore, didWin, winChance, reasons[] }
   */
  function evaluateOutcome(rawScore, maxScore, options = {}){
    const { usedSkip = false, failed = false, cheated = false } = options;
    const reasons = [];
    const cfg = (g.game && g.game.cfg) || g.cfg || {};
    
    // 1. Check debug override first
    if(cfg.debugAlwaysWin === true){
      reasons.push('Debug override: Always win enabled');
      return {
        finalScore: rawScore,
        didWin: true,
        winChance: 1.0,
        reasons
      };
    }
    
    // 2. Check failure states
    if(failed){
      reasons.push('Player failed the challenge');
      return {
        finalScore: 0,
        didWin: false,
        winChance: 0,
        reasons
      };
    }
    
    if(cheated){
      reasons.push('Anti-cheat flagged cheating');
      return {
        finalScore: 0,
        didWin: false,
        winChance: 0,
        reasons
      };
    }
    
    // 3. Apply skip penalty
    let finalScore = rawScore;
    if(usedSkip){
      finalScore = Math.max(0, rawScore - SKIP_PENALTY);
      reasons.push(`Skip penalty applied: ${rawScore} - ${SKIP_PENALTY} = ${finalScore}`);
    }
    
    // 4. Check eligibility threshold
    const eligibilityThreshold = maxScore * MIN_ELIGIBLE_PCT;
    if(finalScore < eligibilityThreshold){
      reasons.push(`Score ${finalScore.toFixed(1)} below eligibility threshold ${eligibilityThreshold.toFixed(1)} (${(MIN_ELIGIBLE_PCT * 100)}% of ${maxScore})`);
      return {
        finalScore,
        didWin: false,
        winChance: 0,
        reasons
      };
    }
    
    // 5. Roll win probability for eligible players
    const rng = g.rng || Math.random;
    const roll = rng();
    const didWin = roll < PLAYER_WIN_CHANCE;
    
    reasons.push(`Eligible for win (score >= ${eligibilityThreshold.toFixed(1)})`);
    reasons.push(`Win roll: ${(roll * 100).toFixed(1)}% vs ${(PLAYER_WIN_CHANCE * 100)}% threshold`);
    reasons.push(didWin ? 'Result: WIN' : 'Result: LOSS');
    
    return {
      finalScore,
      didWin,
      winChance: PLAYER_WIN_CHANCE,
      reasons
    };
  }

  /**
   * Coerce a success score to the loss range (30-55)
   * Used when player succeeded (>= 60) but didn't win the probability roll
   * Maintains existing UX of forced losses appearing in loss band
   * 
   * @param {number} _successScore - Original success score (typically >= 60) - not used in calculation
   * @returns {number} Score in loss range (30-55)
   */
  function coerceSuccessToLossScore(_successScore){
    const rng = g.rng || Math.random;
    return Math.round(LOSS_FLOOR + rng() * LOSS_SPAN);
  }

  /**
   * Generate competition results for AI competitors
   * Creates realistic score distribution with adjustable difficulty
   * 
   * @param {number} playerScore - The human player's score (0-100)
   * @param {number} numCompetitors - Number of AI competitors
   * @param {string} difficulty - Difficulty level ('easy', 'medium', 'hard')
   * @returns {Array<{id: string, score: number}>} Array of competitor results
   */
  function generateCompetitionResults(playerScore, numCompetitors = 5, difficulty = 'medium'){
    const results = [];
    const rng = g.rng || Math.random;
    
    // Difficulty multipliers affect AI score ranges
    const difficultySettings = {
      easy: { baseMin: 30, baseMax: 70, variance: 0.3 },
      medium: { baseMin: 40, baseMax: 85, variance: 0.25 },
      hard: { baseMin: 50, baseMax: 95, variance: 0.2 }
    };
    
    const settings = difficultySettings[difficulty] || difficultySettings.medium;
    
    for(let i = 0; i < numCompetitors; i++){
      const baseScore = settings.baseMin + rng() * (settings.baseMax - settings.baseMin);
      const variance = 1 - settings.variance + rng() * (settings.variance * 2);
      const finalScore = Math.max(0, Math.min(100, baseScore * variance));
      
      results.push({
        id: `ai_${i}`,
        score: Math.round(finalScore * 10) / 10 // Round to 1 decimal
      });
    }
    
    return results;
  }

  /**
   * Anti-copy style object to prevent text selection and copying
   * Apply this to elements containing game patterns, sequences, or answers
   * 
   * @returns {string} CSS style string for preventing selection/copying
   */
  function getAntiCopyStyles(){
    return 'user-select: none; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none;';
  }

  /**
   * Disable copy/paste events on an element
   * 
   * @param {HTMLElement} element - Element to protect
   */
  function disableCopyPaste(element){
    if(!element) return;
    
    const preventEvent = (e) => {
      e.preventDefault();
      return false;
    };
    
    element.addEventListener('copy', preventEvent);
    element.addEventListener('cut', preventEvent);
    element.addEventListener('paste', preventEvent);
    element.addEventListener('contextmenu', preventEvent); // Disable right-click
    
    // Return cleanup function
    return () => {
      element.removeEventListener('copy', preventEvent);
      element.removeEventListener('cut', preventEvent);
      element.removeEventListener('paste', preventEvent);
      element.removeEventListener('contextmenu', preventEvent);
    };
  }

  /**
   * Generate random sequence from array
   * Used for creating random patterns, colors, shapes, etc.
   * 
   * @param {Array} items - Array of items to choose from
   * @param {number} length - Length of sequence to generate
   * @returns {Array} Random sequence
   */
  function generateRandomSequence(items, length){
    const rng = g.rng || Math.random;
    const sequence = [];
    
    for(let i = 0; i < length; i++){
      const index = Math.floor(rng() * items.length);
      sequence.push(items[index]);
    }
    
    return sequence;
  }

  /**
   * Get difficulty settings for games
   * 
   * @param {string} difficulty - 'easy', 'medium', or 'hard'
   * @returns {Object} Difficulty configuration
   */
  function getDifficultySettings(difficulty = 'medium'){
    const settings = {
      easy: {
        patternLength: 4,
        revealDuration: 8000,
        allowedMistakes: 3,
        timeLimit: 75000
      },
      medium: {
        patternLength: 6,
        revealDuration: 6000,
        allowedMistakes: 3,
        timeLimit: 60000
      },
      hard: {
        patternLength: 8,
        revealDuration: 4000,
        allowedMistakes: 3,
        timeLimit: 45000
      }
    };
    
    return settings[difficulty] || settings.medium;
  }

  // Export API
  g.GameUtils = {
    PLAYER_WIN_CHANCE,
    PLAYER_WIN_CHANCE_POV,
    DEFAULT_WIN_CHANCES,
    determineGameResult,
    evaluateOutcome,
    coerceSuccessToLossScore,
    generateCompetitionResults,
    getAntiCopyStyles,
    disableCopyPaste,
    generateRandomSequence,
    getDifficultySettings,
    consts: {
      PLAYER_WIN_CHANCE,
      PLAYER_WIN_CHANCE_POV,
      DEFAULT_WIN_CHANCES,
      SKIP_PENALTY,
      MIN_ELIGIBLE_PCT,
      LOSS_FLOOR,
      LOSS_SPAN
    }
  };

  console.info('[GameUtils] Module loaded - Player win chances:', DEFAULT_WIN_CHANCES);

})(window);
