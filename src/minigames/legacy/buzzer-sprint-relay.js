// MODULE: minigames/buzzer-sprint-relay.js
// Buzzer Sprint Relay - Memory sequence game with speed element (time-based scoring)

(function(g){
  'use strict';

  // Constants
  const ROUNDS = 3;
  const INITIAL_SEQUENCE_LENGTH = 4;
  const INITIAL_FLASH_DURATION = 900;
  const MIN_FLASH_DURATION = 500;
  const MISTAKE_PENALTY_MS = 1500;
  const MAX_MISTAKES_PER_ROUND = 5;
  const BUZZER_COLORS = ['#ff6b6b', '#74e48b', '#6fd3ff', '#f7b955', '#a78bfa'];

  /**
   * Render the Buzzer Sprint Relay minigame
   */
  function render(container, onComplete, options = {}){
    container.innerHTML = '';
    
    const { debugMode = false, competitionMode = false } = options;
    
    // Main wrapper
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:16px;padding:20px;width:100%;max-width:600px;margin:0 auto;';
    
    // Title
    const title = document.createElement('h3');
    title.textContent = 'Buzzer Sprint Relay';
    title.style.cssText = 'margin:0;font-size:1.3rem;color:#e3ecf5;';
    
    // Instructions overlay
    const instructionsOverlay = document.createElement('div');
    instructionsOverlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);z-index:10000;display:flex;align-items:center;justify-content:center;';
    
    const instructionsBox = document.createElement('div');
    instructionsBox.style.cssText = 'background:#1d2734;padding:30px;border-radius:12px;max-width:400px;text-align:center;';
    instructionsBox.innerHTML = `
      <h2 style="color:#6fd3ff;margin:0 0 20px 0;">How to Play</h2>
      <p style="color:#e3ecf5;margin:10px 0;line-height:1.6;">
        • Watch the sequence of buzzer buttons light up<br>
        • Memorize the order<br>
        • Tap the buzzers in the same order as fast as you can<br>
        • Wrong taps add +${MISTAKE_PENALTY_MS/1000}s penalty<br>
        • 3 rounds with increasing difficulty<br>
        • <strong>Lowest total time wins!</strong>
      </p>
      <button id="startGameBtn" class="btn primary" style="margin-top:20px;padding:12px 32px;font-size:1.1rem;">START GAME</button>
    `;
    instructionsOverlay.appendChild(instructionsBox);
    document.body.appendChild(instructionsOverlay);
    
    // HUD
    const hudDiv = document.createElement('div');
    hudDiv.style.cssText = 'display:flex;justify-content:space-between;width:100%;font-size:0.9rem;';
    
    const roundDiv = document.createElement('div');
    roundDiv.style.cssText = 'color:#83bfff;';
    roundDiv.textContent = 'Round: 1/3';
    
    const timerDiv = document.createElement('div');
    timerDiv.style.cssText = 'color:#f7b955;font-size:1.1rem;font-weight:bold;';
    timerDiv.textContent = '0.0s';
    
    const mistakesDiv = document.createElement('div');
    mistakesDiv.style.cssText = 'color:#ff6b6b;';
    mistakesDiv.textContent = 'Mistakes: 0';
    
    hudDiv.appendChild(roundDiv);
    hudDiv.appendChild(timerDiv);
    hudDiv.appendChild(mistakesDiv);
    
    // Status message
    const statusDiv = document.createElement('div');
    statusDiv.style.cssText = 'font-size:0.9rem;color:#95a9c0;text-align:center;min-height:24px;';
    statusDiv.textContent = 'Watch carefully...';
    
    // Buzzer grid
    const buzzerGrid = document.createElement('div');
    buzzerGrid.style.cssText = 'display:grid;grid-template-columns:repeat(3, 1fr);gap:16px;width:100%;max-width:400px;margin:20px 0;';
    
    // Stats display
    const statsDiv = document.createElement('div');
    statsDiv.style.cssText = 'width:100%;background:#1a2332;border-radius:6px;padding:12px;font-size:0.85rem;color:#95a9c0;';
    
    wrapper.appendChild(title);
    wrapper.appendChild(hudDiv);
    wrapper.appendChild(statusDiv);
    wrapper.appendChild(buzzerGrid);
    wrapper.appendChild(statsDiv);
    container.appendChild(wrapper);
    
    // Game state
    let gameActive = false;
    let currentRound = 0;
    let totalTime = 0;
    let roundStartTime = 0;
    let roundTimes = [];
    let totalMistakes = 0;
    let roundMistakes = 0;
    let sequence = [];
    let userInput = [];
    let inputEnabled = false;
    let buzzers = [];
    let numBuzzers = 5;
    let sequenceLength = INITIAL_SEQUENCE_LENGTH;
    let flashDuration = INITIAL_FLASH_DURATION;
    let timerInterval = null;
    
    // Create buzzers
    function createBuzzers(){
      buzzerGrid.innerHTML = '';
      buzzers = [];
      
      for(let i = 0; i < numBuzzers; i++){
        const buzzer = document.createElement('div');
        buzzer.style.cssText = `
          width:100%;
          aspect-ratio:1;
          border-radius:12px;
          background:#2c3a4d;
          border:3px solid ${BUZZER_COLORS[i % BUZZER_COLORS.length]};
          display:flex;
          align-items:center;
          justify-content:center;
          font-size:2rem;
          font-weight:bold;
          color:${BUZZER_COLORS[i % BUZZER_COLORS.length]};
          cursor:pointer;
          user-select:none;
          transition:all 0.2s;
        `;
        buzzer.textContent = i + 1;
        buzzer.dataset.index = i;
        
        buzzer.addEventListener('click', () => handleBuzzerClick(i));
        
        // Touch highlight
        buzzer.addEventListener('touchstart', (e) => {
          e.preventDefault();
          if(inputEnabled){
            buzzer.style.transform = 'scale(0.95)';
          }
        });
        
        buzzer.addEventListener('touchend', (e) => {
          e.preventDefault();
          buzzer.style.transform = 'scale(1)';
          // Call handleBuzzerClick directly since preventDefault blocks the synthesized click
          handleBuzzerClick(i);
        });
        
        buzzerGrid.appendChild(buzzer);
        buzzers.push(buzzer);
      }
    }
    
    // Flash buzzer
    function flashBuzzer(index, duration){
      return new Promise((resolve) => {
        const buzzer = buzzers[index];
        const originalBg = buzzer.style.background;
        
        buzzer.style.background = BUZZER_COLORS[index % BUZZER_COLORS.length];
        buzzer.style.boxShadow = `0 0 20px ${BUZZER_COLORS[index % BUZZER_COLORS.length]}`;
        buzzer.style.transform = 'scale(1.05)';
        
        setTimeout(() => {
          buzzer.style.background = originalBg;
          buzzer.style.boxShadow = 'none';
          buzzer.style.transform = 'scale(1)';
          resolve();
        }, duration);
      });
    }
    
    // Generate sequence
    function generateSequence(){
      sequence = [];
      for(let i = 0; i < sequenceLength; i++){
        sequence.push(Math.floor(Math.random() * numBuzzers));
      }
    }
    
    // Show sequence
    async function showSequence(){
      inputEnabled = false;
      statusDiv.textContent = 'Watch the sequence...';
      
      // Flash each buzzer in sequence
      for(let i = 0; i < sequence.length; i++){
        await flashBuzzer(sequence[i], flashDuration);
        await new Promise(resolve => setTimeout(resolve, 200)); // Pause between flashes
      }
      
      statusDiv.textContent = 'Now repeat it - GO!';
      inputEnabled = true;
      roundStartTime = Date.now();
      
      // Start timer update
      timerInterval = setInterval(updateTimer, 50);
    }
    
    // Update timer display
    function updateTimer(){
      if(!inputEnabled) return;
      const elapsed = (Date.now() - roundStartTime + totalTime) / 1000;
      timerDiv.textContent = elapsed.toFixed(1) + 's';
    }
    
    // Handle buzzer click
    function handleBuzzerClick(index){
      if(!inputEnabled || !gameActive) return;
      
      userInput.push(index);
      
      // Visual feedback
      const buzzer = buzzers[index];
      buzzer.style.background = BUZZER_COLORS[index % BUZZER_COLORS.length];
      buzzer.style.boxShadow = `0 0 20px ${BUZZER_COLORS[index % BUZZER_COLORS.length]}`;
      
      setTimeout(() => {
        buzzer.style.background = '#2c3a4d';
        buzzer.style.boxShadow = 'none';
      }, 200);
      
      // Check if correct
      const position = userInput.length - 1;
      if(sequence[position] !== index){
        // Wrong buzzer!
        handleMistake();
        return;
      }
      
      // Check if sequence complete
      if(userInput.length === sequence.length){
        completeRound();
      }
    }
    
    // Handle mistake
    function handleMistake(){
      roundMistakes++;
      totalMistakes++;
      
      mistakesDiv.textContent = `Mistakes: ${roundMistakes}`;
      
      // Add penalty time
      totalTime += MISTAKE_PENALTY_MS;
      
      // Flash screen red
      buzzerGrid.style.background = '#ff3366';
      setTimeout(() => {
        buzzerGrid.style.background = 'transparent';
      }, 200);
      
      // Error sound effect (visual cue)
      statusDiv.textContent = `Wrong! +${MISTAKE_PENALTY_MS/1000}s penalty`;
      statusDiv.style.color = '#ff6b6b';
      
      setTimeout(() => {
        statusDiv.style.color = '#95a9c0';
      }, 1000);
      
      // Check if too many mistakes
      if(roundMistakes >= MAX_MISTAKES_PER_ROUND){
        failRound();
        return;
      }
      
      // Reset user input to try again
      userInput = [];
    }
    
    // Complete round
    function completeRound(){
      inputEnabled = false;
      if(timerInterval) clearInterval(timerInterval);
      
      const roundTime = Date.now() - roundStartTime;
      totalTime += roundTime;
      roundTimes.push(roundTime / 1000);
      
      statusDiv.textContent = `Round complete! Time: ${(roundTime/1000).toFixed(1)}s`;
      statusDiv.style.color = '#74e48b';
      
      setTimeout(() => {
        statusDiv.style.color = '#95a9c0';
        currentRound++;
        
        if(currentRound < ROUNDS){
          startRound();
        } else {
          endGame();
        }
      }, 2000);
    }
    
    // Fail round (too many mistakes)
    function failRound(){
      inputEnabled = false;
      if(timerInterval) clearInterval(timerInterval);
      
      // Add massive penalty for failing
      const failPenalty = 30000;
      totalTime += failPenalty;
      
      statusDiv.textContent = `Round failed! +${failPenalty/1000}s penalty`;
      statusDiv.style.color = '#ff6b6b';
      
      setTimeout(() => {
        statusDiv.style.color = '#95a9c0';
        currentRound++;
        
        if(currentRound < ROUNDS){
          startRound();
        } else {
          endGame();
        }
      }, 2000);
    }
    
    // Start round
    function startRound(){
      roundMistakes = 0;
      userInput = [];
      
      roundDiv.textContent = `Round: ${currentRound + 1}/${ROUNDS}`;
      mistakesDiv.textContent = 'Mistakes: 0';
      
      // Increase difficulty
      if(currentRound === 1){
        sequenceLength = 5;
        flashDuration = 700;
      } else if(currentRound === 2){
        sequenceLength = 6;
        flashDuration = 500;
        numBuzzers = 6;
        createBuzzers();
      }
      
      generateSequence();
      
      setTimeout(() => {
        showSequence();
      }, 1000);
    }
    
    // End game
    function endGame(){
      gameActive = false;
      if(timerInterval) clearInterval(timerInterval);
      
      // Calculate final score (total time in seconds, converted to 0-1000 scale)
      // Lower time = higher score
      const totalSeconds = totalTime / 1000;
      const bestTime = roundTimes.reduce((a, b) => Math.min(a, b), Infinity);
      const accuracy = sequence.length > 0 ? Math.round(((sequence.length * ROUNDS - totalMistakes) / (sequence.length * ROUNDS)) * 100) : 0;
      
      // Score: penalize high times, reward low times
      // Perfect game ~30s (3 rounds × 10s) = high score
      // Convert to 0-1000 range (lower time = higher score)
      const idealTime = 30;
      const scoreFactor = Math.max(0, 1 - (totalSeconds - idealTime) / 120);
      const finalScore = Math.max(0, Math.floor(scoreFactor * 1000));
      
      // Stats
      statsDiv.innerHTML = `
        <div style="text-align:center;">
          <div style="font-size:1.2rem;color:#6fd3ff;margin-bottom:10px;">Game Over!</div>
          <div>Total Time: <strong style="color:#f7b955;">${totalSeconds.toFixed(1)}s</strong></div>
          <div>Score: <strong style="color:#83bfff;">${finalScore}</strong></div>
          <div>Total Mistakes: ${totalMistakes}</div>
          <div>Best Round: ${bestTime.toFixed(1)}s</div>
          <div>Accuracy: ${accuracy}%</div>
        </div>
      `;
      
      timerDiv.textContent = totalSeconds.toFixed(1) + 's';
      timerDiv.style.color = '#74e48b';
      
      // Set result for integration
      window.minigameResult = {
        score: finalScore,
        totalTime: totalSeconds,
        totalMistakes,
        bestRoundTime: bestTime,
        accuracy
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
      countdownDiv.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);font-size:4rem;color:#6fd3ff;z-index:1000;';
      document.body.appendChild(countdownDiv);
      
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
            document.body.removeChild(countdownDiv);
            startGame();
          }, 500);
        }
      }, 1000);
    });
    
    // Start game
    function startGame(){
      gameActive = true;
      currentRound = 0;
      totalTime = 0;
      totalMistakes = 0;
      roundTimes = [];
      
      createBuzzers();
      startRound();
    }
  }

  // Export
  if(typeof g.MiniGames === 'undefined') g.MiniGames = {};
  g.MiniGames.buzzerSprintRelay = { render };

})(window);
