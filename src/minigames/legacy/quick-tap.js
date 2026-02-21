// MODULE: minigames/quick-tap.js
// Quick Tap Race - Tap as many times as possible in 5 seconds
//
// SAFETY: All helper method calls are guarded with existence checks
// - MinigameAccessibility methods: applyAria, makeAccessibleButton, announceToSR
// - MinigameMobileUtils methods: addTapListener, vibrate
// - onComplete callback is validated before invocation
// Game works on desktop/mobile with or without helper modules

(function(g){
  'use strict';

  function render(container, onComplete, options = {}){
    container.innerHTML = '';
    
    const { 
      debugMode = false, 
      competitionMode = false
    } = options;
    
    // Use accessibility helper if available
    const useAccessibility = !!g.MinigameAccessibility;
    const useMobileUtils = !!g.MinigameMobileUtils;
    
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:16px;padding:20px;max-width:600px;margin:0 auto;';
    
    // Apply ARIA attributes for accessibility
    if(useAccessibility && typeof g.MinigameAccessibility.applyAria === 'function'){
      g.MinigameAccessibility.applyAria(wrapper, {
        'role': 'region',
        'aria-label': 'Quick Tap Race minigame',
        'aria-live': 'polite'
      });
    }
    
    const title = document.createElement('h3');
    title.textContent = 'Quick Tap Race';
    title.style.cssText = 'margin:0;font-size:1.2rem;color:#e3ecf5;';
    
    const instructions = document.createElement('p');
    instructions.textContent = 'Tap the button as many times as you can in 5 seconds!';
    instructions.style.cssText = 'margin:0;font-size:0.9rem;color:#95a9c0;text-align:center;line-height:1.5;';
    
    const counter = document.createElement('div');
    counter.textContent = '0';
    counter.style.cssText = 'font-size:3rem;font-weight:bold;color:#83bfff;min-height:80px;display:flex;align-items:center;';
    counter.setAttribute('aria-label', 'Tap count');
    counter.setAttribute('aria-live', 'polite');
    
    const tapBtn = document.createElement('button');
    tapBtn.textContent = 'START';
    tapBtn.className = 'btn primary';
    tapBtn.style.cssText = 'font-size:1.5rem;padding:24px 48px;min-width:200px;min-height:60px;touch-action:manipulation;user-select:none;-webkit-tap-highlight-color:transparent;';
    
    // Apply accessibility attributes
    if(useAccessibility && typeof g.MinigameAccessibility.makeAccessibleButton === 'function'){
      g.MinigameAccessibility.makeAccessibleButton(tapBtn, {
        label: 'Start tapping game'
      });
    }
    
    let taps = 0;
    let started = false;
    let startTime = 0;
    const DURATION = 5000;
    
    // Use mobile-friendly tap listener if available
    const addListener = (useMobileUtils && typeof g.MinigameMobileUtils.addTapListener === 'function') ? 
      g.MinigameMobileUtils.addTapListener : 
      (el, handler) => {
        el.addEventListener('click', handler);
        return () => el.removeEventListener('click', handler);
      };
    
    addListener(tapBtn, () => {
      if(!started){
        // Start game
        started = true;
        taps = 0;
        startTime = Date.now();
        tapBtn.textContent = 'TAP!';
        tapBtn.setAttribute('aria-label', 'Tap rapidly');
        counter.textContent = '0';
        
        // Announce start to screen readers
        if(useAccessibility && typeof g.MinigameAccessibility.announceToSR === 'function'){
          g.MinigameAccessibility.announceToSR('Game started! Tap rapidly!', 'assertive');
        }
        
        // Add haptic feedback on mobile if available
        if(useMobileUtils && typeof g.MinigameMobileUtils.vibrate === 'function'){
          g.MinigameMobileUtils.vibrate(50);
        }
        
        // Timer
        const timer = setInterval(() => {
          const elapsed = Date.now() - startTime;
          const remaining = Math.ceil((DURATION - elapsed) / 1000);
          
          // Update aria-label with remaining time
          if(useAccessibility && remaining > 0 && remaining <= 5){
            tapBtn.setAttribute('aria-label', `${remaining} seconds remaining`);
          }
          
          if(elapsed >= DURATION){
            clearInterval(timer);
            tapBtn.disabled = true;
            tapBtn.textContent = 'DONE!';
            tapBtn.style.opacity = '0.5';
            
            // Calculate raw score (base on taps, scale to ~20-100 range)
            const rawScore = Math.min(100, Math.max(10, taps * 3.5));
            
            // Use centralized scoring system (SCALE=1000)
            const finalScore = g.MinigameScoring ? 
              g.MinigameScoring.calculateFinalScore({
                rawScore: rawScore,
                minScore: 0,
                maxScore: 100,
                compBeast: 0.5
              }) :
              rawScore * 10; // Fallback: scale to 0-1000
            
            console.log(`[QuickTap] Taps: ${taps}, Raw score: ${rawScore}, Final score: ${Math.round(finalScore)}`);
            
            // Announce completion to screen readers
            if(useAccessibility && typeof g.MinigameAccessibility.announceToSR === 'function'){
              g.MinigameAccessibility.announceToSR(`Game complete! You tapped ${taps} times. Score: ${Math.round(finalScore)}`, 'assertive');
            }
            
            // Haptic feedback for completion
            if(useMobileUtils && typeof g.MinigameMobileUtils.vibrate === 'function'){
              g.MinigameMobileUtils.vibrate([100, 50, 100]);
            }
            
            setTimeout(() => {
              if(typeof onComplete === 'function'){
                onComplete(finalScore);
              }
            }, 1000);
          }
        }, 100);
      } else {
        // Count tap
        taps++;
        counter.textContent = String(taps);
        
        // Light haptic feedback on each tap (not too aggressive)
        if(useMobileUtils && taps % 5 === 0 && typeof g.MinigameMobileUtils.vibrate === 'function'){
          g.MinigameMobileUtils.vibrate(10);
        }
      }
    });
    
    wrapper.appendChild(title);
    wrapper.appendChild(instructions);
    wrapper.appendChild(counter);
    wrapper.appendChild(tapBtn);
    container.appendChild(wrapper);
  }

  // Export
  if(typeof g.MiniGames === 'undefined') g.MiniGames = {};
  g.MiniGames.quickTap = { render };

})(window);
