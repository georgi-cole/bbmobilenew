// MODULE: minigames/memory-match.js
// Memory Match - Memorize and repeat color sequence
// Enhanced with: randomized sequences, timed reveal, difficulty scaling, anti-cheat, win probability

(function(g){
  'use strict';

  /**
   * Memory Match minigame
   * Player watches a sequence of colored blocks OR shapes, then repeats it
   * Score based on correct sequence reproduction and length
   * Mobile-friendly with tap support
   * 
   * @param {HTMLElement} container - Container element for the game UI
   * @param {Function} onComplete - Callback function(score) when game ends
   * @param {Object} options - Configuration options
   *   - debugMode: boolean - If true, bypass win probability bias
   *   - difficulty: string - 'easy', 'medium', or 'hard'
   *   - competitionMode: boolean - If true, enable anti-cheat measures
   *   - mode: string - 'card' (color buttons, default) or 'pattern' (shape dropdowns)
   */
  function render(container, onComplete, options = {}){
    container.innerHTML = '';
    
    const { 
      debugMode = false, 
      difficulty = 'medium',
      competitionMode = false,
      mode = 'card' // 'card' or 'pattern'
    } = options;
    
    // Get difficulty settings
    const diffSettings = g.GameUtils ? 
      g.GameUtils.getDifficultySettings(difficulty) : 
      { patternLength: 6, revealDuration: 3000, allowedMistakes: 1 };
    
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:16px;padding:20px;';
    
    // Anti-cheat wrapper (if in competition mode)
    let antiCheat = null;
    if(competitionMode && g.AntiCheatWrapper){
      antiCheat = g.AntiCheatWrapper.createWrapper(container, {
        onCheatDetected: (event) => {
          console.warn('[MemoryMatch] Cheat detected:', event);
          // Auto-fail on cheat
          if(onComplete){
            onComplete(0);
          }
        },
        competitionMode: true,
        strictMode: true,
        showWarning: true
      });
    }
    
    // Title
    const title = document.createElement('h3');
    title.textContent = mode === 'pattern' ? (debugMode ? 'Pattern Match (DEBUG MODE)' : 'Pattern Match') : (debugMode ? 'Memory Colors (DEBUG MODE)' : 'Memory Colors');
    title.style.cssText = `margin:0;font-size:1.2rem;color:${debugMode ? '#f2ce7b' : '#e3ecf5'};`;
    
    // Instructions
    const instructions = document.createElement('p');
    instructions.textContent = mode === 'pattern' ? 
      'Press Start to see pattern. Memorize it before time runs out!' :
      'Press Start to begin. Watch the sequence, then repeat it';
    instructions.style.cssText = 'margin:0;font-size:0.9rem;color:#95a9c0;text-align:center;';
    
    // Debug info
    if(debugMode){
      const debugInfo = document.createElement('div');
      debugInfo.style.cssText = 'padding:8px;background:rgba(242,206,123,0.1);border:1px solid rgba(242,206,123,0.3);border-radius:4px;font-size:0.8rem;color:#f2ce7b;text-align:center;';
      debugInfo.textContent = `Debug: ${difficulty} difficulty, ${diffSettings.patternLength} colors, ${diffSettings.revealDuration}ms reveal`;
      wrapper.appendChild(debugInfo);
    }
    
    // Color palette (for card mode) - Expanded with more colors
    const colors = [
      '#ff6b6b', // Coral Red
      '#6fd3ff', // Sky Blue
      '#74e48b', // Mint Green
      '#f7b955', // Golden Yellow
      '#b074ff', // Lavender Purple
      '#ff9cf1', // Cotton Candy
      '#9bdc82', // Lime Green
      '#ff8c42', // Tangerine Orange
      '#4ecdc4', // Turquoise
      '#a8e6cf', // Seafoam Green
      '#ffd166', // Honey Gold
      '#e63946', // Crimson Red
      '#457b9d', // Ocean Blue
      '#f1a7b5', // Baby Pink
      '#c77dff', // Amethyst
      '#e76f51', // Terracotta
      '#2a9d8f', // Teal
      '#ffafcc', // Rose Pink
      '#bde0fe', // Powder Blue
      '#ffc8dd'  // Blush Pink
    ];
    
    // Color names mapping (fancy names)
    const colorNames = {
      '#ff6b6b': 'Coral Red',
      '#6fd3ff': 'Sky Blue',
      '#74e48b': 'Mint Green',
      '#f7b955': 'Golden Yellow',
      '#b074ff': 'Lavender Purple',
      '#ff9cf1': 'Cotton Candy',
      '#9bdc82': 'Lime Green',
      '#ff8c42': 'Tangerine',
      '#4ecdc4': 'Turquoise',
      '#a8e6cf': 'Seafoam',
      '#ffd166': 'Honey Gold',
      '#e63946': 'Crimson',
      '#457b9d': 'Ocean Blue',
      '#f1a7b5': 'Baby Pink',
      '#c77dff': 'Amethyst',
      '#e76f51': 'Terracotta',
      '#2a9d8f': 'Teal',
      '#ffafcc': 'Rose Pink',
      '#bde0fe': 'Powder Blue',
      '#ffc8dd': 'Blush Pink'
    };
    
    // Shape options (for pattern mode)
    const shapes = ['▲', '■', '●', '◆', '★', '✚', '♦', '▼'];
    
    // Items to use based on mode
    const items = mode === 'pattern' ? shapes : colors;
    
    // Game state
    let sequence = null;
    let sequenceIndex = 0;
    let inputIndex = 0;
    let acceptingInput = false;
    let correctMatches = 0;
    let mistakesMade = 0; // Track mistakes for score reduction
    let gameStarted = false;
    let sequenceDiv = null;
    let protectCleanup = null;
    let distractorInterval = null;
    let timerDiv = null;
    let distractorDiv = null;
    let inputSelects = [];
    let reflashCount = 0; // Track number of reflashes for score penalty
    let colorNameLabel = null; // Label to show color name during flash
    
    // Status display
    const status = document.createElement('div');
    status.style.cssText = 'font-size:0.9rem;color:#83bfff;min-height:25px;text-align:center;font-weight:bold;';
    status.textContent = 'Press Start to begin';
    
    // Color name label (for showing color name during flash)
    colorNameLabel = document.createElement('div');
    colorNameLabel.style.cssText = 'font-size:1rem;color:#83bfff;min-height:30px;text-align:center;font-weight:bold;margin-top:10px;';
    colorNameLabel.textContent = '';
    
    // Sequence display area (created dynamically after Start)
    const sequenceContainer = document.createElement('div');
    sequenceContainer.style.cssText = 'min-height:60px;display:flex;align-items:center;justify-content:center;';
    
    // Timer display (for pattern mode)
    if(mode === 'pattern'){
      timerDiv = document.createElement('div');
      timerDiv.style.cssText = 'font-size:1.2rem;color:#83bfff;font-weight:bold;min-height:30px;';
      timerDiv.textContent = '';
    }
    
    // Distractor div (for pattern mode - shows random shapes during recall)
    if(mode === 'pattern'){
      distractorDiv = document.createElement('div');
      distractorDiv.style.cssText = 'font-size:1.5rem;color:rgba(149,169,192,0.3);min-height:30px;text-align:center;';
    }
    
    // Color buttons for input (card mode) OR dropdowns (pattern mode)
    const buttonDiv = document.createElement('div');
    buttonDiv.style.cssText = 'display:flex;gap:8px;margin:10px 0;flex-wrap:wrap;justify-content:center;';
    buttonDiv.innerHTML = '<div style="color:#95a9c0;font-size:0.9rem;">Press Start to begin</div>';
    
    // Start button
    const startBtn = document.createElement('button');
    startBtn.className = 'btn primary';
    startBtn.textContent = 'Start';
    
    // Reflash button
    const reflashBtn = document.createElement('button');
    reflashBtn.className = 'btn';
    reflashBtn.textContent = 'Reflash (-10% score)';
    reflashBtn.disabled = true;
    reflashBtn.style.display = 'none';
    reflashBtn.style.marginLeft = '10px';
    
    // Submit button
    const submitBtn = document.createElement('button');
    submitBtn.className = 'btn';
    submitBtn.textContent = 'Submit';
    submitBtn.disabled = true;
    submitBtn.style.display = 'none';
    
    /**
     * Generate sequence ONLY after Start is pressed (anti-cheat measure)
     */
    function generateSequence(){
      const rng = g.rng || Math.random;
      sequence = g.GameUtils ? 
        g.GameUtils.generateRandomSequence(items, diffSettings.patternLength) :
        Array.from({ length: diffSettings.patternLength }, () => items[Math.floor(rng() * items.length)]);
      
      console.log(`[Memory${mode === 'pattern' ? 'Pattern' : 'Match'}] Sequence generated:`, sequence.length, mode === 'pattern' ? 'shapes' : 'colors');
    }
    
    /**
     * Create sequence display boxes
     */
    function createSequenceDisplay(){
      if(mode === 'pattern'){
        // Pattern mode: show sequence directly in a display div
        sequenceDiv = document.createElement('div');
        sequenceDiv.style.cssText = 'font-size:2rem;margin:20px 0;min-height:60px;display:flex;gap:10px;justify-content:center;align-items:center;padding:15px;background:rgba(13,21,31,0.5);border-radius:8px;border:2px solid #2c3a4d;';
        sequenceDiv.textContent = 'Press Start to begin';
      } else {
        // Card mode: show boxes for sequence
        sequenceDiv = document.createElement('div');
        sequenceDiv.style.cssText = 'display:flex;gap:8px;margin:10px 0;';
        
        // Create boxes for sequence
        sequence.forEach(() => {
          const box = document.createElement('div');
          box.style.cssText = `width:40px;height:40px;border-radius:8px;background:#2c3a4d;opacity:0.25;border:2px solid #2c3a4d;`;
          sequenceDiv.appendChild(box);
        });
      }
      
      // Apply anti-copy protection
      if(competitionMode && g.AntiCheatWrapper){
        protectCleanup = g.AntiCheatWrapper.protectElement(sequenceDiv);
      }
      
      sequenceContainer.innerHTML = '';
      sequenceContainer.appendChild(sequenceDiv);
    }
    
    /**
     * Show sequence animation with timed reveal
     */
    function showSequence(){
      if(!sequence) return;
      
      startBtn.disabled = true;
      status.textContent = 'Watch carefully...';
      sequenceIndex = 0;
      inputIndex = 0;
      correctMatches = 0;
      mistakesMade = 0; // Reset mistakes counter
      acceptingInput = false;
      
      // Start anti-cheat monitoring
      if(antiCheat){
        antiCheat.startMonitoring();
      }
      
      if(mode === 'pattern'){
        // Pattern mode: show full sequence, then hide after time
        sequenceDiv.textContent = sequence.join(' ');
        sequenceDiv.style.color = '#e3ecf5';
        sequenceDiv.style.fontSize = '2rem';
        
        // Countdown timer
        const startTime = Date.now();
        const endTime = startTime + diffSettings.revealDuration;
        
        const updateTimer = () => {
          const remaining = Math.max(0, endTime - Date.now());
          const seconds = (remaining / 1000).toFixed(1);
          if(timerDiv){
            timerDiv.textContent = `Time remaining: ${seconds}s`;
            timerDiv.style.color = remaining < 1000 ? '#dc2626' : '#83bfff';
          }
          
          if(remaining > 0){
            requestAnimationFrame(updateTimer);
          } else {
            hideSequence();
          }
        };
        
        updateTimer();
      } else {
        // Card mode: animate sequence one by one
        const boxes = Array.from(sequenceDiv.children);
        const interval = 1100; // Increased from 650ms to 1100ms for slower demonstration
        
        const showNext = () => {
          // Reset all boxes
          boxes.forEach(b => {
            b.style.opacity = '0.25';
            b.style.background = '#2c3a4d';
          });
          
          if(sequenceIndex >= sequence.length){
            // Hide color name label (card mode only)
            if(mode === 'card' && colorNameLabel){
              colorNameLabel.textContent = '';
            }
            // Auto-hide after a short pause (800ms is good for all difficulty levels in card mode)
            setTimeout(() => {
              hideSequence();
            }, 800);
            return;
          }
          
          // Highlight current box with actual color
          const currentColor = sequence[sequenceIndex];
          boxes[sequenceIndex].style.opacity = '1';
          boxes[sequenceIndex].style.background = currentColor;
          
          // Show color name below (card mode only)
          if(mode === 'card' && colorNameLabel){
            const colorName = colorNames[currentColor] || 'Unknown';
            colorNameLabel.textContent = colorName;
            colorNameLabel.style.color = currentColor;
          }
          
          sequenceIndex++;
          
          setTimeout(showNext, interval);
        };
        
        showNext();
      }
    }
    
    /**
     * Hide sequence and enable input (ephemeral clearing)
     */
    function hideSequence(){
      if(mode === 'pattern'){
        // Pattern mode: hide and show distractors
        sequenceDiv.textContent = '(hidden)';
        sequenceDiv.style.color = '#555';
        sequenceDiv.style.fontSize = '1.2rem';
        
        if(timerDiv){
          timerDiv.textContent = 'Now match the pattern!';
          timerDiv.style.color = '#22c55e';
        }
        
        // Cleanup anti-copy protection for display
        if(protectCleanup){
          protectCleanup();
        }
        
        // Start distractors (random shapes to add complexity)
        if(distractorDiv){
          distractorDiv.textContent = '';
          distractorInterval = setInterval(() => {
            const randomShapes = Array.from({length: 6}, () => 
              shapes[Math.floor(Math.random() * shapes.length)]
            ).join(' ');
            distractorDiv.textContent = randomShapes;
          }, 800);
        }
      } else {
        // Card mode: hide boxes
        const boxes = Array.from(sequenceDiv.children);
        boxes.forEach(box => {
          box.style.opacity = '0.25';
          box.style.background = '#2c3a4d';
          // Clear any visual traces
          box.textContent = '';
        });
      }
      
      acceptingInput = true;
      status.textContent = mode === 'pattern' ? 'Now match the pattern!' : 'Now repeat the sequence!';
      submitBtn.style.display = 'inline-block';
      reflashBtn.style.display = 'inline-block';
      reflashBtn.disabled = false;
      
      // Enable input UI
      if(mode === 'pattern'){
        createInputDropdowns();
      } else {
        createColorButtons();
      }
    }
    
    /**
     * Create input dropdowns (for pattern mode)
     */
    function createInputDropdowns(){
      buttonDiv.innerHTML = '';
      buttonDiv.style.display = 'flex';
      buttonDiv.style.gap = '8px';
      buttonDiv.style.margin = '20px 0';
      buttonDiv.style.flexWrap = 'wrap';
      buttonDiv.style.justifyContent = 'center';
      inputSelects = [];
      
      for(let i = 0; i < sequence.length; i++){
        const select = document.createElement('select');
        select.style.cssText = 'font-size:1.5rem;padding:8px;background:#1d2734;color:#e3ecf5;border:1px solid #2c3a4d;border-radius:5px;cursor:pointer;';
        
        // Add blank option first
        const blankOpt = document.createElement('option');
        blankOpt.textContent = '?';
        blankOpt.value = '';
        select.appendChild(blankOpt);
        
        // Add shape options
        shapes.forEach(shape => {
          const option = document.createElement('option');
          option.textContent = shape;
          option.value = shape;
          select.appendChild(option);
        });
        
        inputSelects.push(select);
        buttonDiv.appendChild(select);
      }
    }
    
    /**
     * Create color input buttons (for card mode)
     * Shows only the colors from the sequence + 1 extra color
     */
    function createColorButtons(){
      buttonDiv.innerHTML = '';
      buttonDiv.style.display = 'flex';
      buttonDiv.style.gap = '8px';
      buttonDiv.style.margin = '10px 0';
      buttonDiv.style.flexWrap = 'wrap';
      buttonDiv.style.justifyContent = 'center';
      
      // Get unique colors from the sequence
      const uniqueSequenceColors = [...new Set(sequence)];
      
      // Add one extra random color not in the sequence (if available)
      const availableColors = colors.filter(c => !uniqueSequenceColors.includes(c));
      const rng = g.rng || Math.random;
      
      const displayColors = [...uniqueSequenceColors];
      
      // Only add extra color if available colors exist
      if(availableColors.length > 0){
        const extraColor = availableColors[Math.floor(rng() * availableColors.length)];
        displayColors.push(extraColor);
      }
      
      // Shuffle the display colors using Fisher-Yates
      for(let i = displayColors.length - 1; i > 0; i--){
        const j = Math.floor(rng() * (i + 1));
        [displayColors[i], displayColors[j]] = [displayColors[j], displayColors[i]];
      }
      
      // Create buttons for the selected colors
      displayColors.forEach(color => {
        const btn = document.createElement('button');
        btn.style.cssText = `width:40px;height:40px;border-radius:8px;background:${color};border:2px solid #2c3a4d;cursor:pointer;transition:transform 0.1s;`;
        btn.addEventListener('mousedown', () => {
          btn.style.transform = 'scale(0.9)';
        });
        btn.addEventListener('mouseup', () => {
          btn.style.transform = 'scale(1)';
        });
        btn.addEventListener('click', () => pickColor(color));
        buttonDiv.appendChild(btn);
      });
    }
    
    /**
     * Handle color button click
     */
    function pickColor(color){
      if(!acceptingInput) return;
      
      // Prevent picking more colors than the sequence length
      if(inputIndex >= sequence.length){
        status.textContent = '⚠️ You have guessed all colors. Press Submit!';
        status.style.color = '#f59e0b';
        return;
      }
      
      const boxes = Array.from(sequenceDiv.children);
      
      if(color === sequence[inputIndex]){
        correctMatches++;
        inputIndex++; // Increment to move to next position (visual feedback will use inputIndex-1)
        
        // Visual feedback - highlight the previous position box with the correct color
        if(boxes[inputIndex - 1]){
          boxes[inputIndex - 1].style.opacity = '1';
          boxes[inputIndex - 1].style.background = color;
        }
        
        // Show color name feedback
        const colorName = colorNames[color] || 'Unknown';
        status.textContent = `✅ Correct: ${colorName}`;
        status.style.color = '#22c55e';
        
        if(inputIndex === sequence.length){
          // Sequence complete!
          acceptingInput = false;
          status.textContent = '✅ Perfect match! Press Submit!';
          status.style.color = '#22c55e';
          submitBtn.disabled = false;
          reflashBtn.disabled = true;
          
          // Stop anti-cheat monitoring
          if(antiCheat){
            antiCheat.stopMonitoring();
          }
        }
      } else {
        // Wrong color - track mistake, show correct color, and auto-populate
        mistakesMade++;
        
        const chosenColorName = colorNames[color] || 'Unknown';
        const correctColor = sequence[inputIndex];
        const correctColorName = colorNames[correctColor] || 'Unknown';
        
        // Auto-populate the correct color in the box
        if(boxes[inputIndex]){
          boxes[inputIndex].style.opacity = '1';
          boxes[inputIndex].style.background = correctColor;
        }
        
        if(mistakesMade >= diffSettings.allowedMistakes){
          acceptingInput = false;
          status.textContent = `❌ Game Over! You chose ${chosenColorName} but it was ${correctColorName}`;
          status.style.color = '#dc2626';
          submitBtn.disabled = false;
          reflashBtn.disabled = true;
          
          // Stop anti-cheat monitoring
          if(antiCheat){
            antiCheat.stopMonitoring();
          }
        } else {
          status.textContent = `❌ Incorrect: You chose ${chosenColorName}, it was ${correctColorName} (Mistake ${mistakesMade}/${diffSettings.allowedMistakes})`;
          status.style.color = '#f59e0b';
        }
        
        inputIndex++;
        
        // Check if all positions are filled after mistake
        if(inputIndex === sequence.length){
          acceptingInput = false;
          status.textContent += '. Press Submit!';
          submitBtn.disabled = false;
          reflashBtn.disabled = true;
        }
      }
    }
    
    /**
     * Start button handler - generate sequence on press
     */
    startBtn.addEventListener('click', () => {
      if(!gameStarted){
        gameStarted = true;
        generateSequence();
        createSequenceDisplay();
        showSequence();
        startBtn.style.display = 'none';
      }
    });
    
    /**
     * Reflash button handler - replay the sequence with 10% score penalty
     */
    reflashBtn.addEventListener('click', () => {
      if(!acceptingInput) return;
      
      reflashCount++;
      reflashBtn.disabled = true;
      acceptingInput = false;
      
      // Reset input state but keep mistakes
      inputIndex = 0;
      
      // Clear and show watch message
      buttonDiv.textContent = ''; // Clear safely
      const watchMsg = document.createElement('div');
      watchMsg.style.cssText = 'color:#95a9c0;font-size:0.9rem;';
      watchMsg.textContent = 'Watch again...';
      buttonDiv.appendChild(watchMsg);
      
      // Reset sequence boxes
      const boxes = Array.from(sequenceDiv.children);
      boxes.forEach(box => {
        box.style.opacity = '0.25';
        box.style.background = '#2c3a4d';
      });
      
      // Show warning about penalty
      status.textContent = '⚠️ Reflashing... (-10% score penalty)';
      status.style.color = '#f59e0b';
      
      // Replay the sequence
      sequenceIndex = 0;
      showSequence();
    });
    
    /**
     * Submit button handler with win probability logic
     */
    submitBtn.addEventListener('click', () => {
      submitBtn.disabled = true;
      acceptingInput = false;
      
      // Stop distractors (pattern mode)
      if(distractorInterval){
        clearInterval(distractorInterval);
        if(distractorDiv) distractorDiv.textContent = '';
      }
      
      // Cleanup anti-copy protection
      if(protectCleanup){
        protectCleanup();
      }
      
      // Cleanup anti-cheat
      if(antiCheat){
        antiCheat.stopMonitoring();
        antiCheat.cleanup();
      }
      
      // Calculate raw score
      let correctCount = 0;
      
      if(mode === 'pattern'){
        // Pattern mode: check dropdowns
        inputSelects.forEach((select, index) => {
          if(select.value === sequence[index]){
            correctCount++;
          }
        });
      } else {
        // Card mode: use correctMatches
        correctCount = correctMatches;
      }
      
      const accuracy = correctCount / sequence.length;
      let rawScore = Math.round(accuracy * 100);
      
      // Apply mistake penalty - each mistake reduces score by 15 points
      const mistakePenalty = 15;
      const penaltyAmount = mistakesMade * mistakePenalty;
      rawScore = Math.max(0, rawScore - penaltyAmount);
      
      // Apply reflash penalty - 10% reduction per reflash (capped at 90% to avoid negative scores)
      if(reflashCount > 0){
        const reflashPenalty = Math.min(0.10 * reflashCount, 0.90); // Cap at 90% penalty
        rawScore = Math.round(rawScore * (1 - reflashPenalty));
        rawScore = Math.max(0, rawScore);
      }
      
      // Use MinigameScoring to calculate final score (SCALE=1000)
          const finalScore = g.MinigameScoring ? 
            g.MinigameScoring.calculateFinalScore({
              rawScore: rawScore,
              minScore: 0,
              maxScore: 100,
              compBeast: 0.5
            }) :
            rawScore * 10; // Fallback: scale to 0-1000
      
      if(debugMode){
        console.log(`[Memory${mode === 'pattern' ? 'Pattern' : 'Match'}] Debug - Correct:`, correctCount, '/', sequence.length, 'Mistakes:', mistakesMade, 'Reflashes:', reflashCount, 'Raw score:', rawScore, 'Final score:', finalScore);
      }
      
      onComplete(finalScore);
    });
    
    // Create floating color emojis container (subtle background decoration)
    const emojiContainer = document.createElement('div');
    emojiContainer.className = 'memory-colors-emoji-container'; // Set class immediately for cleanup
    emojiContainer.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;overflow:hidden;opacity:0.15;';
    
    // Color emojis to float (variety for randomization)
    const colorEmojis = ['🔴', '🔵', '🟢', '🟡', '🟣', '🟠', '🟤', '⚫', '⚪', '🔶', '🔷', '🟥', '🟦', '🟩', '🟨', '🟪', '🟧'];
    
    // Create 12 floating emojis with random selection from the pool
    for(let i = 0; i < 12; i++){
      const emoji = document.createElement('div');
      emoji.textContent = colorEmojis[Math.floor(Math.random() * colorEmojis.length)];
      emoji.style.cssText = `
        position:absolute;
        font-size:${20 + Math.random() * 30}px;
        left:${Math.random() * 100}%;
        top:${Math.random() * 100}%;
        animation:float-emoji ${8 + Math.random() * 8}s ease-in-out infinite;
        animation-delay:${Math.random() * 5}s;
      `;
      emojiContainer.appendChild(emoji);
    }
    
    // Add CSS animation for floating emojis (only once per page)
    if(!document.getElementById('memory-colors-emoji-animation')){
      const style = document.createElement('style');
      style.id = 'memory-colors-emoji-animation';
      style.textContent = `
        @keyframes float-emoji {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          25% { transform: translate(30px, -30px) rotate(90deg); }
          50% { transform: translate(-20px, 20px) rotate(180deg); }
          75% { transform: translate(20px, 30px) rotate(270deg); }
        }
      `;
      document.head.appendChild(style);
    }
    
    // Assemble UI
    wrapper.appendChild(title);
    wrapper.appendChild(instructions);
    wrapper.appendChild(sequenceContainer);
    // Only add color name label in card mode (it's used during flash sequence)
    if(mode === 'card'){
      wrapper.appendChild(colorNameLabel);
    }
    if(mode === 'pattern' && distractorDiv){
      wrapper.appendChild(distractorDiv);
    }
    if(mode === 'pattern' && timerDiv){
      wrapper.appendChild(timerDiv);
    }
    wrapper.appendChild(status);
    const buttonRow = document.createElement('div');
    buttonRow.style.cssText = 'display:flex;gap:10px;justify-content:center;';
    buttonRow.appendChild(startBtn);
    buttonRow.appendChild(reflashBtn);
    wrapper.appendChild(buttonRow);
    wrapper.appendChild(buttonDiv);
    wrapper.appendChild(submitBtn);
    
    // Clear any existing emoji containers in this container first
    const existingEmojis = container.querySelector('.memory-colors-emoji-container');
    if(existingEmojis){
      existingEmojis.remove();
    }
    
    // Ensure container has relative positioning for absolute emoji positioning
    if(!container.style.position || container.style.position === 'static'){
      container.style.position = 'relative';
    }
    
    container.appendChild(emojiContainer);
    container.appendChild(wrapper);
  }

  if(typeof g.MiniGames === 'undefined') g.MiniGames = {};
  g.MiniGames.memoryMatch = { render };
  
  // Also export as patternMatch for backward compatibility
  g.MiniGames.patternMatch = {
    render: (container, onComplete, options = {}) => {
      return render(container, onComplete, { ...options, mode: 'pattern' });
    }
  };

})(window);
