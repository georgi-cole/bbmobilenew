// MODULE: minigames/tetris.js
// Tetris - Classic falling blocks puzzle game

(function(g){
  'use strict';

  // Tetromino shapes (Standard Tetris pieces)
  const SHAPES = {
    I: [[1,1,1,1]], 
    O: [[1,1],[1,1]],
    T: [[0,1,0],[1,1,1]],
    S: [[0,1,1],[1,1,0]],
    Z: [[1,1,0],[0,1,1]],
    J: [[1,0,0],[1,1,1]],
    L: [[0,0,1],[1,1,1]]
  };

  const COLORS = {
    I: '#00f0f0',
    O: '#f0f000',
    T: '#a000f0',
    S: '#00f000',
    Z: '#f00000',
    J: '#0000f0',
    L: '#f0a000'
  };

  const SHAPE_KEYS = Object.keys(SHAPES);

  /**
   * Tetris minigame
   * Classic falling blocks with rotation, line clears, and scoring
   * 
   * @param {HTMLElement} container - Container element for the game UI
   * @param {Function} onComplete - Callback function(score) when game ends
   * @param {Object} options - Configuration options (seed for deterministic piece sequence)
   */
  function render(container, onComplete, options = {}){
    container.innerHTML = '';
    
    const { debugMode = false, seed } = options;
    
    // Seeded random for deterministic gameplay
    let rngSeed = seed || Date.now();
    function seededRandom() {
      rngSeed = (rngSeed * 9301 + 49297) % 233280;
      return rngSeed / 233280;
    }

    // Game constants
    const COLS = 10;
    const ROWS = 20;
    const CELL_SIZE = 20;
    
    // Game state
    let board = Array(ROWS).fill(null).map(() => Array(COLS).fill(0));
    let currentPiece = null;
    let currentX = 0;
    let currentY = 0;
    let nextPiece = null;
    let score = 0;
    let lines = 0;
    let level = 1;
    let gameOver = false;
    let dropTimer = 0;
    let dropInterval = 1000; // ms
    let lastTime = Date.now();

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:12px;padding:15px;';
    
    const title = document.createElement('h3');
    title.textContent = 'Tetris';
    title.style.cssText = 'margin:0;font-size:1.4rem;color:#e3ecf5;';
    
    // Show high score if available
    if(g.HighScoreManager){
      const highScoreDisplay = g.HighScoreManager.getHighScoreDisplay('tetris');
      if(highScoreDisplay){
        const highScoreEl = document.createElement('div');
        highScoreEl.textContent = highScoreDisplay;
        highScoreEl.style.cssText = 'font-size:0.8rem;color:#ffd96b;font-weight:600;margin:-8px 0 0 0;text-align:center;';
        title.insertAdjacentElement('afterend', highScoreEl);
      }
    }
    
    const statsDiv = document.createElement('div');
    statsDiv.style.cssText = 'display:flex;gap:20px;font-size:0.9rem;';
    
    const scoreDiv = document.createElement('div');
    scoreDiv.textContent = 'Score: 0';
    scoreDiv.style.cssText = 'color:#83bfff;font-weight:600;';
    
    const linesDiv = document.createElement('div');
    linesDiv.textContent = 'Lines: 0';
    linesDiv.style.cssText = 'color:#5bd68a;font-weight:600;';
    
    const levelDiv = document.createElement('div');
    levelDiv.textContent = 'Level: 1';
    levelDiv.style.cssText = 'color:#f7b955;font-weight:600;';
    
    statsDiv.appendChild(scoreDiv);
    statsDiv.appendChild(linesDiv);
    statsDiv.appendChild(levelDiv);
    
    const gameArea = document.createElement('div');
    gameArea.style.cssText = 'display:flex;gap:15px;';
    
    const canvas = document.createElement('canvas');
    canvas.width = COLS * CELL_SIZE;
    canvas.height = ROWS * CELL_SIZE;
    canvas.style.cssText = 'background:#1a1a1a;border:3px solid #5bd68a;border-radius:8px;';
    const ctx = canvas.getContext('2d');
    
    const nextCanvas = document.createElement('canvas');
    nextCanvas.width = 80;
    nextCanvas.height = 80;
    nextCanvas.style.cssText = 'background:#1a1a1a;border:2px solid #5bd68a;border-radius:8px;';
    const nextCtx = nextCanvas.getContext('2d');
    
    const nextLabel = document.createElement('div');
    nextLabel.textContent = 'Next:';
    nextLabel.style.cssText = 'font-size:0.9rem;color:#95a9c0;text-align:center;';
    
    const nextDiv = document.createElement('div');
    nextDiv.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
    nextDiv.appendChild(nextLabel);
    nextDiv.appendChild(nextCanvas);
    
    gameArea.appendChild(canvas);
    gameArea.appendChild(nextDiv);
    
    const controls = document.createElement('div');
    controls.style.cssText = 'display:grid;grid-template-columns:repeat(3, 1fr);gap:8px;max-width:240px;';
    
    const leftBtn = createButton('◄', 'Move Left');
    const rotateBtn = createButton('↻', 'Rotate');
    const rightBtn = createButton('►', 'Move Right');
    const softDropBtn = createButton('▼', 'Soft Drop');
    const hardDropBtn = createButton('⬇', 'Hard Drop');
    
    controls.appendChild(leftBtn);
    controls.appendChild(rotateBtn);
    controls.appendChild(rightBtn);
    controls.appendChild(document.createElement('div')); // Spacer
    controls.appendChild(softDropBtn);
    controls.appendChild(hardDropBtn);
    
    wrapper.appendChild(title);
    wrapper.appendChild(statsDiv);
    wrapper.appendChild(gameArea);
    wrapper.appendChild(controls);
    container.appendChild(wrapper);
    
    function createButton(text, label) {
      const btn = document.createElement('button');
      btn.textContent = text;
      btn.setAttribute('aria-label', label);
      btn.style.cssText = `
        min-height:50px;
        min-width:70px;
        padding:10px;
        font-size:1.4rem;
        font-weight:bold;
        background:linear-gradient(135deg, #5bd68a 0%, #4db878 100%);
        color:#1a1a1a;
        border:2px solid #4db878;
        border-radius:10px;
        cursor:pointer;
        touch-action:manipulation;
        transition:all 0.1s;
      `;
      return btn;
    }
    
    leftBtn.addEventListener('click', () => { if(!gameOver) move(-1); });
    rightBtn.addEventListener('click', () => { if(!gameOver) move(1); });
    rotateBtn.addEventListener('click', () => { if(!gameOver) rotate(); });
    softDropBtn.addEventListener('click', () => { if(!gameOver) softDrop(); });
    hardDropBtn.addEventListener('click', () => { if(!gameOver) hardDrop(); });
    
    // Keyboard controls
    document.addEventListener('keydown', handleKeyboard);
    
    function handleKeyboard(e) {
      if(gameOver) return;
      
      if(e.key === 'ArrowLeft') {
        move(-1);
        e.preventDefault();
      } else if(e.key === 'ArrowRight') {
        move(1);
        e.preventDefault();
      } else if(e.key === 'ArrowUp' || e.key === ' ') {
        rotate();
        e.preventDefault();
      } else if(e.key === 'ArrowDown') {
        softDrop();
        e.preventDefault();
      }
    }
    
    function getRandomPiece() {
      const key = SHAPE_KEYS[Math.floor(seededRandom() * SHAPE_KEYS.length)];
      return { shape: SHAPES[key], color: COLORS[key], key };
    }
    
    function spawnPiece() {
      currentPiece = nextPiece || getRandomPiece();
      nextPiece = getRandomPiece();
      currentX = Math.floor(COLS / 2) - Math.floor(currentPiece.shape[0].length / 2);
      currentY = 0;
      
      if(collision(currentX, currentY, currentPiece.shape)) {
        endGame();
      }
      
      drawNext();
    }
    
    function collision(x, y, shape) {
      for(let row = 0; row < shape.length; row++) {
        for(let col = 0; col < shape[row].length; col++) {
          if(shape[row][col]) {
            const newX = x + col;
            const newY = y + row;
            
            if(newX < 0 || newX >= COLS || newY >= ROWS) return true;
            if(newY >= 0 && board[newY][newX]) return true;
          }
        }
      }
      return false;
    }
    
    function move(dir) {
      if(!collision(currentX + dir, currentY, currentPiece.shape)) {
        currentX += dir;
      }
    }
    
    function rotate() {
      const rotated = currentPiece.shape[0].map((_, i) =>
        currentPiece.shape.map(row => row[i]).reverse()
      );
      
      if(!collision(currentX, currentY, rotated)) {
        currentPiece.shape = rotated;
      } else if(!collision(currentX + 1, currentY, rotated)) {
        currentX += 1;
        currentPiece.shape = rotated;
      } else if(!collision(currentX - 1, currentY, rotated)) {
        currentX -= 1;
        currentPiece.shape = rotated;
      }
    }
    
    function softDrop() {
      if(!collision(currentX, currentY + 1, currentPiece.shape)) {
        currentY++;
        score += 1;
        scoreDiv.textContent = `Score: ${score}`;
      }
    }
    
    function hardDrop() {
      while(!collision(currentX, currentY + 1, currentPiece.shape)) {
        currentY++;
        score += 2;
      }
      scoreDiv.textContent = `Score: ${score}`;
      lockPiece();
    }
    
    function drop() {
      if(!collision(currentX, currentY + 1, currentPiece.shape)) {
        currentY++;
      } else {
        lockPiece();
      }
    }
    
    function lockPiece() {
      for(let row = 0; row < currentPiece.shape.length; row++) {
        for(let col = 0; col < currentPiece.shape[row].length; col++) {
          if(currentPiece.shape[row][col]) {
            const y = currentY + row;
            const x = currentX + col;
            if(y >= 0 && y < ROWS && x >= 0 && x < COLS) {
              board[y][x] = currentPiece.color;
            }
          }
        }
      }
      
      clearLines();
      spawnPiece();
    }
    
    function clearLines() {
      let cleared = 0;
      
      for(let row = ROWS - 1; row >= 0; row--) {
        if(board[row].every(cell => cell !== 0)) {
          board.splice(row, 1);
          board.unshift(Array(COLS).fill(0));
          cleared++;
          row++; // Check same row again
        }
      }
      
      if(cleared > 0) {
        lines += cleared;
        linesDiv.textContent = `Lines: ${lines}`;
        
        // Scoring: 1 line = 100, 2 = 300, 3 = 500, 4 = 800
        const points = [0, 100, 300, 500, 800][cleared] * level;
        score += points;
        scoreDiv.textContent = `Score: ${score}`;
        
        // Level up every 10 lines
        const newLevel = Math.floor(lines / 10) + 1;
        if(newLevel > level) {
          level = newLevel;
          levelDiv.textContent = `Level: ${level}`;
          dropInterval = Math.max(100, 1000 - (level - 1) * 100);
        }
      }
    }
    
    function drawBoard() {
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, COLS * CELL_SIZE, ROWS * CELL_SIZE);
      
      // Draw locked pieces
      for(let row = 0; row < ROWS; row++) {
        for(let col = 0; col < COLS; col++) {
          if(board[row][col]) {
            ctx.fillStyle = board[row][col];
            ctx.fillRect(col * CELL_SIZE, row * CELL_SIZE, CELL_SIZE - 1, CELL_SIZE - 1);
          }
        }
      }
      
      // Draw current piece
      if(currentPiece) {
        ctx.fillStyle = currentPiece.color;
        for(let row = 0; row < currentPiece.shape.length; row++) {
          for(let col = 0; col < currentPiece.shape[row].length; col++) {
            if(currentPiece.shape[row][col]) {
              const x = (currentX + col) * CELL_SIZE;
              const y = (currentY + row) * CELL_SIZE;
              ctx.fillRect(x, y, CELL_SIZE - 1, CELL_SIZE - 1);
            }
          }
        }
      }
      
      // Draw grid
      ctx.strokeStyle = '#2a3a4a';
      ctx.lineWidth = 1;
      for(let i = 0; i <= COLS; i++) {
        ctx.beginPath();
        ctx.moveTo(i * CELL_SIZE, 0);
        ctx.lineTo(i * CELL_SIZE, ROWS * CELL_SIZE);
        ctx.stroke();
      }
      for(let i = 0; i <= ROWS; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * CELL_SIZE);
        ctx.lineTo(COLS * CELL_SIZE, i * CELL_SIZE);
        ctx.stroke();
      }
    }
    
    function drawNext() {
      nextCtx.fillStyle = '#1a1a1a';
      nextCtx.fillRect(0, 0, 80, 80);
      
      if(nextPiece) {
        nextCtx.fillStyle = nextPiece.color;
        const offsetX = (80 - nextPiece.shape[0].length * 15) / 2;
        const offsetY = (80 - nextPiece.shape.length * 15) / 2;
        
        for(let row = 0; row < nextPiece.shape.length; row++) {
          for(let col = 0; col < nextPiece.shape[row].length; col++) {
            if(nextPiece.shape[row][col]) {
              nextCtx.fillRect(
                offsetX + col * 15,
                offsetY + row * 15,
                14, 14
              );
            }
          }
        }
      }
    }
    
    function gameLoop() {
      if(gameOver) return;
      
      const now = Date.now();
      const delta = now - lastTime;
      lastTime = now;
      
      dropTimer += delta;
      if(dropTimer >= dropInterval) {
        drop();
        dropTimer = 0;
      }
      
      drawBoard();
      requestAnimationFrame(gameLoop);
    }
    
    function endGame() {
      if(gameOver) return;
      gameOver = true;
      
      document.removeEventListener('keydown', handleKeyboard);
      
      // Check for new personal best (using lines cleared as the metric)
      let isNewBest = false;
      if(g.HighScoreManager){
        isNewBest = g.HighScoreManager.isNewBest('tetris', lines);
        if(isNewBest){
          g.HighScoreManager.setHighScore('tetris', lines, `${lines} lines`);
          console.info(`[Tetris] New personal best: ${lines} lines!`);
        }
      }
      
      // Final score calculation
      // Normalize game score to 0-100 range as raw score
      const SCORE_SCALE_FACTOR = 1000; // Points needed for max normalized score
      const NORMALIZED_MAX = 100;      // Maximum normalized score
      const rawScore = Math.min(NORMALIZED_MAX, Math.floor((score / SCORE_SCALE_FACTOR) * NORMALIZED_MAX));
      
      // Use centralized scoring system (SCALE=1000)
      const finalScore = g.MinigameScoring ? 
        g.MinigameScoring.calculateFinalScore({
          rawScore: rawScore,
          minScore: 0,
          maxScore: 100,
          compBeast: 0.5
        }) :
        rawScore * 10; // Fallback: scale to 0-1000
      
      console.log(`[Tetris] Score: ${score}, Lines: ${lines}, Raw: ${rawScore}, Final: ${Math.round(finalScore)}`);
      
      const resultDiv = document.createElement('div');
      resultDiv.style.cssText = `
        position:fixed;
        top:50%;
        left:50%;
        transform:translate(-50%, -50%);
        background:#1a2a3a;
        padding:30px;
        border-radius:15px;
        border:3px solid #5bd68a;
        text-align:center;
        z-index:1000;
        min-width:280px;
      `;
      
      const resultText = document.createElement('div');
      resultText.textContent = '🎮 Game Over!';
      resultText.style.cssText = 'font-size:1.8rem;color:#ff6b9d;margin-bottom:15px;font-weight:bold;';
      
      const statsText = document.createElement('div');
      statsText.innerHTML = `
        <div style="color:#83bfff;font-size:1.1rem;margin-bottom:6px;">Score: ${score}</div>
        <div style="color:#5bd68a;font-size:1.1rem;margin-bottom:6px;">Lines: ${lines}</div>
        <div style="color:#f7b955;font-size:1.1rem;margin-bottom:12px;">Level: ${level}</div>
      `;
      
      // Add personal best indicator if applicable
      if(isNewBest){
        const pbText = document.createElement('div');
        pbText.textContent = '🏆 New Personal Best!';
        pbText.style.cssText = 'font-size:0.95rem;color:#ffd96b;font-weight:700;margin-bottom:10px;';
        statsText.appendChild(pbText);
      }
      
      const finalScoreText = document.createElement('div');
      finalScoreText.textContent = `Final: ${Math.round(finalScore)}`;
      finalScoreText.style.cssText = 'font-size:1.3rem;color:#5bd68a;font-weight:600;';
      
      resultDiv.appendChild(resultText);
      resultDiv.appendChild(statsText);
      resultDiv.appendChild(finalScoreText);
      container.appendChild(resultDiv);
      
      setTimeout(() => {
        if(typeof onComplete === 'function') {
          // Return score data with raw score info
          const scoreData = {
            score: Math.round(finalScore),
            rawScore: lines,
            rawScoreDisplay: `${lines} lines cleared`,
            isNewPersonalBest: isNewBest
          };
          onComplete(scoreData);
        }
      }, 3000);
    }
    
    // Initialize
    spawnPiece();
    drawBoard();
    gameLoop();
  }

  // Register module
  if(typeof g.MinigameModules !== 'undefined' && typeof g.MinigameModules.register === 'function'){
    g.MinigameModules.register('tetris', { render });
  } else {
    g.MinigameModules = g.MinigameModules || {};
    g.MinigameModules.tetris = { render };
    g.MiniGames = g.MiniGames || {};
    g.MiniGames.tetris = { render };
  }

  console.info('[Tetris] Module loaded');

})(window);
