// MODULE: minigames/minesweeper.js
// Minesweeps - Classic minesweeper puzzle game

(function(g){
  'use strict';

  /**
   * Seeded random for deterministic mine placement
   */
  function SeededRandom(seed) {
    this.seed = seed || Date.now();
    this.next = function() {
      this.seed = (this.seed * 9301 + 49297) % 233280;
      return this.seed / 233280;
    };
  }

  /**
   * Minesweeps minigame
   * Classic minesweeper - reveal all safe cells without hitting mines
   * 
   * @param {HTMLElement} container - Container element
   * @param {Function} onComplete - Callback function(score)
   * @param {Object} options - Configuration (seed for determinism)
   */
  function render(container, onComplete, options = {}) {
    container.innerHTML = '';
    
    const { debugMode = false, seed } = options;
    const rng = new SeededRandom(seed);
    
    // Game constants
    const ROWS = 9;
    const COLS = 9;
    const MINES = 10;
    const CELL_SIZE = 35;
    
    // Game state
    let board = [];
    let revealed = [];
    let flagged = [];
    let gameOver = false;
    let won = false;
    let startTime = Date.now();
    let firstClick = true;
    let flagMode = false;

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:12px;padding:15px;';
    
    const title = document.createElement('h3');
    title.textContent = 'Minesweeps';
    title.style.cssText = 'margin:0;font-size:1.4rem;color:#e3ecf5;';
    
    const instructions = document.createElement('p');
    instructions.textContent = 'Reveal all safe squares. Long-press or use flag button to mark mines!';
    instructions.style.cssText = 'margin:0;font-size:0.85rem;color:#95a9c0;text-align:center;max-width:350px;';
    
    const statsDiv = document.createElement('div');
    statsDiv.style.cssText = 'display:flex;gap:16px;font-size:0.9rem;align-items:center;';
    
    const minesDiv = document.createElement('div');
    minesDiv.textContent = `💣 ${MINES}`;
    minesDiv.style.cssText = 'color:#ff6b9d;font-weight:600;';
    
    const timerDiv = document.createElement('div');
    timerDiv.textContent = '⏱️ 0s';
    timerDiv.style.cssText = 'color:#83bfff;font-weight:600;';
    
    const flagBtn = document.createElement('button');
    flagBtn.textContent = '🚩';
    flagBtn.style.cssText = `
      min-height:44px;
      min-width:44px;
      padding:8px;
      font-size:1.2rem;
      background:#2a3a4a;
      color:#fff;
      border:2px solid #5bd68a;
      border-radius:8px;
      cursor:pointer;
    `;
    
    statsDiv.appendChild(minesDiv);
    statsDiv.appendChild(timerDiv);
    statsDiv.appendChild(flagBtn);
    
    const canvas = document.createElement('canvas');
    canvas.width = COLS * CELL_SIZE;
    canvas.height = ROWS * CELL_SIZE;
    canvas.style.cssText = 'background:#1a1a1a;border:3px solid #5bd68a;border-radius:8px;touch-action:none;cursor:pointer;';
    const ctx = canvas.getContext('2d');
    
    wrapper.appendChild(title);
    wrapper.appendChild(instructions);
    wrapper.appendChild(statsDiv);
    wrapper.appendChild(canvas);
    container.appendChild(wrapper);
    
    function initBoard(avoidRow, avoidCol) {
      // Initialize empty board
      board = Array(ROWS).fill(null).map(() => Array(COLS).fill(0));
      revealed = Array(ROWS).fill(null).map(() => Array(COLS).fill(false));
      flagged = Array(ROWS).fill(null).map(() => Array(COLS).fill(false));
      
      // Place mines (avoid first click position)
      let minesPlaced = 0;
      while(minesPlaced < MINES) {
        const row = Math.floor(rng.next() * ROWS);
        const col = Math.floor(rng.next() * COLS);
        
        if(board[row][col] !== -1 && (row !== avoidRow || col !== avoidCol)) {
          board[row][col] = -1; // Mine
          minesPlaced++;
        }
      }
      
      // Calculate numbers
      for(let row = 0; row < ROWS; row++) {
        for(let col = 0; col < COLS; col++) {
          if(board[row][col] !== -1) {
            let count = 0;
            for(let dr = -1; dr <= 1; dr++) {
              for(let dc = -1; dc <= 1; dc++) {
                const r = row + dr;
                const c = col + dc;
                if(r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r][c] === -1) {
                  count++;
                }
              }
            }
            board[row][col] = count;
          }
        }
      }
    }
    
    function reveal(row, col) {
      if(row < 0 || row >= ROWS || col < 0 || col >= COLS) return;
      if(revealed[row][col] || flagged[row][col]) return;
      
      revealed[row][col] = true;
      
      // Flood fill for zeros
      if(board[row][col] === 0) {
        for(let dr = -1; dr <= 1; dr++) {
          for(let dc = -1; dc <= 1; dc++) {
            if(dr !== 0 || dc !== 0) {
              reveal(row + dr, col + dc);
            }
          }
        }
      }
    }
    
    function toggleFlag(row, col) {
      if(revealed[row][col] || gameOver) return;
      
      flagged[row][col] = !flagged[row][col];
      
      // Update mines counter
      const flagCount = flagged.flat().filter(f => f).length;
      minesDiv.textContent = `💣 ${MINES - flagCount}`;
    }
    
    function checkWin() {
      for(let row = 0; row < ROWS; row++) {
        for(let col = 0; col < COLS; col++) {
          if(board[row][col] !== -1 && !revealed[row][col]) {
            return false;
          }
        }
      }
      return true;
    }
    
    function draw() {
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, COLS * CELL_SIZE, ROWS * CELL_SIZE);
      
      for(let row = 0; row < ROWS; row++) {
        for(let col = 0; col < COLS; col++) {
          const x = col * CELL_SIZE;
          const y = row * CELL_SIZE;
          
          if(revealed[row][col]) {
            ctx.fillStyle = '#2a3a4a';
            ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
            
            if(board[row][col] === -1) {
              // Mine
              ctx.fillStyle = '#ff6b9d';
              ctx.font = 'bold 18px Arial';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText('💣', x + CELL_SIZE / 2, y + CELL_SIZE / 2);
            } else if(board[row][col] > 0) {
              // Number
              const colors = ['', '#83bfff', '#5bd68a', '#ff6b9d', '#a000f0', '#f7b955', '#00f0f0', '#000', '#888'];
              ctx.fillStyle = colors[board[row][col]] || '#fff';
              ctx.font = 'bold 16px Arial';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(board[row][col], x + CELL_SIZE / 2, y + CELL_SIZE / 2);
            }
          } else {
            // Unrevealed
            ctx.fillStyle = '#3a4a5a';
            ctx.fillRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2);
            
            if(flagged[row][col]) {
              ctx.fillStyle = '#ff6b9d';
              ctx.font = 'bold 18px Arial';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText('🚩', x + CELL_SIZE / 2, y + CELL_SIZE / 2);
            }
          }
          
          // Grid lines
          ctx.strokeStyle = '#1a1a1a';
          ctx.lineWidth = 1;
          ctx.strokeRect(x, y, CELL_SIZE, CELL_SIZE);
        }
      }
    }
    
    function handleClick(e) {
      if(gameOver) return;
      
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;
      
      const col = Math.floor(x / CELL_SIZE);
      const row = Math.floor(y / CELL_SIZE);
      
      if(row < 0 || row >= ROWS || col < 0 || col >= COLS) return;
      
      if(firstClick) {
        firstClick = false;
        initBoard(row, col);
        startTime = Date.now();
      }
      
      if(flagMode || e.shiftKey) {
        toggleFlag(row, col);
      } else {
        if(flagged[row][col]) return;
        
        if(board[row][col] === -1) {
          // Hit mine - game over
          revealed[row][col] = true;
          gameOver = true;
          won = false;
          endGame();
        } else {
          reveal(row, col);
          
          if(checkWin()) {
            gameOver = true;
            won = true;
            endGame();
          }
        }
      }
      
      draw();
    }
    
    let longPressTimer = null;
    let longPressTriggered = false;
    
    function handleTouchStart(e) {
      e.preventDefault();
      if(e.touches.length !== 1) return;
      
      const touch = e.touches[0];
      longPressTriggered = false;
      
      longPressTimer = setTimeout(() => {
        longPressTriggered = true;
        flagMode = true;
        handleClick({ clientX: touch.clientX, clientY: touch.clientY });
        flagMode = false;
      }, 500);
    }
    
    function handleTouchEnd(e) {
      e.preventDefault();
      clearTimeout(longPressTimer);
      
      if(!longPressTriggered && e.changedTouches.length === 1) {
        const touch = e.changedTouches[0];
        handleClick({ clientX: touch.clientX, clientY: touch.clientY });
      }
    }
    
    function handleTouchMove(e) {
      e.preventDefault();
      clearTimeout(longPressTimer);
    }
    
    function updateTimer() {
      if(!gameOver && !firstClick) {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        timerDiv.textContent = `⏱️ ${elapsed}s`;
      }
    }
    
    const timerInterval = setInterval(updateTimer, 1000);
    
    function endGame() {
      clearInterval(timerInterval);
      
      const elapsed = (Date.now() - startTime) / 1000;
      
      // Reveal all mines
      for(let row = 0; row < ROWS; row++) {
        for(let col = 0; col < COLS; col++) {
          if(board[row][col] === -1) {
            revealed[row][col] = true;
          }
        }
      }
      draw();
      
      let rawScore = 0;
      if(won) {
        rawScore = 100;
        // Time bonus (faster is better, cap at 120s)
        const timeBonus = Math.max(0, 20 - Math.min(elapsed / 6, 20));
        rawScore += timeBonus;
        rawScore = Math.min(100, Math.round(rawScore));
      } else {
        // Partial credit for progress
        const revealedCount = revealed.flat().filter(r => r).length;
        const totalSafe = ROWS * COLS - MINES;
        rawScore = Math.round((revealedCount / totalSafe) * 50);
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
      
      console.log(`[Minesweeper] Won: ${won}, Raw: ${rawScore}, Final: ${Math.round(score)}`);
      
      setTimeout(() => {
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
          min-width:280px;
        `;
        
        const resultText = document.createElement('div');
        resultText.textContent = won ? '🎉 You Won!' : '💥 Mine Hit!';
        resultText.style.cssText = `font-size:1.8rem;color:${won ? '#5bd68a' : '#ff6b9d'};margin-bottom:15px;font-weight:bold;`;
        
        const timeText = document.createElement('div');
        timeText.textContent = `Time: ${elapsed.toFixed(1)}s`;
        timeText.style.cssText = 'font-size:1.1rem;color:#83bfff;margin-bottom:12px;';
        
        const scoreText = document.createElement('div');
        scoreText.textContent = `Score: ${Math.round(score)}`;
        scoreText.style.cssText = 'font-size:1.3rem;color:#f7b955;font-weight:600;';
        
        resultDiv.appendChild(resultText);
        resultDiv.appendChild(timeText);
        resultDiv.appendChild(scoreText);
        container.appendChild(resultDiv);
        
        setTimeout(() => {
          if(typeof onComplete === 'function') {
            onComplete(Math.round(score));
          }
        }, 3000);
      }, 1000);
    }
    
    flagBtn.addEventListener('click', () => {
      flagMode = !flagMode;
      flagBtn.style.background = flagMode ? '#5bd68a' : '#2a3a4a';
      flagBtn.style.color = flagMode ? '#1a1a1a' : '#fff';
    });
    
    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      flagMode = true;
      handleClick(e);
      flagMode = false;
    });
    canvas.addEventListener('touchstart', handleTouchStart);
    canvas.addEventListener('touchend', handleTouchEnd);
    canvas.addEventListener('touchmove', handleTouchMove);
    
    // Initialize with dummy board for display
    initBoard(-1, -1);
    draw();
  }

  // Register module
  if(typeof g.MinigameModules !== 'undefined' && typeof g.MinigameModules.register === 'function'){
    g.MinigameModules.register('minesweeps', { render });
  } else {
    g.MinigameModules = g.MinigameModules || {};
    g.MinigameModules.minesweeps = { render };
    g.MiniGames = g.MiniGames || {};
    g.MiniGames.minesweeps = { render };
  }

  console.info('[Minesweeps] Module loaded');

})(window);
