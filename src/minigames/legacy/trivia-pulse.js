// MODULE: minigames/trivia-pulse.js
// Trivia Pulse - Time-pressured Big Brother trivia with score multipliers

(function(g){
  'use strict';

  const STORAGE_KEY = 'bb_sp_competitions_v1';

  function saveScore(gameName, score){
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      if(!data[gameName] || score > data[gameName]){
        data[gameName] = score;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      }
    } catch(e){
      // Ignore localStorage errors
    }
  }

  function loadBestScore(gameName){
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return data[gameName] || 0;
    } catch(e){
      return 0;
    }
  }

  const QUESTIONS = [
    // Core Game Mechanics (Easy)
    { q: 'What year was Big Brother first aired in the US?', a: ['2000', '1999', '2001', '2002'], correct: 0, difficulty: 'easy' },
    { q: 'How many houseguests typically start each season?', a: ['12', '14', '16', '18'], correct: 2, difficulty: 'easy' },
    { q: 'What does HOH stand for?', a: ['Head of House', 'Head of Household', 'House of Honor', 'Hero of House'], correct: 1, difficulty: 'easy' },
    { q: 'How many nominees are typically put up each week?', a: ['1', '2', '3', '4'], correct: 1, difficulty: 'easy' },
    { q: 'What competition can save a nominee?', a: ['HOH', 'Veto', 'Jury', 'Vote'], correct: 1, difficulty: 'easy' },
    { q: 'Where do evicted players go after jury starts?', a: ['Home', 'Jury House', 'Sequester', 'Hotel'], correct: 1, difficulty: 'medium' },
    { q: 'Who votes in the finale?', a: ['America', 'Host', 'Jury', 'Nominees'], correct: 2, difficulty: 'easy' },
    { q: 'What is a "backdoor" in Big Brother?', a: ['Exit door', 'Secret room', 'Veto strategy', 'Alliance name'], correct: 2, difficulty: 'medium' },
    { q: 'How many jury members typically vote?', a: ['7', '9', '5', '11'], correct: 1, difficulty: 'medium' },
    { q: 'What is a "floater" in Big Brother?', a: ['Pool toy', 'Strategic player', 'Loyalty player', 'Non-aligned player'], correct: 3, difficulty: 'medium' },
    { q: 'What happens during a double eviction?', a: ['Two nominees', 'Two evictions', 'Two HOHs', 'Two vetoes'], correct: 1, difficulty: 'medium' },
    { q: 'Who typically cannot compete in HOH?', a: ['Previous HOH', 'Nominees', 'Veto winner', 'Jury'], correct: 0, difficulty: 'easy' },
    
    // Additional Core Rules (Easy)
    { q: 'What does POV stand for?', a: ['Point of View', 'Power of Veto', 'Player of Victory', 'Power of Vote'], correct: 1, difficulty: 'easy' },
    { q: 'How many people compete in POV?', a: ['4', '6', '8', '10'], correct: 1, difficulty: 'easy' },
    { q: 'Who breaks tie votes?', a: ['America', 'Host', 'HOH', 'Oldest player'], correct: 2, difficulty: 'easy' },
    { q: 'What is the Diary Room for?', a: ['Storage', 'Confessionals', 'Sleeping', 'Competitions'], correct: 1, difficulty: 'easy' },
    { q: 'What day is eviction typically?', a: ['Monday', 'Wednesday', 'Thursday', 'Saturday'], correct: 2, difficulty: 'easy' },
    { q: 'What happens on eviction night?', a: ['Nominations', 'Someone leaves', 'POV ceremony', 'Alliance forms'], correct: 1, difficulty: 'easy' },
    { q: 'What is "the Block"?', a: ['Punishment', 'Nomination seats', 'Voting area', 'Time limit'], correct: 1, difficulty: 'easy' },
    { q: 'Who can use the veto?', a: ['Anyone', 'POV winner', 'HOH only', 'Nominees'], correct: 1, difficulty: 'easy' },
    
    // Strategy Terms (Medium)
    { q: 'What is a "showmance"?', a: ['TV show', 'House romance', 'Performance', 'Drama'], correct: 1, difficulty: 'easy' },
    { q: 'What is "jury management"?', a: ['Managing jurors', 'Building jury votes', 'Controlling jury', 'Avoiding jury'], correct: 1, difficulty: 'medium' },
    { q: 'What does "throwing a comp" mean?', a: ['Give up', 'Lose intentionally', 'Throw objects', 'Get angry'], correct: 1, difficulty: 'medium' },
    { q: 'What is a "pawn"?', a: ['Chess piece', 'Safe nominee', 'Weak player', 'Sacrifice'], correct: 1, difficulty: 'medium' },
    { q: 'What is a "blindside"?', a: ['Surprise eviction', 'Closed eyes', 'Darkness', 'Betrayal'], correct: 0, difficulty: 'medium' },
    { q: 'What is "blood on hands"?', a: ['Injury', 'Eviction guilt', 'Actual blood', 'Violence'], correct: 1, difficulty: 'medium' },
    { q: 'What is a "comp beast"?', a: ['Animal', 'Strong player', 'Competition winner', 'Frequent winner'], correct: 3, difficulty: 'medium' },
    { q: 'What is "flipping the house"?', a: ['Renovating', 'Changing votes', 'Evicting HOH', 'Winning all'], correct: 1, difficulty: 'medium' },
    { q: 'What does "laying low" mean?', a: ['Sleeping', 'Avoiding attention', 'Losing comps', 'Quitting'], correct: 1, difficulty: 'easy' },
    { q: 'What is a "power alliance"?', a: ['Electric group', 'Dominant alliance', 'HOH team', 'Winners'], correct: 1, difficulty: 'medium' },
    
    // Advanced Strategy (Hard)
    { q: 'What is a "bitter jury"?', a: ['Angry jurors', 'Bad losers', 'Personal voting', 'All of these'], correct: 3, difficulty: 'hard' },
    { q: 'What is a "goat"?', a: ['Animal', 'Weak finalist', 'Winner', 'Villain'], correct: 1, difficulty: 'hard' },
    { q: 'What does "cutting someone" mean?', a: ['Injury', 'Evicting ally', 'Nomination', 'Betrayal'], correct: 1, difficulty: 'medium' },
    { q: 'What is "sitting pretty"?', a: ['Posing', 'Safe position', 'Winning', 'Relaxing'], correct: 1, difficulty: 'medium' },
    { q: 'What is a "vote flip"?', a: ['Coin toss', 'Changing vote', 'Gymnastics', 'Betrayal'], correct: 1, difficulty: 'medium' },
    { q: 'What does "throwing under bus" mean?', a: ['Violence', 'Blaming others', 'Accident', 'Strategy'], correct: 1, difficulty: 'easy' },
    { q: 'What is a "mastermind"?', a: ['Smart player', 'Strategic leader', 'Comp winner', 'Manipulator'], correct: 1, difficulty: 'medium' },
    
    // Game Phases (Medium)
    { q: 'What is the "Final 2"?', a: ['Last two players', 'Final comp', 'Last vote', 'Finale episode'], correct: 0, difficulty: 'easy' },
    { q: 'What is the "Final HOH"?', a: ['Last comp', '3-part comp', 'Chooses F2', 'All of these'], correct: 3, difficulty: 'medium' },
    { q: 'What is "pre-jury"?', a: ['Before game', 'Before jury phase', 'Early eviction', 'First week'], correct: 1, difficulty: 'medium' },
    { q: 'What is "jury phase"?', a: ['Trial', 'When jury forms', 'Final weeks', 'Voting period'], correct: 1, difficulty: 'medium' },
    { q: 'What is "making jury"?', a: ['Creating jury', 'Lasting to jury', 'Joining jury', 'Winning game'], correct: 2, difficulty: 'medium' },
    { q: 'What is the "Jury Roundtable"?', a: ['Table shape', 'Jury discussion', 'Voting area', 'Final comp'], correct: 1, difficulty: 'medium' },
    
    // Competitions (Medium)
    { q: 'What is a "Battle Back"?', a: ['Fight', 'Return comp', 'Revenge', 'Backstab'], correct: 1, difficulty: 'medium' },
    { q: 'What type is an endurance comp?', a: ['Quick', 'Long-lasting', 'Mental', 'Physical'], correct: 1, difficulty: 'easy' },
    { q: 'What is a mental comp?', a: ['Days comp', 'Memory test', 'Quiz', 'All of these'], correct: 3, difficulty: 'medium' },
    { q: 'What happens at POV ceremony?', a: ['Nominations', 'Veto decision', 'Eviction', 'Vote'], correct: 1, difficulty: 'easy' },
    { q: 'What is a "knockout" comp?', a: ['Boxing', 'Elimination style', 'Physical', 'Mental'], correct: 1, difficulty: 'medium' },
    
    // Social Game (Easy/Medium)
    { q: 'What is an "alliance"?', a: ['Marriage', 'Group together', 'Comp team', 'Vote bloc'], correct: 1, difficulty: 'easy' },
    { q: 'What is "social game"?', a: ['Parties', 'Relationships', 'Competitions', 'Strategy'], correct: 1, difficulty: 'easy' },
    { q: 'What is "campaigning"?', a: ['Running', 'Asking votes', 'Competing', 'Arguing'], correct: 1, difficulty: 'easy' },
    { q: 'What is a "target"?', a: ['Goal', 'Eviction target', 'Prize', 'Bullseye'], correct: 1, difficulty: 'easy' },
    { q: 'What is "making deals"?', a: ['Shopping', 'Negotiating', 'Trading', 'Card games'], correct: 1, difficulty: 'easy' },
    
    // Voting & Nominations (Easy/Medium)
    { q: 'What is a unanimous vote?', a: ['Close vote', 'All agree', 'Tie vote', 'No vote'], correct: 1, difficulty: 'easy' },
    { q: 'When is the veto ceremony?', a: ['Before noms', 'After POV comp', 'Eviction night', 'Finale'], correct: 1, difficulty: 'easy' },
    { q: 'What happens if POV is used?', a: ['Nothing', 'Replacement nom', 'Week ends', 'No eviction'], correct: 1, difficulty: 'easy' },
    { q: 'What are jury votes for?', a: ['Evictions', 'Winner decision', 'Nominations', 'America'], correct: 1, difficulty: 'easy' },
    
    // Special Events (Medium/Hard)
    { q: 'What is a "twist"?', a: ['Dance move', 'Rule change', 'Turn', 'Strategy'], correct: 1, difficulty: 'easy' },
    { q: 'What is "America\'s Vote"?', a: ['Election', 'Viewer influence', 'HOH comp', 'Jury vote'], correct: 1, difficulty: 'medium' },
    { q: 'What are "Have-Nots"?', a: ['Losers', 'Food restriction', 'Nominees', 'Jury'], correct: 1, difficulty: 'medium' },
    { q: 'What is the prize money?', a: ['$100K', '$250K', '$500K', '$1M'], correct: 2, difficulty: 'medium' },
  ];

  function render(container, onComplete, options = {}){
    container.innerHTML = '';
    
    const { 
      debugMode = false, 
      competitionMode = false,
      variant = 'pulse' // 'pulse' (timed with bonuses) or 'standard' (no timer)
    } = options;
    
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;flex-direction:column;gap:12px;padding:20px;max-width:500px;margin:0 auto;';
    
    const title = document.createElement('h3');
    title.textContent = variant === 'pulse' ? 'Trivia Pulse' : 'Big Brother Trivia';
    title.style.cssText = 'margin:0;font-size:1.2rem;color:#e3ecf5;text-align:center;';
    
    const bestScore = loadBestScore(variant === 'pulse' ? 'triviaPulse' : 'triviaQuiz');
    const bestDisplay = document.createElement('div');
    bestDisplay.textContent = `Best: ${Math.round(bestScore)}`;
    bestDisplay.style.cssText = 'font-size:0.75rem;color:#95a9c0;text-align:center;';
    
    const progressBar = document.createElement('div');
    progressBar.style.cssText = variant === 'pulse' ? 'width:100%;height:8px;background:#1d2734;border-radius:4px;overflow:hidden;' : 'display:none;';
    const progressFill = document.createElement('div');
    progressFill.style.cssText = 'height:100%;background:#83bfff;width:100%;transition:width 0.1s linear;';
    progressBar.appendChild(progressFill);
    
    const questionCounter = document.createElement('div');
    questionCounter.style.cssText = 'font-size:0.85rem;color:#95a9c0;text-align:center;';
    
    const questionText = document.createElement('div');
    questionText.style.cssText = 'font-size:1.05rem;color:#e3ecf5;min-height:70px;text-align:center;padding:16px;background:#1d2734;border-radius:8px;';
    
    const answersContainer = document.createElement('div');
    answersContainer.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
    
    const scoreDisplay = document.createElement('div');
    scoreDisplay.style.cssText = 'font-size:0.9rem;color:#83bfff;text-align:center;min-height:25px;';
    
    let currentQuestion = 0;
    let totalScore = 0;
    let correctCount = 0;
    const totalQuestions = variant === 'pulse' ? 6 : 5; // pulse: 6 questions, standard: 5
    const selectedQuestions = [];
    let questionStartTime = 0;
    const timeLimit = variant === 'pulse' ? 15000 : 0; // 15 seconds for pulse, no limit for standard
    let timerInterval = null;
    let gameActive = false;
    let isPaused = false;
    let pauseStartTime = 0;
    
    // Pause on visibility change
    function handleVisibilityChange(){
      if(document.hidden && gameActive){
        isPaused = true;
        pauseStartTime = Date.now();
        clearInterval(timerInterval);
        scoreDisplay.textContent = 'Game paused...';
      } else if(isPaused && gameActive){
        isPaused = false;
        const pauseDuration = Date.now() - pauseStartTime;
        questionStartTime += pauseDuration; // Extend time by pause duration
        startTimer();
        scoreDisplay.textContent = '';
      }
    }
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Select random questions
    const shuffled = [...QUESTIONS].sort(() => Math.random() - 0.5);
    for(let i = 0; i < Math.min(totalQuestions, shuffled.length); i++){
      selectedQuestions.push(shuffled[i]);
    }
    
    function startTimer(){
      if(variant === 'standard'){
        // No timer for standard variant
        return;
      }
      
      if(timerInterval) clearInterval(timerInterval);
      
      timerInterval = setInterval(() => {
        if(isPaused) return;
        
        const elapsed = Date.now() - questionStartTime;
        const remaining = Math.max(0, timeLimit - elapsed);
        const percent = (remaining / timeLimit) * 100;
        
        progressFill.style.width = percent + '%';
        
        if(percent < 30){
          progressFill.style.background = '#ff6d6d';
        } else if(percent < 60){
          progressFill.style.background = '#f7b955';
        } else {
          progressFill.style.background = '#83bfff';
        }
        
        if(remaining <= 0){
          clearInterval(timerInterval);
          handleTimeout();
        }
      }, 50);
    }
    
    function handleTimeout(){
      answersContainer.querySelectorAll('button').forEach(b => b.disabled = true);
      scoreDisplay.textContent = 'Time\'s up! 0 points';
      
      setTimeout(() => {
        currentQuestion++;
        showQuestion();
      }, 1500);
    }
    
    function showQuestion(){
      if(currentQuestion >= selectedQuestions.length){
        finishGame();
        return;
      }
      
      gameActive = true;
      const question = selectedQuestions[currentQuestion];
      questionCounter.textContent = `Question ${currentQuestion + 1} of ${selectedQuestions.length}`;
      questionText.textContent = question.q;
      answersContainer.innerHTML = '';
      scoreDisplay.textContent = `Score: ${Math.round(totalScore)}`;
      
      questionStartTime = Date.now();
      progressFill.style.width = '100%';
      startTimer();
      
      question.a.forEach((answer, index) => {
        const btn = document.createElement('button');
        btn.className = 'btn';
        btn.textContent = answer;
        btn.style.cssText = 'padding:12px 20px;text-align:left;font-size:0.95rem;transition:all 0.2s;';
        
        btn.addEventListener('click', () => {
          clearInterval(timerInterval);
          answersContainer.querySelectorAll('button').forEach(b => b.disabled = true);
          
          const elapsed = Date.now() - questionStartTime;
          const timeBonus = variant === 'pulse' ? Math.max(0, (timeLimit - elapsed) / timeLimit) : 0;
          
          if(index === question.correct){
            // Correct!
            btn.style.background = '#77d58d';
            btn.style.color = '#fff';
            correctCount++;
            
            if(variant === 'pulse'){
              // Base points: 10, Time bonus: up to 6.67 points per correct
              const points = 10 + (timeBonus * 6.67);
              totalScore += points;
              scoreDisplay.textContent = `+${points.toFixed(1)} points! (${(timeBonus * 100).toFixed(0)}% time bonus)`;
            } else {
              // Standard: no time bonus, simpler scoring
              totalScore += 20; // 20 points per correct answer
              scoreDisplay.textContent = '✓ Correct!';
            }
          } else {
            // Wrong
            btn.style.background = '#ff6d6d';
            btn.style.color = '#fff';
            answersContainer.querySelectorAll('button')[question.correct].style.background = '#77d58d';
            answersContainer.querySelectorAll('button')[question.correct].style.color = '#fff';
            scoreDisplay.textContent = variant === 'pulse' ? '0 points - Incorrect' : '✗ Incorrect';
          }
          
          setTimeout(() => {
            currentQuestion++;
            showQuestion();
          }, variant === 'pulse' ? 1800 : 1500);
        }, { passive: false });
        
        answersContainer.appendChild(btn);
      });
    }
    
    function finishGame(){
      gameActive = false;
      clearInterval(timerInterval);
      
      questionText.textContent = '🎉 Quiz Complete! 🎉';
      answersContainer.innerHTML = '';
      questionCounter.textContent = '';
      progressBar.style.display = 'none';
      
      let finalScore;
      
      if(variant === 'pulse'){
        // Normalize to 0-100: Perfect score is 100 (6 questions x 16.67 points each)
        const maxPossibleScore = totalQuestions * 16.67;
        const rawScore = Math.min(100, (totalScore / maxPossibleScore) * 100);
        
        // Use MinigameScoring to calculate final score (SCALE=1000)
        finalScore = g.MinigameScoring ? 
          g.MinigameScoring.calculateFinalScore({
            rawScore: rawScore,
            minScore: 0,
            maxScore: 100,
            compBeast: 0.5
          }) :
          rawScore * 10; // Fallback: scale to 0-1000
      } else {
        // Standard variant: simpler scoring (20-100 range based on correct answers)
        const rawScore = Math.max(20, Math.min(100, (correctCount / selectedQuestions.length) * 80 + 20));
        
        finalScore = g.MinigameScoring ? 
          g.MinigameScoring.calculateFinalScore({
            rawScore: rawScore,
            minScore: 0,
            maxScore: 100,
            compBeast: 0.5
          }) :
          rawScore * 10; // Fallback: scale to 0-1000
      }
      
      scoreDisplay.innerHTML = `
        <div style="font-size:1.1rem;margin:10px 0;">Correct: ${correctCount}/${selectedQuestions.length}</div>
        <div style="font-size:1.3rem;color:#83bfff;">Final Score: ${Math.round(finalScore)}</div>
      `;
      
      // Save best score
      saveScore(variant === 'pulse' ? 'triviaPulse' : 'triviaQuiz', finalScore);
      
      // Cleanup
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      
      setTimeout(() => {
        onComplete(finalScore);
      }, 2500);
    }
    
    wrapper.appendChild(title);
    wrapper.appendChild(bestDisplay);
    wrapper.appendChild(progressBar);
    wrapper.appendChild(questionCounter);
    wrapper.appendChild(questionText);
    wrapper.appendChild(answersContainer);
    wrapper.appendChild(scoreDisplay);
    container.appendChild(wrapper);
    
    showQuestion();
  }

  // Export
  if(typeof g.MiniGames === 'undefined') g.MiniGames = {};
  g.MiniGames.triviaPulse = { render };
  
  // Also export as triviaQuiz for backward compatibility
  g.MiniGames.triviaQuiz = {
    render: (container, onComplete, options = {}) => {
      return render(container, onComplete, { ...options, variant: 'standard' });
    }
  };

})(window);
