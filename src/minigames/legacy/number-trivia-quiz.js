// MODULE: minigames/number-trivia-quiz.js
// Number Trivia - Answer numeric trivia questions with higher/lower hints

(function(g){
  'use strict';

  // 100 numeric-answer trivia questions about Big Brother and general knowledge
  const QUESTIONS = [
    { q: 'How many houseguests typically compete in a season of Big Brother US?', a: 16 },
    { q: 'In what year did Big Brother US first premiere?', a: 2000 },
    { q: 'How many days does a typical Big Brother US season last?', a: 99 },
    { q: 'How many votes does it take to evict with a house of 10 remaining?', a: 5 },
    { q: 'What is the maximum number of houseguests who can be nominated at once?', a: 2 },
    { q: 'How many weeks typically occur in a full Big Brother season?', a: 13 },
    { q: 'How many people vote in the finale to crown the winner?', a: 9 },
    { q: 'What is the typical prize amount for winning Big Brother (in thousands)?', a: 500 },
    { q: 'How many houseguests make it to the final two?', a: 2 },
    { q: 'How many competition wins did Janelle Pierzina have in BB7?', a: 9 },
    
    { q: 'In what season did the Power of Veto first appear?', a: 3 },
    { q: 'How many seasons has Big Brother US aired (as of 2024)?', a: 26 },
    { q: 'How many cameras are typically in the Big Brother house?', a: 94 },
    { q: 'What is the age requirement to apply for Big Brother?', a: 21 },
    { q: 'How many jury members typically vote in the finale?', a: 9 },
    { q: 'In Season 10, how old was Dan Gheesling when he won?', a: 24 },
    { q: 'How many competitions did Cody Calafiore win in BB22?', a: 8 },
    { q: 'What week does the jury phase typically start?', a: 5 },
    { q: 'How many houseguests were in the first season of Big Brother?', a: 10 },
    { q: 'How many Battle Back competitions occurred in BB18?', a: 4 },
    
    { q: 'What is 7 x 8?', a: 56 },
    { q: 'What is 12 x 12?', a: 144 },
    { q: 'What is 15 x 4?', a: 60 },
    { q: 'What is 9 x 9?', a: 81 },
    { q: 'How many minutes are in 3 hours?', a: 180 },
    { q: 'What is 20% of 500?', a: 100 },
    { q: 'How many days are in a leap year?', a: 366 },
    { q: 'What is the square root of 64?', a: 8 },
    { q: 'How many sides does a hexagon have?', a: 6 },
    { q: 'What is 50 + 75?', a: 125 },
    
    { q: 'In what year did World War II end?', a: 1945 },
    { q: 'How many stripes are on the US flag?', a: 13 },
    { q: 'How many states are in the United States?', a: 50 },
    { q: 'In what year did the Titanic sink?', a: 1912 },
    { q: 'How many players are on a basketball team on the court?', a: 5 },
    { q: 'How many keys are on a standard piano?', a: 88 },
    { q: 'How many bones are in the adult human body?', a: 206 },
    { q: 'What is the boiling point of water in Fahrenheit?', a: 212 },
    { q: 'How many continents are there?', a: 7 },
    { q: 'How many degrees are in a right angle?', a: 90 },
    
    { q: 'How many comp wins did Janelle have across BB6, BB7, and BB14?', a: 13 },
    { q: 'What season introduced the Battle Back twist?', a: 18 },
    { q: 'How many weeks was Willie Hantz in the house before eviction?', a: 2 },
    { q: 'In BB16, how many competitions did Frankie Grande win?', a: 9 },
    { q: 'What season featured twins entering the house separately?', a: 17 },
    { q: 'How many houseguests competed in BB21?', a: 16 },
    { q: 'In what season did Paul Abrahamian first compete?', a: 18 },
    { q: 'How many seasons did Dan Gheesling compete in?', a: 2 },
    { q: 'What is the record for most HOH wins in one season?', a: 5 },
    { q: 'How many votes did Tyler receive to win BB20?', a: 5 },
    
    { q: 'How many players start a game of chess?', a: 2 },
    { q: 'How many cards are in a standard deck?', a: 52 },
    { q: 'How many innings in a standard baseball game?', a: 9 },
    { q: 'How many points is a touchdown worth in football?', a: 6 },
    { q: 'How many strings does a standard guitar have?', a: 6 },
    { q: 'How many squares are on a checkerboard?', a: 64 },
    { q: 'How many planets are in our solar system?', a: 8 },
    { q: 'How many Olympic rings are there?', a: 5 },
    { q: 'How many seconds are in 5 minutes?', a: 300 },
    { q: 'What is 25% of 80?', a: 20 },
    
    { q: 'How many houseguests entered BB23?', a: 16 },
    { q: 'What season introduced the Temptation competitions?', a: 19 },
    { q: 'How many weeks was Nicole Franzel on the block in BB18?', a: 5 },
    { q: 'In BB15, how many competitions did Amanda Zuckerman win?', a: 0 },
    { q: 'What season had the most double evictions?', a: 23 },
    { q: 'How many days was Kaysar Ridha in the house in BB6?', a: 39 },
    { q: 'In what season did the Coaches twist occur?', a: 14 },
    { q: 'How many competitions did Rachel Reilly win in BB13?', a: 10 },
    { q: 'What is the record for longest HOH competition (in hours)?', a: 14 },
    { q: 'How many houseguests made it to jury in BB24?', a: 9 },
    
    { q: 'How many letters are in the English alphabet?', a: 26 },
    { q: 'How many hours are in a week?', a: 168 },
    { q: 'What is 10 squared?', a: 100 },
    { q: 'How many cents are in a dollar?', a: 100 },
    { q: 'How many yards are in a football field?', a: 100 },
    { q: 'How many black keys are on a piano?', a: 36 },
    { q: 'How many teeth does an adult human have?', a: 32 },
    { q: 'How many ounces are in a pound?', a: 16 },
    { q: 'How many millimeters are in a centimeter?', a: 10 },
    { q: 'What is the freezing point of water in Celsius?', a: 0 },
    
    { q: 'How many eviction votes did Cody receive in BB19?', a: 5 },
    { q: 'In BB20, how many days was Kaitlyn Herman in the house?', a: 23 },
    { q: 'What season featured the first African American winner?', a: 10 },
    { q: 'How many houseguests from BB7 were previously on the show?', a: 14 },
    { q: 'In BB12, how many competitions did Britney Haynes win?', a: 4 },
    { q: 'What season introduced the Have/Have-Not twist?', a: 9 },
    { q: 'How many unanimous votes has there been in BB history (through S25)?', a: 38 },
    { q: 'In BB22, how many former winners competed?', a: 5 },
    { q: 'How many seasons of Big Brother aired in 2020?', a: 1 },
    { q: 'What is the most common age range for BB houseguests (lower bound)?', a: 21 },
    
    { q: 'How many faces does a cube have?', a: 6 },
    { q: 'How many months have 31 days?', a: 7 },
    { q: 'How many zeros are in one million?', a: 6 },
    { q: 'What is 3 cubed (3³)?', a: 27 },
    { q: 'How many degrees are in a circle?', a: 360 },
    { q: 'How many quarts are in a gallon?', a: 4 },
    { q: 'How many hours ahead is GMT from EST?', a: 5 },
    { q: 'How many innings are in a cricket test match (per team)?', a: 2 },
    { q: 'How many permanent members are on the UN Security Council?', a: 5 },
    { q: 'What is the atomic number of carbon?', a: 6 }
  ];

  /**
   * Number Trivia Quiz minigame
   * Answer numeric trivia questions with higher/lower hints
   * Relies on global competition timer only (no internal countdown)
   * 
   * @param {HTMLElement} container - Container element for the game UI
   * @param {Function} onComplete - Callback function(score) when game ends
   * @param {Object} options - Configuration options
   */
  function render(container, onComplete, options = {}){
    container.innerHTML = '';
    
    const { debugMode = false } = options;
    
    // Game state
    const questionPool = [...QUESTIONS].sort(() => Math.random() - 0.5); // Shuffle
    let currentQuestionIndex = 0;
    let correctAnswers = 0;
    let skippedQuestions = 0;
    let totalAttempts = 0;
    const startTime = Date.now();
    let gameOver = false;
    let currentQuestion = questionPool[0];

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:20px;padding:20px;max-width:600px;margin:0 auto;';
    
    const title = document.createElement('h3');
    title.textContent = 'Number Trivia';
    title.style.cssText = 'margin:0;font-size:1.5rem;color:#e3ecf5;';
    
    const instructions = document.createElement('p');
    instructions.textContent = 'Answer numeric trivia questions! Use hints or skip if stuck.';
    instructions.style.cssText = 'margin:0;font-size:0.9rem;color:#95a9c0;text-align:center;';
    
    const statsDiv = document.createElement('div');
    statsDiv.style.cssText = 'display:flex;gap:20px;font-size:0.95rem;flex-wrap:wrap;justify-content:center;';
    
    const correctDiv = document.createElement('div');
    correctDiv.textContent = 'Correct: 0';
    correctDiv.style.cssText = 'color:#5bd68a;font-weight:600;';
    
    const skippedDiv = document.createElement('div');
    skippedDiv.textContent = 'Skipped: 0';
    skippedDiv.style.cssText = 'color:#f7b955;font-weight:600;';
    
    const attemptsDiv = document.createElement('div');
    attemptsDiv.textContent = 'Attempts: 0';
    attemptsDiv.style.cssText = 'color:#83bfff;font-weight:600;';
    
    statsDiv.appendChild(correctDiv);
    statsDiv.appendChild(skippedDiv);
    statsDiv.appendChild(attemptsDiv);
    
    const questionDiv = document.createElement('div');
    questionDiv.style.cssText = 'min-height:80px;font-size:1.1rem;color:#e3ecf5;text-align:center;padding:15px;background:#1a2a3a;border-radius:10px;border:2px solid #5bd68a;max-width:100%;';
    questionDiv.textContent = currentQuestion.q;
    
    const hintDiv = document.createElement('div');
    hintDiv.textContent = 'Enter your answer below';
    hintDiv.style.cssText = 'min-height:30px;font-size:1rem;color:#95a9c0;text-align:center;font-weight:500;';
    hintDiv.setAttribute('aria-live', 'polite');
    
    const inputDiv = document.createElement('div');
    inputDiv.style.cssText = 'display:flex;gap:10px;align-items:center;';
    
    const input = document.createElement('input');
    input.type = 'number';
    input.placeholder = 'Enter number';
    input.style.cssText = `
      min-height:48px;
      min-width:150px;
      padding:12px;
      font-size:1.2rem;
      font-weight:bold;
      text-align:center;
      background:#1a1a1a;
      color:#e3ecf5;
      border:2px solid #5bd68a;
      border-radius:10px;
      outline:none;
    `;
    input.setAttribute('aria-label', 'Answer input');
    
    const submitBtn = document.createElement('button');
    submitBtn.textContent = 'Submit';
    submitBtn.style.cssText = `
      min-height:48px;
      min-width:100px;
      padding:12px 20px;
      font-size:1rem;
      font-weight:bold;
      background:linear-gradient(135deg, #5bd68a 0%, #4db878 100%);
      color:#1a1a1a;
      border:2px solid #4db878;
      border-radius:10px;
      cursor:pointer;
      transition:all 0.2s;
    `;
    
    const skipBtn = document.createElement('button');
    skipBtn.textContent = 'Skip';
    skipBtn.style.cssText = `
      min-height:48px;
      min-width:100px;
      padding:12px 20px;
      font-size:1rem;
      font-weight:bold;
      background:#666;
      color:#fff;
      border:2px solid #555;
      border-radius:10px;
      cursor:pointer;
      transition:all 0.2s;
    `;
    
    inputDiv.appendChild(input);
    inputDiv.appendChild(submitBtn);
    inputDiv.appendChild(skipBtn);
    
    wrapper.appendChild(title);
    wrapper.appendChild(instructions);
    wrapper.appendChild(statsDiv);
    wrapper.appendChild(questionDiv);
    wrapper.appendChild(hintDiv);
    wrapper.appendChild(inputDiv);
    container.appendChild(wrapper);
    
    input.focus();

    function getGradedHint(guess, answer){
      const diff = Math.abs(guess - answer);
      const percentOff = (diff / Math.max(Math.abs(answer), 1)) * 100;
      
      if(guess === answer){
        return 'Correct!';
      } else if(diff === 1){
        return guess < answer ? '↑ Almost! Go higher by 1' : '↓ Almost! Go lower by 1';
      } else if(diff <= 5){
        return guess < answer ? '↑ Close! Go higher' : '↓ Close! Go lower';
      } else if(percentOff <= 10){
        return guess < answer ? '↑ Higher!' : '↓ Lower!';
      } else if(percentOff <= 25){
        return guess < answer ? '↑↑ Much Higher!' : '↓↓ Much Lower!';
      } else if(percentOff <= 50){
        return guess < answer ? '↑↑↑ Way Higher!' : '↓↓↓ Way Lower!';
      } else {
        return guess < answer ? '⬆ Significantly Higher!' : '⬇ Significantly Lower!';
      }
    }

    function submitAnswer(){
      if(gameOver) return;
      
      const guess = parseInt(input.value);
      if(isNaN(guess)){
        hintDiv.textContent = '⚠ Please enter a valid number';
        hintDiv.style.color = '#ff6b9d';
        return;
      }
      
      totalAttempts++;
      attemptsDiv.textContent = `Attempts: ${totalAttempts}`;
      
      const answer = currentQuestion.a;
      const hint = getGradedHint(guess, answer);
      
      if(guess === answer){
        // Correct!
        correctAnswers++;
        correctDiv.textContent = `Correct: ${correctAnswers}`;
        hintDiv.textContent = '✓ Correct!';
        hintDiv.style.color = '#5bd68a';
        
        // Flash input green
        input.style.borderColor = '#5bd68a';
        input.style.background = '#2a4a5a';
        
        setTimeout(() => {
          nextQuestion();
        }, 1500);
      } else {
        // Wrong - show hint
        hintDiv.textContent = hint;
        hintDiv.style.color = '#ff6b9d';
        
        // Flash input red
        const originalBorder = input.style.borderColor;
        input.style.borderColor = '#ff6b9d';
        setTimeout(() => {
          input.style.borderColor = originalBorder;
        }, 300);
        
        input.value = '';
        input.focus();
      }
    }

    function skipQuestion(){
      if(gameOver) return;
      
      skippedQuestions++;
      skippedDiv.textContent = `Skipped: ${skippedQuestions}`;
      
      hintDiv.textContent = `Answer was: ${currentQuestion.a}`;
      hintDiv.style.color = '#f7b955';
      
      setTimeout(() => {
        nextQuestion();
      }, 2000);
    }

    function nextQuestion(){
      if(gameOver) return;
      
      currentQuestionIndex++;
      
      if(currentQuestionIndex >= questionPool.length){
        // No more questions
        endGame();
        return;
      }
      
      currentQuestion = questionPool[currentQuestionIndex];
      
      questionDiv.textContent = currentQuestion.q;
      hintDiv.textContent = 'Enter your answer below';
      hintDiv.style.color = '#95a9c0';
      input.value = '';
      input.style.borderColor = '#5bd68a';
      input.style.background = '#1a1a1a';
      input.focus();
    }

    function endGame(reason = 'complete'){
      if(gameOver) return;
      gameOver = true;
      
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      
      // Calculate score
      let score = 0;
      
      // Base score from correct answers (5 points each)
      score += correctAnswers * 5;
      
      // Penalty for skipped questions (2 points each)
      score -= skippedQuestions * 2;
      
      // Small penalty for total attempts beyond correct answers (0.5 per extra)
      const extraAttempts = Math.max(0, totalAttempts - correctAnswers);
      score -= extraAttempts * 0.5;
      
      // Time bonus (faster is better for first 60s)
      if(elapsed < 60){
        score += (60 - elapsed) * 0.3;
      }
      
      score = Math.max(0, Math.min(100, Math.round(score)));
      
      // If ended by skip, invoke callback immediately without showing result UI
      if(reason === 'skip'){
        console.info('[NumberTriviaQuiz] Game ended by skip - score:', score);
        if(typeof onComplete === 'function'){
          onComplete(score);
        }
        return;
      }
      
      // Show result
      const resultDiv = document.createElement('div');
      resultDiv.style.cssText = `
        position:fixed;
        top:50%;
        left:50%;
        transform:translate(-50%, -50%);
        background:#1a2a3a;
        padding:30px;
        border-radius:15px;
        border:3px solid #5bd68a;
        text-align:center;
        z-index:1000;
        min-width:300px;
      `;
      
      const resultText = document.createElement('div');
      resultText.textContent = '🎉 Quiz Complete!';
      resultText.style.cssText = 'font-size:1.8rem;color:#5bd68a;margin-bottom:15px;font-weight:bold;';
      
      const statsText = document.createElement('div');
      statsText.innerHTML = `
        <div style="color:#5bd68a;font-size:1.1rem;margin-bottom:6px;">Correct: ${correctAnswers}</div>
        <div style="color:#f7b955;font-size:1.1rem;margin-bottom:6px;">Skipped: ${skippedQuestions}</div>
        <div style="color:#83bfff;font-size:1.1rem;margin-bottom:12px;">Total Attempts: ${totalAttempts}</div>
      `;
      
      const scoreText = document.createElement('div');
      scoreText.textContent = `Score: ${score}`;
      scoreText.style.cssText = 'font-size:1.3rem;color:#f7b955;font-weight:600;';
      
      resultDiv.appendChild(resultText);
      resultDiv.appendChild(statsText);
      resultDiv.appendChild(scoreText);
      container.appendChild(resultDiv);
      
      // Disable controls
      input.disabled = true;
      submitBtn.disabled = true;
      skipBtn.disabled = true;
      
      setTimeout(() => {
        if(typeof onComplete === 'function'){
          onComplete(score);
        }
      }, 3500);
    }
    
    // Skip finish logic - called by drainer
    function trySkipFinish(){
      if(gameOver) return false;
      endGame('skip');
      return true;
    }
    
    // Store reference for drainer access
    g.__numberTriviaQuizActive = { trySkipFinish };

    // Event listeners
    submitBtn.addEventListener('click', submitAnswer);
    skipBtn.addEventListener('click', skipQuestion);
    
    input.addEventListener('keydown', (e) => {
      if(e.key === 'Enter'){
        submitAnswer();
      }
    });
  }

  // Drainer for SkipController integration
  function numberTriviaQuizDrainer(){
    if(g.__numberTriviaQuizActive && g.__numberTriviaQuizActive.trySkipFinish){
      const didWork = g.__numberTriviaQuizActive.trySkipFinish();
      if(didWork){
        delete g.__numberTriviaQuizActive;
      }
      return didWork;
    }
    return false;
  }

  // Register module (both MinigameModules and legacy MiniGames)
  if(typeof g.MinigameModules !== 'undefined' && typeof g.MinigameModules.register === 'function'){
    g.MinigameModules.register('threeDigitsQuiz', { render });
  } else {
    // Fallback to direct registration
    g.MinigameModules = g.MinigameModules || {};
    g.MinigameModules.threeDigitsQuiz = { render };
    g.MiniGames = g.MiniGames || {};
    g.MiniGames.threeDigitsQuiz = { render };
  }
  
  // Register drainer with SkipController
  if(g.SkipController){
    g.SkipController.registerDrainer('numberTriviaQuiz', numberTriviaQuizDrainer);
  }

  console.info('[NumberTriviaQuiz] Module loaded (registered as threeDigitsQuiz)');

})(window);
