// MODULE: minigames/card-clash.js
// Card Clash - Memory card matching game

(function(g){
  'use strict';

  /**
   * Card Clash minigame
   * Match pairs of cards by remembering their positions
   * Score based on matches found and time taken
   * 
   * @param {HTMLElement} container - Container element for the game UI
   * @param {Function} onComplete - Callback function(score) when game ends
   */
  function render(container, onComplete, options = {}){
    container.innerHTML = '';
    
    const { 
      debugMode = false, 
      competitionMode = false
    } = options;
    
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:16px;padding:20px;max-width:600px;margin:0 auto;';
    
    const title = document.createElement('h3');
    title.textContent = 'Card Clash';
    title.style.cssText = 'margin:0;font-size:1.2rem;color:#e3ecf5;';
    
    const instructions = document.createElement('p');
    instructions.textContent = 'Match all pairs of cards. Fewer moves = higher score!';
    instructions.style.cssText = 'margin:0;font-size:0.9rem;color:#95a9c0;text-align:center;';
    
    const statsDiv = document.createElement('div');
    statsDiv.style.cssText = 'display:flex;gap:20px;font-size:0.9rem;color:#83bfff;';
    
    const movesSpan = document.createElement('span');
    movesSpan.textContent = 'Moves: 0';
    const matchesSpan = document.createElement('span');
    matchesSpan.textContent = 'Matches: 0/10';
    
    statsDiv.appendChild(movesSpan);
    statsDiv.appendChild(matchesSpan);
    
    const gridDiv = document.createElement('div');
    gridDiv.style.cssText = 'display:grid;grid-template-columns:repeat(5,75px);gap:10px;margin:20px 0;';
    
    wrapper.appendChild(title);
    wrapper.appendChild(instructions);
    wrapper.appendChild(statsDiv);
    wrapper.appendChild(gridDiv);
    container.appendChild(wrapper);
    
    // Game state (5x4 = 20 cards, 10 pairs)
    const symbols = ['🌟', '❤️', '🎭', '🎨', '🎵', '⚡', '🎯', '🎪', '🎬', '🎮'];
    const cards = [...symbols, ...symbols].sort(() => Math.random() - 0.5);
    let flipped = [];
    let matched = 0;
    let moves = 0;
    let canFlip = true;
    const startTime = Date.now();
    
    // Create cards
    cards.forEach((symbol, index) => {
      const card = document.createElement('div');
      card.style.cssText = `
        width:75px;
        height:95px;
        background:#2c3a4d;
        border-radius:8px;
        display:flex;
        align-items:center;
        justify-content:center;
        font-size:2rem;
        cursor:pointer;
        transition:transform 0.2s, background 0.2s;
        user-select:none;
      `;
      card.dataset.index = index;
      card.dataset.symbol = symbol;
      card.dataset.matched = 'false';
      
      card.addEventListener('click', () => {
        if(!canFlip || card.dataset.matched === 'true' || flipped.includes(card)) return;
        
        // Flip card
        card.textContent = symbol;
        card.style.background = '#3d5170';
        flipped.push(card);
        
        if(flipped.length === 2){
          canFlip = false;
          moves++;
          movesSpan.textContent = `Moves: ${moves}`;
          
          // Check match
          if(flipped[0].dataset.symbol === flipped[1].dataset.symbol){
            // Match!
            matched++;
            matchesSpan.textContent = `Matches: ${matched}/10`;
            flipped[0].dataset.matched = 'true';
            flipped[1].dataset.matched = 'true';
            flipped[0].style.background = '#74e48b';
            flipped[1].style.background = '#74e48b';
            flipped = [];
            canFlip = true;
            
            // Check win
            if(matched === 10){
              setTimeout(() => {
                const timeTaken = (Date.now() - startTime) / 1000;
                // Calculate raw score: Perfect: 6 moves (100), Good: 10 moves (80), scale down
                const movePenalty = Math.max(0, (moves - 6) * 3);
                const rawScore = Math.min(100, Math.max(0, 100 - movePenalty));
                const maxScore = 100;
                
                // Determine if player succeeded (legacy threshold for backward compatibility)
                const playerSucceeded = rawScore >= 60;
                
                // Apply new centralized outcome logic in competition mode
                let finalScore = rawScore;
                if(g.GameUtils && g.GameUtils.evaluateOutcome && !debugMode && competitionMode){
                  const outcome = g.GameUtils.evaluateOutcome(rawScore, maxScore, {
                    usedSkip: false,
                    failed: !playerSucceeded,
                    cheated: false
                  });
                  
                  finalScore = outcome.finalScore;
                  
                  // If player succeeded but didn't win, coerce to loss band for consistent UX
                  if(rawScore >= 60 && !outcome.didWin && !g.cfg?.debugAlwaysWin){
                    finalScore = g.GameUtils.coerceSuccessToLossScore(finalScore);
                    console.log('[CardClash] Win probability applied: success forced to loss, score:', finalScore);
                  }
                  
                  if(outcome.didWin){
                    console.log('[CardClash] Player won! Reasons:', outcome.reasons.join('; '));
                  } else {
                    console.log('[CardClash] Player lost. Reasons:', outcome.reasons.join('; '));
                  }
                }
                
                if(onComplete){
                  onComplete(finalScore);
                }
              }, 500);
            }
          } else {
            // No match
            setTimeout(() => {
              flipped[0].textContent = '';
              flipped[1].textContent = '';
              flipped[0].style.background = '#2c3a4d';
              flipped[1].style.background = '#2c3a4d';
              flipped = [];
              canFlip = true;
            }, 800);
          }
        }
      });
      
      gridDiv.appendChild(card);
    });
  }

  // Export
  if(typeof g.MiniGames === 'undefined') g.MiniGames = {};
  g.MiniGames.cardClash = { render };

})(window);
