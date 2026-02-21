// MODULE: minigames/color-match.js
// Color Match - Match colors quickly with slider mode variant

(function(g){
  'use strict';

  /**
   * Color Match minigame
   * Match displayed color by mixing RGB values
   * Slider mode: use sliders instead of buttons
   * 
   * @param {HTMLElement} container - Container element for the game UI
   * @param {Function} onComplete - Callback function(score) when game ends
   * @param {Object} options - Configuration options
   */
  function render(container, onComplete, options = {}){
    container.innerHTML = '';
    
    const { 
      debugMode = false, 
      competitionMode = false,
      variant = 'slider' // 'button' or 'slider'
    } = options;
    
    const sliderMode = variant === 'slider';
    
    // Game configuration
    const maxRounds = 3;
    let targetColor = {r:0, g:0, b:0};
    let playerColor = {r:128, g:128, b:128};
    let currentRound = 1;
    let totalScore = 0;
    
    // Feedback color thresholds
    const EXCELLENT_THRESHOLD = 90;
    const GOOD_THRESHOLD = 70;
    const COLOR_EXCELLENT = '#4ade80';
    const COLOR_GOOD = '#fbbf24';
    const COLOR_POOR = '#f87171';
    
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:16px;padding:20px;';
    
    const title = document.createElement('h3');
    title.textContent = sliderMode ? 'Color Match (Slider)' : 'Color Match';
    title.style.cssText = 'margin:0;font-size:1.3rem;color:#e3ecf5;';
    
    const instructions = document.createElement('p');
    instructions.textContent = sliderMode ? 'Use sliders to match the target color!' : 'Mix colors to match the target!';
    instructions.style.cssText = 'margin:0;font-size:0.9rem;color:#95a9c0;text-align:center;';
    
    const roundDiv = document.createElement('div');
    roundDiv.textContent = `Round 1/${maxRounds}`;
    roundDiv.style.cssText = 'font-size:1rem;color:#83bfff;';
    
    // Target color display
    const targetDiv = document.createElement('div');
    targetDiv.style.cssText = 'width:150px;height:150px;border:3px solid #3d4f64;border-radius:8px;margin:10px 0;';
    
    const targetLabel = document.createElement('div');
    targetLabel.textContent = 'Target Color';
    targetLabel.style.cssText = 'font-size:0.85rem;color:#95a9c0;text-align:center;margin-top:-5px;';
    
    // Player's color display
    const playerDiv = document.createElement('div');
    playerDiv.style.cssText = 'width:150px;height:150px;border:3px solid #3d4f64;border-radius:8px;margin:10px 0;';
    
    const playerLabel = document.createElement('div');
    playerLabel.textContent = 'Your Color';
    playerLabel.style.cssText = 'font-size:0.85rem;color:#95a9c0;text-align:center;margin-top:-5px;';
    
    // Similarity feedback
    const feedbackDiv = document.createElement('div');
    feedbackDiv.style.cssText = 'font-size:1.2rem;color:#4ade80;font-weight:bold;min-height:30px;text-align:center;margin:10px 0;';
    
    // Color controls
    const controlsDiv = document.createElement('div');
    controlsDiv.style.cssText = 'display:flex;flex-direction:column;gap:12px;margin:15px 0;width:100%;max-width:300px;';
    
    const submitBtn = document.createElement('button');
    submitBtn.className = 'btn primary';
    submitBtn.textContent = 'Submit Match';
    
    wrapper.appendChild(title);
    wrapper.appendChild(instructions);
    wrapper.appendChild(roundDiv);
    wrapper.appendChild(targetDiv);
    wrapper.appendChild(targetLabel);
    wrapper.appendChild(playerDiv);
    wrapper.appendChild(playerLabel);
    wrapper.appendChild(feedbackDiv);
    wrapper.appendChild(controlsDiv);
    wrapper.appendChild(submitBtn);
    container.appendChild(wrapper);
    
    // Create controls
    const controls = {};
    ['r', 'g', 'b'].forEach(channel => {
      const channelDiv = document.createElement('div');
      channelDiv.style.cssText = 'display:flex;flex-direction:column;gap:5px;';
      
      const label = document.createElement('div');
      label.textContent = channel.toUpperCase() + ': ' + playerColor[channel];
      label.style.cssText = 'font-size:0.9rem;color:#e3ecf5;';
      
      if(sliderMode){
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '0';
        slider.max = '255';
        slider.value = playerColor[channel];
        slider.style.cssText = 'width:100%;';
        
        slider.addEventListener('input', () => {
          playerColor[channel] = parseInt(slider.value);
          label.textContent = channel.toUpperCase() + ': ' + playerColor[channel];
          updatePlayerColor();
        });
        
        channelDiv.appendChild(label);
        channelDiv.appendChild(slider);
        controls[channel] = {slider, label};
      } else {
        const btnDiv = document.createElement('div');
        btnDiv.style.cssText = 'display:flex;gap:8px;';
        
        const btnDown = document.createElement('button');
        btnDown.textContent = '−';
        btnDown.className = 'btn';
        btnDown.style.cssText = 'flex:1;';
        
        const btnUp = document.createElement('button');
        btnUp.textContent = '+';
        btnUp.className = 'btn';
        btnUp.style.cssText = 'flex:1;';
        
        btnDown.addEventListener('click', () => {
          playerColor[channel] = Math.max(0, playerColor[channel] - 15);
          label.textContent = channel.toUpperCase() + ': ' + playerColor[channel];
          updatePlayerColor();
        });
        
        btnUp.addEventListener('click', () => {
          playerColor[channel] = Math.min(255, playerColor[channel] + 15);
          label.textContent = channel.toUpperCase() + ': ' + playerColor[channel];
          updatePlayerColor();
        });
        
        btnDiv.appendChild(btnDown);
        btnDiv.appendChild(btnUp);
        channelDiv.appendChild(label);
        channelDiv.appendChild(btnDiv);
        controls[channel] = {btnUp, btnDown, label};
      }
      
      controlsDiv.appendChild(channelDiv);
    });
    
    function updatePlayerColor(){
      playerDiv.style.backgroundColor = `rgb(${playerColor.r},${playerColor.g},${playerColor.b})`;
    }
    
    function startRound(){
      // Clear feedback from previous round
      feedbackDiv.textContent = '';
      
      // Generate random target color
      targetColor = {
        r: Math.floor(Math.random() * 256),
        g: Math.floor(Math.random() * 256),
        b: Math.floor(Math.random() * 256)
      };
      
      targetDiv.style.backgroundColor = `rgb(${targetColor.r},${targetColor.g},${targetColor.b})`;
      
      // Reset player color to gray
      playerColor = {r:128, g:128, b:128};
      updatePlayerColor();
      
      // Update control displays
      ['r','g','b'].forEach(ch => {
        if(sliderMode){
          controls[ch].slider.value = playerColor[ch];
          controls[ch].label.textContent = ch.toUpperCase() + ': ' + playerColor[ch];
        } else {
          controls[ch].label.textContent = ch.toUpperCase() + ': ' + playerColor[ch];
        }
      });
      
      submitBtn.disabled = false;
    }
    
    function evaluateRound(){
      submitBtn.disabled = true;
      
      // Calculate color difference
      const diff = Math.sqrt(
        Math.pow(targetColor.r - playerColor.r, 2) +
        Math.pow(targetColor.g - playerColor.g, 2) +
        Math.pow(targetColor.b - playerColor.b, 2)
      );
      
      // Max possible difference is sqrt(255^2 * 3) ≈ 441
      // Convert to score (0-100)
      const accuracy = Math.max(0, 100 - (diff / 441) * 100);
      const roundScore = Math.round(accuracy);
      
      totalScore += roundScore;
      
      // Display similarity percentage
      feedbackDiv.textContent = `${roundScore}% Similarity`;
      feedbackDiv.style.color = roundScore >= EXCELLENT_THRESHOLD ? COLOR_EXCELLENT : 
                                 roundScore >= GOOD_THRESHOLD ? COLOR_GOOD : 
                                 COLOR_POOR;
      
      setTimeout(() => {
        if(currentRound < maxRounds){
          currentRound++;
          roundDiv.textContent = `Round ${currentRound}/${maxRounds}`;
          startRound();
        } else {
          finishGame();
        }
      }, 1200);
    }
    
    function finishGame(){
      const avgScore = Math.round(totalScore / maxRounds);
      
      // Use MinigameScoring to calculate final score (SCALE=1000)
      const finalScore = g.MinigameScoring ? 
        g.MinigameScoring.calculateFinalScore({
          rawScore: avgScore,
          minScore: 0,
          maxScore: 100,
          compBeast: 0.5
        }) :
        avgScore * 10; // Fallback: scale to 0-1000
      
      setTimeout(() => onComplete(Math.round(finalScore)), 500);
    }
    
    submitBtn.addEventListener('click', evaluateRound);
    
    // Start first round
    startRound();
  }

  // Export
  if(typeof g.MiniGames === 'undefined') g.MiniGames = {};
  g.MiniGames.colorMatch = { render };

})(window);
