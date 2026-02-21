// MODULE: minigames/word-anagram.js
// Word Anagram - Unscramble Big Brother themed words
// Migrated from legacy minigames.js

(function(g){
  'use strict';

  /**
   * Word Anagram minigame
   * Player unscrambles 3 Big Brother-themed words
   * Score based on correctness across all 3 rounds
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
    title.textContent = 'Word Anagram';
    title.style.cssText = 'margin:0;font-size:1.2rem;color:#e3ecf5;';
    
    // Instructions
    const instructions = document.createElement('p');
    instructions.textContent = 'Unscramble the word';
    instructions.style.cssText = 'margin:0;font-size:0.9rem;color:#95a9c0;text-align:center;';
    
    // Round indicator
    const roundDiv = document.createElement('div');
    roundDiv.textContent = 'Word 1/3';
    roundDiv.style.cssText = 'font-size:1rem;color:#83bfff;font-weight:bold;';
    
    // Word pool (Big Brother themed)
    const words = [
      'alliance', 'strategy', 'competition', 'nominee', 'eviction',
      'jury', 'twist', 'backdoor', 'target', 'veto', 'houseguest',
      'power', 'final', 'vote', 'ceremony', 'betrayal'
    ];
    
    // Scrambled word display
    const scrambledDiv = document.createElement('div');
    scrambledDiv.style.cssText = 'font-size:2rem;font-weight:bold;color:#83bfff;letter-spacing:4px;margin:15px 0;';
    
    // Input field
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Type your answer';
    input.style.cssText = 'width:250px;padding:10px;font-size:1.1rem;text-align:center;background:#1d2734;color:#e3ecf5;border:1px solid #2c3a4d;border-radius:5px;';
    
    // Submit button
    const submitBtn = document.createElement('button');
    submitBtn.className = 'btn primary';
    submitBtn.textContent = 'Submit';
    
    // Assemble UI
    wrapper.appendChild(title);
    wrapper.appendChild(instructions);
    wrapper.appendChild(roundDiv);
    wrapper.appendChild(scrambledDiv);
    wrapper.appendChild(input);
    wrapper.appendChild(submitBtn);
    container.appendChild(wrapper);
    
    // Game state
    const rng = g.rng || Math.random;
    const selectedWords = [];
    let currentRound = 0;
    let totalScore = 0;
    let currentWord = '';
    
    // Select 3 unique words
    while(selectedWords.length < 3){
      const word = words[Math.floor(rng() * words.length)];
      if(!selectedWords.includes(word)){
        selectedWords.push(word);
      }
    }
    
    function startRound(){
      currentRound++;
      roundDiv.textContent = `Word ${currentRound}/3`;
      
      currentWord = selectedWords[currentRound - 1];
      
      // Scramble the word
      const scrambled = currentWord.split('').sort(() => rng() - 0.5).join('');
      scrambledDiv.textContent = scrambled.toUpperCase();
      
      input.value = '';
      input.maxLength = currentWord.length + 2;
      input.disabled = false;
      input.focus();
      
      submitBtn.disabled = false;
    }
    
    function evaluateRound(){
      submitBtn.disabled = true;
      input.disabled = true;
      
      const answer = input.value.trim().toLowerCase();
      let roundScore = 0;
      
      if(answer === currentWord){
        // Perfect match
        roundScore = 100;
        instructions.textContent = 'Correct!';
        instructions.style.color = '#74e48b';
      } else {
        // Partial credit for matching letters in correct positions
        for(let i = 0; i < Math.min(answer.length, currentWord.length); i++){
          if(answer[i] === currentWord[i]){
            roundScore += 5;
          }
        }
        instructions.textContent = `Incorrect! (${currentWord})`;
        instructions.style.color = '#ff6b6b';
      }
      
      totalScore += roundScore;
      
      setTimeout(() => {
        instructions.textContent = 'Unscramble the word';
        instructions.style.color = '#95a9c0';
        
        if(currentRound < 3){
          startRound();
        } else {
          finishGame();
        }
      }, 1500);
    }
    
    function finishGame(){
      const avgScore = Math.round(totalScore / 3);
      
      // Use MinigameScoring to calculate final score (SCALE=1000)
      const finalScore = g.MinigameScoring ? 
        g.MinigameScoring.calculateFinalScore({
          rawScore: avgScore,
          minScore: 0,
          maxScore: 100,
          compBeast: 0.5
        }) :
        avgScore * 10; // Fallback: scale to 0-1000
      
      setTimeout(() => onComplete(Math.round(finalScore)), 500);
    }
    
    // Handle Enter key
    input.addEventListener('keypress', (e) => {
      if(e.key === 'Enter' && !submitBtn.disabled){
        submitBtn.click();
      }
    });
    
    submitBtn.addEventListener('click', evaluateRound);
    
    // Start first round
    startRound();
  }

  // Export to global minigames namespace
  if(typeof g.MiniGames === 'undefined') g.MiniGames = {};
  g.MiniGames.wordAnagram = { render };

})(window);
