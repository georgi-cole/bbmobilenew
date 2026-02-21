// MODULE: minigames/flash-flood.js
// Flash Flood - React to flash patterns quickly

(function(g){
  'use strict';

  function render(container, onComplete, options = {}){
    container.innerHTML = '';
    
    const { 
      debugMode = false, 
      competitionMode = false
    } = options;
    
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:16px;padding:20px;max-width:600px;margin:0 auto;';
    
    const title = document.createElement('h3');
    title.textContent = 'Flash Flood';
    title.style.cssText = 'margin:0;font-size:1.2rem;color:#e3ecf5;';
    
    const instructions = document.createElement('p');
    instructions.textContent = 'Click only the GREEN tiles as fast as you can!';
    instructions.style.cssText = 'margin:0;font-size:0.9rem;color:#95a9c0;text-align:center;';
    
    const scoreDiv = document.createElement('div');
    scoreDiv.textContent = 'Score: 0 | Errors: 0';
    scoreDiv.style.cssText = 'font-size:1rem;color:#83bfff;';
    
    const gridDiv = document.createElement('div');
    gridDiv.style.cssText = 'display:grid;grid-template-columns:repeat(5,70px);gap:8px;margin:20px 0;';
    
    const startBtn = document.createElement('button');
    startBtn.className = 'btn primary';
    startBtn.textContent = 'Start Game';
    
    wrapper.appendChild(title);
    wrapper.appendChild(instructions);
    wrapper.appendChild(scoreDiv);
    wrapper.appendChild(gridDiv);
    wrapper.appendChild(startBtn);
    container.appendChild(wrapper);
    
    let score = 0;
    let errors = 0;
    let gameActive = false;
    let flashInterval = null;
    let targetCount = 25; // Increased for bigger grid
    let flashed = 0;
    
    for(let i = 0; i < 25; i++){ // 5x5 = 25 tiles
      const tile = document.createElement('div');
      tile.style.cssText = `
        width:70px;height:70px;
        background:#2c3a4d;
        border-radius:8px;
        cursor:pointer;
        transition:background 0.1s;
      `;
      
      tile.addEventListener('click', () => {
        if(!gameActive) return;
        
        if(tile.dataset.active === 'true'){
          score++;
          tile.style.background = '#74e48b';
          tile.dataset.active = 'false';
          setTimeout(() => tile.style.background = '#2c3a4d', 200);
        } else {
          errors++;
          tile.style.background = '#ff6b6b';
          setTimeout(() => tile.style.background = '#2c3a4d', 200);
        }
        
        scoreDiv.textContent = `Score: ${score} | Errors: ${errors}`;
      });
      
      gridDiv.appendChild(tile);
    }
    
    function flashTile(){
      if(!gameActive || flashed >= targetCount) return;
      
      const tiles = Array.from(gridDiv.children);
      const tile = tiles[Math.floor(Math.random() * tiles.length)];
      
      tile.style.background = '#74e48b';
      tile.dataset.active = 'true';
      flashed++;
      
      setTimeout(() => {
        tile.style.background = '#2c3a4d';
        tile.dataset.active = 'false';
      }, 800);
      
      if(flashed >= targetCount){
        setTimeout(endGame, 2000);
      }
    }
    
    function endGame(){
      gameActive = false;
      clearInterval(flashInterval);
      
      // Calculate raw score based on hits vs errors
      const accuracy = score / (score + errors + 1);
      const rawScore = Math.min(100, Math.round(accuracy * 100));
      
      // Use MinigameScoring to calculate final score (SCALE=1000)
          const finalScore = g.MinigameScoring ? 
            g.MinigameScoring.calculateFinalScore({
              rawScore: rawScore,
              minScore: 0,
              maxScore: 100,
              compBeast: 0.5
            }) :
            rawScore * 10; // Fallback: scale to 0-1000
      
      if(onComplete) onComplete(finalScore);
    }
    
    startBtn.addEventListener('click', () => {
      gameActive = true;
      score = 0;
      errors = 0;
      flashed = 0;
      startBtn.disabled = true;
      scoreDiv.textContent = 'Score: 0 | Errors: 0';
      
      flashInterval = setInterval(flashTile, 600);
    });
  }

  if(typeof g.MiniGames === 'undefined') g.MiniGames = {};
  g.MiniGames.flashFlood = { render };

})(window);
