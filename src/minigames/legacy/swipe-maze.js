// MODULE: minigames/swipe-maze.js
// Swipe Maze - Navigate maze with swipe gestures

(function(g){
  'use strict';

  /**
   * Swipe Maze minigame
   * Navigate through a maze using swipe gestures or arrow keys
   * Score based on time and completion
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
    title.textContent = 'Swipe Maze';
    title.style.cssText = 'margin:0;font-size:1.3rem;color:#e3ecf5;';
    
    const instructions = document.createElement('p');
    instructions.textContent = 'Swipe or use arrows to reach the exit!';
    instructions.style.cssText = 'margin:0;font-size:0.9rem;color:#95a9c0;text-align:center;';
    
    const timerDiv = document.createElement('div');
    timerDiv.textContent = 'Time: 0s';
    timerDiv.style.cssText = 'font-size:1.2rem;font-weight:bold;color:#83bfff;';
    
    // Canvas for maze
    const canvas = document.createElement('canvas');
    const gridSize = 10;
    const tileSize = 30;
    canvas.width = gridSize * tileSize;
    canvas.height = gridSize * tileSize;
    canvas.style.cssText = 'border:3px solid #3d4f64;background:#1a2332;border-radius:4px;touch-action:none;';
    const ctx = canvas.getContext('2d');
    
    wrapper.appendChild(title);
    wrapper.appendChild(instructions);
    wrapper.appendChild(timerDiv);
    wrapper.appendChild(canvas);
    container.appendChild(wrapper);
    
    // Maze: 0=wall, 1=path, 2=player, 3=exit
    const maze = [
      [1,1,1,0,0,0,1,1,1,3],
      [0,0,1,0,1,1,1,0,1,0],
      [1,1,1,1,1,0,1,0,1,0],
      [1,0,0,0,1,0,1,0,1,1],
      [1,1,1,0,1,0,1,0,0,1],
      [0,0,1,0,1,1,1,1,0,1],
      [1,1,1,0,0,0,0,1,0,1],
      [1,0,1,1,1,1,0,1,0,1],
      [1,0,0,0,0,1,1,1,1,1],
      [2,1,1,1,1,1,0,0,0,0]
    ];
    
    let playerX = 0;
    let playerY = 9;
    let startTime = Date.now();
    let gameOver = false;
    let timerInterval = null;
    
    function draw(){
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      for(let y = 0; y < gridSize; y++){
        for(let x = 0; x < gridSize; x++){
          if(maze[y][x] === 0){
            // Wall
            ctx.fillStyle = '#2c3a4d';
            ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
          } else if(maze[y][x] === 3){
            // Exit
            ctx.fillStyle = '#74e48b';
            ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
          }
          
          // Draw grid lines
          ctx.strokeStyle = '#3d4f64';
          ctx.strokeRect(x * tileSize, y * tileSize, tileSize, tileSize);
        }
      }
      
      // Draw player
      ctx.fillStyle = '#83bfff';
      ctx.beginPath();
      ctx.arc(
        playerX * tileSize + tileSize/2,
        playerY * tileSize + tileSize/2,
        tileSize/3,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
    
    function move(dx, dy){
      if(gameOver) return;
      
      const newX = playerX + dx;
      const newY = playerY + dy;
      
      // Check bounds
      if(newX < 0 || newX >= gridSize || newY < 0 || newY >= gridSize) return;
      
      // Check wall
      if(maze[newY][newX] === 0) return;
      
      // Move player
      playerX = newX;
      playerY = newY;
      
      // Check exit
      if(maze[newY][newX] === 3){
        win();
      }
      
      draw();
    }
    
    function win(){
      gameOver = true;
      clearInterval(timerInterval);
      
      const elapsed = (Date.now() - startTime) / 1000;
      
      // Score: faster = better (target ~20s, max 60s)
      let rawScore;
      if(elapsed <= 15){
        rawScore = 100;
      } else if(elapsed <= 30){
        rawScore = 80 - (elapsed - 15);
      } else if(elapsed <= 45){
        rawScore = 65 - (elapsed - 30);
      } else {
        rawScore = Math.max(30, 50 - (elapsed - 45));
      }
      
      rawScore = Math.round(rawScore);
      
      instructions.textContent = `Complete! Time: ${elapsed.toFixed(1)}s`;
      instructions.style.color = '#74e48b';
      
      // Use MinigameScoring to calculate final score (SCALE=1000)
      const finalScore = g.MinigameScoring ? 
        g.MinigameScoring.calculateFinalScore({
          rawScore: rawScore,
          minScore: 0,
          maxScore: 100,
          compBeast: 0.5
        }) :
        rawScore * 10; // Fallback: scale to 0-1000
      
      setTimeout(() => onComplete(Math.round(finalScore)), 1500);
    }
    
    // Keyboard controls
    document.addEventListener('keydown', (e) => {
      if(gameOver) return;
      
      if(e.key === 'ArrowUp' || e.key === 'w'){
        e.preventDefault();
        move(0, -1);
      } else if(e.key === 'ArrowDown' || e.key === 's'){
        e.preventDefault();
        move(0, 1);
      } else if(e.key === 'ArrowLeft' || e.key === 'a'){
        e.preventDefault();
        move(-1, 0);
      } else if(e.key === 'ArrowRight' || e.key === 'd'){
        e.preventDefault();
        move(1, 0);
      }
    });
    
    // Touch/swipe controls
    let touchStartX = 0;
    let touchStartY = 0;
    
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    });
    
    canvas.addEventListener('touchend', (e) => {
      if(gameOver) return;
      e.preventDefault();
      
      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      
      const dx = touchEndX - touchStartX;
      const dy = touchEndY - touchStartY;
      
      // Determine swipe direction
      if(Math.abs(dx) > Math.abs(dy)){
        // Horizontal swipe
        if(Math.abs(dx) > 20){
          move(dx > 0 ? 1 : -1, 0);
        }
      } else {
        // Vertical swipe
        if(Math.abs(dy) > 20){
          move(0, dy > 0 ? 1 : -1);
        }
      }
    });
    
    // Timer
    timerInterval = setInterval(() => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      timerDiv.textContent = `Time: ${elapsed}s`;
    }, 100);
    
    // Initial draw
    draw();
  }

  // Export
  if(typeof g.MiniGames === 'undefined') g.MiniGames = {};
  g.MiniGames.swipeMaze = { render };

})(window);
