// MODULE: minigames/confetti-cannon.js
// Confetti Cannon - Touch-based target shooter gallery with decoys and combos

(function(g){
  'use strict';

  // Constants
  const GAME_DURATION = 60000; // 60 seconds
  const TARGET_LIFETIME_START = 2000; // 2 seconds
  const TARGET_LIFETIME_MIN = 800; // 0.8 seconds
  const CORRECT_TARGET_POINTS = 10;
  const WRONG_COLOR_PENALTY = 5;
  const COMBO_MULTIPLIER = 1.5;
  const OVERHEAT_THRESHOLD = 8; // taps per second
  const OVERHEAT_LOCKOUT_MS = 500;
  const TARGET_SIZE = 50;
  const REGION_SPAM_THRESHOLD = 5; // taps in same region
  const REGION_RADIUS = 80;
  const TARGET_COLOR_CHANGE_MS = 5000; // 5 seconds
  const SPAWN_INTERVAL_START = 1500; // 1.5 seconds
  const SPAWN_INTERVAL_MIN = 600; // 0.6 seconds
  
  // Color palette for targets
  const COLOR_PALETTE = [
    { name: 'Red', hex: '#ff3366', lightHex: '#ff6b6b' },
    { name: 'Blue', hex: '#3366ff', lightHex: '#6b8fff' },
    { name: 'Green', hex: '#33ff66', lightHex: '#74e48b' },
    { name: 'Yellow', hex: '#ffcc33', lightHex: '#f7b955' },
    { name: 'Purple', hex: '#9933ff', lightHex: '#a78bfa' },
    { name: 'Orange', hex: '#ff6633', lightHex: '#ff8c5a' }
  ];

  /**
   * Generate confetti particles
   */
  function createConfetti(x, y, container){
    const colors = ['#ff6b6b', '#6fd3ff', '#74e48b', '#f7b955', '#a78bfa'];
    for(let i = 0; i < 12; i++){
      const particle = document.createElement('div');
      particle.style.cssText = `
        position:absolute;
        left:${x}px;
        top:${y}px;
        width:6px;
        height:6px;
        background:${colors[Math.floor(Math.random() * colors.length)]};
        border-radius:50%;
        pointer-events:none;
        z-index:1000;
      `;
      container.appendChild(particle);
      
      const angle = (Math.PI * 2 * i) / 12;
      const velocity = 50 + Math.random() * 50;
      const vx = Math.cos(angle) * velocity;
      const vy = Math.sin(angle) * velocity;
      
      let px = x, py = y;
      let time = 0;
      
      const animate = () => {
        time += 16;
        px += vx * 0.016;
        py += vy * 0.016 + time * 0.3; // gravity
        
        particle.style.left = px + 'px';
        particle.style.top = py + 'px';
        particle.style.opacity = Math.max(0, 1 - time / 600);
        
        if(time < 600){
          requestAnimationFrame(animate);
        } else {
          container.removeChild(particle);
        }
      };
      animate();
    }
  }

  /**
   * Render the Confetti Cannon minigame
   */
  function render(container, onComplete, options = {}){
    container.innerHTML = '';
    
    const { debugMode = false, competitionMode = false } = options;
    
    // Main wrapper
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:16px;padding:20px;width:100%;max-width:600px;margin:0 auto;';
    
    // Title
    const title = document.createElement('h3');
    title.textContent = 'Confetti Cannon';
    title.style.cssText = 'margin:0;font-size:1.3rem;color:#e3ecf5;';
    
    // Instructions overlay
    const instructionsOverlay = document.createElement('div');
    instructionsOverlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);z-index:10000;display:flex;align-items:center;justify-content:center;';
    
    const instructionsBox = document.createElement('div');
    instructionsBox.style.cssText = 'background:#1d2734;padding:30px;border-radius:12px;max-width:400px;text-align:center;';
    instructionsBox.innerHTML = `
      <h2 style="color:#6fd3ff;margin:0 0 20px 0;">How to Play</h2>
      <p style="color:#e3ecf5;margin:10px 0;line-height:1.6;">
        • Tap targets that match the <strong>required color</strong><br>
        • The required color changes every 5 seconds<br>
        • Wrong color targets give penalties<br>
        • Build combos with consecutive correct hits<br>
        • Targets disappear quickly - be fast!<br>
        • Game gets faster and harder over time<br>
        • Don't tap too fast or you'll overheat<br>
        • 60 seconds to get the highest score
      </p>
      <button id="startGameBtn" class="btn primary" style="margin-top:20px;padding:12px 32px;font-size:1.1rem;">START GAME</button>
    `;
    instructionsOverlay.appendChild(instructionsBox);
    document.body.appendChild(instructionsOverlay);
    
    // HUD
    const hudDiv = document.createElement('div');
    hudDiv.style.cssText = 'display:flex;justify-content:space-between;width:100%;font-size:0.9rem;';
    
    const scoreDiv = document.createElement('div');
    scoreDiv.style.cssText = 'color:#83bfff;';
    scoreDiv.textContent = 'Score: 0';
    
    const comboDiv = document.createElement('div');
    comboDiv.style.cssText = 'color:#74e48b;font-weight:bold;';
    comboDiv.textContent = 'Combo: 0x';
    
    const timerDiv = document.createElement('div');
    timerDiv.style.cssText = 'color:#f7b955;';
    timerDiv.textContent = '60s';
    
    hudDiv.appendChild(scoreDiv);
    hudDiv.appendChild(comboDiv);
    hudDiv.appendChild(timerDiv);
    
    // Color badge - shows current required color
    const colorBadge = document.createElement('div');
    colorBadge.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:12px;padding:12px 20px;background:#2c3a4d;border-radius:8px;width:100%;';
    
    const colorLabel = document.createElement('div');
    colorLabel.style.cssText = 'color:#95a9c0;font-size:0.9rem;font-weight:bold;';
    colorLabel.textContent = 'TAP THIS COLOR:';
    
    const colorSwatch = document.createElement('div');
    colorSwatch.style.cssText = 'width:32px;height:32px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 12px rgba(0,0,0,0.5);';
    
    const colorName = document.createElement('div');
    colorName.style.cssText = 'font-size:1.1rem;font-weight:bold;color:#fff;';
    
    colorBadge.appendChild(colorLabel);
    colorBadge.appendChild(colorSwatch);
    colorBadge.appendChild(colorName);
    
    // Game area
    const gameArea = document.createElement('div');
    gameArea.style.cssText = 'position:relative;width:100%;height:400px;background:#0a1420;border:2px solid #2c3a4d;border-radius:8px;overflow:hidden;touch-action:none;';
    
    // Overheat indicator
    const overheatDiv = document.createElement('div');
    overheatDiv.style.cssText = 'position:absolute;top:10px;left:50%;transform:translateX(-50%);padding:8px 16px;background:#ff3366;color:#fff;border-radius:6px;font-weight:bold;display:none;z-index:2000;';
    overheatDiv.textContent = 'OVERHEATED!';
    gameArea.appendChild(overheatDiv);
    
    // Stats display
    const statsDiv = document.createElement('div');
    statsDiv.style.cssText = 'width:100%;background:#1a2332;border-radius:6px;padding:12px;font-size:0.85rem;color:#95a9c0;';
    
    wrapper.appendChild(title);
    wrapper.appendChild(hudDiv);
    wrapper.appendChild(colorBadge);
    wrapper.appendChild(gameArea);
    wrapper.appendChild(statsDiv);
    container.appendChild(wrapper);
    
    // Game state
    let gameActive = false;
    let score = 0;
    let startTime = 0;
    let currentCombo = 0;
    let maxCombo = 0;
    let targetsHit = 0;
    let targetsMissed = 0;
    let wrongColorHits = 0;
    let totalTargets = 0;
    let targets = [];
    let animationFrame = null;
    let spawnInterval = null;
    let colorChangeInterval = null;
    let recentTaps = [];
    let regionTaps = [];
    let isOverheated = false;
    let targetLifetime = TARGET_LIFETIME_START;
    let spawnIntervalTime = SPAWN_INTERVAL_START;
    let activeColor = COLOR_PALETTE[0];
    
    // Update color badge display
    function updateColorBadge(){
      colorSwatch.style.background = activeColor.hex;
      colorSwatch.style.borderColor = activeColor.lightHex;
      colorSwatch.style.boxShadow = `0 0 16px ${activeColor.hex}`;
      colorName.textContent = activeColor.name;
      colorName.style.color = activeColor.lightHex;
    }
    updateColorBadge();
    
    // Spawn target
    function spawnTarget(){
      if(!gameActive) return;
      
      const rect = gameArea.getBoundingClientRect();
      const x = Math.random() * (rect.width - TARGET_SIZE);
      const y = Math.random() * (rect.height - TARGET_SIZE);
      
      // Check if region has been spammed
      const regionSpammed = regionTaps.filter(tap => {
        const dist = Math.sqrt(Math.pow(tap.x - x, 2) + Math.pow(tap.y - y, 2));
        return dist < REGION_RADIUS && Date.now() - tap.time < 5000;
      }).length >= REGION_SPAM_THRESHOLD;
      
      // Select color (more likely to match active color if not region spammed)
      const elapsed = Date.now() - startTime;
      const correctChance = regionSpammed ? 0.4 : 0.6; // 60% correct normally, 40% if spammed
      const isCorrectColor = Math.random() < correctChance;
      
      let targetColor;
      if(isCorrectColor){
        targetColor = activeColor;
      } else {
        // Pick a random different color
        const otherColors = COLOR_PALETTE.filter(c => c.name !== activeColor.name);
        targetColor = otherColors[Math.floor(Math.random() * otherColors.length)];
      }
      
      const targetDiv = document.createElement('div');
      targetDiv.style.cssText = `
        position:absolute;
        left:${x}px;
        top:${y}px;
        width:${TARGET_SIZE}px;
        height:${TARGET_SIZE}px;
        border-radius:50%;
        background:${targetColor.hex};
        border:3px solid ${targetColor.lightHex};
        box-shadow:0 0 12px ${targetColor.hex};
        cursor:pointer;
        display:flex;
        align-items:center;
        justify-content:center;
        font-size:1.5rem;
        transition:transform 0.1s;
        z-index:100;
      `;
      targetDiv.textContent = '✓';
      
      gameArea.appendChild(targetDiv);
      
      const target = {
        div: targetDiv,
        x,
        y,
        color: targetColor,
        isCorrectColor,
        spawnTime: Date.now(),
        lifetime: targetLifetime
      };
      
      targets.push(target);
      totalTargets++;
      
      // Handle click
      targetDiv.addEventListener('click', (e) => {
        e.stopPropagation();
        handleTargetClick(target);
      });
      
      // Moving targets (later in game)
      if(elapsed > 30000){
        const vx = (Math.random() - 0.5) * 2;
        const vy = (Math.random() - 0.5) * 2;
        target.velocity = { vx, vy };
      }
    }
    
    // Handle target click
    function handleTargetClick(target){
      if(!gameActive || isOverheated) return;
      
      // Check overheat
      const now = Date.now();
      recentTaps = recentTaps.filter(t => now - t < 1000);
      recentTaps.push(now);
      
      if(recentTaps.length > OVERHEAT_THRESHOLD){
        triggerOverheat();
        return;
      }
      
      // Record region tap
      regionTaps.push({ x: target.x, y: target.y, time: now });
      regionTaps = regionTaps.filter(tap => now - tap.time < 5000);
      
      // Remove target
      const idx = targets.indexOf(target);
      if(idx !== -1){
        targets.splice(idx, 1);
        gameArea.removeChild(target.div);
      }
      
      if(!target.isCorrectColor){
        // Hit wrong color - penalty!
        score = Math.max(0, score - WRONG_COLOR_PENALTY);
        currentCombo = 0;
        wrongColorHits++;
        
        // Flash screen red
        gameArea.style.background = '#ff3366';
        setTimeout(() => {
          gameArea.style.background = '#0a1420';
        }, 100);
        
        // Screen shake
        gameArea.style.transform = 'translateX(-5px)';
        setTimeout(() => {
          gameArea.style.transform = 'translateX(5px)';
          setTimeout(() => {
            gameArea.style.transform = 'translateX(0)';
          }, 50);
        }, 50);
      } else {
        // Hit correct color!
        currentCombo++;
        maxCombo = Math.max(maxCombo, currentCombo);
        
        const points = Math.floor(CORRECT_TARGET_POINTS * Math.pow(COMBO_MULTIPLIER, Math.min(currentCombo - 1, 5)));
        score += points;
        targetsHit++;
        
        // Confetti!
        createConfetti(target.x + TARGET_SIZE/2, target.y + TARGET_SIZE/2, gameArea);
        
        // Score popup
        const popup = document.createElement('div');
        popup.textContent = `+${points}`;
        popup.style.cssText = `
          position:absolute;
          left:${target.x}px;
          top:${target.y}px;
          color:${activeColor.lightHex};
          font-weight:bold;
          font-size:1.2rem;
          pointer-events:none;
          z-index:500;
        `;
        gameArea.appendChild(popup);
        
        let popupY = target.y;
        const popupAnim = () => {
          popupY -= 2;
          popup.style.top = popupY + 'px';
          popup.style.opacity = Math.max(0, 1 - (target.y - popupY) / 50);
          
          if(target.y - popupY < 50){
            requestAnimationFrame(popupAnim);
          } else {
            gameArea.removeChild(popup);
          }
        };
        popupAnim();
      }
      
      scoreDiv.textContent = `Score: ${score}`;
      comboDiv.textContent = `Combo: ${currentCombo}x`;
      comboDiv.style.fontSize = currentCombo > 5 ? '1.2rem' : '0.9rem';
    }
    
    // Trigger overheat
    function triggerOverheat(){
      isOverheated = true;
      overheatDiv.style.display = 'block';
      
      setTimeout(() => {
        isOverheated = false;
        overheatDiv.style.display = 'none';
      }, OVERHEAT_LOCKOUT_MS);
    }
    
    // Game loop
    function gameLoop(){
      if(!gameActive) return;
      
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, GAME_DURATION - elapsed);
      timerDiv.textContent = `${Math.ceil(remaining/1000)}s`;
      
      // Update target lifetime (gets shorter over time)
      const progressRatio = elapsed / GAME_DURATION;
      targetLifetime = Math.max(
        TARGET_LIFETIME_MIN,
        TARGET_LIFETIME_START - progressRatio * (TARGET_LIFETIME_START - TARGET_LIFETIME_MIN)
      );
      
      // Update targets
      for(let i = targets.length - 1; i >= 0; i--){
        const target = targets[i];
        const age = Date.now() - target.spawnTime;
        
        // Move target if it has velocity
        if(target.velocity){
          const rect = gameArea.getBoundingClientRect();
          target.x += target.velocity.vx;
          target.y += target.velocity.vy;
          
          // Bounce off walls
          if(target.x <= 0 || target.x >= rect.width - TARGET_SIZE){
            target.velocity.vx *= -1;
          }
          if(target.y <= 0 || target.y >= rect.height - TARGET_SIZE){
            target.velocity.vy *= -1;
          }
          
          target.x = Math.max(0, Math.min(rect.width - TARGET_SIZE, target.x));
          target.y = Math.max(0, Math.min(rect.height - TARGET_SIZE, target.y));
          
          target.div.style.left = target.x + 'px';
          target.div.style.top = target.y + 'px';
        }
        
        // Fade out based on lifetime
        const fadeStart = target.lifetime * 0.7;
        if(age > fadeStart){
          const opacity = 1 - (age - fadeStart) / (target.lifetime - fadeStart);
          target.div.style.opacity = opacity;
        }
        
        // Remove expired targets
        if(age > target.lifetime){
          if(target.isCorrectColor){
            targetsMissed++;
            currentCombo = 0;
            comboDiv.textContent = 'Combo: 0x';
          }
          
          gameArea.removeChild(target.div);
          targets.splice(i, 1);
        }
      }
      
      // Game end
      if(remaining <= 0){
        endGame();
        return;
      }
      
      animationFrame = requestAnimationFrame(gameLoop);
    }
    
    // End game
    function endGame(){
      gameActive = false;
      if(animationFrame) cancelAnimationFrame(animationFrame);
      if(spawnInterval) clearInterval(spawnInterval);
      if(colorChangeInterval) clearInterval(colorChangeInterval);
      
      // Clear remaining targets
      targets.forEach(target => {
        if(target.div.parentNode === gameArea){
          gameArea.removeChild(target.div);
        }
      });
      targets = [];
      
      // Calculate accuracy
      const accuracy = totalTargets > 0 ? Math.round((targetsHit / totalTargets) * 100) : 0;
      const finalScore = Math.max(0, score);
      
      // Stats
      statsDiv.innerHTML = `
        <div style="text-align:center;">
          <div style="font-size:1.2rem;color:#6fd3ff;margin-bottom:10px;">Game Over!</div>
          <div>Final Score: <strong style="color:#83bfff;">${finalScore}</strong></div>
          <div>Accuracy: ${accuracy}%</div>
          <div>Max Combo: ${maxCombo}x</div>
          <div>Correct Hits: ${targetsHit}</div>
          <div>Wrong Color Hits: ${wrongColorHits}</div>
        </div>
      `;
      
      // Set result for integration
      window.minigameResult = {
        score: finalScore,
        accuracy,
        maxCombo,
        targetsHit,
        wrongColorHits
      };
      
      // Dispatch event
      window.dispatchEvent(new CustomEvent('minigame:end', {
        detail: { score: finalScore, stats: window.minigameResult }
      }));
      
      // Complete
      setTimeout(() => {
        if(typeof onComplete === 'function'){
          onComplete(finalScore);
        }
      }, 2000);
    }
    
    // Start game button
    document.getElementById('startGameBtn').addEventListener('click', () => {
      document.body.removeChild(instructionsOverlay);
      
      // Countdown
      const countdownDiv = document.createElement('div');
      countdownDiv.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:4rem;color:#6fd3ff;z-index:1000;';
      gameArea.appendChild(countdownDiv);
      
      let count = 3;
      countdownDiv.textContent = count;
      const countdownInterval = setInterval(() => {
        count--;
        if(count > 0){
          countdownDiv.textContent = count;
        } else {
          countdownDiv.textContent = 'GO!';
          clearInterval(countdownInterval);
          setTimeout(() => {
            gameArea.removeChild(countdownDiv);
            startGame();
          }, 500);
        }
      }, 1000);
    });
    
    // Start game
    function startGame(){
      gameActive = true;
      startTime = Date.now();
      
      // Set initial color and start cycling
      activeColor = COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)];
      updateColorBadge();
      
      colorChangeInterval = setInterval(() => {
        // Pick a different color
        const otherColors = COLOR_PALETTE.filter(c => c.name !== activeColor.name);
        activeColor = otherColors[Math.floor(Math.random() * otherColors.length)];
        updateColorBadge();
        
        // Flash effect
        colorBadge.style.transform = 'scale(1.1)';
        setTimeout(() => {
          colorBadge.style.transform = 'scale(1)';
        }, 200);
      }, TARGET_COLOR_CHANGE_MS);
      
      // Spawn targets periodically with dynamic speed
      // Using recursive setTimeout (not setInterval) to allow dynamic spawn rate changes
      function scheduleNextSpawn(){
        if(!gameActive) return;
        
        const elapsed = Date.now() - startTime;
        const progressRatio = elapsed / GAME_DURATION;
        
        // Ramp up speed: spawn interval decreases over time
        spawnIntervalTime = Math.max(
          SPAWN_INTERVAL_MIN,
          SPAWN_INTERVAL_START - progressRatio * (SPAWN_INTERVAL_START - SPAWN_INTERVAL_MIN)
        );
        
        // Spawn multiple targets later in game
        const spawnCount = elapsed > 30000 ? 2 : 1;
        
        for(let i = 0; i < spawnCount; i++){
          spawnTarget();
        }
        
        // Only schedule next spawn if game is still active
        if(gameActive){
          setTimeout(scheduleNextSpawn, spawnIntervalTime);
        }
      }
      
      // Initial targets
      spawnTarget();
      scheduleNextSpawn();
      
      gameLoop();
    }
  }

  // Export
  if(typeof g.MiniGames === 'undefined') g.MiniGames = {};
  g.MiniGames.confettiCannon = { render };

})(window);
