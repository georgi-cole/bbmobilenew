// MODULE: minigames/count-house.js
// Count House - Count objects appearing on screen quickly and accurately

(function(g){
  'use strict';

  function render(container, onComplete, options = {}){
    container.innerHTML = '';
    
    const { 
      debugMode = false, 
      competitionMode = false
    } = options;
    
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:16px;padding:20px;';
    
    const title = document.createElement('h3');
    title.textContent = 'Count House';
    title.style.cssText = 'margin:0;font-size:1.2rem;color:#e3ecf5;';
    
    // Use centralized HighScoreManager if available
    let bestScore = 0;
    if(g.HighScoreManager){
      const highScore = g.HighScoreManager.getHighScore('countHouse');
      bestScore = highScore ? highScore.score : 0;
    }
    
    const bestDisplay = document.createElement('div');
    bestDisplay.textContent = `Best: ${Math.round(bestScore)}`;
    bestDisplay.style.cssText = 'font-size:0.75rem;color:#95a9c0;';
    
    const instructions = document.createElement('p');
    instructions.textContent = 'Count the objects that appear, then enter your answer!';
    instructions.style.cssText = 'margin:0;font-size:0.9rem;color:#95a9c0;text-align:center;';
    
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 200;
    canvas.style.cssText = 'border:2px solid #2c3a4d;border-radius:8px;background:#0a0e14;';
    const ctx = canvas.getContext('2d');
    
    const inputGroup = document.createElement('div');
    inputGroup.style.cssText = 'display:flex;gap:8px;align-items:center;';
    
    const input = document.createElement('input');
    input.type = 'number';
    input.placeholder = 'Count?';
    input.style.cssText = 'width:100px;padding:8px;font-size:1rem;text-align:center;';
    input.disabled = true;
    
    const startBtn = document.createElement('button');
    startBtn.className = 'btn primary';
    startBtn.textContent = 'Start';
    
    const submitBtn = document.createElement('button');
    submitBtn.className = 'btn';
    submitBtn.textContent = 'Submit';
    submitBtn.disabled = true;
    
    const status = document.createElement('div');
    status.style.cssText = 'font-size:0.9rem;color:#83bfff;min-height:30px;text-align:center;';
    
    let actualCount = 0;
    let gameActive = false;
    let isPaused = false;
    
    // Pause on visibility change
    function handleVisibilityChange(){
      if(document.hidden && gameActive){
        isPaused = true;
        status.textContent = 'Game paused...';
      } else if(isPaused && gameActive){
        isPaused = false;
        status.textContent = 'Watch carefully!';
      }
    }
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    function drawObjects(){
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Generate random count of objects (5-20)
      actualCount = 5 + Math.floor(Math.random() * 16);
      
      // Choose random shape
      const shapes = ['circle', 'square', 'triangle', 'star'];
      const shape = shapes[Math.floor(Math.random() * shapes.length)];
      const colors = ['#83bfff', '#77d58d', '#f7b955', '#ff6d6d', '#b074ff'];
      
      for(let i = 0; i < actualCount; i++){
        const x = 20 + Math.random() * 260;
        const y = 20 + Math.random() * 160;
        const size = 8 + Math.random() * 8;
        const color = colors[Math.floor(Math.random() * colors.length)];
        
        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        
        switch(shape){
          case 'circle':
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
            break;
          case 'square':
            ctx.fillRect(x - size, y - size, size * 2, size * 2);
            break;
          case 'triangle':
            ctx.beginPath();
            ctx.moveTo(x, y - size);
            ctx.lineTo(x - size, y + size);
            ctx.lineTo(x + size, y + size);
            ctx.closePath();
            ctx.fill();
            break;
          case 'star':
            ctx.beginPath();
            for(let j = 0; j < 5; j++){
              const angle = (j * 4 * Math.PI) / 5 - Math.PI / 2;
              const radius = j % 2 === 0 ? size : size / 2;
              const px = x + radius * Math.cos(angle);
              const py = y + radius * Math.sin(angle);
              if(j === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fill();
            break;
        }
      }
    }
    
    startBtn.addEventListener('click', () => {
      gameActive = true;
      startBtn.disabled = true;
      status.textContent = 'Watch carefully!';
      
      // Show objects for 3 seconds
      drawObjects();
      
      setTimeout(() => {
        if(isPaused) return;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#95a9c0';
        ctx.font = '18px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('How many did you see?', canvas.width / 2, canvas.height / 2);
        
        input.disabled = false;
        submitBtn.disabled = false;
        status.textContent = 'Enter your count';
        input.focus();
      }, 3000);
    });
    
    submitBtn.addEventListener('click', () => {
      const userCount = parseInt(input.value) || 0;
      const difference = Math.abs(userCount - actualCount);
      
      // Calculate raw score: perfect = 100, -5 points per unit off, min 20
      const rawScore = Math.max(20, 100 - (difference * 5));
      
      // Check for new personal best (using raw score)
      let isNewBest = false;
      if(g.HighScoreManager){
        isNewBest = g.HighScoreManager.isNewBest('countHouse', rawScore);
        if(isNewBest){
          g.HighScoreManager.setHighScore('countHouse', rawScore, `${rawScore} points`);
          console.info(`[CountHouse] New personal best: ${rawScore} points!`);
        }
      }
      
      // Use MinigameScoring to calculate final score (SCALE=1000)
          const finalScore = g.MinigameScoring ? 
            g.MinigameScoring.calculateFinalScore({
              rawScore: rawScore,
              minScore: 0,
              maxScore: 100,
              compBeast: 0.5
            }) :
            rawScore * 10; // Fallback: scale to 0-1000
      
      status.textContent = `Actual: ${actualCount} | Your: ${userCount} | Score: ${Math.round(finalScore)}`;
      
      submitBtn.disabled = true;
      input.disabled = true;
      gameActive = false;
      
      // Cleanup
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      
      setTimeout(() => {
        // Return score data with metadata
        const scoreData = {
          score: Math.round(finalScore),
          rawScore: rawScore,
          rawScoreDisplay: `${rawScore} points`,
          isNewPersonalBest: isNewBest
        };
        onComplete(scoreData);
      }, 2000);
    });
    
    wrapper.appendChild(title);
    wrapper.appendChild(bestDisplay);
    wrapper.appendChild(instructions);
    wrapper.appendChild(canvas);
    inputGroup.appendChild(input);
    inputGroup.appendChild(submitBtn);
    wrapper.appendChild(inputGroup);
    wrapper.appendChild(startBtn);
    wrapper.appendChild(status);
    container.appendChild(wrapper);
  }

  // Export
  if(typeof g.MiniGames === 'undefined') g.MiniGames = {};
  g.MiniGames.countHouse = { render };

})(window);
