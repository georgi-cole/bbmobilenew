// MODULE: minigames/grid-lock.js
// Grid Lock - Unlock grid patterns puzzle

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
    title.textContent = 'Grid Lock';
    title.style.cssText = 'margin:0;font-size:1.2rem;color:#e3ecf5;';
    
    const instructions = document.createElement('p');
    instructions.textContent = 'Click tiles to toggle them. Make all tiles the same color!';
    instructions.style.cssText = 'margin:0;font-size:0.9rem;color:#95a9c0;text-align:center;';
    
    const movesDiv = document.createElement('div');
    movesDiv.textContent = 'Moves: 0';
    movesDiv.style.cssText = 'font-size:1rem;color:#83bfff;';
    
    const gridDiv = document.createElement('div');
    gridDiv.style.cssText = 'display:grid;grid-template-columns:repeat(4,70px);gap:8px;margin:20px 0;';
    
    wrapper.appendChild(title);
    wrapper.appendChild(instructions);
    wrapper.appendChild(movesDiv);
    wrapper.appendChild(gridDiv);
    container.appendChild(wrapper);
    
    let moves = 0;
    let grid = [];
    
    for(let i = 0; i < 16; i++){
      const tile = document.createElement('div');
      tile.style.cssText = `
        width:70px;height:70px;
        background:${Math.random() > 0.5 ? '#6fd3ff' : '#2c3a4d'};
        border-radius:8px;cursor:pointer;
        transition:background 0.2s;
      `;
      tile.dataset.state = tile.style.background.includes('6fd3ff') ? '1' : '0';
      
      tile.addEventListener('click', () => {
        moves++;
        movesDiv.textContent = `Moves: ${moves}`;
        
        // Toggle this tile and adjacent tiles
        const index = grid.indexOf(tile);
        const row = Math.floor(index / 4);
        const col = index % 4;
        
        function toggle(idx){
          if(idx < 0 || idx >= 16) return;
          const t = grid[idx];
          const state = t.dataset.state === '1' ? '0' : '1';
          t.dataset.state = state;
          t.style.background = state === '1' ? '#6fd3ff' : '#2c3a4d';
        }
        
        toggle(index);
        if(row > 0) toggle(index - 4);
        if(row < 3) toggle(index + 4);
        if(col > 0) toggle(index - 1);
        if(col < 3) toggle(index + 1);
        
        // Check if all same
        setTimeout(() => {
          const states = grid.map(t => t.dataset.state);
          const allSame = states.every(s => s === states[0]);
          
          if(allSame){
            // Calculate raw score based on moves (less moves = better score)
            const rawScore = Math.max(30, 100 - moves * 3);
            
            // Use MinigameScoring to normalize to 0-1000 scale
            const finalScore = g.MinigameScoring ? 
              g.MinigameScoring.calculateFinalScore({
                rawScore: rawScore,
                minScore: 30,
                maxScore: 100,
                compBeast: 0.5
              }) :
              rawScore * 10; // Fallback: scale to 0-1000
            
            if(onComplete) onComplete(Math.round(finalScore));
          }
        }, 100);
      });
      
      gridDiv.appendChild(tile);
      grid.push(tile);
    }
  }

  if(typeof g.MiniGames === 'undefined') g.MiniGames = {};
  g.MiniGames.gridLock = { render };

})(window);
