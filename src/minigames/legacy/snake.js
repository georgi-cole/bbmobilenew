// MODULE: minigames/snake.js
// Snake - Classic snake game with portal mode variant

(function(g){
  'use strict';

  function injectStyles() {
    // Check if styles already exist in DOM
    if(document.querySelector('style[data-snake-nokia-styles]')) return;

    const styleTag = document.createElement('style');
    styleTag.setAttribute('data-snake-nokia-styles', 'true');
    styleTag.textContent = `
      .snake-nokia-wrapper {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
        padding: 20px;
      }

      .snake-nokia-title {
        margin: 0;
        font-size: 1.3rem;
        color: #e3ecf5;
        font-family: 'Courier New', monospace;
        text-transform: uppercase;
        letter-spacing: 2px;
      }

      .snake-nokia-instructions {
        margin: 0;
        font-size: 0.9rem;
        color: #95a9c0;
        text-align: center;
        font-family: 'Courier New', monospace;
      }

      .snake-nokia-canvas-container {
        position: relative;
        background: #2a2a2a;
        padding: 16px;
        border-radius: 8px;
        box-shadow: inset 0 4px 12px rgba(0, 0, 0, 0.7),
                    0 2px 8px rgba(0, 0, 0, 0.3);
      }

      .snake-nokia-canvas {
        display: block;
        background: #b7d378;
        border: 2px solid #1a1a1a;
        image-rendering: pixelated;
        image-rendering: crisp-edges;
      }

      .snake-nokia-status {
        position: absolute;
        top: 20px;
        left: 20px;
        font-family: 'Courier New', monospace;
        font-size: 11px;
        font-weight: bold;
        color: #1a1a1a;
        background: rgba(183, 211, 120, 0.85);
        padding: 2px 6px;
        border-radius: 2px;
        letter-spacing: 1px;
      }

      .snake-nokia-scanlines {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        pointer-events: none;
        background: repeating-linear-gradient(
          0deg,
          rgba(0, 0, 0, 0.05) 0px,
          rgba(0, 0, 0, 0.05) 1px,
          transparent 1px,
          transparent 2px
        );
      }

      .snake-nokia-dpad {
        display: grid;
        grid-template-columns: repeat(3, 70px);
        grid-template-rows: repeat(3, 70px);
        gap: 4px;
        margin-top: 10px;
      }

      .snake-nokia-dpad-btn {
        position: relative;
        background: linear-gradient(135deg, #3a3a3a 0%, #2a2a2a 100%);
        border: 2px solid #4a4a4a;
        border-radius: 8px;
        cursor: pointer;
        padding: 0;
        transition: all 0.1s ease;
        box-shadow: 0 3px 6px rgba(0, 0, 0, 0.3),
                    inset 0 1px 2px rgba(255, 255, 255, 0.1);
      }

      .snake-nokia-dpad-btn:hover {
        background: linear-gradient(135deg, #4a4a4a 0%, #3a3a3a 100%);
        border-color: #5a5a5a;
      }

      .snake-nokia-dpad-btn:active,
      .snake-nokia-dpad-pressed {
        background: linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%);
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5),
                    inset 0 2px 4px rgba(0, 0, 0, 0.4);
        transform: translateY(2px);
      }

      .snake-nokia-dpad-btn::after {
        content: '';
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 0;
        height: 0;
        border-style: solid;
      }

      .snake-nokia-dpad-up::after {
        border-width: 0 12px 16px 12px;
        border-color: transparent transparent #b7d378 transparent;
      }

      .snake-nokia-dpad-down::after {
        border-width: 16px 12px 0 12px;
        border-color: #b7d378 transparent transparent transparent;
      }

      .snake-nokia-dpad-left::after {
        border-width: 12px 16px 12px 0;
        border-color: transparent #b7d378 transparent transparent;
      }

      .snake-nokia-dpad-right::after {
        border-width: 12px 0 12px 16px;
        border-color: transparent transparent transparent #b7d378;
      }

      .snake-nokia-dpad-center {
        background: radial-gradient(circle, #1a1a1a 0%, #2a2a2a 100%);
        border: 2px solid #3a3a3a;
        border-radius: 50%;
      }

      /* Nokia Image Shell Theme Styles */
      .snake-phone-shell {
        --phone-width: 300px;
        --phone-height: 665px;
        --lcd-top: 155px;
        --lcd-left: 53px;
        --lcd-width: 194px;
        --lcd-height: 125px;
        --keypad-top: 365px;
        --keypad-btn-size: 40px;
        
        position: relative;
        width: var(--phone-width);
        height: var(--phone-height);
        background-image: url('assets/skins/nokia3310-shell.png');
        background-size: contain;
        background-repeat: no-repeat;
        background-position: center;
        margin: 20px auto;
      }

      .snake-phone-shell .snake-nokia-canvas-container {
        position: absolute;
        top: var(--lcd-top);
        left: var(--lcd-left);
        width: var(--lcd-width);
        height: var(--lcd-height);
        background: transparent;
        padding: 0;
        border-radius: 4px;
        box-shadow: none;
      }

      .snake-phone-shell .snake-nokia-canvas {
        width: 100%;
        height: 100%;
        border: none;
      }

      .snake-phone-shell .snake-nokia-status {
        top: 5px;
        left: 5px;
        font-size: 9px;
      }

      .snake-phone-shell .snake-nokia-scanlines {
        border-radius: 4px;
      }

      .snake-keypad-overlay {
        position: absolute;
        top: var(--keypad-top);
        left: 50%;
        transform: translateX(-50%);
        width: 180px;
        height: 130px;
      }

      .snake-keypad-btn {
        position: absolute;
        background: transparent;
        border: none;
        cursor: pointer;
        width: var(--keypad-btn-size);
        height: var(--keypad-btn-size);
        padding: 0;
        transition: background 0.1s ease;
      }

      .snake-keypad-btn:active {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 5px;
      }

      .snake-keypad-btn-up {
        top: 0;
        left: 50%;
        transform: translateX(-50%);
        height: 45px;
      }

      .snake-keypad-btn-down {
        bottom: 0;
        left: 50%;
        transform: translateX(-50%);
        height: 45px;
      }

      .snake-keypad-btn-left {
        left: 0;
        top: 50%;
        transform: translateY(-50%);
        width: 50px;
      }

      .snake-keypad-btn-right {
        right: 0;
        top: 50%;
        transform: translateY(-50%);
        width: 50px;
      }

      /* Responsive scaling */
      @media (max-width: 768px) {
        .snake-phone-shell {
          --phone-width: 270px;
          --phone-height: 598px;
          --lcd-top: 140px;
          --lcd-left: 48px;
          --lcd-width: 175px;
          --lcd-height: 113px;
          --keypad-top: 328px;
          --keypad-btn-size: 36px;
        }
        
        .snake-keypad-overlay {
          width: 162px;
          height: 117px;
        }
      }

      @media (max-width: 480px) {
        .snake-phone-shell {
          --phone-width: 240px;
          --phone-height: 532px;
          --lcd-top: 124px;
          --lcd-left: 42px;
          --lcd-width: 155px;
          --lcd-height: 100px;
          --keypad-top: 292px;
          --keypad-btn-size: 32px;
        }
        
        .snake-keypad-overlay {
          width: 144px;
          height: 104px;
        }

        .snake-nokia-dpad {
          grid-template-columns: repeat(3, 60px);
          grid-template-rows: repeat(3, 60px);
        }

        .snake-nokia-canvas-container {
          padding: 12px;
        }
      }
    `;
    document.head.appendChild(styleTag);
  }

  /**
   * Snake minigame
   * Control snake to eat food and grow
   * Avoid walls and yourself
   * Portal mode: edges wrap around
   * Optional: Timed arcade mode with countdown
   * 
   * @param {HTMLElement} container - Container element for the game UI
   * @param {Function} onComplete - Callback function(score) when game ends
   * @param {Object} options - Configuration options
   * @param {boolean} options.timedMode - Enable countdown timer (default: false)
   * @param {number} options.timeLimitMs - Time limit in milliseconds (default: 60000)
   */
  function render(container, onComplete, options = {}){
    container.innerHTML = '';
    
    const { 
      debugMode = false, 
      competitionMode = false,
      variant = 'normal', // 'normal' or 'portal'
      theme = 'nokia', // 'nokia', 'nokia-shell', or 'nokia-image-shell'
      timedMode = false, // Enable countdown timer
      timeLimitMs = 60000 // 60 seconds default
    } = options;
    
    const portalMode = variant === 'portal';
    const useImageShell = theme === 'nokia-image-shell';
    
    // Inject styles
    injectStyles();
    
    const wrapper = document.createElement('div');
    wrapper.className = useImageShell ? 'snake-phone-shell' : 'snake-nokia-wrapper';
    
    // For image shell theme, don't show title/instructions separately
    if (!useImageShell) {
      const title = document.createElement('h3');
      title.textContent = portalMode ? 'Snake (Portal Mode)' : 'Snake';
      title.className = 'snake-nokia-title';
      wrapper.appendChild(title);
      
      // Show high score if available
      if(g.HighScoreManager){
        const highScoreDisplay = g.HighScoreManager.getHighScoreDisplay('snake');
        if(highScoreDisplay){
          const highScoreEl = document.createElement('div');
          highScoreEl.textContent = highScoreDisplay;
          highScoreEl.style.cssText = 'font-size:0.8rem;color:#ffd96b;font-weight:600;margin:-8px 0 0 0;text-align:center;';
          wrapper.appendChild(highScoreEl);
        }
      }
      
      const instructions = document.createElement('p');
      const instructionText = timedMode ?
        (portalMode ? 'Eat food, grow, edges wrap around! (Timed!)' : 'Eat food, avoid walls and yourself! (Timed!)') :
        (portalMode ? 'Eat food, grow, edges wrap around!' : 'Eat food, avoid walls and yourself!');
      instructions.textContent = instructionText;
      instructions.className = 'snake-nokia-instructions';
      wrapper.appendChild(instructions);
      
      // Add timer if timed mode
      if(timedMode && g.GameTimer){
        const timerContainer = document.createElement('div');
        timerContainer.style.cssText = 'margin:4px 0;';
        wrapper.appendChild(timerContainer);
      }
    }
    
    // Store instructions element for later updates (game over message)
    let instructions = null;
    if (!useImageShell) {
      instructions = wrapper.querySelector('.snake-nokia-instructions');
    }
    
    // Canvas container with bezel
    const canvasContainer = document.createElement('div');
    canvasContainer.className = 'snake-nokia-canvas-container';
    
    // Canvas for game
    const canvas = document.createElement('canvas');
    const gridSize = 20;
    const tileSize = 15;
    canvas.width = gridSize * tileSize;
    canvas.height = gridSize * tileSize;
    canvas.className = 'snake-nokia-canvas';
    const ctx = canvas.getContext('2d');
    
    // Status line overlay
    const statusLine = document.createElement('div');
    statusLine.className = 'snake-nokia-status';
    statusLine.textContent = 'LEN 3  F 0';
    
    // Scanline overlay
    const scanlines = document.createElement('div');
    scanlines.className = 'snake-nokia-scanlines';
    
    canvasContainer.appendChild(canvas);
    canvasContainer.appendChild(statusLine);
    canvasContainer.appendChild(scanlines);
    
    // D-pad controls
    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'snake-nokia-dpad';
    
    const btnUp = createDPadBtn('up');
    const btnLeft = createDPadBtn('left');
    const btnDown = createDPadBtn('down');
    const btnRight = createDPadBtn('right');
    
    const spacer1 = document.createElement('div');
    const spacer2 = document.createElement('div');
    const spacer3 = document.createElement('div');
    const center = document.createElement('div');
    center.className = 'snake-nokia-dpad-center';
    
    controlsDiv.appendChild(spacer1);
    controlsDiv.appendChild(btnUp);
    controlsDiv.appendChild(spacer2);
    controlsDiv.appendChild(btnLeft);
    controlsDiv.appendChild(center);
    controlsDiv.appendChild(btnRight);
    controlsDiv.appendChild(spacer3);
    controlsDiv.appendChild(btnDown);
    controlsDiv.appendChild(document.createElement('div')); // bottom-right spacer
    
    function createDPadBtn(direction){
      const btn = document.createElement('button');
      btn.className = 'snake-nokia-dpad-btn snake-nokia-dpad-' + direction;
      btn.setAttribute('aria-label', direction);
      return btn;
    }
    
    // Append canvas container
    wrapper.appendChild(canvasContainer);
    
    // For image shell theme, create transparent keypad overlay instead of D-pad
    if (useImageShell) {
      const keypadOverlay = document.createElement('div');
      keypadOverlay.className = 'snake-keypad-overlay';
      
      const keypadBtnUp = document.createElement('button');
      keypadBtnUp.className = 'snake-keypad-btn snake-keypad-btn-up';
      keypadBtnUp.setAttribute('aria-label', 'up');
      
      const keypadBtnDown = document.createElement('button');
      keypadBtnDown.className = 'snake-keypad-btn snake-keypad-btn-down';
      keypadBtnDown.setAttribute('aria-label', 'down');
      
      const keypadBtnLeft = document.createElement('button');
      keypadBtnLeft.className = 'snake-keypad-btn snake-keypad-btn-left';
      keypadBtnLeft.setAttribute('aria-label', 'left');
      
      const keypadBtnRight = document.createElement('button');
      keypadBtnRight.className = 'snake-keypad-btn snake-keypad-btn-right';
      keypadBtnRight.setAttribute('aria-label', 'right');
      
      keypadOverlay.appendChild(keypadBtnUp);
      keypadOverlay.appendChild(keypadBtnDown);
      keypadOverlay.appendChild(keypadBtnLeft);
      keypadOverlay.appendChild(keypadBtnRight);
      
      wrapper.appendChild(keypadOverlay);
      
      // Store keypad buttons for later event handling
      btnUp._keypadBtn = keypadBtnUp;
      btnDown._keypadBtn = keypadBtnDown;
      btnLeft._keypadBtn = keypadBtnLeft;
      btnRight._keypadBtn = keypadBtnRight;
    } else {
      // Use traditional D-pad for non-image-shell themes
      wrapper.appendChild(controlsDiv);
    }
    
    container.appendChild(wrapper);
    
    // Game state
    const snake = [{x:10, y:10}];
    let direction = {x:1, y:0};
    let nextDirection = {x:1, y:0};
    let food = null;
    let foodEaten = 0;
    let gameOver = false;
    let gameLoop = null;
    
    // Timer (if timed mode enabled)
    let gameTimer = null;
    if(timedMode && g.GameTimer){
      try {
        gameTimer = new g.GameTimer('arcade', {
          duration: timeLimitMs,
          countDirection: 'down'
        });
        
        // Handle timer completion
        gameTimer.onComplete(() => {
          console.log('[Snake] Time expired');
          if(!gameOver){
            endGame();
          }
        });
        
        // Render timer UI if we have a timer container
        const timerContainer = wrapper.querySelector('div[style*="margin:4px"]');
        if(timerContainer){
          gameTimer.render(timerContainer);
        }
        
        console.log('[Snake] GameTimer initialized (countdown mode)');
      } catch(err){
        console.warn('[Snake] Failed to initialize GameTimer:', err);
        gameTimer = null;
      }
    }
    
    function placeFood(){
      do {
        food = {
          x: Math.floor(Math.random() * gridSize),
          y: Math.floor(Math.random() * gridSize)
        };
      } while(snake.some(seg => seg.x === food.x && seg.y === food.y));
    }
    
    function setDirection(newDir){
      // Prevent reversing
      if(newDir.x === -direction.x && newDir.y === -direction.y) return;
      nextDirection = newDir;
    }
    
    function update(){
      if(gameOver) return;
      
      direction = nextDirection;
      
      // New head position
      const newHead = {
        x: snake[0].x + direction.x,
        y: snake[0].y + direction.y
      };
      
      // Portal mode: wrap around
      if(portalMode){
        if(newHead.x < 0) newHead.x = gridSize - 1;
        if(newHead.x >= gridSize) newHead.x = 0;
        if(newHead.y < 0) newHead.y = gridSize - 1;
        if(newHead.y >= gridSize) newHead.y = 0;
      } else {
        // Normal mode: check wall collision
        if(newHead.x < 0 || newHead.x >= gridSize || newHead.y < 0 || newHead.y >= gridSize){
          endGame();
          return;
        }
      }
      
      // Check self collision
      if(snake.some(seg => seg.x === newHead.x && seg.y === newHead.y)){
        endGame();
        return;
      }
      
      snake.unshift(newHead);
      
      // Check food
      if(newHead.x === food.x && newHead.y === food.y){
        foodEaten++;
        statusLine.textContent = `LEN ${snake.length}  F ${foodEaten}`;
        placeFood();
      } else {
        snake.pop();
      }
      
      draw();
    }
    
    function draw(){
      // Clear with Nokia green background
      ctx.fillStyle = '#b7d378';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Draw snake with near-black pixels
      snake.forEach((seg, i) => {
        ctx.fillStyle = i === 0 ? '#1a1a1a' : '#2d2d2d';
        ctx.fillRect(seg.x * tileSize, seg.y * tileSize, tileSize - 1, tileSize - 1);
      });
      
      // Draw food with near-black
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(food.x * tileSize, food.y * tileSize, tileSize - 1, tileSize - 1);
    }
    
    function endGame(){
      gameOver = true;
      clearInterval(gameLoop);
      
      // Stop timer if it exists
      if(gameTimer){
        gameTimer.stop();
        gameTimer.destroy();
        console.log('[Snake] GameTimer stopped');
      }
      
      // Update instructions if they exist (not in image shell theme)
      if (instructions) {
        instructions.textContent = 'Game Over!';
        instructions.style.color = '#ff6b6b';
      }
      
      // Score based on food eaten - Each food = 10 points
      // Raw score capped at 100 for normalization
      const rawScore = Math.min(100, foodEaten * 10);
      
      // Check for new personal best
      let isNewBest = false;
      if(g.HighScoreManager){
        isNewBest = g.HighScoreManager.isNewBest('snake', foodEaten);
        if(isNewBest){
          g.HighScoreManager.setHighScore('snake', foodEaten, `${foodEaten} food`);
          console.info(`[Snake] New personal best: ${foodEaten} food!`);
        }
      }
      
      // Use centralized scoring system (SCALE=1000)
      const finalScore = g.MinigameScoring ? 
        g.MinigameScoring.calculateFinalScore({
          rawScore: rawScore,
          minScore: 0,
          maxScore: 100,
          compBeast: 0.5
        }) :
        rawScore * 10; // Fallback: scale to 0-1000
      
      console.log(`[Snake] Food eaten: ${foodEaten}, Raw score: ${rawScore}, Final score: ${Math.round(finalScore)}`);
      
      // Store metadata about raw score for display purposes
      const scoreData = {
        score: Math.round(finalScore),
        rawScore: foodEaten,
        rawScoreDisplay: `${foodEaten} food eaten`,
        isNewPersonalBest: isNewBest
      };
      
      setTimeout(() => onComplete(scoreData), 1500);
    }
    
    // Controls - Keyboard
    document.addEventListener('keydown', (e) => {
      if(gameOver) return;
      
      if(e.key === 'ArrowUp' || e.key === 'w'){
        e.preventDefault();
        setDirection({x:0, y:-1});
      } else if(e.key === 'ArrowDown' || e.key === 's'){
        e.preventDefault();
        setDirection({x:0, y:1});
      } else if(e.key === 'ArrowLeft' || e.key === 'a'){
        e.preventDefault();
        setDirection({x:-1, y:0});
      } else if(e.key === 'ArrowRight' || e.key === 'd'){
        e.preventDefault();
        setDirection({x:1, y:0});
      }
    });
    
    // D-pad/keypad button handlers with haptic feedback
    function addDPadHandler(btn, dir) {
      const handler = (e) => {
        if(!gameOver) {
          e.preventDefault();
          setDirection(dir);
          
          // Add visual feedback if not using image shell
          if (!useImageShell) {
            btn.classList.add('snake-nokia-dpad-pressed');
            setTimeout(() => btn.classList.remove('snake-nokia-dpad-pressed'), 100);
          }
          
          // Haptic feedback
          if(navigator.vibrate) {
            navigator.vibrate(10);
          }
        }
      };
      
      btn.addEventListener('pointerdown', handler);
      btn.addEventListener('click', handler);
    }
    
    // Add handlers for either D-pad or keypad buttons depending on theme
    if (useImageShell) {
      // Use keypad overlay buttons
      addDPadHandler(btnUp._keypadBtn, {x:0, y:-1});
      addDPadHandler(btnDown._keypadBtn, {x:0, y:1});
      addDPadHandler(btnLeft._keypadBtn, {x:-1, y:0});
      addDPadHandler(btnRight._keypadBtn, {x:1, y:0});
    } else {
      // Use traditional D-pad buttons
      addDPadHandler(btnUp, {x:0, y:-1});
      addDPadHandler(btnDown, {x:0, y:1});
      addDPadHandler(btnLeft, {x:-1, y:0});
      addDPadHandler(btnRight, {x:1, y:0});
    }
    
    // Swipe controls on canvas
    let touchStartX = 0;
    let touchStartY = 0;
    
    canvas.addEventListener('touchstart', (e) => {
      if(!e.touches || !e.touches[0]) return;
      e.preventDefault();
      const touch = e.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
    });
    
    canvas.addEventListener('touchend', (e) => {
      if(gameOver) return;
      if(!e.changedTouches || !e.changedTouches[0]) return;
      e.preventDefault();
      
      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchStartX;
      const deltaY = touch.clientY - touchStartY;
      const absDeltaX = Math.abs(deltaX);
      const absDeltaY = Math.abs(deltaY);
      
      // Minimum swipe distance threshold
      const minSwipeDistance = 30;
      
      if(absDeltaX > minSwipeDistance || absDeltaY > minSwipeDistance) {
        if(absDeltaX > absDeltaY) {
          // Horizontal swipe
          if(deltaX > 0) {
            setDirection({x:1, y:0});
          } else {
            setDirection({x:-1, y:0});
          }
        } else {
          // Vertical swipe
          if(deltaY > 0) {
            setDirection({x:0, y:1});
          } else {
            setDirection({x:0, y:-1});
          }
        }
        
        // Haptic feedback
        if(navigator.vibrate) {
          navigator.vibrate(10);
        }
      }
    });
    
    // Start game
    placeFood();
    draw();
    gameLoop = setInterval(update, 150);
    
    // Start timer if it exists
    if(gameTimer){
      gameTimer.start();
      console.log('[Snake] GameTimer started');
    }
  }

  // Export
  if(typeof g.MiniGames === 'undefined') g.MiniGames = {};
  g.MiniGames.snake = { render };

})(window);
