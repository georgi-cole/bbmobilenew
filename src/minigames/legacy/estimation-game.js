// MODULE: minigames/estimation-game.js
// Estimation Game - Count dots on screen
// Migrated from legacy minigames.js

(function(g){
  'use strict';

  /**
   * Estimation Game minigame
   * Player views dots briefly, then estimates the count
   * Score based on accuracy of estimate
   * Mobile-friendly
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
    wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:16px;padding:20px;';
    
    // Title
    const title = document.createElement('h3');
    title.textContent = 'Estimation';
    title.style.cssText = 'margin:0;font-size:1.2rem;color:#e3ecf5;';
    
    // Instructions
    const instructions = document.createElement('p');
    instructions.textContent = 'Look at the dots, then guess the count';
    instructions.style.cssText = 'margin:0;font-size:0.9rem;color:#95a9c0;text-align:center;';
    
    // Canvas for dots
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 180;
    canvas.style.cssText = 'background:#0a0e14;border:2px solid #2c3a4d;border-radius:8px;';
    
    const ctx = canvas.getContext('2d');
    
    // Generate random number of dots
    const dotCount = 20 + Math.floor(Math.random() * 40); // 20-60 dots
    
    // Draw dots
    ctx.fillStyle = '#6fd3ff';
    for(let i = 0; i < dotCount; i++){
      const x = Math.random() * 280 + 10;
      const y = Math.random() * 160 + 10;
      const radius = 3;
      
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Input field
    const input = document.createElement('input');
    input.type = 'number';
    input.placeholder = 'How many dots?';
    input.min = '0';
    input.max = '100';
    input.style.cssText = 'width:180px;padding:10px;font-size:1.1rem;text-align:center;background:#1d2734;color:#e3ecf5;border:1px solid #2c3a4d;border-radius:5px;';
    
    // Submit button
    const submitBtn = document.createElement('button');
    submitBtn.className = 'btn primary';
    submitBtn.textContent = 'Submit';
    
    // Handle Enter key
    input.addEventListener('keypress', (e) => {
      if(e.key === 'Enter' && !submitBtn.disabled){
        submitBtn.click();
      }
    });
    
    // Submit handler
    submitBtn.addEventListener('click', () => {
      submitBtn.disabled = true;
      input.disabled = true;
      
      const guess = parseInt(input.value) || 0;
      const difference = Math.abs(dotCount - guess);
      
      // Calculate raw score: perfect = 100, decreases with difference
      // Each dot off reduces score by 4 points
      const rawScore = Math.max(0, 100 - (difference * 4));
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
          console.log('[EstimationGame] Win probability applied: success forced to loss, score:', finalScore);
        }
        
        if(outcome.didWin){
          console.log('[EstimationGame] Player won! Reasons:', outcome.reasons.join('; '));
        } else {
          console.log('[EstimationGame] Player lost. Reasons:', outcome.reasons.join('; '));
        }
      }
      
      onComplete(finalScore);
    });
    
    // Assemble UI
    wrapper.appendChild(title);
    wrapper.appendChild(instructions);
    wrapper.appendChild(canvas);
    wrapper.appendChild(input);
    wrapper.appendChild(submitBtn);
    container.appendChild(wrapper);
    
    // Focus input
    setTimeout(() => input.focus(), 100);
  }

  // Export to global minigames namespace
  if(typeof g.MiniGames === 'undefined') g.MiniGames = {};
  g.MiniGames.estimationGame = { render };

})(window);
