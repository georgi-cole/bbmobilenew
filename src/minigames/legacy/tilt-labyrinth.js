// MODULE: minigames/tilt-labyrinth.js
// Tilt Labyrinth - HARD MODE (BitLife Escape from Jail style)
// Tilt phone to move ball through complex maze with hazards and keys

(function(g){
  'use strict';

  /**
   * Seeded random number generator for deterministic maze generation
   */
  function SeededRandom(seed) {
    this.seed = seed || Math.floor(Math.random() * 1000000);
    
    this.next = function() {
      this.seed = (this.seed * 9301 + 49297) % 233280;
      return this.seed / 233280;
    };
    
    this.range = function(min, max) {
      return Math.floor(this.next() * (max - min + 1)) + min;
    };
  }

  /**
   * Generate a complex maze using recursive backtracking
   */
  function generateMaze(cols, rows, rng) {
    const cells = [];
    const stack = [];
    
    // Initialize grid
    for(let y = 0; y < rows; y++){
      cells[y] = [];
      for(let x = 0; x < cols; x++){
        cells[y][x] = {
          visited: false,
          walls: { top: true, right: true, bottom: true, left: true }
        };
      }
    }
    
    // Start from random position
    let currentX = 0;
    let currentY = 0;
    cells[currentY][currentX].visited = true;
    
    while(true){
      const neighbors = [];
      
      // Check all neighbors
      if(currentY > 0 && !cells[currentY - 1][currentX].visited) 
        neighbors.push({ x: currentX, y: currentY - 1, dir: 'top' });
      if(currentX < cols - 1 && !cells[currentY][currentX + 1].visited) 
        neighbors.push({ x: currentX + 1, y: currentY, dir: 'right' });
      if(currentY < rows - 1 && !cells[currentY + 1][currentX].visited) 
        neighbors.push({ x: currentX, y: currentY + 1, dir: 'bottom' });
      if(currentX > 0 && !cells[currentY][currentX - 1].visited) 
        neighbors.push({ x: currentX - 1, y: currentY, dir: 'left' });
      
      if(neighbors.length > 0){
        // Choose random neighbor
        const next = neighbors[Math.floor(rng.next() * neighbors.length)];
        
        // Remove walls between current and next
        if(next.dir === 'top'){
          cells[currentY][currentX].walls.top = false;
          cells[next.y][next.x].walls.bottom = false;
        } else if(next.dir === 'right'){
          cells[currentY][currentX].walls.right = false;
          cells[next.y][next.x].walls.left = false;
        } else if(next.dir === 'bottom'){
          cells[currentY][currentX].walls.bottom = false;
          cells[next.y][next.x].walls.top = false;
        } else if(next.dir === 'left'){
          cells[currentY][currentX].walls.left = false;
          cells[next.y][next.x].walls.right = false;
        }
        
        cells[next.y][next.x].visited = true;
        stack.push({ x: currentX, y: currentY });
        currentX = next.x;
        currentY = next.y;
      } else if(stack.length > 0){
        const prev = stack.pop();
        currentX = prev.x;
        currentY = prev.y;
      } else {
        break;
      }
    }
    
    return cells;
  }

  /**
   * Convert maze cells to wall segments for collision detection
   */
  function cellsToWalls(cells, cellSize) {
    const walls = [];
    const rows = cells.length;
    const cols = cells[0].length;
    
    for(let y = 0; y < rows; y++){
      for(let x = 0; x < cols; x++){
        const cell = cells[y][x];
        const x1 = x * cellSize;
        const y1 = y * cellSize;
        const x2 = (x + 1) * cellSize;
        const y2 = (y + 1) * cellSize;
        
        if(cell.walls.top) walls.push([x1, y1, x2, y1]);
        if(cell.walls.right) walls.push([x2, y1, x2, y2]);
        if(cell.walls.bottom) walls.push([x1, y2, x2, y2]);
        if(cell.walls.left) walls.push([x1, y1, x1, y2]);
      }
    }
    
    return walls;
  }

  /**
   * Tilt Labyrinth minigame - HARD MODE
   * Use device orientation (or swipe fallback) to guide ball to goal
   * Features: Large maze, moving hazards, key/lock mechanics
   * 
   * @param {HTMLElement} container - Container element for the game UI
   * @param {Function} onComplete - Callback function(score) when game ends
   * @param {Object} options - Configuration options (seed for determinism)
   */
  function render(container, onComplete, options = {}){
    container.innerHTML = '';
    
    const { debugMode = false, seed } = options;
    const rng = new SeededRandom(seed);
    
    // Game state
    let gameOver = false;
    let startTime = Date.now();
    let orientationGranted = false;
    let useTiltControls = false;
    let hazardPenalty = 0;
    let hasKey = false;
    
    // Ball physics
    const MAZE_COLS = 19;
    const MAZE_ROWS = 19;
    const CELL_SIZE = 25;
    const MAZE_SIZE = MAZE_COLS * CELL_SIZE;
    
    let ballX = CELL_SIZE / 2;
    let ballY = CELL_SIZE / 2;
    let velocityX = 0;
    let velocityY = 0;
    const BALL_RADIUS = 6;
    const FRICTION = 0.90;
    const ACCELERATION = 0.35;
    const KEYBOARD_ACCELERATION_MULTIPLIER = 1.2;
    
    // Tilt detection constants
    const TILT_DETECTION_TIMEOUT_MS = 1200;
    const TILT_SENSOR_THRESHOLD = 0.1;
    
    // Control message constants
    const CONTROLS_MSG_TILT = '📱 Tilt device to control (mouse/keyboard also available)';
    const CONTROLS_MSG_DESKTOP = '👆 Use arrow keys (← ↑ ↓ →) or swipe/drag to control';
    
    // Game completion delay
    const COMPLETION_DELAY_MS = 3000;
    
    // Generate maze
    const mazeCells = generateMaze(MAZE_COLS, MAZE_ROWS, rng);
    const walls = cellsToWalls(mazeCells, CELL_SIZE);
    
    // Key and lock positions
    const KEY_X = CELL_SIZE * rng.range(9, 13) + CELL_SIZE / 2;
    const KEY_Y = CELL_SIZE * rng.range(5, 9) + CELL_SIZE / 2;
    const KEY_RADIUS = 8;
    
    const LOCK_X = CELL_SIZE * rng.range(14, 17) + CELL_SIZE / 2;
    const LOCK_Y = CELL_SIZE * rng.range(12, 16);
    let lockOpen = false;
    
    // Goal position (bottom-right area)
    const GOAL_X = CELL_SIZE * (MAZE_COLS - 1) + CELL_SIZE / 2;
    const GOAL_Y = CELL_SIZE * (MAZE_ROWS - 1) + CELL_SIZE / 2;
    const GOAL_RADIUS = 12;
    
    // Moving hazards (patrols)
    const hazards = [];
    for(let i = 0; i < 4; i++){
      hazards.push({
        x: CELL_SIZE * rng.range(3, MAZE_COLS - 4) + CELL_SIZE / 2,
        y: CELL_SIZE * rng.range(3, MAZE_ROWS - 4) + CELL_SIZE / 2,
        vx: (rng.next() - 0.5) * 0.4,
        vy: (rng.next() - 0.5) * 0.4,
        radius: 7
      });
    }

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:12px;padding:20px;';
    
    const title = document.createElement('h3');
    title.textContent = 'Tilt Labyrinth (HARD)';
    title.style.cssText = 'margin:0;font-size:1.4rem;color:#e3ecf5;';
    
    const instructions = document.createElement('p');
    instructions.textContent = 'Find the key, unlock the door, reach the goal!';
    instructions.style.cssText = 'margin:0;font-size:0.85rem;color:#95a9c0;text-align:center;';
    
    const statsDiv = document.createElement('div');
    statsDiv.style.cssText = 'display:flex;gap:16px;font-size:0.95rem;';
    
    const timerDiv = document.createElement('div');
    timerDiv.textContent = 'Time: 0s';
    timerDiv.style.cssText = 'color:#83bfff;font-weight:600;';
    
    const penaltyDiv = document.createElement('div');
    penaltyDiv.textContent = 'Hits: 0';
    penaltyDiv.style.cssText = 'color:#ff6b9d;font-weight:600;';
    
    const keyDiv = document.createElement('div');
    keyDiv.textContent = '🔑 No Key';
    keyDiv.style.cssText = 'color:#f7b955;font-weight:600;';
    
    statsDiv.appendChild(timerDiv);
    statsDiv.appendChild(penaltyDiv);
    statsDiv.appendChild(keyDiv);
    
    const canvas = document.createElement('canvas');
    canvas.width = MAZE_SIZE;
    canvas.height = MAZE_SIZE;
    canvas.style.cssText = 'background:#1a1a1a;border:3px solid #5bd68a;border-radius:8px;touch-action:none;max-width:100%;';
    const ctx = canvas.getContext('2d');
    
    const controlsInfo = document.createElement('div');
    controlsInfo.textContent = 'Checking for motion sensors...';
    controlsInfo.style.cssText = 'font-size:0.8rem;color:#95a9c0;text-align:center;';
    
    wrapper.appendChild(title);
    wrapper.appendChild(instructions);
    wrapper.appendChild(statsDiv);
    wrapper.appendChild(canvas);
    wrapper.appendChild(controlsInfo);
    container.appendChild(wrapper);

    // Request permission for iOS
    function requestOrientationPermission(){
      if(typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function'){
        return DeviceOrientationEvent.requestPermission()
          .then(permissionState => {
            if(permissionState === 'granted'){
              orientationGranted = true;
              return true;
            }
            return false;
          })
          .catch(() => false);
      } else {
        orientationGranted = true;
        return Promise.resolve(true);
      }
    }

    // Check for orientation support with robust detection
    function setupControls(){
      if(typeof DeviceOrientationEvent !== 'undefined'){
        requestOrientationPermission().then(granted => {
          if(granted){
            // Try to detect if real orientation data is available
            let tiltDetectionTimeout = null;
            let tiltDetected = false;
            
            const tempOrientationHandler = (event) => {
              const beta = event.beta || 0;
              const gamma = event.gamma || 0;
              
              // Check if we're getting real sensor data (finite values above threshold)
              if(isFinite(beta) && isFinite(gamma) && (Math.abs(beta) > TILT_SENSOR_THRESHOLD || Math.abs(gamma) > TILT_SENSOR_THRESHOLD)){
                tiltDetected = true;
                
                // Clear timeout and remove temporary handler
                if(tiltDetectionTimeout) clearTimeout(tiltDetectionTimeout);
                window.removeEventListener('deviceorientation', tempOrientationHandler);
                
                // Set up tilt controls permanently
                useTiltControls = true;
                controlsInfo.textContent = CONTROLS_MSG_TILT;
                window.addEventListener('deviceorientation', handleOrientation);
              }
            };
            
            // Attach temporary listener
            window.addEventListener('deviceorientation', tempOrientationHandler);
            
            // Set timeout: if no valid orientation event arrives, assume no tilt support
            tiltDetectionTimeout = setTimeout(() => {
              if(!tiltDetected){
                window.removeEventListener('deviceorientation', tempOrientationHandler);
                useTiltControls = false;
                controlsInfo.textContent = CONTROLS_MSG_DESKTOP;
              }
            }, TILT_DETECTION_TIMEOUT_MS);
          } else {
            // Permission denied
            useTiltControls = false;
            controlsInfo.textContent = CONTROLS_MSG_DESKTOP;
          }
        });
      } else {
        // DeviceOrientationEvent not available
        useTiltControls = false;
        controlsInfo.textContent = CONTROLS_MSG_DESKTOP;
      }
    }

    // Keyboard event handlers and state (stored for cleanup and access in updatePhysics)
    const controlKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
    function keyIsControl(k){
      return controlKeys.includes(k);
    }
    let keydownHandler = null;
    let keyupHandler = null;
    const keysPressed = {}; // Tracks arrow keys

    // Always setup pointer controls (mouse/touch drag)
    function setupPointerControls(){
      let touchStartX = 0;
      let touchStartY = 0;
      
      canvas.addEventListener('touchstart', (e) => {
        const touch = e.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
      }, { passive: true });
      
      canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        const swipeX = (touch.clientX - touchStartX) * 0.08;
        const swipeY = (touch.clientY - touchStartY) * 0.08;
        
        velocityX += swipeX * ACCELERATION;
        velocityY += swipeY * ACCELERATION;
      }, { passive: false });
      
      // Mouse fallback for desktop
      let isDragging = false;
      let lastMouseX = 0;
      let lastMouseY = 0;
      
      canvas.addEventListener('mousedown', (e) => {
        isDragging = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
      });
      
      canvas.addEventListener('mousemove', (e) => {
        if(!isDragging) return;
        const dx = (e.clientX - lastMouseX) * 0.08;
        const dy = (e.clientY - lastMouseY) * 0.08;
        
        velocityX += dx * ACCELERATION;
        velocityY += dy * ACCELERATION;
        
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
      });
      
      canvas.addEventListener('mouseup', () => {
        isDragging = false;
      });
      
      canvas.addEventListener('mouseleave', () => {
        isDragging = false;
      });
    }

    // Always setup keyboard controls
    function setupKeyboardControls(){
      keydownHandler = (e) => {
        if(keyIsControl(e.key)) {
          keysPressed[e.key] = true;
          e.preventDefault();
        }
      };
      
      keyupHandler = (e) => {
        if(keyIsControl(e.key)) {
          keysPressed[e.key] = false;
          e.preventDefault();
        }
      };
      
      window.addEventListener('keydown', keydownHandler);
      window.addEventListener('keyup', keyupHandler);
    }

    function handleOrientation(event){
      if(!useTiltControls || gameOver) return;
      
      const beta = event.beta || 0;
      const gamma = event.gamma || 0;
      
      velocityX += (gamma / 90) * ACCELERATION;
      velocityY += (beta / 90) * ACCELERATION;
    }

    function checkWallCollision(newX, newY){
      for(const wall of walls){
        const [x1, y1, x2, y2] = wall;
        
        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);
        const minY = Math.min(y1, y2);
        const maxY = Math.max(y1, y2);
        
        const closestX = Math.max(minX, Math.min(maxX, newX));
        const closestY = Math.max(minY, Math.min(maxY, newY));
        
        const dx = newX - closestX;
        const dy = newY - closestY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if(distance < BALL_RADIUS){
          return true;
        }
      }
      return false;
    }

    function updateHazards(){
      hazards.forEach(hazard => {
        hazard.x += hazard.vx;
        hazard.y += hazard.vy;
        
        // Bounce off walls
        if(hazard.x - hazard.radius < 0 || hazard.x + hazard.radius > MAZE_SIZE){
          hazard.vx *= -1;
          hazard.x = Math.max(hazard.radius, Math.min(MAZE_SIZE - hazard.radius, hazard.x));
        }
        if(hazard.y - hazard.radius < 0 || hazard.y + hazard.radius > MAZE_SIZE){
          hazard.vy *= -1;
          hazard.y = Math.max(hazard.radius, Math.min(MAZE_SIZE - hazard.radius, hazard.y));
        }
        
        // Check collision with ball
        const dx = ballX - hazard.x;
        const dy = ballY - hazard.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if(dist < BALL_RADIUS + hazard.radius){
          hazardPenalty += 1;
          penaltyDiv.textContent = `Hits: ${hazardPenalty}`;
          
          // Push ball away
          const angle = Math.atan2(dy, dx);
          velocityX += Math.cos(angle) * 2;
          velocityY += Math.sin(angle) * 2;
        }
      });
    }

    function updatePhysics(){
      if(gameOver) return;
      
      // Apply keyboard controls when tilt is not active
      if(!useTiltControls){
        const impulseFactor = ACCELERATION * KEYBOARD_ACCELERATION_MULTIPLIER;
        if(keysPressed.ArrowLeft)  velocityX -= impulseFactor;
        if(keysPressed.ArrowRight) velocityX += impulseFactor;
        if(keysPressed.ArrowUp)    velocityY -= impulseFactor;
        if(keysPressed.ArrowDown)  velocityY += impulseFactor;
      }
      
      // Apply velocity
      const newX = ballX + velocityX;
      const newY = ballY + velocityY;
      
      // Check wall collisions
      if(checkWallCollision(newX, ballY)){
        velocityX *= -0.5;
      } else {
        ballX = newX;
      }
      
      if(checkWallCollision(ballX, newY)){
        velocityY *= -0.5;
      } else {
        ballY = newY;
      }
      
      // Apply friction
      velocityX *= FRICTION;
      velocityY *= FRICTION;
      
      // Keep in bounds
      ballX = Math.max(BALL_RADIUS, Math.min(MAZE_SIZE - BALL_RADIUS, ballX));
      ballY = Math.max(BALL_RADIUS, Math.min(MAZE_SIZE - BALL_RADIUS, ballY));
      
      // Check key pickup
      if(!hasKey){
        const distToKey = Math.sqrt(Math.pow(ballX - KEY_X, 2) + Math.pow(ballY - KEY_Y, 2));
        if(distToKey < KEY_RADIUS + BALL_RADIUS){
          hasKey = true;
          keyDiv.textContent = '🔑 Got Key!';
          keyDiv.style.color = '#5bd68a';
        }
      }
      
      // Check lock
      if(hasKey && !lockOpen){
        const distToLock = Math.sqrt(Math.pow(ballX - LOCK_X, 2) + Math.pow(ballY - LOCK_Y, 2));
        if(distToLock < 15){
          lockOpen = true;
          // Remove lock wall
          const lockWallIndex = walls.findIndex(w => 
            Math.abs(w[0] - LOCK_X) < 5 && Math.abs(w[1] - LOCK_Y) < 5
          );
          if(lockWallIndex >= 0) walls.splice(lockWallIndex, 1);
        }
      }
      
      // Check goal (only accessible if lock is open)
      if(lockOpen){
        const distToGoal = Math.sqrt(Math.pow(ballX - GOAL_X, 2) + Math.pow(ballY - GOAL_Y, 2));
        if(distToGoal < GOAL_RADIUS){
          endGame();
        }
      }
      
      // Update hazards
      updateHazards();
    }

    function draw(){
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, MAZE_SIZE, MAZE_SIZE);
      
      // Draw walls
      ctx.strokeStyle = '#5bd68a';
      ctx.lineWidth = 2;
      for(const wall of walls){
        ctx.beginPath();
        ctx.moveTo(wall[0], wall[1]);
        ctx.lineTo(wall[2], wall[3]);
        ctx.stroke();
      }
      
      // Draw key (if not collected)
      if(!hasKey){
        ctx.fillStyle = '#f7b955';
        ctx.beginPath();
        ctx.arc(KEY_X, KEY_Y, KEY_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      
      // Draw lock (if not opened)
      if(!lockOpen && hasKey){
        ctx.fillStyle = '#ff6b9d';
        ctx.fillRect(LOCK_X - 10, LOCK_Y - 10, 20, 20);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(LOCK_X - 10, LOCK_Y - 10, 20, 20);
      }
      
      // Draw hazards
      ctx.fillStyle = '#ff4444';
      hazards.forEach(hazard => {
        ctx.beginPath();
        ctx.arc(hazard.x, hazard.y, hazard.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.stroke();
      });
      
      // Draw goal
      ctx.fillStyle = lockOpen ? '#5bd68a' : '#444';
      ctx.beginPath();
      ctx.arc(GOAL_X, GOAL_Y, GOAL_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Draw ball
      ctx.fillStyle = '#83bfff';
      ctx.beginPath();
      ctx.arc(ballX, ballY, BALL_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    function updateTimer(){
      if(!gameOver){
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        timerDiv.textContent = `Time: ${elapsed}s`;
      }
    }

    function gameLoop(){
      if(!gameOver){
        updatePhysics();
        draw();
        updateTimer();
        requestAnimationFrame(gameLoop);
      }
    }

    function endGame(){
      if(gameOver) return;
      gameOver = true;
      
      const elapsed = (Date.now() - startTime) / 1000;
      
      // Score: base 100, time penalty, hazard penalty
      let rawScore = 100;
      rawScore -= Math.min(elapsed * 1.5, 60); // Time penalty
      rawScore -= hazardPenalty * 5; // Hazard penalty
      rawScore = Math.max(0, Math.round(rawScore));
      
      // Use centralized scoring system (SCALE=1000)
      const score = g.MinigameScoring ? 
        g.MinigameScoring.calculateFinalScore({
          rawScore: rawScore,
          minScore: 0,
          maxScore: 100,
          compBeast: 0.5
        }) :
        rawScore * 10; // Fallback: scale to 0-1000
      
      console.log(`[TiltLabyrinth] Time: ${elapsed.toFixed(1)}s, Hazards: ${hazardPenalty}, Raw: ${rawScore}, Final: ${Math.round(score)}`);
      
      // Show result
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
      resultText.textContent = '🎉 Escaped!';
      resultText.style.cssText = 'font-size:1.8rem;color:#5bd68a;margin-bottom:15px;font-weight:bold;';
      
      const timeText = document.createElement('div');
      timeText.textContent = `Time: ${elapsed.toFixed(1)}s`;
      timeText.style.cssText = 'font-size:1.1rem;color:#83bfff;margin-bottom:8px;';
      
      const penaltyText = document.createElement('div');
      penaltyText.textContent = `Hazard hits: ${hazardPenalty}`;
      penaltyText.style.cssText = 'font-size:1.1rem;color:#ff6b9d;margin-bottom:12px;';
      
      const scoreText = document.createElement('div');
      scoreText.textContent = `Score: ${Math.round(score)}`;
      scoreText.style.cssText = 'font-size:1.3rem;color:#f7b955;font-weight:600;';
      
      resultDiv.appendChild(resultText);
      resultDiv.appendChild(timeText);
      resultDiv.appendChild(penaltyText);
      resultDiv.appendChild(scoreText);
      container.appendChild(resultDiv);
      
      // Cleanup
      if(useTiltControls){
        window.removeEventListener('deviceorientation', handleOrientation);
      }
      // Always remove keyboard event listeners since they're always registered
      if(keydownHandler) window.removeEventListener('keydown', keydownHandler);
      if(keyupHandler) window.removeEventListener('keyup', keyupHandler);
      
      setTimeout(() => {
        if(typeof onComplete === 'function'){
          onComplete(Math.round(score));
        }
      }, COMPLETION_DELAY_MS);
    }

    // Always setup pointer and keyboard controls
    setupPointerControls();
    setupKeyboardControls();
    
    // Try to detect tilt controls
    setupControls();
    draw();
    
    // Start game loop after a short delay
    setTimeout(() => {
      startTime = Date.now();
      gameLoop();
    }, 500);
  }

  // Register module (both MinigameModules and legacy MiniGames)
  if(typeof g.MinigameModules !== 'undefined' && typeof g.MinigameModules.register === 'function'){
    g.MinigameModules.register('tiltLabyrinth', { render });
  } else {
    // Fallback to direct registration
    g.MinigameModules = g.MinigameModules || {};
    g.MinigameModules.tiltLabyrinth = { render };
    g.MiniGames = g.MiniGames || {};
    g.MiniGames.tiltLabyrinth = { render };
  }

  console.info('[TiltLabyrinth] Hard mode module loaded');

})(window);
