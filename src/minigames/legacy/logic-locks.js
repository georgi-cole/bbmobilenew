// MODULE: minigames/logic-locks.js
// Logic Locks - Solve logic puzzles using deduction

(function(g){
  'use strict';

  /**
   * Logic Locks minigame
   * Crack a 4-digit code using logic deduction (similar to Mastermind)
   * Bulls = correct digit in correct position
   * Cows = correct digit in wrong position
   * 
   * @param {HTMLElement} container - Container element for the game UI
   * @param {Function} onComplete - Callback function(score) when game ends
   * @param {Object} options - Configuration options
   */
  function render(container, onComplete, options = {}){
    container.innerHTML = '';
    
    const { 
      debugMode = false, 
      competitionMode = false
    } = options;
    
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:16px;padding:20px;';
    
    const title = document.createElement('h3');
    title.textContent = 'Logic Locks';
    title.style.cssText = 'margin:0;font-size:1.3rem;color:#e3ecf5;';
    
    const instructions = document.createElement('p');
    instructions.textContent = 'Crack the 4-digit code! Bulls=correct position, Cows=correct digit wrong position';
    instructions.style.cssText = 'margin:0;font-size:0.85rem;color:#95a9c0;text-align:center;max-width:350px;';
    
    const attemptsDiv = document.createElement('div');
    attemptsDiv.textContent = 'Attempts: 0/8';
    attemptsDiv.style.cssText = 'font-size:1rem;color:#83bfff;';
    
    // History of guesses
    const historyDiv = document.createElement('div');
    historyDiv.style.cssText = 'width:100%;max-width:300px;min-height:200px;background:#1a2332;border-radius:8px;padding:10px;margin:10px 0;overflow-y:auto;max-height:250px;';
    
    // Input area
    const inputDiv = document.createElement('div');
    inputDiv.style.cssText = 'display:flex;gap:8px;';
    
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = '0-9';
    input.maxLength = 4;
    input.style.cssText = 'width:120px;padding:10px;font-size:1.5rem;text-align:center;background:#1d2734;color:#e3ecf5;border:1px solid #2c3a4d;border-radius:5px;letter-spacing:4px;';
    
    const submitBtn = document.createElement('button');
    submitBtn.className = 'btn primary';
    submitBtn.textContent = 'Try';
    
    inputDiv.appendChild(input);
    inputDiv.appendChild(submitBtn);
    
    wrapper.appendChild(title);
    wrapper.appendChild(instructions);
    wrapper.appendChild(attemptsDiv);
    wrapper.appendChild(historyDiv);
    wrapper.appendChild(inputDiv);
    container.appendChild(wrapper);
    
    // Generate secret code (4 unique digits)
    const digits = [0,1,2,3,4,5,6,7,8,9];
    const rng = g.rng || Math.random;
    for(let i = digits.length - 1; i > 0; i--){
      const j = Math.floor(rng() * (i + 1));
      [digits[i], digits[j]] = [digits[j], digits[i]];
    }
    const secretCode = digits.slice(0, 4);
    
    let attempts = 0;
    const maxAttempts = 8;
    
    if(debugMode){
      console.log('[LogicLocks] Secret code:', secretCode.join(''));
    }
    
    function evaluateGuess(guess){
      const guessDigits = guess.split('').map(d => parseInt(d));
      
      let bulls = 0;
      let cows = 0;
      
      // Count bulls (exact matches)
      for(let i = 0; i < 4; i++){
        if(guessDigits[i] === secretCode[i]){
          bulls++;
        }
      }
      
      // Count cows (correct digit, wrong position)
      for(let i = 0; i < 4; i++){
        if(guessDigits[i] !== secretCode[i] && secretCode.includes(guessDigits[i])){
          cows++;
        }
      }
      
      return { bulls, cows };
    }
    
    function addToHistory(guess, bulls, cows){
      const entry = document.createElement('div');
      entry.style.cssText = 'padding:8px;margin:4px 0;background:#2c3a4d;border-radius:4px;display:flex;justify-content:space-between;align-items:center;';
      
      const guessSpan = document.createElement('span');
      guessSpan.textContent = guess;
      guessSpan.style.cssText = 'font-size:1.2rem;letter-spacing:3px;font-weight:bold;color:#e3ecf5;';
      
      const feedbackSpan = document.createElement('span');
      feedbackSpan.textContent = `🐂${bulls} 🐄${cows}`;
      feedbackSpan.style.cssText = 'font-size:0.9rem;color:#95a9c0;';
      
      entry.appendChild(guessSpan);
      entry.appendChild(feedbackSpan);
      historyDiv.appendChild(entry);
      historyDiv.scrollTop = historyDiv.scrollHeight;
    }
    
    function handleSubmit(){
      const guess = input.value.trim();
      
      // Validate
      if(guess.length !== 4 || !/^\d{4}$/.test(guess)){
        input.style.borderColor = '#ff6b6b';
        setTimeout(() => input.style.borderColor = '#2c3a4d', 500);
        return;
      }
      
      // Check for duplicates
      const uniqueDigits = new Set(guess.split(''));
      if(uniqueDigits.size !== 4){
        input.style.borderColor = '#ff6b6b';
        setTimeout(() => input.style.borderColor = '#2c3a4d', 500);
        return;
      }
      
      attempts++;
      attemptsDiv.textContent = `Attempts: ${attempts}/${maxAttempts}`;
      
      const result = evaluateGuess(guess);
      addToHistory(guess, result.bulls, result.cows);
      
      input.value = '';
      
      // Check win condition
      if(result.bulls === 4){
        // Won!
        finishGame(true);
        return;
      }
      
      // Check lose condition
      if(attempts >= maxAttempts){
        finishGame(false);
      }
    }
    
    function finishGame(won){
      submitBtn.disabled = true;
      input.disabled = true;
      
      if(won){
        instructions.textContent = `Cracked! Code was ${secretCode.join('')}`;
        instructions.style.color = '#74e48b';
      } else {
        instructions.textContent = `Failed! Code was ${secretCode.join('')}`;
        instructions.style.color = '#ff6b6b';
      }
      
      // Score: fewer attempts = higher score
      let rawScore;
      if(won){
        rawScore = Math.max(40, 100 - (attempts - 1) * 10);
      } else {
        rawScore = 25;
      }
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
          console.log('[LogicLocks] Win probability applied: success forced to loss, score:', finalScore);
        }
        
        if(outcome.didWin){
          console.log('[LogicLocks] Player won! Reasons:', outcome.reasons.join('; '));
        } else {
          console.log('[LogicLocks] Player lost. Reasons:', outcome.reasons.join('; '));
        }
      }
      
      setTimeout(() => onComplete(finalScore), 1500);
    }
    
    submitBtn.addEventListener('click', handleSubmit);
    input.addEventListener('keypress', (e) => {
      if(e.key === 'Enter'){
        handleSubmit();
      }
    });
    
    // Only allow digits
    input.addEventListener('input', () => {
      input.value = input.value.replace(/[^0-9]/g, '');
    });
    
    input.focus();
  }

  // Export
  if(typeof g.MiniGames === 'undefined') g.MiniGames = {};
  g.MiniGames.logicLocks = { render };

})(window);
