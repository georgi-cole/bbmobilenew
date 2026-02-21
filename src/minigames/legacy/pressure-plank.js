// MODULE: minigames/pressure-plank.js
// Endurance #2 — Pressure Plank Rhythm
// Alternate hold/release to stay within a moving safe window

(function(g){
  'use strict';
  
  const gameId = 'pressure-plank';
  
  function render(container, onComplete, options = {}){
    const root = document.createElement('div');
    root.style.cssText = 'position:relative;display:grid;grid-template-rows:auto 1fr auto;height:100%;min-height:480px;background:radial-gradient(120% 120% at 50% 0%, #0a0f22, #0c1630);color:#e9f3ff;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;overflow:hidden;';
    
    // Game state
    let state = 'instructions';
    let pressure = 0; // 0-100
    let targetMin = 40;
    let targetMax = 60;
    let score = 0;
    let timeElapsed = 0;
    let startTime = 0;
    let animationFrame = null;
    let isHolding = false;
    let lastToggleTime = 0;
    const ANTI_SPAM_DELAY = 150; // ms between toggles
    
    // Difficulty ramping
    let difficultyLevel = 1;
    const BASE_PRESSURE_RATE = 0.5; // units per frame when holding
    const BASE_RELEASE_RATE = 0.3; // units per frame when releasing
    const BASE_TARGET_SPEED = 0.02; // units per frame
    
    // Instructions overlay
    const instructionsOverlay = document.createElement('div');
    instructionsOverlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(10,15,30,0.95);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;z-index:100;';
    instructionsOverlay.innerHTML = `
      <h2 style="margin:0 0 16px;font-size:1.8rem;color:#83bfff;">Pressure Plank</h2>
      <div style="max-width:400px;text-align:center;line-height:1.6;color:#95a9c0;margin-bottom:24px;">
        <p style="margin:0 0 12px;">Maintain rhythm to keep pressure in the safe zone!</p>
        <p style="margin:0 0 12px;"><strong style="color:#e8f3ff;">HOLD</strong> to increase pressure<br><strong style="color:#e8f3ff;">RELEASE</strong> to decrease pressure</p>
        <p style="margin:0 0 12px;">The safe zone <strong style="color:#ff6b9d;">moves</strong> — adjust your rhythm!</p>
        <p style="margin:0;">Stay in the zone as long as possible!</p>
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
    
    // Pressure gauge
    const gaugeContainer = document.createElement('div');
    gaugeContainer.style.cssText = 'position:relative;width:100%;max-width:400px;height:300px;background:rgba(20,30,50,0.6);border-radius:12px;overflow:hidden;margin-bottom:20px;';
    
    // Target zone (moves up/down)
    const targetZone = document.createElement('div');
    targetZone.id = 'targetZone';
    targetZone.style.cssText = 'position:absolute;left:0;width:100%;height:20%;background:rgba(131,191,255,0.3);border-top:2px solid #83bfff;border-bottom:2px solid #83bfff;transition:bottom 0.1s ease-out;pointer-events:none;';
    gaugeContainer.appendChild(targetZone);
    
    // Pressure bar (rises from bottom)
    const pressureBar = document.createElement('div');
    pressureBar.id = 'pressureBar';
    pressureBar.style.cssText = 'position:absolute;bottom:0;left:0;width:100%;height:0%;background:linear-gradient(180deg,#ff6b9d,#ff3d7f);transition:height 0.05s ease-out;';
    gaugeContainer.appendChild(pressureBar);
    
    // Current pressure line indicator
    const pressureLine = document.createElement('div');
    pressureLine.style.cssText = 'position:absolute;left:0;width:100%;height:3px;background:#fff;box-shadow:0 0 10px rgba(255,255,255,0.8);transition:bottom 0.05s ease-out;pointer-events:none;';
    gaugeContainer.appendChild(pressureLine);
    
    gameArea.appendChild(gaugeContainer);
    
    // Status indicator
    const statusIndicator = document.createElement('div');
    statusIndicator.id = 'statusIndicator';
    statusIndicator.style.cssText = 'padding:8px 16px;background:rgba(131,191,255,0.2);border:2px solid #83bfff;border-radius:8px;font-size:0.9rem;color:#83bfff;font-weight:600;transition:all 0.2s;';
    statusIndicator.textContent = 'READY';
    gameArea.appendChild(statusIndicator);
    
    root.appendChild(gameArea);
    
    // Control
    const controlArea = document.createElement('div');
    controlArea.style.cssText = 'padding:16px;';
    controlArea.innerHTML = `
      <button id="holdBtn" style="width:100%;padding:24px;font-size:1.3rem;background:#2a4a6a;color:#83bfff;border:none;border-radius:12px;cursor:pointer;font-weight:600;touch-action:manipulation;transition:background 0.2s;">
        TAP TO HOLD
      </button>
      <div style="text-align:center;margin-top:8px;font-size:0.85rem;color:#95a9c0;">
        Tap and hold to increase pressure • Release to decrease
      </div>
    `;
    root.appendChild(controlArea);
    
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
    const holdBtn = root.querySelector('#holdBtn');
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
      pressure = 50;
      targetMin = 40;
      targetMax = 60;
      score = 0;
      timeElapsed = 0;
      startTime = Date.now();
      difficultyLevel = 1;
      isHolding = false;
      
      updateHUD();
      updateVisuals();
      gameLoop();
    }
    
    let targetDirection = 1;
    
    function gameLoop(){
      if(state !== 'playing'){
        return;
      }
      
      // Update time
      timeElapsed = Date.now() - startTime;
      
      // Update pressure based on holding state
      const pressureRate = BASE_PRESSURE_RATE * (1 + difficultyLevel * 0.1);
      const releaseRate = BASE_RELEASE_RATE * (1 + difficultyLevel * 0.1);
      
      if(isHolding){
        pressure += pressureRate;
      } else {
        pressure -= releaseRate;
      }
      
      // Clamp pressure
      pressure = Math.max(0, Math.min(100, pressure));
      
      // Move target zone
      const targetSpeed = BASE_TARGET_SPEED * (1 + difficultyLevel * 0.2);
      const targetCenter = (targetMin + targetMax) / 2;
      const newCenter = targetCenter + (targetDirection * targetSpeed * 60); // ~60fps
      
      // Bounce target zone
      if(newCenter <= 10 || newCenter >= 90){
        targetDirection *= -1;
      }
      
      const targetWidth = 20 - (difficultyLevel * 0.5); // Shrinks with difficulty
      targetMin = Math.max(0, newCenter - targetWidth / 2);
      targetMax = Math.min(100, newCenter + targetWidth / 2);
      
      // Check if pressure is in safe zone
      const inZone = pressure >= targetMin && pressure <= targetMax;
      
      if(inZone){
        score += 1; // Increment score each frame in zone
      } else {
        // Out of zone - potential failure
        if(pressure <= 0 || pressure >= 100){
          endGame();
          return;
        }
      }
      
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
      // Update pressure bar
      const pressureBar = root.querySelector('#pressureBar');
      pressureBar.style.height = `${pressure}%`;
      
      // Update target zone position
      const targetZone = root.querySelector('#targetZone');
      targetZone.style.bottom = `${targetMin}%`;
      targetZone.style.height = `${targetMax - targetMin}%`;
      
      // Update status indicator
      const statusIndicator = root.querySelector('#statusIndicator');
      const inZone = pressure >= targetMin && pressure <= targetMax;
      
      if(inZone){
        statusIndicator.textContent = '✓ IN ZONE';
        statusIndicator.style.background = 'rgba(131,191,255,0.3)';
        statusIndicator.style.borderColor = '#83bfff';
        statusIndicator.style.color = '#83bfff';
      } else {
        statusIndicator.textContent = '⚠ OUT OF ZONE';
        statusIndicator.style.background = 'rgba(255,107,157,0.3)';
        statusIndicator.style.borderColor = '#ff6b9d';
        statusIndicator.style.color = '#ff6b9d';
      }
      
      // Update button appearance
      const holdBtn = root.querySelector('#holdBtn');
      if(isHolding){
        holdBtn.style.background = '#ff6b9d';
        holdBtn.style.color = '#0b1020';
        holdBtn.textContent = 'HOLDING...';
      } else {
        holdBtn.style.background = '#2a4a6a';
        holdBtn.style.color = '#83bfff';
        holdBtn.textContent = 'TAP TO HOLD';
      }
    }
    
    function updateHUD(){
      root.querySelector('#timeDisplay').textContent = `${(timeElapsed / 1000).toFixed(1)}s`;
      root.querySelector('#scoreDisplay').textContent = Math.floor(score / 60); // Convert frames to seconds
      root.querySelector('#levelDisplay').textContent = difficultyLevel;
    }
    
    function endGame(){
      state = 'end';
      isHolding = false;
      if(animationFrame){
        cancelAnimationFrame(animationFrame);
      }
      
      // Calculate final score (0-100 scale)
      const survivalTime = timeElapsed / 1000;
      const rawScore = Math.min(100, Math.max(0, survivalTime * 2)); // ~50s = 100 score
      
      // Show end screen
      endScreen.style.display = 'flex';
      root.querySelector('#finalScore').textContent = Math.round(rawScore);
      root.querySelector('#finalTime').textContent = `${survivalTime.toFixed(1)}s`;
      
      // Set result and dispatch event
      g.minigameResult = {
        game: gameId,
        score: rawScore,
        time: timeElapsed,
        survived: survivalTime
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
    
    holdBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if(state !== 'playing') return;
      
      const now = Date.now();
      if(now - lastToggleTime < ANTI_SPAM_DELAY) return;
      lastToggleTime = now;
      
      isHolding = true;
      updateVisuals();
    });
    
    holdBtn.addEventListener('pointerup', (e) => {
      e.preventDefault();
      if(state !== 'playing') return;
      
      isHolding = false;
      updateVisuals();
    });
    
    holdBtn.addEventListener('pointerleave', (e) => {
      if(state !== 'playing') return;
      isHolding = false;
      updateVisuals();
    });
    
    replayBtn.addEventListener('click', () => {
      endScreen.style.display = 'none';
      instructionsOverlay.style.display = 'flex';
      state = 'instructions';
    });
    
    // Keyboard support (spacebar)
    document.addEventListener('keydown', (e) => {
      if(state !== 'playing') return;
      if(e.key === ' ' || e.key === 'Spacebar'){
        e.preventDefault();
        isHolding = true;
        updateVisuals();
      }
    });
    
    document.addEventListener('keyup', (e) => {
      if(state !== 'playing') return;
      if(e.key === ' ' || e.key === 'Spacebar'){
        e.preventDefault();
        isHolding = false;
        updateVisuals();
      }
    });
  }
  
  // Export
  if(!g.MiniGames) g.MiniGames = {};
  g.MiniGames.pressurePlank = { render };
  
})(window);
