// MODULE: minigames/hangman.js
// Hangman - Classic word guessing game with on-screen keyboard

(function(g){
  'use strict';

  const WORDS = [
    'VETO', 'JURY', 'VOTE', 'EVICT', 'ALLIANCE', 'BACKDOOR', 'FLOATER',
    'PAWN', 'TARGET', 'NOMINATED', 'COMPETITION', 'STRATEGY', 'HOUSEGUEST',
    'FINAL', 'POWER', 'TWIST', 'BETRAYAL', 'CEREMONY', 'SHOWMANCE'
  ];

  const MAX_WRONG = 6;

  /**
   * Hangman minigame
   * Guess letters to reveal a Big Brother related word
   * 
   * @param {HTMLElement} container - Container element for the game UI
   * @param {Function} onComplete - Callback function(score) when game ends
   * @param {Object} options - Configuration options
   */
  function render(container, onComplete, options = {}){
    container.innerHTML = '';
    
    const { debugMode = false } = options;
    
    // Game state
    const word = WORDS[Math.floor(Math.random() * WORDS.length)];
    const guessed = new Set();
    let wrongCount = 0;
    const startTime = Date.now();
    let gameOver = false;

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:20px;padding:20px;max-width:600px;margin:0 auto;';
    
    // Title
    const title = document.createElement('h3');
    title.textContent = 'Hangman';
    title.style.cssText = 'margin:0;font-size:1.5rem;color:#e3ecf5;';
    
    // Instructions
    const instructions = document.createElement('p');
    instructions.textContent = 'Guess the Big Brother word!';
    instructions.style.cssText = 'margin:0;font-size:1rem;color:#95a9c0;text-align:center;';
    
    // Wrong count display
    const wrongDiv = document.createElement('div');
    wrongDiv.textContent = `Wrong: 0/${MAX_WRONG}`;
    wrongDiv.style.cssText = 'font-size:1.1rem;font-weight:bold;color:#ff6b9d;';
    wrongDiv.setAttribute('aria-live', 'polite');
    
    // Gallows/figure display (SVG)
    const gallowsDiv = document.createElement('div');
    gallowsDiv.style.cssText = 'width:200px;height:250px;margin:10px auto;';
    gallowsDiv.innerHTML = `
      <svg width="200" height="250" viewBox="0 0 200 250" style="background:#0a0a0a;border-radius:8px;">
        <!-- Base -->
        <line x1="20" y1="230" x2="120" y2="230" stroke="#5bd68a" stroke-width="4"/>
        <!-- Pole -->
        <line x1="50" y1="230" x2="50" y2="20" stroke="#5bd68a" stroke-width="4"/>
        <!-- Top beam -->
        <line x1="50" y1="20" x2="130" y2="20" stroke="#5bd68a" stroke-width="4"/>
        <!-- Rope -->
        <line x1="130" y1="20" x2="130" y2="50" stroke="#5bd68a" stroke-width="2"/>
        
        <!-- Figure parts (initially hidden) -->
        <!-- Head -->
        <circle id="hangman-head" cx="130" cy="70" r="20" stroke="#ff6b9d" stroke-width="3" fill="none" opacity="0"/>
        <!-- Torso -->
        <line id="hangman-torso" x1="130" y1="90" x2="130" y2="150" stroke="#ff6b9d" stroke-width="3" opacity="0"/>
        <!-- Left arm -->
        <line id="hangman-left-arm" x1="130" y1="110" x2="100" y2="130" stroke="#ff6b9d" stroke-width="3" opacity="0"/>
        <!-- Right arm -->
        <line id="hangman-right-arm" x1="130" y1="110" x2="160" y2="130" stroke="#ff6b9d" stroke-width="3" opacity="0"/>
        <!-- Left leg -->
        <line id="hangman-left-leg" x1="130" y1="150" x2="105" y2="190" stroke="#ff6b9d" stroke-width="3" opacity="0"/>
        <!-- Right leg -->
        <line id="hangman-right-leg" x1="130" y1="150" x2="155" y2="190" stroke="#ff6b9d" stroke-width="3" opacity="0"/>
      </svg>
    `;
    gallowsDiv.setAttribute('aria-label', 'Hangman figure');
    gallowsDiv.setAttribute('role', 'img');
    
    // Word display
    const wordDisplay = document.createElement('div');
    wordDisplay.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;justify-content:center;min-height:60px;align-items:center;';
    wordDisplay.setAttribute('aria-live', 'polite');
    wordDisplay.setAttribute('aria-label', 'Word to guess');
    
    // Keyboard container
    const keyboardDiv = document.createElement('div');
    keyboardDiv.style.cssText = 'display:grid;grid-template-columns:repeat(7, 1fr);gap:8px;max-width:500px;width:100%;';
    keyboardDiv.setAttribute('role', 'group');
    keyboardDiv.setAttribute('aria-label', 'Letter keyboard');
    
    // Give up button
    const giveUpBtn = document.createElement('button');
    giveUpBtn.textContent = 'Give Up';
    giveUpBtn.style.cssText = 'min-height:44px;min-width:120px;padding:12px 24px;font-size:1rem;background:#666;color:#fff;border:none;border-radius:10px;cursor:pointer;font-weight:600;';
    giveUpBtn.addEventListener('click', () => {
      if(!gameOver){
        endGame(false);
      }
    });
    
    wrapper.appendChild(title);
    wrapper.appendChild(instructions);
    wrapper.appendChild(wrongDiv);
    wrapper.appendChild(gallowsDiv);
    wrapper.appendChild(wordDisplay);
    wrapper.appendChild(keyboardDiv);
    wrapper.appendChild(giveUpBtn);
    container.appendChild(wrapper);

    // Create letter buttons
    for(let i = 0; i < 26; i++){
      const letter = String.fromCharCode(65 + i); // A-Z
      const btn = document.createElement('button');
      btn.textContent = letter;
      btn.dataset.letter = letter;
      btn.style.cssText = `
        min-height:44px;
        min-width:44px;
        padding:10px;
        font-size:1.1rem;
        font-weight:bold;
        background:linear-gradient(135deg, #5bd68a 0%, #4db878 100%);
        color:#1a1a1a;
        border:2px solid #4db878;
        border-radius:10px;
        cursor:pointer;
        transition:all 0.2s;
        touch-action:manipulation;
      `;
      btn.setAttribute('aria-label', `Letter ${letter}`);
      
      btn.addEventListener('click', () => {
        if(gameOver || guessed.has(letter)) return;
        guessLetter(letter);
      });
      
      keyboardDiv.appendChild(btn);
    }

    function updateWordDisplay(){
      wordDisplay.innerHTML = '';
      for(const char of word){
        const letterBox = document.createElement('div');
        letterBox.style.cssText = `
          width:40px;
          height:50px;
          display:flex;
          align-items:center;
          justify-content:center;
          font-size:1.5rem;
          font-weight:bold;
          color:#e3ecf5;
          background:${guessed.has(char) ? '#2a4a5a' : '#1a1a1a'};
          border:2px solid #5bd68a;
          border-radius:8px;
        `;
        letterBox.textContent = guessed.has(char) ? char : '';
        wordDisplay.appendChild(letterBox);
      }
    }
    
    function updateGallows(){
      // Show body parts progressively based on wrong count
      // 1: head, 2: torso, 3: left arm, 4: right arm, 5: left leg, 6: right leg
      const parts = [
        'hangman-head',
        'hangman-torso', 
        'hangman-left-arm',
        'hangman-right-arm',
        'hangman-left-leg',
        'hangman-right-leg'
      ];
      
      // Show parts up to wrongCount
      for(let i = 0; i < parts.length; i++){
        const part = document.getElementById(parts[i]);
        if(part){
          part.setAttribute('opacity', i < wrongCount ? '1' : '0');
        }
      }
    }

    function guessLetter(letter){
      if(gameOver || guessed.has(letter)) return;
      
      guessed.add(letter);
      
      // Update button appearance
      const btn = keyboardDiv.querySelector(`[data-letter="${letter}"]`);
      if(btn){
        if(word.includes(letter)){
          btn.style.background = '#5bd68a';
          btn.style.borderColor = '#5bd68a';
        } else {
          wrongCount++;
          btn.style.background = '#ff6b9d';
          btn.style.borderColor = '#ff6b9d';
          btn.style.color = '#1a1a1a';
        }
        btn.style.cursor = 'not-allowed';
        btn.style.opacity = '0.5';
        btn.disabled = true;
      }
      
      wrongDiv.textContent = `Wrong: ${wrongCount}/${MAX_WRONG}`;
      updateGallows();
      updateWordDisplay();
      
      // Check win/lose
      if(wrongCount >= MAX_WRONG){
        endGame(false);
      } else {
        const allGuessed = word.split('').every(char => guessed.has(char));
        if(allGuessed){
          endGame(true);
        }
      }
    }

    function endGame(won){
      if(gameOver) return;
      gameOver = true;
      
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      
      let rawScore = 0;
      if(won){
        // Base score for winning
        rawScore = 100;
        
        // Bonus for fewer wrong guesses
        const wrongPenalty = wrongCount * 8;
        rawScore -= wrongPenalty;
        
        // Time bonus (faster is better, cap at 120 seconds)
        const timePenalty = Math.min(elapsed, 120) * 0.5;
        rawScore -= timePenalty;
        
        rawScore = Math.max(0, Math.round(rawScore));
      }
      
      // Use centralized scoring system (SCALE=1000)
      const score = g.MinigameScoring ? 
        g.MinigameScoring.calculateFinalScore({
          rawScore: rawScore,
          minScore: 0,
          maxScore: 100,
          compBeast: 0.5
        }) :
        rawScore * 10; // Fallback: scale to 0-1000
      
      console.log(`[Hangman] Won: ${won}, Wrong guesses: ${wrongCount}, Raw: ${rawScore}, Final: ${Math.round(score)}`);
      
      // Show result
      const resultDiv = document.createElement('div');
      resultDiv.style.cssText = `
        position:fixed;
        top:50%;
        left:50%;
        transform:translate(-50%, -50%);
        background:#1a2a3a;
        padding:30px;
        border-radius:15px;
        border:3px solid ${won ? '#5bd68a' : '#ff6b9d'};
        text-align:center;
        z-index:1000;
        min-width:250px;
      `;
      
      const resultText = document.createElement('div');
      resultText.textContent = won ? '🎉 You Won!' : '😞 Game Over';
      resultText.style.cssText = `font-size:1.8rem;color:${won ? '#5bd68a' : '#ff6b9d'};margin-bottom:15px;font-weight:bold;`;
      
      const wordReveal = document.createElement('div');
      wordReveal.textContent = `Word: ${word}`;
      wordReveal.style.cssText = 'font-size:1.3rem;color:#e3ecf5;margin-bottom:10px;';
      
      const scoreText = document.createElement('div');
      scoreText.textContent = `Score: ${Math.round(score)}`;
      scoreText.style.cssText = 'font-size:1.2rem;color:#83bfff;font-weight:600;';
      
      resultDiv.appendChild(resultText);
      resultDiv.appendChild(wordReveal);
      resultDiv.appendChild(scoreText);
      container.appendChild(resultDiv);
      
      // Disable all buttons
      keyboardDiv.querySelectorAll('button').forEach(btn => {
        btn.disabled = true;
        btn.style.cursor = 'not-allowed';
        btn.style.opacity = '0.5';
      });
      giveUpBtn.disabled = true;
      
      setTimeout(() => {
        if(typeof onComplete === 'function'){
          onComplete(Math.round(score));
        }
      }, 3000);
    }

    updateWordDisplay();
  }

  // Register module (both MinigameModules and legacy MiniGames)
  if(typeof g.MinigameModules !== 'undefined' && typeof g.MinigameModules.register === 'function'){
    g.MinigameModules.register('hangman', { render });
  } else {
    // Fallback to direct registration
    g.MinigameModules = g.MinigameModules || {};
    g.MinigameModules.hangman = { render };
    g.MiniGames = g.MiniGames || {};
    g.MiniGames.hangman = { render };
  }

  console.info('[Hangman] Module loaded');

})(window);
