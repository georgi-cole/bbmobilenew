// MODULE: minigames/tilted-ledge.js
// Endurance #1 — The Tilted Ledge
// Keep balance on a tilting ledge with telegraphed jerks

(function(g){
  'use strict';
  
  const gameId = 'tilted-ledge';
  
  function render(container, onComplete, options = {}){
    const root = document.createElement('div');
    root.style.cssText = 'position:relative;display:grid;grid-template-rows:auto 1fr auto;height:100%;min-height:480px;background:linear-gradient(180deg,#0b1020,#0f1530);color:#e8f3ff;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;overflow:hidden;';
    
    // Game state
    let state = 'instructions'; // instructions, countdown, playing, end
    let balance = 50; // 0-100, center is 50
    let score = 0;
    let timeElapsed = 0;
    let startTime = 0;
    let animationFrame = null;
    let inputActive = false;
    let lastInputTime = 0;
    const ANTI_SPAM_DELAY = 100; // ms between inputs
    
    // Difficulty ramping
    let difficultyLevel = 1;
    const BASE_DRIFT_RATE = 0.03; // units per frame
    const BASE_JERK_INTERVAL = 3000; // ms
    const BASE_JERK_STRENGTH = 8; // units
    
    // Instructions overlay
    const instructionsOverlay = document.createElement('div');
    instructionsOverlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(10,15,30,0.95);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;z-index:100;';
    instructionsOverlay.innerHTML = `
      <h2 style="margin:0 0 16px;font-size:1.8rem;color:#83bfff;">The Tilted Ledge</h2>
      <div style="max-width:400px;text-align:center;line-height:1.6;color:#95a9c0;margin-bottom:24px;">
        <p style="margin:0 0 12px;">Keep your balance on a constantly tilting ledge!</p>
        <p style="margin:0 0 12px;"><strong style="color:#e8f3ff;">Tap LEFT</strong> to lean left<br><strong style="color:#e8f3ff;">Tap RIGHT</strong> to lean right</p>
        <p style="margin:0 0 12px;">Watch for <strong style="color:#ff6b9d;">telegraphed jerks</strong> that will push you off balance.</p>
        <p style="margin:0;">Survive as long as possible!</p>
      </div>
      <button id="startBtn" style="padding:12px 32px;font-size:1.1rem;background:#83bfff;color:#0b1020;border:none;border-radius:8px;cursor:pointer;font-weight:600;touch-action:manipulation;">
        START GAME
      </button>
    `;
    root.appendChild(instructionsOverlay);
    
    // Countdown overlay
    const countdownOverlay = document.createElement('div');
    countdownOverlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(10,15,30,0.9);display:none;flex-direction:column;align-items:center;justify-content:center;z-index:99;';
    countdownOverlay.innerHTML = `
      <div id="countdownText" style="font-size:6rem;font-weight:bold;color:#83bfff;">3</div>
    `;
    root.appendChild(countdownOverlay);
    
    // HUD
    const hud = document.createElement('div');
    hud.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;padding:16px;background:rgba(10,15,30,0.8);backdrop-filter:blur(4px);';
    hud.innerHTML = `
      <div style="text-align:center;">
        <div style="font-size:0.75rem;color:#95a9c0;text-transform:uppercase;margin-bottom:4px;">Time</div>
        <div id="timeDisplay" style="font-size:1.3rem;font-weight:600;color:#83bfff;">0.0s</div>
      </div>
      <div style="text-align:center;">
        <div style="font-size:0.75rem;color:#95a9c0;text-transform:uppercase;margin-bottom:4px;">Score</div>
        <div id="scoreDisplay" style="font-size:1.3rem;font-weight:600;color:#83bfff;">0</div>
      </div>
      <div style="text-align:center;">
        <div style="font-size:0.75rem;color:#95a9c0;text-transform:uppercase;margin-bottom:4px;">Level</div>
        <div id="levelDisplay" style="font-size:1.3rem;font-weight:600;color:#83bfff;">1</div>
      </div>
    `;
    root.appendChild(hud);
    
    // Game area
    const gameArea = document.createElement('div');
    gameArea.style.cssText = 'position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;';
    
    // Balance indicator
    const balanceContainer = document.createElement('div');
    balanceContainer.style.cssText = 'position:relative;width:100%;max-width:400px;height:40px;background:rgba(20,30,50,0.6);border-radius:20px;overflow:hidden;margin-bottom:40px;';
    
    const balanceBar = document.createElement('div');
    balanceBar.id = 'balanceBar';
    balanceBar.style.cssText = 'position:absolute;top:0;left:50%;width:4px;height:100%;background:#83bfff;transform:translateX(-50%);transition:left 0.1s ease-out;';
    balanceContainer.appendChild(balanceBar);
    
    // Safe zone indicator
    const safeZone = document.createElement('div');
    safeZone.style.cssText = 'position:absolute;top:0;left:30%;width:40%;height:100%;background:rgba(131,191,255,0.15);pointer-events:none;';
    balanceContainer.appendChild(safeZone);
    
    gameArea.appendChild(balanceContainer);
    
    // Ledge visualization
    const ledge = document.createElement('div');
    ledge.id = 'ledge';
    ledge.style.cssText = 'width:300px;height:60px;background:linear-gradient(180deg,#2a4a6a,#1a2a3a);border-radius:8px;position:relative;transition:transform 0.1s ease-out;box-shadow:0 4px 20px rgba(0,0,0,0.4);';
    
    const playerDot = document.createElement('div');
    playerDot.style.cssText = 'position:absolute;top:50%;left:50%;width:24px;height:24px;background:#ff6b9d;border-radius:50%;transform:translate(-50%,-50%);box-shadow:0 2px 8px rgba(255,107,157,0.6);';
    ledge.appendChild(playerDot);
    
    gameArea.appendChild(ledge);
    
    // Warning indicator for jerks
    const warningIndicator = document.createElement('div');
    warningIndicator.id = 'warningIndicator';
    warningIndicator.style.cssText = 'margin-top:20px;padding:8px 16px;background:rgba(255,107,157,0.2);border:2px solid #ff6b9d;border-radius:8px;opacity:0;transition:opacity 0.3s;font-size:0.9rem;color:#ff6b9d;font-weight:600;';
    warningIndicator.textContent = '⚠ JERK INCOMING!';
    gameArea.appendChild(warningIndicator);
    
    root.appendChild(gameArea);
    
    // Controls
    const controls = document.createElement('div');
    controls.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:16px;';
    controls.innerHTML = `
      <button id="leftBtn" style="padding:20px;font-size:1.2rem;background:#2a4a6a;color:#83bfff;border:none;border-radius:12px;cursor:pointer;font-weight:600;touch-action:manipulation;">← LEFT</button>
      <button id="rightBtn" style="padding:20px;font-size:1.2rem;background:#2a4a6a;color:#83bfff;border:none;border-radius:12px;cursor:pointer;font-weight:600;touch-action:manipulation;">RIGHT →</button>
    `;
    root.appendChild(controls);
    
    // End screen
    const endScreen = document.createElement('div');
    endScreen.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(10,15,30,0.95);display:none;flex-direction:column;align-items:center;justify-content:center;padding:20px;z-index:98;';
    endScreen.innerHTML = `
      <h2 style="margin:0 0 16px;font-size:2rem;color:#83bfff;">Game Over!</h2>
      <div style="text-align:center;margin-bottom:24px;">
        <div style="font-size:0.9rem;color:#95a9c0;margin-bottom:8px;">Final Score</div>
        <div id="finalScore" style="font-size:3rem;font-weight:bold;color:#ff6b9d;">0</div>
        <div style="font-size:0.9rem;color:#95a9c0;margin-top:8px;">Time Survived: <span id="finalTime">0.0s</span></div>
      </div>
      <button id="replayBtn" style="padding:12px 32px;font-size:1.1rem;background:#83bfff;color:#0b1020;border:none;border-radius:8px;cursor:pointer;font-weight:600;touch-action:manipulation;">
        REPLAY
      </button>
    `;
    root.appendChild(endScreen);
    
    container.appendChild(root);
    
    // Event handlers
    const startBtn = root.querySelector('#startBtn');
    const leftBtn = root.querySelector('#leftBtn');
    const rightBtn = root.querySelector('#rightBtn');
    const replayBtn = root.querySelector('#replayBtn');
    
    function startCountdown(){
      state = 'countdown';
      instructionsOverlay.style.display = 'none';
      countdownOverlay.style.display = 'flex';
      
      let count = 3;
      const countdownText = countdownOverlay.querySelector('#countdownText');
      
      const interval = setInterval(() => {
        count--;
        if(count > 0){
          countdownText.textContent = count;
        } else if(count === 0){
          countdownText.textContent = 'GO!';
        } else {
          clearInterval(interval);
          countdownOverlay.style.display = 'none';
          startGame();
        }
      }, 1000);
    }
    
    function startGame(){
      state = 'playing';
      balance = 50;
      score = 0;
      timeElapsed = 0;
      startTime = Date.now();
      difficultyLevel = 1;
      inputActive = true;
      
      updateHUD();
      gameLoop();
      scheduleJerk();
    }
    
    let nextJerkTime = 0;
    let jerkWarningActive = false;
    
    function scheduleJerk(){
      if(state !== 'playing') return;
      
      const interval = BASE_JERK_INTERVAL / difficultyLevel;
      nextJerkTime = Date.now() + interval;
      
      // Show warning 500ms before jerk
      setTimeout(() => {
        if(state === 'playing'){
          jerkWarningActive = true;
          const warning = root.querySelector('#warningIndicator');
          warning.style.opacity = '1';
        }
      }, interval - 500);
    }
    
    function applyJerk(){
      const direction = Math.random() < 0.5 ? -1 : 1;
      const strength = BASE_JERK_STRENGTH * (1 + difficultyLevel * 0.2);
      balance += direction * strength;
      
      jerkWarningActive = false;
      const warning = root.querySelector('#warningIndicator');
      warning.style.opacity = '0';
      
      scheduleJerk();
    }
    
    function gameLoop(){
      if(state !== 'playing'){
        return;
      }
      
      // Update time
      timeElapsed = Date.now() - startTime;
      
      // Apply passive drift
      const driftRate = BASE_DRIFT_RATE * (1 + difficultyLevel * 0.15);
      const driftDirection = balance < 50 ? -1 : 1;
      balance += driftDirection * driftRate;
      
      // Check for jerk
      if(Date.now() >= nextJerkTime){
        applyJerk();
      }
      
      // Clamp balance
      balance = Math.max(0, Math.min(100, balance));
      
      // Check for fall
      if(balance <= 5 || balance >= 95){
        endGame();
        return;
      }
      
      // Update score (survival time in deciseconds)
      score = Math.floor(timeElapsed / 100);
      
      // Ramp difficulty every 10 seconds
      const newLevel = Math.floor(timeElapsed / 10000) + 1;
      if(newLevel > difficultyLevel){
        difficultyLevel = newLevel;
      }
      
      // Update visuals
      updateVisuals();
      updateHUD();
      
      animationFrame = requestAnimationFrame(gameLoop);
    }
    
    function updateVisuals(){
      const balanceBar = root.querySelector('#balanceBar');
      balanceBar.style.left = `${balance}%`;
      
      const ledge = root.querySelector('#ledge');
      const tilt = (balance - 50) * 0.5; // -25 to +25 degrees
      ledge.style.transform = `rotate(${tilt}deg)`;
    }
    
    function updateHUD(){
      root.querySelector('#timeDisplay').textContent = `${(timeElapsed / 1000).toFixed(1)}s`;
      root.querySelector('#scoreDisplay').textContent = score;
      root.querySelector('#levelDisplay').textContent = difficultyLevel;
    }
    
    function handleInput(direction){
      if(!inputActive || state !== 'playing') return;
      
      // Anti-spam check
      const now = Date.now();
      if(now - lastInputTime < ANTI_SPAM_DELAY) return;
      lastInputTime = now;
      
      // Apply correction
      const correction = 3 * direction; // -3 or +3
      balance += correction;
    }
    
    function endGame(){
      state = 'end';
      inputActive = false;
      if(animationFrame){
        cancelAnimationFrame(animationFrame);
      }
      
      // Calculate final score (0-100 scale)
      const rawScore = Math.min(100, Math.max(0, score));
      
      // Show end screen
      endScreen.style.display = 'flex';
      root.querySelector('#finalScore').textContent = Math.round(rawScore);
      root.querySelector('#finalTime').textContent = `${(timeElapsed / 1000).toFixed(1)}s`;
      
      // Set result and dispatch event
      g.minigameResult = {
        game: gameId,
        score: rawScore,
        time: timeElapsed,
        survived: timeElapsed / 1000
      };
      
      g.dispatchEvent(new CustomEvent('minigame:end', {
        detail: g.minigameResult
      }));
      
      // Call completion callback
      setTimeout(() => {
        if(typeof onComplete === 'function'){
          onComplete(rawScore);
        }
      }, 1500);
    }
    
    // Wire up events
    startBtn.addEventListener('click', startCountdown);
    leftBtn.addEventListener('click', () => handleInput(-1));
    rightBtn.addEventListener('click', () => handleInput(1));
    replayBtn.addEventListener('click', () => {
      endScreen.style.display = 'none';
      instructionsOverlay.style.display = 'flex';
      state = 'instructions';
    });
    
    // Keyboard support
    document.addEventListener('keydown', (e) => {
      if(state !== 'playing') return;
      if(e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A'){
        handleInput(-1);
      } else if(e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D'){
        handleInput(1);
      }
    });
  }
  
  // Export
  if(!g.MiniGames) g.MiniGames = {};
  g.MiniGames.tiltedLedge = { render };
  
})(window);
