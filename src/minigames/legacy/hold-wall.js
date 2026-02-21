// MODULE: minigames/hold-wall.js
// Endurance Challenge - Hold the Wall
// Press and hold a wall avatar - last person standing wins

(function(g){
  'use strict';
  
  const gameId = 'hold-wall';
  
  function render(container, onComplete, options = {}){
    const root = document.createElement('div');
    root.style.cssText = 'position:relative;display:grid;grid-template-rows:auto 1fr auto;height:100%;min-height:480px;background:linear-gradient(180deg,#0d1424,#0f1a2e);color:#e8f3ff;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;overflow:hidden;';
    
    // Game state
    let state = 'instructions'; // instructions, countdown, playing, end
    let score = 0;
    let timeElapsed = 0;
    let startTime = 0;
    let animationFrame = null;
    let participants = [];
    let isHolding = false;
    let hasEnded = false;
    let isProcessingDrops = false;
    let eliminationLog = [];
    
    // AFK detection state
    let hasHumanStartedHolding = false;
    let gracePeriodTimer = null;
    const GRACE_PERIOD_MS = 3000; // Grace period before auto-dropping AFK players (3 seconds)
    
    // AI drop timing constants
    const MIN_AI_DROP_TIME_MS = 10000; // 10 seconds
    const MAX_AI_DROP_TIME_MS = 120000; // 120 seconds
    const AI_DROP_TIME_RANGE_MS = MAX_AI_DROP_TIME_MS - MIN_AI_DROP_TIME_MS;
    
    // Narrative timing constants
    const NARRATIVE_UPDATE_MIN_MS = 8000; // 8 seconds
    const NARRATIVE_UPDATE_RANGE_MS = 7000; // 7 seconds (8-15 total)
    
    // Difficulty timing constants
    const WATER_EFFECT_TIME_MS = 15000;
    const WIND_EFFECT_TIME_MS = 30000;
    const VIBRATION_EFFECT_TIME_MS = 45000;
    const TILT_EFFECT_TIME_MS = 60000;
    const FLASH_EFFECT_TIME_MS = 75000;
    const CALL_EFFECT_TIME_MS = 90000;
    
    // Visual effect constants
    const VIBRATION_PATTERN = [200, 100, 200, 100, 200];
    const WALL_GRADIENT_DEFAULT = 'linear-gradient(135deg,#2a4a5a 0%,#3a5a6a 25%,#2a3a4a 50%,#3a5a6a 75%,#2a4a5a 100%)';
    const WALL_GRADIENT_HOLDING = 'linear-gradient(135deg,#3a6a8a 0%,#4a7a9a 25%,#3a5a7a 50%,#4a7a9a 75%,#3a6a8a 100%)';
    
    // Timers and intervals for cleanup
    let narrativeTimer = null;
    let difficultyTimeouts = [];
    let aiDropTimeouts = [];
    let effectCleanupTimeouts = [];
    let narrativePulseTimeout = null;
    
    // Funny narrative lines for different events
    const NARRATIVES = {
      start: [
        "Alright houseguests, grip that wall like your life depends on it... because it kinda does! 💪",
        "Welcome to the wall of pain! Hope you all had a good breakfast! 🏋️",
        "Time to see who's got the strength... and who's got the noodle arms! 🍝"
      ],
      holding: [
        "You're doing great! Your arms definitely won't regret this tomorrow... 😅",
        "Look at you, still hanging on! Literally! 🤩",
        "The wall loves you... the wall won't let you go... 👻",
        "Your grip strength is impressive! Have you been opening jars? 🫙"
      ],
      someone_dropped: [
        "{name} has hit the ground! That's gonna leave a mark! 💥",
        "And {name} is out! Don't worry, we have ice packs! 🧊",
        "{name} couldn't hold on! The wall claims another victim! 😱",
        "There goes {name}! Gravity: 1, Houseguest: 0! 🪂"
      ],
      difficulty: [
        "Oh no! Production is spraying water! 💦",
        "Someone turned on the wind machine! Hold tight! 🌪️",
        "The wall is starting to tilt! This is getting spicy! 🌶️",
        "Is that paint? Oh yes, it's paint time! 🎨",
        "The wall is vibrating! Earthquake mode activated! 📳",
        "Incoming call! Just kidding, focus on the wall! 📞"
      ],
      final_two: [
        "We're down to TWO! This is getting intense! 🔥",
        "Mano a mano! Who wants it more?! 💪",
        "Two houseguests, one wall, zero mercy! 😤"
      ],
      victory: [
        "WE HAVE A WINNER! What an incredible performance! 🏆",
        "VICTORY! Your arms may be dead but your spirit is alive! 🎉",
        "CHAMPION! You've conquered the wall! 👑"
      ],
      loss: [
        "And you're down! Great effort though! 💔",
        "Gravity wins this round! Better luck next time! 🌍",
        "The wall claims another victim! At least you tried! 😢"
      ]
    };
    
    // Detect competition type
    let compType = 'hoh'; // default
    if(g.game && g.game.phase){
      // POV competitions use phase 'veto_comp', 'veto', or 'pov'
      const phase = g.game.phase;
      compType = (phase === 'veto_comp' || phase === 'veto' || phase === 'pov') ? 'pov' : 'hoh';
      console.log(`[HoldWall] Detected competition type: ${compType} (phase: ${phase})`);
    }
    
    // Initialize participants
    function setupParticipants(){
      const allPlayers = (g.game && g.game.players) ? g.game.players.filter(p => !p.evicted) : [];
      
      // Apply HOH exclusion rule if needed
      let eligible = allPlayers;
      if(compType === 'hoh'){
        const week = (g.game && g.game.week) || 1;
        const lastHOHId = g.game && g.game.lastHOHId;
        const lastHOHWeek = g.game && g.game.lastHOHWeek;
        
        const shouldExclude = eligible.length > 3 && week > 1 && lastHOHId && lastHOHWeek === (week - 1);
        if(shouldExclude){
          eligible = eligible.filter(p => p.id !== lastHOHId);
          console.log(`[HoldWall] Excluding previous HOH (id: ${lastHOHId})`);
        }
      }
      
      participants = eligible.map(p => ({
        id: p.id,
        name: p.name,
        isPlayer: p.human || p.isPlayer || false,
        dropTimeMs: null,
        avatarUrl: g.resolveAvatar ? g.resolveAvatar(p) : null,
        // Assign each AI a personal drop time (randomized between 10-120 seconds)
        personalDropTime: p.human || p.isPlayer ? null : MIN_AI_DROP_TIME_MS + Math.random() * AI_DROP_TIME_RANGE_MS
      }));
      
      console.log(`[HoldWall] ${participants.length} participants for ${compType} competition`);
    }
    
    setupParticipants();
    
    // Instructions overlay
    const instructionsOverlay = document.createElement('div');
    instructionsOverlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(10,15,30,0.95);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;z-index:100;';
    instructionsOverlay.innerHTML = `
      <h2 style="margin:0 0 16px;font-size:1.8rem;color:#83bfff;">Hold the Wall</h2>
      <div style="max-width:400px;text-align:center;line-height:1.6;color:#95a9c0;margin-bottom:24px;">
        <p style="margin:0 0 12px;">Press and hold the wall for as long as you can!</p>
        <p style="margin:0 0 12px;"><strong style="color:#e8f3ff;">Click and HOLD</strong> the wall panel</p>
        <p style="margin:0 0 12px;"><strong style="color:#ff6b9d;">Don't let go</strong> - releasing means you drop!</p>
        <p style="margin:0;">Last person standing wins!</p>
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
    hud.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:16px;background:rgba(10,15,30,0.8);backdrop-filter:blur(4px);';
    hud.innerHTML = `
      <div style="text-align:center;">
        <div style="font-size:0.75rem;color:#95a9c0;text-transform:uppercase;margin-bottom:4px;">Elapsed</div>
        <div id="timeDisplay" style="font-size:1.3rem;font-weight:600;color:#83bfff;">0.0s</div>
      </div>
      <div style="text-align:center;">
        <div style="font-size:0.75rem;color:#95a9c0;text-transform:uppercase;margin-bottom:4px;">Remaining</div>
        <div id="remainingDisplay" style="font-size:1.3rem;font-weight:600;color:#83bfff;">${participants.length}</div>
      </div>
    `;
    root.appendChild(hud);
    
    // Narrative box
    const narrativeBox = document.createElement('div');
    narrativeBox.id = 'narrativeBox';
    narrativeBox.style.cssText = 'padding:12px 16px;background:linear-gradient(135deg,rgba(131,191,255,0.15),rgba(131,191,255,0.05));border-left:4px solid #83bfff;margin:0 16px;font-size:0.95rem;color:#e8f3ff;line-height:1.4;min-height:60px;display:flex;align-items:center;font-style:italic;';
    narrativeBox.textContent = 'Get ready to hold on for dear life...';
    root.appendChild(narrativeBox);
    
    // Game area
    const gameArea = document.createElement('div');
    gameArea.style.cssText = 'position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;';
    
    // Participants display
    const participantsDisplay = document.createElement('div');
    participantsDisplay.id = 'participantsDisplay';
    participantsDisplay.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin-bottom:30px;max-width:600px;';
    
    function renderParticipants(){
      participantsDisplay.innerHTML = participants.map(p => {
        const dropped = p.dropTimeMs !== null;
        const avatarStyle = dropped ? 'opacity:0.3;filter:grayscale(100%);' : '';
        const borderColor = p.isPlayer ? '#83bfff' : '#555';
        return `
          <div style="text-align:center;">
            <div style="width:60px;height:60px;border-radius:50%;border:3px solid ${borderColor};overflow:hidden;background:#1a2a3a;${avatarStyle}">
              ${p.avatarUrl ? `<img src="${p.avatarUrl}" alt="${p.name}" style="width:100%;height:100%;object-fit:cover;">` : `<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:1.5rem;color:#83bfff;">${p.name[0]}</div>`}
            </div>
            <div style="font-size:0.75rem;margin-top:4px;color:${dropped ? '#666' : '#95a9c0'};">${p.name}</div>
          </div>
        `;
      }).join('');
    }
    
    renderParticipants();
    gameArea.appendChild(participantsDisplay);
    
    // Wall panel with enhanced brick wall styling
    const wallPanel = document.createElement('div');
    wallPanel.id = 'wallPanel';
    wallPanel.style.cssText = `
      width:100%;max-width:400px;height:200px;
      background:linear-gradient(135deg,#2a4a5a 0%,#3a5a6a 25%,#2a3a4a 50%,#3a5a6a 75%,#2a4a5a 100%);
      background-size:200% 200%;
      border:6px solid #3a5a6a;
      border-radius:12px;
      display:flex;align-items:center;justify-content:center;
      font-size:3.5rem;font-weight:900;
      cursor:grab;user-select:none;
      transition:all 0.3s cubic-bezier(0.4,0,0.2,1);
      box-shadow:
        0 8px 32px rgba(0,0,0,0.7),
        inset 0 2px 4px rgba(255,255,255,0.1),
        inset 0 -2px 4px rgba(0,0,0,0.3);
      position:relative;overflow:hidden;
      text-shadow:0 4px 12px rgba(0,0,0,0.9),0 2px 4px rgba(0,0,0,0.7);
      letter-spacing:0.2em;
      animation:wallPulse 3s ease-in-out infinite;
    `;
    
    // Add brick texture overlay to make it look more wall-like
    const wallTexture = document.createElement('div');
    wallTexture.style.cssText = `
      position:absolute;inset:0;
      background:
        /* Horizontal mortar lines */
        repeating-linear-gradient(
          0deg,
          transparent 0px,
          transparent 38px,
          rgba(0,0,0,0.3) 38px,
          rgba(0,0,0,0.3) 40px
        ),
        /* Vertical mortar lines (offset pattern for brick effect) */
        repeating-linear-gradient(
          90deg,
          transparent 0px,
          transparent 78px,
          rgba(0,0,0,0.25) 78px,
          rgba(0,0,0,0.25) 80px
        ),
        /* Brick texture detail */
        repeating-linear-gradient(
          90deg,
          transparent 0px,
          rgba(255,255,255,0.02) 1px,
          transparent 2px,
          transparent 8px
        );
      pointer-events:none;
      opacity:0.8;
    `;
    wallPanel.appendChild(wallTexture);
    
    const wallText = document.createElement('div');
    wallText.textContent = 'WALL';
    wallText.style.cssText = 'position:relative;z-index:1;color:#e8f3ff;';
    wallPanel.appendChild(wallText);
    
    gameArea.appendChild(wallPanel);
    
    // Add CSS animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes wallPulse {
        0%, 100% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
      }
      @keyframes wallShake {
        0%, 100% { transform: translateX(0) scale(0.98); }
        25% { transform: translateX(-3px) scale(0.98); }
        75% { transform: translateX(3px) scale(0.98); }
      }
      @keyframes flashScreen {
        0%, 100% { opacity: 0; }
        50% { opacity: 0.3; }
      }
      @keyframes slideDown {
        from { transform: translateX(-50%) translateY(-100px); opacity: 0; }
        to { transform: translateX(-50%) translateY(0); opacity: 1; }
      }
    `;
    root.appendChild(style);
    
    // Status message
    const statusMsg = document.createElement('div');
    statusMsg.id = 'statusMsg';
    statusMsg.style.cssText = 'margin-top:20px;font-size:1.1rem;color:#95a9c0;text-align:center;min-height:30px;';
    statusMsg.textContent = 'Click START to begin';
    gameArea.appendChild(statusMsg);
    
    root.appendChild(gameArea);
    
    // End screen
    const endScreen = document.createElement('div');
    endScreen.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(10,15,30,0.95);display:none;flex-direction:column;align-items:center;justify-content:center;padding:20px;z-index:98;';
    endScreen.innerHTML = `
      <div style="text-align:center;max-width:500px;">
        <h2 style="margin:0 0 20px;font-size:2rem;color:#83bfff;">Competition Complete!</h2>
        <div style="font-size:1.2rem;color:#95a9c0;margin-bottom:30px;">
          <div style="margin:10px 0;">Time: <span id="finalTime" style="color:#e8f3ff;font-weight:600;">0s</span></div>
          <div style="margin:10px 0;">Score: <span id="finalScore" style="color:#e8f3ff;font-weight:600;">0</span></div>
        </div>
        <div id="standingsContainer" style="margin-top:20px;"></div>
      </div>
    `;
    root.appendChild(endScreen);
    
    // Append to container
    container.appendChild(root);
    
    // Event handlers
    const startBtn = root.querySelector('#startBtn');
    let mouseDownTime = 0;
    
    function startCountdown(){
      state = 'countdown';
      instructionsOverlay.style.display = 'none';
      countdownOverlay.style.display = 'flex';
      
      let count = 3;
      const countdownText = root.querySelector('#countdownText');
      
      const countInterval = setInterval(() => {
        count--;
        if(count > 0){
          countdownText.textContent = count;
        } else {
          countdownText.textContent = 'GO!';
          setTimeout(() => {
            countdownOverlay.style.display = 'none';
            startGame();
          }, 500);
          clearInterval(countInterval);
        }
      }, 1000);
    }
    
    function startGame(){
      state = 'playing';
      startTime = Date.now();
      updateNarrative(NARRATIVES.start);
      
      // Start AI drop simulation with personalized drop times
      startAIDrops();
      
      // Start difficulty progression
      startDifficulties();
      
      // Start game loop
      gameLoop();
      
      // Random narrative updates during gameplay with setTimeout chain for natural variation
      function scheduleNextNarrative() {
        if(hasEnded || state !== 'playing') return;
        
        const delay = NARRATIVE_UPDATE_MIN_MS + Math.random() * NARRATIVE_UPDATE_RANGE_MS;
        narrativeTimer = setTimeout(() => {
          if(hasEnded || state !== 'playing') return;
          
          if(isHolding && Math.random() > 0.5){
            updateNarrative(NARRATIVES.holding);
          }
          
          // Schedule next update with new random delay
          scheduleNextNarrative();
        }, delay);
      }
      scheduleNextNarrative();
      
      // AFK FIX: Start grace period timer
      // If human never starts holding within grace period, automatically drop them
      gracePeriodTimer = setTimeout(() => {
        if(!hasHumanStartedHolding && !hasEnded && state === 'playing'){
          console.log('[HoldWall] ⚠️ AFK DETECTION: Grace period expired - human never started holding, auto-dropping');
          const playerParticipant = participants.find(p => p.isPlayer);
          if(playerParticipant && playerParticipant.dropTimeMs === null){
            // Mark player as dropped immediately
            const dropTime = Date.now() - startTime;
            playerParticipant.dropTimeMs = dropTime;
            eliminationLog.push({
              name: playerParticipant.name,
              timeMs: dropTime,
              isPlayer: true
            });
            
            // AFK FIX: Disable wall interaction and provide clear UI feedback
            wallPanel.style.cursor = 'not-allowed';
            wallPanel.style.opacity = '0.5';
            wallPanel.style.filter = 'grayscale(100%)';
            wallPanel.style.pointerEvents = 'none';
            statusMsg.textContent = 'You were dropped for being AFK!';
            statusMsg.style.color = '#ff4444';
            
            updateNarrative(["You never held the wall! What were you thinking?! 😱"]);
            
            console.log(`[HoldWall] ✓ AFK Player dropped at ${(dropTime/1000).toFixed(1)}s - will NOT be eligible to win`);
            console.log('[HoldWall] ✓ Wall disabled - human cannot interact after AFK drop');
            
            // Check if game should end
            checkGameEnd();
          }
        } else if(hasHumanStartedHolding){
          console.log('[HoldWall] ✓ Grace period check: Human started holding, no AFK drop needed');
        }
      }, GRACE_PERIOD_MS);
    }
    
    function updateNarrative(messages){
      if(!messages || messages.length === 0) return;
      const message = messages[Math.floor(Math.random() * messages.length)];
      const narrativeBox = root.querySelector('#narrativeBox');
      if(narrativeBox){
        narrativeBox.textContent = message;
        // Pulse effect with cleanup
        narrativeBox.style.transform = 'scale(1.02)';
        
        // Clear previous pulse timeout if exists
        if(narrativePulseTimeout){
          clearTimeout(narrativePulseTimeout);
        }
        
        narrativePulseTimeout = setTimeout(() => {
          if(narrativeBox && narrativeBox.parentNode){
            narrativeBox.style.transform = 'scale(1)';
          }
          narrativePulseTimeout = null;
        }, 200);
      }
    }
    
    function startDifficulties(){
      // Progressive difficulty system
      const difficulties = [
        { time: WATER_EFFECT_TIME_MS, action: applyWaterEffect, message: "Oh no! Production is spraying water! 💦" },
        { time: WIND_EFFECT_TIME_MS, action: applyWindEffect, message: "Someone turned on the wind machine! Hold tight! 🌪️" },
        { time: VIBRATION_EFFECT_TIME_MS, action: applyVibration, message: "The wall is vibrating! Earthquake mode! 📳" },
        { time: TILT_EFFECT_TIME_MS, action: applyTiltEffect, message: "The wall is starting to tilt! 🌶️" },
        { time: FLASH_EFFECT_TIME_MS, action: applyFlashEffect, message: "Bright lights! Don't let go! ✨" },
        { time: CALL_EFFECT_TIME_MS, action: applyCallEffect, message: "Incoming call! Just kidding! Focus! 📞" }
      ];
      
      difficulties.forEach(diff => {
        const timeoutId = setTimeout(() => {
          if(!hasEnded && state === 'playing'){
            updateNarrative([diff.message]);
            diff.action();
          }
        }, diff.time);
        difficultyTimeouts.push(timeoutId);
      });
    }
    
    function applyWaterEffect(){
      // Visual: drips on screen
      wallPanel.style.filter = 'blur(1px) brightness(0.9)';
      const cleanupTimeout = setTimeout(() => {
        if(state === 'playing') wallPanel.style.filter = 'none';
      }, 3000);
      effectCleanupTimeouts.push(cleanupTimeout);
    }
    
    function applyWindEffect(){
      // Tilt the wall slightly
      wallPanel.style.transform = isHolding ? 'scale(0.98) rotate(-2deg)' : 'rotate(-2deg)';
      const cleanupTimeout = setTimeout(() => {
        if(state === 'playing') wallPanel.style.transform = isHolding ? 'scale(0.98)' : 'scale(1)';
      }, 4000);
      effectCleanupTimeouts.push(cleanupTimeout);
    }
    
    function applyVibration(){
      // Try to vibrate device (mobile only)
      if(navigator.vibrate){
        navigator.vibrate(VIBRATION_PATTERN);
      }
      // Visual shake
      wallPanel.style.animation = 'wallShake 0.5s ease-in-out 5';
      const cleanupTimeout = setTimeout(() => {
        if(state === 'playing') wallPanel.style.animation = 'wallPulse 3s ease-in-out infinite';
      }, 2500);
      effectCleanupTimeouts.push(cleanupTimeout);
    }
    
    function applyTiltEffect(){
      wallPanel.style.transform = isHolding ? 'scale(0.98) rotate(3deg)' : 'rotate(3deg)';
      const cleanupTimeout = setTimeout(() => {
        if(state === 'playing') wallPanel.style.transform = isHolding ? 'scale(0.98)' : 'scale(1)';
      }, 5000);
      effectCleanupTimeouts.push(cleanupTimeout);
    }
    
    function applyFlashEffect(){
      // Screen flash
      const flash = document.createElement('div');
      flash.style.cssText = 'position:absolute;inset:0;background:white;z-index:50;animation:flashScreen 0.5s ease-out;pointer-events:none;';
      root.appendChild(flash);
      const cleanupTimeout = setTimeout(() => flash.remove(), 500);
      effectCleanupTimeouts.push(cleanupTimeout);
    }
    
    function applyCallEffect(){
      // Simulate incoming call notification
      const callNotif = document.createElement('div');
      callNotif.style.cssText = 'position:absolute;top:80px;left:50%;transform:translateX(-50%);background:#000;color:#fff;padding:12px 20px;border-radius:12px;font-size:0.9rem;z-index:60;box-shadow:0 4px 20px rgba(0,0,0,0.6);animation:slideDown 0.3s ease-out;';
      callNotif.innerHTML = '📞 Mom is calling...';
      root.appendChild(callNotif);
      const cleanupTimeout = setTimeout(() => callNotif.remove(), 3000);
      effectCleanupTimeouts.push(cleanupTimeout);
    }
    
    function startAIDrops(){
      // Schedule each AI participant to drop at their personal time
      participants.forEach(p => {
        if(!p.isPlayer && p.personalDropTime){
          const timeoutId = setTimeout(() => {
            if(!hasEnded && state === 'playing' && p.dropTimeMs === null){
              dropParticipant(p);
            }
          }, p.personalDropTime);
          aiDropTimeouts.push(timeoutId);
        }
      });
    }
    
    function dropParticipant(participant){
      if(!participant || participant.dropTimeMs !== null) return;
      
      const dropTime = Date.now() - startTime;
      participant.dropTimeMs = dropTime;
      
      eliminationLog.push({
        name: participant.name,
        timeMs: dropTime,
        isPlayer: participant.isPlayer
      });
      
      console.log(`[HoldWall] ${participant.name} dropped at ${(dropTime/1000).toFixed(1)}s`);
      
      // Update narrative when someone drops
      if(!participant.isPlayer){
        const messages = NARRATIVES.someone_dropped.map(msg => msg.replace('{name}', participant.name));
        updateNarrative(messages);
      }
      
      // Update UI
      renderParticipants();
      updateRemaining();
      
      // Check for final two
      const stillHolding = participants.filter(p => p.dropTimeMs === null);
      if(stillHolding.length === 2){
        updateNarrative(NARRATIVES.final_two);
      }
      
      // Check if game should end
      checkGameEnd();
    }
    
    function checkGameEnd(){
      // Find participants still holding - CRITICAL: use correct filter
      const stillHolding = participants.filter(p => p.dropTimeMs === null);
      
      if(stillHolding.length === 1){
        // One person left - they win!
        const winner = stillHolding[0];
        console.log(`[HoldWall] Last person standing: ${winner.name} (isPlayer: ${winner.isPlayer})`);
        
        if(winner.isPlayer){
          finalizeVictory();
        } else {
          finalizeResults();
        }
      } else if(stillHolding.length === 0){
        // Everyone dropped (shouldn't happen, but handle gracefully)
        finalizeResults();
      }
    }
    
    function handleMouseDown(e){
      if(state !== 'playing' || hasEnded) return;
      
      // AFK FIX: Prevent interaction if human has been AFK-dropped
      const playerParticipant = participants.find(p => p.isPlayer);
      if(playerParticipant && playerParticipant.dropTimeMs !== null){
        console.log('[HoldWall] Ignoring click - human was already dropped for AFK');
        return;
      }
      
      e.preventDefault();
      
      if(!isHolding){
        isHolding = true;
        hasHumanStartedHolding = true; // AFK FIX: Track that human has started
        mouseDownTime = Date.now();
        wallPanel.style.background = WALL_GRADIENT_HOLDING;
        wallPanel.style.transform = 'scale(0.98)';
        wallPanel.style.cursor = 'grabbing';
        wallPanel.style.borderColor = '#66ff66';
        statusMsg.textContent = 'Keep holding!';
        
        console.log('[HoldWall] ✓ Human started holding - AFK prevention successful');
        
        // AFK FIX: Clear grace period timer since they started holding
        if(gracePeriodTimer){
          clearTimeout(gracePeriodTimer);
          gracePeriodTimer = null;
          console.log('[HoldWall] ✓ Grace period timer cleared - human is active');
        }
      }
    }
    
    function handleMouseUp(e){
      if(state !== 'playing' || hasEnded) return;
      
      if(isHolding){
        // Player released - they drop!
        endHold();
      }
    }
    
    function cleanupTimers(){
      // Clear grace period timer
      if(gracePeriodTimer){
        clearTimeout(gracePeriodTimer);
        gracePeriodTimer = null;
      }
      
      // Clear narrative timer
      if(narrativeTimer){
        clearTimeout(narrativeTimer);
        narrativeTimer = null;
      }
      
      // Clear narrative pulse timeout
      if(narrativePulseTimeout){
        clearTimeout(narrativePulseTimeout);
        narrativePulseTimeout = null;
      }
      
      // Clear all difficulty timeouts
      difficultyTimeouts.forEach(clearTimeout);
      difficultyTimeouts = [];
      
      // Clear all AI drop timeouts
      aiDropTimeouts.forEach(clearTimeout);
      aiDropTimeouts = [];
      
      // Clear all effect cleanup timeouts
      effectCleanupTimeouts.forEach(clearTimeout);
      effectCleanupTimeouts = [];
      
      // Cancel animation frame
      if(animationFrame){
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
      }
    }
    
    function endHold(){
      if(hasEnded) return;
      
      isHolding = false;
      
      // BUG FIX: Check if player is last standing BEFORE any other logic
      const stillHolding = participants.filter(p => p.dropTimeMs === null);
      if(stillHolding.length === 1 && stillHolding[0].isPlayer){
        // Human is the last person standing - they WIN!
        console.log('[HoldWall] Human is last standing - VICTORY!');
        finalizeVictory();
        return; // Exit immediately - game is over
      }
      
      // BUG FIX: Human is NOT the last standing - they are dropping
      // Do NOT set hasEnded yet - game continues with AI
      // Do NOT call cleanupTimers() - AI drop timers must continue!
      
      const dropTime = Date.now() - startTime;
      const playerParticipant = participants.find(p => p.isPlayer);
      
      if(playerParticipant){
        playerParticipant.dropTimeMs = dropTime;
        eliminationLog.push({
          name: playerParticipant.name,
          timeMs: dropTime,
          isPlayer: true
        });
        
        console.log(`[HoldWall] Player dropped at ${(dropTime/1000).toFixed(1)}s`);
        updateNarrative(NARRATIVES.loss);
      }
      
      wallPanel.style.background = WALL_GRADIENT_DEFAULT;
      wallPanel.style.transform = 'scale(1)';
      wallPanel.style.borderColor = '#ff6b6b';
      statusMsg.textContent = 'You released!';
      
      // BUG FIX: Let AI drop timers continue naturally
      // The last AI standing should be the true winner
      // Update displays to show human dropped
      renderParticipants();
      updateRemaining();
      
      // Check if game should end (only 1 or 0 players remaining)
      checkGameEnd();
    }
    
    function finalizeVictory(){
      if(hasEnded) return;
      hasEnded = true;
      
      // Cleanup all timers
      cleanupTimers();
      
      const victoryTime = Date.now() - startTime;
      score = 100; // Winner gets max score
      
      console.log(`[HoldWall] Player wins! Held for ${(victoryTime/1000).toFixed(1)}s`);
      updateNarrative(NARRATIVES.victory);
      
      statusMsg.textContent = 'YOU WIN!';
      statusMsg.style.color = '#66ff66';
      statusMsg.style.fontSize = '2rem';
      
      wallPanel.style.borderColor = '#66ff66';
      
      // Build final standings with player first
      const playerParticipant = participants.find(p => p.isPlayer);
      if(playerParticipant){
        playerParticipant.dropTimeMs = victoryTime;
        
        // Player is first, others get 0 score
        const standings = [
          { name: playerParticipant.name, timeMs: victoryTime, score: 100, isPlayer: true }
        ];
        
        // Add eliminated in reverse order
        eliminationLog.reverse().forEach(entry => {
          standings.push({ ...entry, score: 0 });
        });
        
        displayResults(standings, victoryTime);
      }
    }
    
    function finalizeResults(){
      if(state === 'end') return; // Already finalized
      state = 'end';
      
      const finalTime = Date.now() - startTime;
      
      // Build final standings: still holding first, then eliminated in reverse order
      const stillHolding = participants.filter(p => p.dropTimeMs === null);
      const dropped = participants.filter(p => p.dropTimeMs !== null);
      
      // Sort dropped by time (latest first)
      dropped.sort((a, b) => b.dropTimeMs - a.dropTimeMs);
      
      const finalStandings = [
        ...stillHolding.map(p => ({
          name: p.name,
          timeMs: finalTime,
          score: 100,
          isPlayer: p.isPlayer
        })),
        ...dropped.map((p, idx) => ({
          name: p.name,
          timeMs: p.dropTimeMs,
          score: stillHolding.length === 0 && idx === 0 ? 100 : 0,
          isPlayer: p.isPlayer
        }))
      ];
      
      console.log('[HoldWall] Final standings:', finalStandings.map(s => `${s.name}: ${s.score}`).join(', '));
      
      displayResults(finalStandings, finalTime);
    }
    
    function displayResults(standings, finalTime){
      // Update HUD
      root.querySelector('#finalTime').textContent = `${(finalTime / 1000).toFixed(1)}s`;
      root.querySelector('#finalScore').textContent = standings[0].score;
      
      // Build standings list
      const standingsHTML = standings.slice(0, 5).map((s, idx) => {
        const place = idx + 1;
        const medal = place === 1 ? '🥇' : place === 2 ? '🥈' : place === 3 ? '🥉' : '';
        return `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px;margin:5px 0;background:rgba(44,58,77,0.3);border-radius:6px;${s.isPlayer ? 'border:2px solid #83bfff;' : ''}">
            <span style="font-weight:600;color:#e8f3ff;">${medal} ${place}. ${s.name}</span>
            <span style="color:#95a9c0;">${(s.timeMs / 1000).toFixed(1)}s</span>
          </div>
        `;
      }).join('');
      
      root.querySelector('#standingsContainer').innerHTML = standingsHTML;
      
      // Show end screen
      endScreen.style.display = 'flex';
      
      // Store results globally
      if(g.lastCompScores){
        // ENDURANCE FIX: Don't replace the entire Map - just update scores for participants
        // This prevents submitScore() from failing and maintains CompLocks integrity
        
        // OPTIMIZATION: Create lookup map to avoid O(n²) complexity
        const participantsByName = new Map(participants.map(p => [p.name, p]));
        
        standings.forEach(s => {
          // Find the participant to get their player ID
          const participant = participantsByName.get(s.name);
          if(participant && participant.id !== undefined){
            g.lastCompScores.set(participant.id, s.score);
          }
        });
        
        // ENDURANCE FIX: Mark winner as authoritative to prevent override by fallback logic
        // Store winner player ID for HOH/POV determination
        const winnerParticipant = participantsByName.get(standings[0].name);
        if(winnerParticipant && winnerParticipant.id !== undefined){
          // BUG FIX: Store on g.game (window.game), not g (window)
          // competitions.js reads from g.__authoritativeWinner where g = window.game
          g.game.__authoritativeWinner = {
            playerId: winnerParticipant.id,
            score: standings[0].score,
            minigame: gameId,
            compType: compType, // 'hoh' or 'pov'
            timestamp: Date.now()
          };
          console.log(`[HoldWall] ✓ Authoritative winner set: Player ${winnerParticipant.id} (${standings[0].name}) for ${compType}`);
        }
      }
      
      // Dispatch event
      g.dispatchEvent(new CustomEvent('minigame:end', {
        detail: {
          game: gameId,
          score: standings[0].score,
          standings: standings
        }
      }));
      
      // Call completion callback after delay
      setTimeout(() => {
        if(typeof onComplete === 'function'){
          onComplete(standings[0].score);
        }
      }, 2000);
    }
    
    function gameLoop(){
      if(state !== 'playing' || hasEnded){
        return;
      }
      
      timeElapsed = Date.now() - startTime;
      score = Math.floor(timeElapsed / 100); // Score = time in deciseconds
      
      updateHUD();
      
      animationFrame = requestAnimationFrame(gameLoop);
    }
    
    function updateHUD(){
      root.querySelector('#timeDisplay').textContent = `${(timeElapsed / 1000).toFixed(1)}s`;
    }
    
    function updateRemaining(){
      const remaining = participants.filter(p => p.dropTimeMs === null).length;
      root.querySelector('#remainingDisplay').textContent = remaining;
    }
    
    // Wire up events
    startBtn.addEventListener('click', startCountdown);
    wallPanel.addEventListener('mousedown', handleMouseDown);
    wallPanel.addEventListener('touchstart', handleMouseDown);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchend', handleMouseUp);
  }
  
  // Export
  if(!g.MiniGames) g.MiniGames = {};
  g.MiniGames.holdWall = { render };
  
})(window);
