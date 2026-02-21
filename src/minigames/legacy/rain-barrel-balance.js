// MODULE: minigames/rain-barrel-balance.js
// Endurance #3 — Rain Barrel Balance
// Align center-of-mass with target zone while water sloshes

(function(g){
  'use strict';
  
  const gameId = 'rain-barrel-balance';
  
  function render(container, onComplete, options = {}){
    const root = document.createElement('div');
    root.style.cssText = 'position:relative;display:grid;grid-template-rows:auto 1fr auto;height:100%;min-height:480px;background:linear-gradient(180deg,#071423,#0b1b36);color:#e8f2ff;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;overflow:hidden;';
    
    // Game state
    let state = 'instructions';
    let waterLeft = 50; // 0-100
    let waterRight = 50; // 0-100
    let targetPosition = 50; // 0-100
    let score = 0;
    let timeElapsed = 0;
    let startTime = 0;
    let animationFrame = null;
    let lastInputTime = 0;
    const ANTI_SPAM_DELAY = 120; // ms between inputs
    
    // Difficulty ramping
    let difficultyLevel = 1;
    const BASE_RAIN_RATE = 0.15; // units per frame
    const BASE_SLOSH_RATE = 0.08; // natural water movement
    const BASE_TARGET_SPEED = 0.03; // target movement speed
    
    // Instructions overlay
    const instructionsOverlay = document.createElement('div');
    instructionsOverlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(10,15,30,0.95);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;z-index:100;';
    instructionsOverlay.innerHTML = `
      <h2 style="margin:0 0 16px;font-size:1.8rem;color:#83bfff;">Rain Barrel Balance</h2>
      <div style="max-width:400px;text-align:center;line-height:1.6;color:#95a9c0;margin-bottom:24px;">
        <p style="margin:0 0 12px;">Balance a rain barrel by managing water levels!</p>
        <p style="margin:0 0 12px;"><strong style="color:#e8f3ff;">TAP LEFT</strong> to tilt left and move water<br><strong style="color:#e8f3ff;">TAP RIGHT</strong> to tilt right and move water</p>
        <p style="margin:0 0 12px;">Keep the center-of-mass aligned with the <strong style="color:#ff6b9d;">moving target</strong>.</p>
        <p style="margin:0;">Rain fills both sides — manage the slosh!</p>
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
    
    // Target indicator bar
    const targetBar = document.createElement('div');
    targetBar.style.cssText = 'position:relative;width:100%;max-width:400px;height:40px;background:rgba(20,30,50,0.6);border-radius:20px;overflow:hidden;margin-bottom:20px;';
    
    const targetZone = document.createElement('div');
    targetZone.id = 'targetZone';
    targetZone.style.cssText = 'position:absolute;top:0;height:100%;width:40px;background:rgba(131,191,255,0.4);border:2px solid #83bfff;border-radius:20px;transition:left 0.1s ease-out;';
    targetBar.appendChild(targetZone);
    
    const comIndicator = document.createElement('div');
    comIndicator.id = 'comIndicator';
    comIndicator.style.cssText = 'position:absolute;top:0;left:50%;width:4px;height:100%;background:#ff6b9d;box-shadow:0 0 10px rgba(255,107,157,0.8);transform:translateX(-50%);transition:left 0.05s ease-out;';
    targetBar.appendChild(comIndicator);
    
    gameArea.appendChild(targetBar);
    
    // Barrel visualization
    const barrelContainer = document.createElement('div');
    barrelContainer.style.cssText = 'position:relative;width:300px;height:200px;margin-bottom:20px;';
    
    const barrel = document.createElement('div');
    barrel.id = 'barrel';
    barrel.style.cssText = 'position:absolute;top:0;left:50%;width:280px;height:200px;background:rgba(30,50,70,0.4);border:3px solid #2a4a6a;border-radius:12px;transform:translateX(-50%);display:grid;grid-template-columns:1fr 1px 1fr;transition:transform 0.1s ease-out;overflow:hidden;';
    
    // Left chamber
    const leftChamber = document.createElement('div');
    leftChamber.style.cssText = 'position:relative;overflow:hidden;';
    const leftWater = document.createElement('div');
    leftWater.id = 'leftWater';
    leftWater.style.cssText = 'position:absolute;bottom:0;left:0;width:100%;height:50%;background:linear-gradient(180deg,rgba(131,191,255,0.6),rgba(131,191,255,0.8));transition:height 0.1s ease-out;';
    leftChamber.appendChild(leftWater);
    barrel.appendChild(leftChamber);
    
    // Divider
    const divider = document.createElement('div');
    divider.style.cssText = 'background:#2a4a6a;';
    barrel.appendChild(divider);
    
    // Right chamber
    const rightChamber = document.createElement('div');
    rightChamber.style.cssText = 'position:relative;overflow:hidden;';
    const rightWater = document.createElement('div');
    rightWater.id = 'rightWater';
    rightWater.style.cssText = 'position:absolute;bottom:0;left:0;width:100%;height:50%;background:linear-gradient(180deg,rgba(131,191,255,0.6),rgba(131,191,255,0.8));transition:height 0.1s ease-out;';
    rightChamber.appendChild(rightWater);
    barrel.appendChild(rightChamber);
    
    barrelContainer.appendChild(barrel);
    gameArea.appendChild(barrelContainer);
    
    // Water level indicators
    const levelsDisplay = document.createElement('div');
    levelsDisplay.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:12px;width:100%;max-width:300px;margin-bottom:20px;';
    levelsDisplay.innerHTML = `
      <div style="text-align:center;padding:8px;background:rgba(20,30,50,0.4);border-radius:8px;">
        <div style="font-size:0.75rem;color:#95a9c0;margin-bottom:4px;">LEFT</div>
        <div id="leftLevel" style="font-size:1.1rem;font-weight:600;color:#83bfff;">50%</div>
      </div>
      <div style="text-align:center;padding:8px;background:rgba(20,30,50,0.4);border-radius:8px;">
        <div style="font-size:0.75rem;color:#95a9c0;margin-bottom:4px;">RIGHT</div>
        <div id="rightLevel" style="font-size:1.1rem;font-weight:600;color:#83bfff;">50%</div>
      </div>
    `;
    gameArea.appendChild(levelsDisplay);
    
    // Status
    const statusIndicator = document.createElement('div');
    statusIndicator.id = 'statusIndicator';
    statusIndicator.style.cssText = 'padding:8px 16px;background:rgba(131,191,255,0.2);border:2px solid #83bfff;border-radius:8px;font-size:0.9rem;color:#83bfff;font-weight:600;transition:all 0.2s;';
    statusIndicator.textContent = 'READY';
    gameArea.appendChild(statusIndicator);
    
    root.appendChild(gameArea);
    
    // Controls
    const controls = document.createElement('div');
    controls.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:16px;';
    controls.innerHTML = `
      <button id="leftBtn" style="padding:20px;font-size:1.2rem;background:#2a4a6a;color:#83bfff;border:none;border-radius:12px;cursor:pointer;font-weight:600;touch-action:manipulation;">← TILT LEFT</button>
      <button id="rightBtn" style="padding:20px;font-size:1.2rem;background:#2a4a6a;color:#83bfff;border:none;border-radius:12px;cursor:pointer;font-weight:600;touch-action:manipulation;">TILT RIGHT →</button>
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
      waterLeft = 50;
      waterRight = 50;
      targetPosition = 50;
      score = 0;
      timeElapsed = 0;
      startTime = Date.now();
      difficultyLevel = 1;
      
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
      
      // Add rain (fills both sides)
      const rainRate = BASE_RAIN_RATE * (1 + difficultyLevel * 0.15);
      waterLeft += rainRate;
      waterRight += rainRate;
      
      // Natural slosh (water tries to equalize)
      const sloshRate = BASE_SLOSH_RATE * (1 + difficultyLevel * 0.1);
      const diff = waterLeft - waterRight;
      if(Math.abs(diff) > 1){
        const transfer = Math.sign(diff) * sloshRate;
        waterLeft -= transfer;
        waterRight += transfer;
      }
      
      // Clamp water levels
      waterLeft = Math.max(0, Math.min(100, waterLeft));
      waterRight = Math.max(0, Math.min(100, waterRight));
      
      // Calculate center of mass (weighted average)
      const totalWater = waterLeft + waterRight;
      const com = totalWater > 0 ? (waterRight * 100) / totalWater : 50;
      
      // Move target
      const targetSpeed = BASE_TARGET_SPEED * (1 + difficultyLevel * 0.2);
      targetPosition += targetDirection * targetSpeed * 60; // ~60fps
      
      // Bounce target
      if(targetPosition <= 15 || targetPosition >= 85){
        targetDirection *= -1;
      }
      
      // Check if COM is near target (within tolerance)
      const tolerance = 15 - (difficultyLevel * 0.5); // Shrinks with difficulty
      const distance = Math.abs(com - targetPosition);
      const aligned = distance < tolerance;
      
      if(aligned){
        score += 1; // Increment score each frame when aligned
      }
      
      // Check for overflow failure
      if(waterLeft >= 100 || waterRight >= 100){
        endGame();
        return;
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
      // Update water levels
      root.querySelector('#leftWater').style.height = `${waterLeft}%`;
      root.querySelector('#rightWater').style.height = `${waterRight}%`;
      root.querySelector('#leftLevel').textContent = `${Math.round(waterLeft)}%`;
      root.querySelector('#rightLevel').textContent = `${Math.round(waterRight)}%`;
      
      // Calculate COM
      const totalWater = waterLeft + waterRight;
      const com = totalWater > 0 ? (waterRight * 100) / totalWater : 50;
      
      // Update COM indicator
      root.querySelector('#comIndicator').style.left = `${com}%`;
      
      // Update target zone
      root.querySelector('#targetZone').style.left = `calc(${targetPosition}% - 20px)`;
      
      // Update barrel tilt based on water distribution
      const tilt = (waterRight - waterLeft) * 0.15; // -15 to +15 degrees
      root.querySelector('#barrel').style.transform = `translateX(-50%) rotate(${tilt}deg)`;
      
      // Update status
      const tolerance = 15 - (difficultyLevel * 0.5);
      const distance = Math.abs(com - targetPosition);
      const aligned = distance < tolerance;
      
      const statusIndicator = root.querySelector('#statusIndicator');
      if(aligned){
        statusIndicator.textContent = '✓ ALIGNED';
        statusIndicator.style.background = 'rgba(131,191,255,0.3)';
        statusIndicator.style.borderColor = '#83bfff';
        statusIndicator.style.color = '#83bfff';
      } else {
        statusIndicator.textContent = '⚠ NOT ALIGNED';
        statusIndicator.style.background = 'rgba(255,107,157,0.3)';
        statusIndicator.style.borderColor = '#ff6b9d';
        statusIndicator.style.color = '#ff6b9d';
      }
    }
    
    function updateHUD(){
      root.querySelector('#timeDisplay').textContent = `${(timeElapsed / 1000).toFixed(1)}s`;
      root.querySelector('#scoreDisplay').textContent = Math.floor(score / 60); // Convert frames to seconds
      root.querySelector('#levelDisplay').textContent = difficultyLevel;
    }
    
    function handleTilt(direction){
      if(state !== 'playing') return;
      
      // Anti-spam check
      const now = Date.now();
      if(now - lastInputTime < ANTI_SPAM_DELAY) return;
      lastInputTime = now;
      
      // Transfer water (direction: -1 = left, +1 = right)
      const transferAmount = 5;
      if(direction < 0){
        // Tilt left: move water from right to left
        const transfer = Math.min(transferAmount, waterRight);
        waterRight -= transfer;
        waterLeft += transfer;
      } else {
        // Tilt right: move water from left to right
        const transfer = Math.min(transferAmount, waterLeft);
        waterLeft -= transfer;
        waterRight += transfer;
      }
      
      updateVisuals();
    }
    
    function endGame(){
      state = 'end';
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
    leftBtn.addEventListener('click', () => handleTilt(-1));
    rightBtn.addEventListener('click', () => handleTilt(1));
    replayBtn.addEventListener('click', () => {
      endScreen.style.display = 'none';
      instructionsOverlay.style.display = 'flex';
      state = 'instructions';
    });
    
    // Keyboard support
    document.addEventListener('keydown', (e) => {
      if(state !== 'playing') return;
      if(e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A'){
        handleTilt(-1);
      } else if(e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D'){
        handleTilt(1);
      }
    });
  }
  
  // Export
  if(!g.MiniGames) g.MiniGames = {};
  g.MiniGames.rainBarrelBalance = { render };
  
})(window);
