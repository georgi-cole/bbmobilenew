// MODULE: minigames/target-practice.js
// Target Practice - Click moving targets within time limit
// Migrated from legacy minigames.js

(function(g){
  'use strict';

  /**
   * Target Practice minigame
   * Player clicks/taps moving targets for 10 seconds
   * Score based on number of hits
   * Mobile-friendly with tap support
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
    title.textContent = 'Target Practice';
    title.style.cssText = 'margin:0;font-size:1.2rem;color:#e3ecf5;';
    
    // Instructions
    const instructions = document.createElement('p');
    instructions.textContent = 'Click the targets (10 seconds)';
    instructions.style.cssText = 'margin:0;font-size:0.9rem;color:#95a9c0;text-align:center;';
    
    // Game area
    const gameArea = document.createElement('div');
    gameArea.style.cssText = 'position:relative;width:100%;max-width:400px;height:250px;background:#0a1420;border:2px solid #2c3a4d;border-radius:8px;overflow:hidden;';
    
    // Target element
    const target = document.createElement('div');
    target.style.cssText = 'position:absolute;width:30px;height:30px;border-radius:50%;background:#6fd3ff;box-shadow:0 0 12px #6fd3ff;cursor:pointer;transition:transform 0.1s;';
    gameArea.appendChild(target);
    
    // Start button
    const startBtn = document.createElement('button');
    startBtn.className = 'btn primary';
    startBtn.textContent = 'Start';
    
    // Score display
    const scoreDisplay = document.createElement('div');
    scoreDisplay.textContent = 'Score: 0';
    scoreDisplay.style.cssText = 'font-size:1.1rem;color:#83bfff;min-height:30px;font-weight:bold;';
    
    // Game state
    let score = 0;
    let endTime = 0;
    let moveInterval = null;
    let gameActive = false;
    
    // Move target to random position
    function moveTarget(){
      if(!gameActive) return;
      
      const maxX = gameArea.clientWidth - 30;
      const maxY = gameArea.clientHeight - 30;
      
      const x = Math.random() * maxX;
      const y = Math.random() * maxY;
      
      target.style.left = x + 'px';
      target.style.top = y + 'px';
    }
    
    // Target click/tap handler
    target.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      if(Date.now() < endTime && gameActive){
        score += 10;
        scoreDisplay.textContent = `Score: ${score}`;
        
        // Visual feedback
        target.style.transform = 'scale(1.2)';
        setTimeout(() => {
          target.style.transform = 'scale(1)';
        }, 100);
        
        moveTarget();
      }
    });
    
    // Touch support
    target.addEventListener('touchstart', (e) => {
      e.preventDefault();
      target.click();
    });
    
    // Start button handler
    startBtn.addEventListener('click', () => {
      score = 0;
      scoreDisplay.textContent = 'Score: 0';
      endTime = Date.now() + 10000; // 10 seconds
      gameActive = true;
      startBtn.disabled = true;
      
      // Initial position
      moveTarget();
      
      // Auto-move targets every 700ms
      clearInterval(moveInterval);
      moveInterval = setInterval(() => {
        if(Date.now() >= endTime){
          clearInterval(moveInterval);
          gameActive = false;
          target.style.display = 'none';
          startBtn.disabled = true;
          
          // Calculate final score
          const rawScore = score;
          
          // Use MinigameScoring to calculate final score (SCALE=1000)
          const finalScore = g.MinigameScoring ? 
            g.MinigameScoring.calculateFinalScore({
              rawScore: rawScore,
              minScore: 0,
              maxScore: 100,
              compBeast: 0.5
            }) :
            rawScore * 10; // Fallback: scale to 0-1000
          
          // Complete game
          setTimeout(() => {
            onComplete(finalScore);
          }, 500);
        } else {
          moveTarget();
        }
      }, 700);
    });
    
    // Assemble UI
    wrapper.appendChild(title);
    wrapper.appendChild(instructions);
    wrapper.appendChild(gameArea);
    wrapper.appendChild(scoreDisplay);
    wrapper.appendChild(startBtn);
    container.appendChild(wrapper);
  }

  // Export to global minigames namespace
  if(typeof g.MiniGames === 'undefined') g.MiniGames = {};
  g.MiniGames.targetPractice = { render };

})(window);
