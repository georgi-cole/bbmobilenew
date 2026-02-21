// MODULE: minigames/key-master.js
// Key Master - Unlock sequences puzzle with bulls/cows feedback

(function(g){
  'use strict';

  /**
   * Key Master minigame
   * Guess 4-digit code with unique digits
   * Bulls = correct digit in correct position
   * Cows = correct digit in wrong position
   * Code revealed after 6 failed attempts
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
    wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:16px;padding:20px;max-width:600px;margin:0 auto;';
    
    const title = document.createElement('h3');
    title.textContent = 'Key Master';
    title.style.cssText = 'margin:0;font-size:1.2rem;color:#e3ecf5;';
    
    const instructions = document.createElement('p');
    instructions.textContent = 'Crack the 4-digit code! Bulls=correct position, Cows=correct digit wrong position';
    instructions.style.cssText = 'margin:0;font-size:0.85rem;color:#95a9c0;text-align:center;max-width:400px;';
    
    const displayDiv = document.createElement('div');
    displayDiv.textContent = '____';
    displayDiv.style.cssText = 'font-size:3rem;font-weight:bold;color:#83bfff;font-family:monospace;letter-spacing:10px;';
    
    const feedbackDiv = document.createElement('div');
    feedbackDiv.style.cssText = 'min-height:30px;color:#95a9c0;text-align:center;font-size:1.1rem;';
    
    // History of guesses
    const historyDiv = document.createElement('div');
    historyDiv.style.cssText = 'width:100%;max-width:350px;min-height:150px;background:#1a2332;border-radius:8px;padding:10px;margin:10px 0;overflow-y:auto;max-height:200px;';
    
    const inputDiv = document.createElement('div');
    inputDiv.style.cssText = 'display:grid;grid-template-columns:repeat(3,70px);gap:8px;';
    
    const attemptsDiv = document.createElement('div');
    attemptsDiv.textContent = 'Attempts: 0/6';
    attemptsDiv.style.cssText = 'font-size:0.9rem;color:#95a9c0;';
    
    wrapper.appendChild(title);
    wrapper.appendChild(instructions);
    wrapper.appendChild(displayDiv);
    wrapper.appendChild(feedbackDiv);
    wrapper.appendChild(historyDiv);
    wrapper.appendChild(inputDiv);
    wrapper.appendChild(attemptsDiv);
    container.appendChild(wrapper);
    
    // Generate code with 4 unique digits
    const digits = [0,1,2,3,4,5,6,7,8,9];
    const rng = g.rng || Math.random;
    for(let i = digits.length - 1; i > 0; i--){
      const j = Math.floor(rng() * (i + 1));
      [digits[i], digits[j]] = [digits[j], digits[i]];
    }
    const code = digits.slice(0, 4).join('');
    
    let input = '';
    let attempts = 0;
    const maxAttempts = 6;
    let gameOver = false;
    
    if(debugMode){
      console.log('[KeyMaster] Secret code:', code);
    }
    
    function evaluateGuess(guess){
      const guessDigits = guess.split('');
      const codeDigits = code.split('');
      
      let bulls = 0;
      let cows = 0;
      
      // Count bulls (exact matches)
      for(let i = 0; i < 4; i++){
        if(guessDigits[i] === codeDigits[i]){
          bulls++;
        }
      }
      
      // Count cows (correct digit, wrong position)
      for(let i = 0; i < 4; i++){
        if(guessDigits[i] !== codeDigits[i] && codeDigits.includes(guessDigits[i])){
          cows++;
        }
      }
      
      return {bulls, cows};
    }
    
    function addToHistory(guess, bulls, cows){
      const entry = document.createElement('div');
      entry.style.cssText = 'padding:8px;margin:4px 0;background:#2c3a4d;border-radius:4px;display:flex;justify-content:space-between;align-items:center;';
      
      const guessSpan = document.createElement('span');
      guessSpan.textContent = guess;
      guessSpan.style.cssText = 'font-size:1.2rem;letter-spacing:3px;font-weight:bold;color:#e3ecf5;font-family:monospace;';
      
      const feedbackSpan = document.createElement('span');
      feedbackSpan.textContent = `🐂${bulls} 🐄${cows}`;
      feedbackSpan.style.cssText = 'font-size:0.9rem;color:#95a9c0;';
      
      entry.appendChild(guessSpan);
      entry.appendChild(feedbackSpan);
      historyDiv.appendChild(entry);
      historyDiv.scrollTop = historyDiv.scrollHeight;
    }
    
    function handleInput(){
      if(input.length === 4 && !gameOver){
        // Check for duplicate digits
        const uniqueDigits = new Set(input.split(''));
        if(uniqueDigits.size !== 4){
          feedbackDiv.textContent = '❌ No duplicate digits allowed!';
          feedbackDiv.style.color = '#ff6b6b';
          input = '';
          displayDiv.textContent = '____';
          return;
        }
        
        attempts++;
        attemptsDiv.textContent = `Attempts: ${attempts}/${maxAttempts}`;
        
        const result = evaluateGuess(input);
        addToHistory(input, result.bulls, result.cows);
        
        if(result.bulls === 4){
          // Won!
          feedbackDiv.textContent = '✅ Unlocked!';
          feedbackDiv.style.color = '#74e48b';
          gameOver = true;
          
          setTimeout(() => {
            const rawScore = Math.max(40, 100 - (attempts - 1) * 15);
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
                console.log('[KeyMaster] Win probability applied: success forced to loss, score:', finalScore);
              }
              
              if(outcome.didWin){
                console.log('[KeyMaster] Player won! Reasons:', outcome.reasons.join('; '));
              } else {
                console.log('[KeyMaster] Player lost. Reasons:', outcome.reasons.join('; '));
              }
            }
            
            if(onComplete) onComplete(finalScore);
          }, 1000);
        } else if(attempts >= maxAttempts){
          // Failed - reveal code
          gameOver = true;
          feedbackDiv.textContent = `Code revealed: ${code}`;
          feedbackDiv.style.color = '#ff6b6b';
          displayDiv.textContent = code;
          
          setTimeout(() => {
            if(onComplete) onComplete(20);
          }, 2000);
        } else {
          feedbackDiv.textContent = `${result.bulls} Bulls, ${result.cows} Cows`;
          feedbackDiv.style.color = '#95a9c0';
        }
        
        input = '';
        displayDiv.textContent = '____';
      }
    }
    
    // Number pad
    for(let i = 0; i <= 9; i++){
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = i;
      btn.style.cssText = 'height:70px;font-size:1.5rem;';
      
      btn.addEventListener('click', () => {
        if(gameOver) return;
        
        if(input.length < 4){
          input += i;
          displayDiv.textContent = input + '____'.substring(input.length);
          handleInput();
        }
      });
      
      inputDiv.appendChild(btn);
    }
    
    const clearBtn = document.createElement('button');
    clearBtn.className = 'btn';
    clearBtn.textContent = 'Clear';
    clearBtn.addEventListener('click', () => {
      if(!gameOver){
        input = '';
        displayDiv.textContent = '____';
      }
    });
    inputDiv.appendChild(clearBtn);
  }

  if(typeof g.MiniGames === 'undefined') g.MiniGames = {};
  g.MiniGames.keyMaster = { render };

})(window);
