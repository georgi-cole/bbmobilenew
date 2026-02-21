// MODULE: minigames/laser-pantry-dash.js
// Laser Pantry Dash - Top-down dodge-and-collect arcade game
// Player drags avatar to collect recipe ingredients while avoiding sweeping lasers

(function(g){
  'use strict';

  // Constants
  const GAME_DURATION = 60000; // 60 seconds
  const RECIPE_SWITCH_TIME = 30000; // Switch recipe at 30s
  const LIVES = 3;
  const CORRECT_ITEM_POINTS = 10;
  const WRONG_ITEM_PENALTY = 5;
  const LASER_HIT_PENALTY = 10;
  const PLAYER_SIZE = 20;
  const ITEM_SIZE = 24;
  const CAMPING_RADIUS = 60;
  const CAMPING_THRESHOLD = 3000; // 3s in same spot
  const WRONG_ITEM_STREAK_THRESHOLD = 3;
  const MOVE_THRESHOLD = 10; // pixels to count as movement
  const LASER_HITS_PER_LIFE = 2; // Number of hits before losing a life
  
  // Laser mechanics constants
  const LASER_TELEGRAPH_MS = 700; // Show warning before sweep
  const LASER_SWEEP_DURATION = 1200; // Slower sweep
  const LASER_GAP_PERCENT = 0.25; // 25% safe gap in sweep
  const LASER_HIT_GRACE_MS = 350; // Must be in beam this long to count
  const LASER_RECOVERY_MS = 800; // Invulnerability after hit

  // Recipe items database
  const ALL_INGREDIENTS = [
    { name: '🍎', correct: true },
    { name: '🍌', correct: true },
    { name: '🥕', correct: true },
    { name: '🍞', correct: true },
    { name: '🥛', correct: true },
    { name: '🍕', correct: true },
    { name: '🍰', correct: true },
    { name: '🥗', correct: true },
    { name: '🍔', correct: false },
    { name: '🍟', correct: false },
    { name: '🌭', correct: false },
    { name: '🍿', correct: false },
    { name: '🍩', correct: false },
    { name: '🍪', correct: false },
    { name: '🧁', correct: false },
    { name: '🍫', correct: false }
  ];

  /**
   * Generate a random recipe of 3 items
   */
  function generateRecipe(){
    const correctItems = ALL_INGREDIENTS.filter(i => i.correct);
    const recipe = [];
    const used = new Set();
    
    while(recipe.length < 3){
      const idx = Math.floor(Math.random() * correctItems.length);
      if(!used.has(idx)){
        recipe.push(correctItems[idx]);
        used.add(idx);
      }
    }
    
    return recipe;
  }

  /**
   * Render the Laser Pantry Dash minigame
   */
  function render(container, onComplete, options = {}){
    container.innerHTML = '';
    
    const { debugMode = false, competitionMode = false } = options;
    
    // Main wrapper
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:16px;padding:20px;width:100%;max-width:600px;margin:0 auto;';
    
    // Title
    const title = document.createElement('h3');
    title.textContent = 'Laser Pantry Dash';
    title.style.cssText = 'margin:0;font-size:1.3rem;color:#e3ecf5;';
    
    // Instructions overlay
    const instructionsOverlay = document.createElement('div');
    instructionsOverlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);z-index:10000;display:flex;align-items:center;justify-content:center;';
    
    const instructionsBox = document.createElement('div');
    instructionsBox.style.cssText = 'background:#1d2734;padding:30px;border-radius:12px;max-width:400px;text-align:center;';
    instructionsBox.innerHTML = `
      <h2 style="color:#6fd3ff;margin:0 0 20px 0;">How to Play</h2>
      <p style="color:#e3ecf5;margin:10px 0;line-height:1.6;">
        • Drag your avatar to collect recipe ingredients<br>
        • Watch for laser <strong>warnings</strong> before sweeps<br>
        • Dodge the laser beams - they have safe gaps!<br>
        • Collect items matching the recipe for points<br>
        • Wrong items give penalties<br>
        • Laser hits give penalties and eventually cost lives<br>
        • Recipe changes at 30 seconds!
      </p>
      <button id="startGameBtn" class="btn primary" style="margin-top:20px;padding:12px 32px;font-size:1.1rem;">START GAME</button>
    `;
    instructionsOverlay.appendChild(instructionsBox);
    document.body.appendChild(instructionsOverlay);
    
    // HUD
    const hudDiv = document.createElement('div');
    hudDiv.style.cssText = 'display:flex;justify-content:space-between;width:100%;font-size:0.9rem;';
    
    const livesDiv = document.createElement('div');
    livesDiv.style.cssText = 'color:#ff6b6b;';
    livesDiv.textContent = `Lives: ${LIVES}`;
    
    const scoreDiv = document.createElement('div');
    scoreDiv.style.cssText = 'color:#83bfff;';
    scoreDiv.textContent = 'Score: 0';
    
    const timerDiv = document.createElement('div');
    timerDiv.style.cssText = 'color:#f7b955;';
    timerDiv.textContent = '60s';
    
    hudDiv.appendChild(livesDiv);
    hudDiv.appendChild(scoreDiv);
    hudDiv.appendChild(timerDiv);
    
    // Recipe card
    const recipeCard = document.createElement('div');
    recipeCard.style.cssText = 'background:#2c3a4d;padding:12px;border-radius:8px;width:100%;text-align:center;';
    const recipeTitle = document.createElement('div');
    recipeTitle.textContent = 'Recipe:';
    recipeTitle.style.cssText = 'color:#95a9c0;font-size:0.8rem;margin-bottom:6px;';
    const recipeItems = document.createElement('div');
    recipeItems.style.cssText = 'font-size:1.8rem;';
    recipeCard.appendChild(recipeTitle);
    recipeCard.appendChild(recipeItems);
    
    // Game area
    const gameArea = document.createElement('div');
    gameArea.style.cssText = 'position:relative;width:100%;height:350px;background:#0a1420;border:2px solid #2c3a4d;border-radius:8px;overflow:hidden;touch-action:none;';
    
    // Add style element for animations
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      @keyframes pulse {
        0%, 100% { opacity: 0.4; }
        50% { opacity: 0.8; }
      }
      @keyframes blink {
        0%, 100% { opacity: 0.3; }
        50% { opacity: 1; }
      }
    `;
    document.head.appendChild(styleEl);
    
    // Player avatar
    const player = document.createElement('div');
    player.style.cssText = `position:absolute;width:${PLAYER_SIZE}px;height:${PLAYER_SIZE}px;border-radius:50%;background:#6fd3ff;box-shadow:0 0 12px #6fd3ff;z-index:100;`;
    gameArea.appendChild(player);
    
    // Stats display
    const statsDiv = document.createElement('div');
    statsDiv.style.cssText = 'width:100%;background:#1a2332;border-radius:6px;padding:12px;font-size:0.85rem;color:#95a9c0;';
    
    wrapper.appendChild(title);
    wrapper.appendChild(hudDiv);
    wrapper.appendChild(recipeCard);
    wrapper.appendChild(gameArea);
    wrapper.appendChild(statsDiv);
    container.appendChild(wrapper);
    
    // Game state
    let gameActive = false;
    let lives = LIVES;
    let score = 0;
    let currentRecipe = generateRecipe();
    let recipeChanged = false;
    let startTime = 0;
    let correctItems = 0;
    let wrongItems = 0;
    let laserHits = 0;
    let laserHitAccumulator = 0; // Track persistent hits
    let wrongStreak = 0;
    let bestCombo = 0;
    let currentCombo = 0;
    let lastMoveTime = Date.now();
    let lastMoveX = 0;
    let lastMoveY = 0;
    let playerX = 0;
    let playerY = 0;
    let items = [];
    let animationFrame = null;
    let isInvulnerable = false;
    let invulnerableUntil = 0;
    let itemSpawnInterval, laserSpawnInterval;
    
    // Update recipe display
    function updateRecipeDisplay(){
      recipeItems.innerHTML = currentRecipe.map(item => item.name).join(' ');
    }
    updateRecipeDisplay();
    
    // Spawn item
    function spawnItem(){
      if(!gameActive) return;
      
      const rect = gameArea.getBoundingClientRect();
      const isCamping = Date.now() - lastMoveTime > CAMPING_THRESHOLD;
      
      // Anti-camping: spawn farther from player if camping
      let x, y;
      let attempts = 0;
      do {
        x = Math.random() * (rect.width - ITEM_SIZE);
        y = Math.random() * (rect.height - ITEM_SIZE);
        const dist = Math.sqrt(Math.pow(x - playerX, 2) + Math.pow(y - playerY, 2));
        attempts++;
        
        if(!isCamping || dist > CAMPING_RADIUS || attempts > 10) break;
      } while(attempts < 20);
      
      // Randomly select from correct or wrong items
      const isCorrect = Math.random() < 0.65; // 65% correct items
      let item;
      
      if(isCorrect){
        item = currentRecipe[Math.floor(Math.random() * currentRecipe.length)];
      } else {
        const wrongItems = ALL_INGREDIENTS.filter(i => !i.correct);
        item = wrongItems[Math.floor(Math.random() * wrongItems.length)];
      }
      
      const itemDiv = document.createElement('div');
      itemDiv.textContent = item.name;
      itemDiv.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${ITEM_SIZE}px;height:${ITEM_SIZE}px;font-size:1.5rem;z-index:50;`;
      itemDiv.dataset.correct = isCorrect;
      gameArea.appendChild(itemDiv);
      
      items.push({ div: itemDiv, x, y, correct: isCorrect, name: item.name });
    }
    
    // Spawn laser with telegraph and sweep
    function spawnLaser(){
      if(!gameActive) return;
      
      const rect = gameArea.getBoundingClientRect();
      const isHorizontal = Math.random() < 0.5;
      
      // Create telegraph warning
      const telegraph = document.createElement('div');
      telegraph.classList.add('laser-telegraph');
      
      if(isHorizontal){
        const yPos = Math.random() * rect.height;
        telegraph.style.cssText = `
          position:absolute;
          left:0;
          top:${yPos}px;
          width:100%;
          height:8px;
          background:rgba(255, 200, 0, 0.3);
          border:1px dashed #ffcc00;
          z-index:85;
          animation:pulse 0.3s ease-in-out infinite;
        `;
        
        gameArea.appendChild(telegraph);
        
        // After telegraph delay, show sweep
        setTimeout(() => {
          if(!gameActive){
            if(telegraph.parentNode) gameArea.removeChild(telegraph);
            return;
          }
          
          gameArea.removeChild(telegraph);
          
          // Create laser beam with gap
          const gapSize = rect.width * LASER_GAP_PERCENT;
          const gapStart = Math.random() * (rect.width - gapSize);
          
          // Create two beam segments (before and after gap)
          const beam1 = document.createElement('div');
          beam1.classList.add('laser-beam');
          beam1.style.cssText = `
            position:absolute;
            left:0;
            top:${yPos - 2}px;
            width:0;
            height:4px;
            background:linear-gradient(90deg, transparent, #ff3366, #ff3366);
            box-shadow:0 0 12px #ff3366;
            z-index:90;
          `;
          gameArea.appendChild(beam1);
          
          const beam2 = document.createElement('div');
          beam2.classList.add('laser-beam');
          beam2.style.cssText = `
            position:absolute;
            left:${gapStart + gapSize}px;
            top:${yPos - 2}px;
            width:0;
            height:4px;
            background:linear-gradient(90deg, #ff3366, #ff3366, transparent);
            box-shadow:0 0 12px #ff3366;
            z-index:90;
          `;
          gameArea.appendChild(beam2);
          
          // Animate sweep
          let progress = 0;
          const startTime = Date.now();
          let hitStartTime = null;
          
          const sweepAnimation = () => {
            if(!gameActive){
              if(beam1.parentNode) gameArea.removeChild(beam1);
              if(beam2.parentNode) gameArea.removeChild(beam2);
              return;
            }
            
            progress = Math.min(1, (Date.now() - startTime) / LASER_SWEEP_DURATION);
            
            beam1.style.width = (gapStart * progress) + 'px';
            beam2.style.width = ((rect.width - gapStart - gapSize) * progress) + 'px';
            
            // Check collision with player (if not invulnerable)
            if(!isInvulnerable && Date.now() > invulnerableUntil){
              const playerCenterY = playerY + PLAYER_SIZE / 2;
              const inBeam = Math.abs(playerCenterY - yPos) < PLAYER_SIZE / 2 + 4;
              
              // Check if player is in gap
              const playerCenterX = playerX + PLAYER_SIZE / 2;
              const inGap = playerCenterX >= gapStart && playerCenterX <= gapStart + gapSize;
              
              if(inBeam && !inGap){
                if(hitStartTime === null){
                  hitStartTime = Date.now();
                }
                
                // Hit must persist for grace period
                if(Date.now() - hitStartTime > LASER_HIT_GRACE_MS){
                  handleLaserHit();
                  hitStartTime = null; // Reset to avoid multiple hits
                }
              } else {
                hitStartTime = null; // Player escaped
              }
            }
            
            if(progress < 1){
              requestAnimationFrame(sweepAnimation);
            } else {
              // Cleanup
              if(beam1.parentNode) gameArea.removeChild(beam1);
              if(beam2.parentNode) gameArea.removeChild(beam2);
            }
          };
          
          sweepAnimation();
        }, LASER_TELEGRAPH_MS);
      } else {
        // Vertical laser
        const xPos = Math.random() * rect.width;
        telegraph.style.cssText = `
          position:absolute;
          left:${xPos}px;
          top:0;
          width:8px;
          height:100%;
          background:rgba(255, 200, 0, 0.3);
          border:1px dashed #ffcc00;
          z-index:85;
          animation:pulse 0.3s ease-in-out infinite;
        `;
        
        gameArea.appendChild(telegraph);
        
        setTimeout(() => {
          if(!gameActive){
            if(telegraph.parentNode) gameArea.removeChild(telegraph);
            return;
          }
          
          gameArea.removeChild(telegraph);
          
          // Create laser beam with gap
          const gapSize = rect.height * LASER_GAP_PERCENT;
          const gapStart = Math.random() * (rect.height - gapSize);
          
          const beam1 = document.createElement('div');
          beam1.classList.add('laser-beam');
          beam1.style.cssText = `
            position:absolute;
            left:${xPos - 2}px;
            top:0;
            width:4px;
            height:0;
            background:linear-gradient(180deg, transparent, #ff3366, #ff3366);
            box-shadow:0 0 12px #ff3366;
            z-index:90;
          `;
          gameArea.appendChild(beam1);
          
          const beam2 = document.createElement('div');
          beam2.classList.add('laser-beam');
          beam2.style.cssText = `
            position:absolute;
            left:${xPos - 2}px;
            top:${gapStart + gapSize}px;
            width:4px;
            height:0;
            background:linear-gradient(180deg, #ff3366, #ff3366, transparent);
            box-shadow:0 0 12px #ff3366;
            z-index:90;
          `;
          gameArea.appendChild(beam2);
          
          let progress = 0;
          const startTime = Date.now();
          let hitStartTime = null;
          
          const sweepAnimation = () => {
            if(!gameActive){
              if(beam1.parentNode) gameArea.removeChild(beam1);
              if(beam2.parentNode) gameArea.removeChild(beam2);
              return;
            }
            
            progress = Math.min(1, (Date.now() - startTime) / LASER_SWEEP_DURATION);
            
            beam1.style.height = (gapStart * progress) + 'px';
            beam2.style.height = ((rect.height - gapStart - gapSize) * progress) + 'px';
            
            // Check collision
            if(!isInvulnerable && Date.now() > invulnerableUntil){
              const playerCenterX = playerX + PLAYER_SIZE / 2;
              const inBeam = Math.abs(playerCenterX - xPos) < PLAYER_SIZE / 2 + 4;
              
              const playerCenterY = playerY + PLAYER_SIZE / 2;
              const inGap = playerCenterY >= gapStart && playerCenterY <= gapStart + gapSize;
              
              if(inBeam && !inGap){
                if(hitStartTime === null){
                  hitStartTime = Date.now();
                }
                
                if(Date.now() - hitStartTime > LASER_HIT_GRACE_MS){
                  handleLaserHit();
                  hitStartTime = null;
                }
              } else {
                hitStartTime = null;
              }
            }
            
            if(progress < 1){
              requestAnimationFrame(sweepAnimation);
            } else {
              if(beam1.parentNode) gameArea.removeChild(beam1);
              if(beam2.parentNode) gameArea.removeChild(beam2);
            }
          };
          
          sweepAnimation();
        }, LASER_TELEGRAPH_MS);
      }
    }
    
    // Handle laser hit
    function handleLaserHit(){
      if(isInvulnerable) return;
      
      laserHitAccumulator++;
      score = Math.max(0, score - LASER_HIT_PENALTY);
      currentCombo = 0;
      
      // Flash screen
      gameArea.style.background = '#ff9933';
      setTimeout(() => {
        gameArea.style.background = '#0a1420';
      }, 150);
      
      // Accumulate hits - lose life when threshold reached
      if(laserHitAccumulator >= LASER_HITS_PER_LIFE){
        lives--;
        laserHits++;
        laserHitAccumulator = 0;
        
        // Drop items
        items.forEach(item => {
          if(item.div.parentNode) gameArea.removeChild(item.div);
        });
        items = [];
        
        livesDiv.textContent = `Lives: ${lives}`;
        
        // Start invulnerability period
        isInvulnerable = true;
        invulnerableUntil = Date.now() + LASER_RECOVERY_MS;
        player.style.opacity = '0.5';
        player.style.animation = 'blink 0.2s ease-in-out infinite';
        
        setTimeout(() => {
          isInvulnerable = false;
          player.style.opacity = '1';
          player.style.animation = '';
        }, LASER_RECOVERY_MS);
        
        if(lives <= 0){
          endGame();
          return;
        }
        
        // Move player to center for safety
        playerX = gameArea.clientWidth / 2 - PLAYER_SIZE / 2;
        playerY = gameArea.clientHeight / 2 - PLAYER_SIZE / 2;
        player.style.left = playerX + 'px';
        player.style.top = playerY + 'px';
      }
      
      scoreDiv.textContent = `Score: ${score}`;
    }
    
    // Check collision with items
    function checkItemCollision(){
      for(let i = items.length - 1; i >= 0; i--){
        const item = items[i];
        const dist = Math.sqrt(Math.pow(playerX - item.x, 2) + Math.pow(playerY - item.y, 2));
        
        if(dist < PLAYER_SIZE){
          // Collect item
          gameArea.removeChild(item.div);
          items.splice(i, 1);
          
          const isRecipeItem = currentRecipe.some(r => r.name === item.name);
          
          if(isRecipeItem){
            score += CORRECT_ITEM_POINTS;
            correctItems++;
            wrongStreak = 0;
            currentCombo++;
            bestCombo = Math.max(bestCombo, currentCombo);
          } else {
            const streakPenalty = wrongStreak >= WRONG_ITEM_STREAK_THRESHOLD ? WRONG_ITEM_PENALTY * 2 : WRONG_ITEM_PENALTY;
            score = Math.max(0, score - streakPenalty);
            wrongItems++;
            wrongStreak++;
            currentCombo = 0;
          }
          
          scoreDiv.textContent = `Score: ${score}`;
        }
      }
    }
    
    // Game loop
    function gameLoop(){
      if(!gameActive) return;
      
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, GAME_DURATION - elapsed);
      timerDiv.textContent = `${Math.ceil(remaining/1000)}s`;
      
      // Recipe switch at 30s
      if(elapsed >= RECIPE_SWITCH_TIME && !recipeChanged){
        recipeChanged = true;
        currentRecipe = generateRecipe();
        updateRecipeDisplay();
        
        // Flash effect
        recipeCard.style.background = '#ff6b6b';
        setTimeout(() => {
          recipeCard.style.background = '#2c3a4d';
        }, 300);
      }
      
      // Check item collision
      checkItemCollision();
      
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
      
      // Clear intervals
      clearInterval(itemSpawnInterval);
      clearInterval(laserSpawnInterval);
      
      // Calculate final score
      const finalScore = Math.max(0, score);
      
      // Stats
      statsDiv.innerHTML = `
        <div style="text-align:center;">
          <div style="font-size:1.2rem;color:#6fd3ff;margin-bottom:10px;">Game Over!</div>
          <div>Final Score: <strong style="color:#83bfff;">${finalScore}</strong></div>
          <div>Laser Hits: ${laserHits}</div>
          <div>Correct Items: ${correctItems}</div>
          <div>Wrong Items: ${wrongItems}</div>
          <div>Best Combo: ${bestCombo}</div>
        </div>
      `;
      
      // Set result for integration
      window.minigameResult = {
        score: finalScore,
        laserHits,
        correctItems,
        wrongItems,
        bestCombo
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
      
      // Initial position
      playerX = gameArea.clientWidth / 2 - PLAYER_SIZE / 2;
      playerY = gameArea.clientHeight / 2 - PLAYER_SIZE / 2;
      player.style.left = playerX + 'px';
      player.style.top = playerY + 'px';
      
      lastMoveX = playerX;
      lastMoveY = playerY;
      
      // Spawn items periodically
      itemSpawnInterval = setInterval(() => {
        spawnItem();
      }, 2000);
      
      // Spawn lasers periodically (less frequent, telegraphed)
      laserSpawnInterval = setInterval(() => {
        spawnLaser();
      }, 4000); // Less frequent since they're more visible now
      
      // Initial spawns
      spawnItem();
      spawnItem();
      
      // First laser after a delay
      setTimeout(() => {
        spawnLaser();
      }, 2000);
      
      gameLoop();
    }
    
    // Touch/mouse controls
    let isDragging = false;
    
    function handleStart(e){
      e.preventDefault();
      isDragging = true;
    }
    
    function handleMove(e){
      if(!isDragging || !gameActive) return;
      e.preventDefault();
      
      const touch = e.touches ? e.touches[0] : e;
      const rect = gameArea.getBoundingClientRect();
      
      const newX = touch.clientX - rect.left - PLAYER_SIZE / 2;
      const newY = touch.clientY - rect.top - PLAYER_SIZE / 2;
      
      // Clamp to boundaries
      playerX = Math.max(0, Math.min(rect.width - PLAYER_SIZE, newX));
      playerY = Math.max(0, Math.min(rect.height - PLAYER_SIZE, newY));
      
      player.style.left = playerX + 'px';
      player.style.top = playerY + 'px';
      
      // Check movement for camping detection
      const dist = Math.sqrt(Math.pow(playerX - lastMoveX, 2) + Math.pow(playerY - lastMoveY, 2));
      if(dist > MOVE_THRESHOLD){
        lastMoveTime = Date.now();
        lastMoveX = playerX;
        lastMoveY = playerY;
      }
    }
    
    function handleEnd(e){
      isDragging = false;
    }
    
    gameArea.addEventListener('touchstart', handleStart);
    gameArea.addEventListener('touchmove', handleMove);
    gameArea.addEventListener('touchend', handleEnd);
    gameArea.addEventListener('mousedown', handleStart);
    gameArea.addEventListener('mousemove', handleMove);
    gameArea.addEventListener('mouseup', handleEnd);
  }

  // Export
  if(typeof g.MiniGames === 'undefined') g.MiniGames = {};
  g.MiniGames.laserPantryDash = { render };

})(window);
