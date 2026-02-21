// MODULE: minigames/memory-zipline.js
// Memory Zipline - Remember path sequence while ziplining

(function(g){
  'use strict';

  /**
   * Memory Zipline minigame
   * Watch zipline path sequence, then recreate it
   * Score based on number of correct paths recalled
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
    title.textContent = 'Memory Zipline';
    title.style.cssText = 'margin:0;font-size:1.3rem;color:#e3ecf5;';
    
    const instructions = document.createElement('p');
    instructions.textContent = 'Watch the zipline path, then recreate it!';
    instructions.style.cssText = 'margin:0;font-size:0.9rem;color:#95a9c0;text-align:center;';
    
    const statusDiv = document.createElement('div');
    statusDiv.textContent = 'Round 1/3';
    statusDiv.style.cssText = 'font-size:1rem;color:#83bfff;font-weight:bold;';
    
    // Grid of platforms
    const gridDiv = document.createElement('div');
    gridDiv.style.cssText = 'display:grid;grid-template-columns:repeat(3,80px);gap:10px;margin:20px 0;';
    
    const submitBtn = document.createElement('button');
    submitBtn.className = 'btn primary';
    submitBtn.textContent = 'Submit Path';
    submitBtn.style.display = 'none';
    
    wrapper.appendChild(title);
    wrapper.appendChild(instructions);
    wrapper.appendChild(statusDiv);
    wrapper.appendChild(gridDiv);
    wrapper.appendChild(submitBtn);
    container.appendChild(wrapper);
    
    let sequence = [];
    let playerSequence = [];
    let currentRound = 1;
    const maxRounds = 3;
    let totalCorrect = 0;
    const platforms = [];
    
    // Create 3x3 grid of platforms
    for(let i = 0; i < 9; i++){
      const platform = document.createElement('div');
      platform.textContent = (i + 1);
      platform.style.cssText = 'width:80px;height:80px;background:#2c3a4d;border:2px solid #3d4f64;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:1.5rem;color:#95a9c0;cursor:pointer;transition:all 0.3s;';
      platform.dataset.index = i;
      
      platform.addEventListener('click', () => {
        if(submitBtn.style.display === 'none') return;
        
        // Toggle selection
        if(playerSequence.includes(i)){
          playerSequence = playerSequence.filter(idx => idx !== i);
          platform.style.background = '#2c3a4d';
          platform.style.borderColor = '#3d4f64';
        } else {
          playerSequence.push(i);
          platform.style.background = '#83bfff';
          platform.style.borderColor = '#83bfff';
          platform.style.color = '#1a2332';
        }
      });
      
      gridDiv.appendChild(platform);
      platforms.push(platform);
    }
    
    function showSequence(){
      instructions.textContent = 'Watch the zipline path...';
      submitBtn.style.display = 'none';
      
      // Generate sequence (length increases each round)
      const length = 3 + currentRound;
      sequence = [];
      for(let i = 0; i < length; i++){
        let next;
        do {
          next = Math.floor(Math.random() * 9);
        } while(sequence.includes(next));
        sequence.push(next);
      }
      
      // Show sequence with animation
      let i = 0;
      function highlightNext(){
        if(i >= sequence.length){
          setTimeout(startRecall, 500);
          return;
        }
        
        const platform = platforms[sequence[i]];
        platform.style.background = '#f7b955';
        platform.style.borderColor = '#f7b955';
        
        setTimeout(() => {
          platform.style.background = '#2c3a4d';
          platform.style.borderColor = '#3d4f64';
          i++;
          setTimeout(highlightNext, 300);
        }, 400);
      }
      
      highlightNext();
    }
    
    function startRecall(){
      instructions.textContent = 'Tap platforms in order!';
      playerSequence = [];
      submitBtn.style.display = 'block';
      
      // Reset platform styles
      platforms.forEach(p => {
        p.style.background = '#2c3a4d';
        p.style.borderColor = '#3d4f64';
        p.style.color = '#95a9c0';
      });
    }
    
    function evaluateRound(){
      submitBtn.disabled = true;
      
      // Check how many correct
      let correct = 0;
      for(let i = 0; i < Math.min(sequence.length, playerSequence.length); i++){
        if(sequence[i] === playerSequence[i]){
          correct++;
        } else {
          break; // Stop at first wrong answer
        }
      }
      
      totalCorrect += correct;
      
      // Show feedback
      platforms.forEach((p, idx) => {
        if(sequence.includes(idx)){
          p.style.background = '#74e48b';
          p.style.borderColor = '#74e48b';
        }
        if(playerSequence.includes(idx) && !sequence.includes(idx)){
          p.style.background = '#ff6b6b';
          p.style.borderColor = '#ff6b6b';
        }
      });
      
      setTimeout(() => {
        if(currentRound < maxRounds){
          currentRound++;
          statusDiv.textContent = `Round ${currentRound}/${maxRounds}`;
          submitBtn.disabled = false;
          showSequence();
        } else {
          finishGame();
        }
      }, 1500);
    }
    
    function finishGame(){
      // Total possible correct: 3+1=4, 3+2=5, 3+3=6 = 15 total
      const maxPossible = 15;
      const rawScore = Math.round((totalCorrect / maxPossible) * 100);
      
      // Use MinigameScoring to calculate final score (SCALE=1000)
      const finalScore = g.MinigameScoring ? 
        g.MinigameScoring.calculateFinalScore({
          rawScore: rawScore,
          minScore: 0,
          maxScore: 100,
          compBeast: 0.5
        }) :
        rawScore * 10; // Fallback: scale to 0-1000
      
      setTimeout(() => onComplete(Math.round(finalScore)), 500);
    }
    
    submitBtn.addEventListener('click', evaluateRound);
    
    // Start first round
    setTimeout(showSequence, 800);
  }

  // Export
  if(typeof g.MiniGames === 'undefined') g.MiniGames = {};
  g.MiniGames.memoryZipline = { render };

})(window);
