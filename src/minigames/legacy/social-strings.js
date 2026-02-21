// MODULE: minigames/social-strings.js
// Social Strings - Match houseguest pairs based on their alliances

(function(g){
  'use strict';

  /**
   * Social Strings - Alliance matching game or houseguest trivia
   * Players identify which houseguests are in alliances together (Week 5+)
   * or answer trivia questions about the houseguests (earlier weeks)
   * 3 rounds with increasing difficulty
   * 
   * CLEAR PROMPTS:
   * - Round 1: Easy pairs (2 choices, strong alliances) or easy trivia
   * - Round 2: Medium difficulty (3 choices) or medium trivia
   * - Round 3: Hard difficulty (4 choices) or hard trivia
   */
  function render(container, onComplete, options = {}){
    container.innerHTML = '';
    
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;flex-direction:column;gap:16px;padding:20px;max-width:500px;margin:0 auto;';
    
    // Title
    const title = document.createElement('h3');
    title.textContent = 'Social Strings';
    title.style.cssText = 'margin:0;font-size:1.2rem;color:#e3ecf5;text-align:center;';
    
    // Get game data
    const game = g.game || {};
    const players = game.players || [];
    const alliances = game.alliances || [];
    const relationships = game.relationships || {};
    const currentWeek = game.week || 1;
    
    // Determine game mode based on week
    const isAllianceMode = currentWeek >= 5;
    
    // Instructions - dynamic based on mode
    const instructions = document.createElement('div');
    if(isAllianceMode){
      instructions.innerHTML = `
        <p style="margin:0 0 8px 0;font-size:0.95rem;color:#e3ecf5;text-align:center;">
          <strong>Match houseguests who are in the same alliance!</strong>
        </p>
        <p style="margin:0;font-size:0.85rem;color:#95a9c0;text-align:center;">
          An alliance is a secret group working together to advance in the game.
        </p>
      `;
    } else {
      instructions.innerHTML = `
        <p style="margin:0 0 8px 0;font-size:0.95rem;color:#e3ecf5;text-align:center;">
          <strong>Test your knowledge of the houseguests!</strong>
        </p>
        <p style="margin:0;font-size:0.85rem;color:#95a9c0;text-align:center;">
          Answer questions about the players in the house.
        </p>
      `;
    }
    
    // Progress indicator
    const progress = document.createElement('div');
    progress.style.cssText = 'font-size:0.85rem;color:#95a9c0;text-align:center;';
    
    // Question text
    const questionText = document.createElement('div');
    questionText.style.cssText = 'font-size:1rem;color:#e3ecf5;min-height:50px;text-align:center;padding:12px;background:#1d2734;border-radius:8px;';
    
    // Answer buttons container
    const answersContainer = document.createElement('div');
    answersContainer.style.cssText = 'display:flex;flex-direction:column;gap:10px;';
    
    // Game state
    let currentRound = 0;
    let correctAnswers = 0;
    const totalRounds = 3;
    let questions = [];
    
    /**
     * Generate questions based on game state
     */
    function generateQuestions(){
      questions = [];
      
      // Get alive players only
      const alivePlayers = players.filter(p => !p.evicted && p.name);
      
      if(alivePlayers.length < 4){
        // Not enough players - create fallback questions
        questions = generateFallbackQuestions();
        return;
      }
      
      // If week 5+, try alliance questions first
      if(isAllianceMode){
        // Round 1: Easy - 2 options (one correct alliance pair, one random)
        const round1 = generateAllianceQuestion(alivePlayers, alliances, 2, 'easy');
        if(round1) questions.push(round1);
        
        // Round 2: Medium - 3 options
        const round2 = generateAllianceQuestion(alivePlayers, alliances, 3, 'medium');
        if(round2) questions.push(round2);
        
        // Round 3: Hard - 4 options
        const round3 = generateAllianceQuestion(alivePlayers, alliances, 4, 'hard');
        if(round3) questions.push(round3);
      }
      
      // If we don't have enough alliance questions, use houseguest trivia
      while(questions.length < 3){
        const triviaQuestion = generateHouseguestTrivia(players, questions.length);
        if(triviaQuestion){
          questions.push(triviaQuestion);
        } else {
          // Last resort: generic Big Brother questions
          const fallbacks = generateFallbackQuestions();
          questions.push(fallbacks[questions.length % fallbacks.length]);
        }
      }
    }
    
    /**
     * Generate an alliance-based question
     */
    function generateAllianceQuestion(alivePlayers, alliances, numOptions, difficulty){
      // Find alliances with at least 2 alive members
      const viableAlliances = alliances.filter(al => {
        const aliveMembers = al.members.filter(id => {
          const p = alivePlayers.find(player => player.id === id);
          return p && !p.evicted;
        });
        return aliveMembers.length >= 2;
      });
      
      if(viableAlliances.length === 0){
        return null;
      }
      
      // Pick a random alliance
      const targetAlliance = viableAlliances[Math.floor(Math.random() * viableAlliances.length)];
      const aliveAllianceMembers = targetAlliance.members
        .map(id => alivePlayers.find(p => p.id === id))
        .filter(p => p && !p.evicted);
      
      if(aliveAllianceMembers.length < 2){
        return null;
      }
      
      // Pick the anchor player (who to match with)
      const anchor = aliveAllianceMembers[Math.floor(Math.random() * aliveAllianceMembers.length)];
      
      // Build answer choices
      const choices = [];
      
      // Add correct answer (another alliance member)
      const correctOptions = aliveAllianceMembers.filter(p => p.id !== anchor.id);
      if(correctOptions.length === 0) return null;
      
      const correctAnswer = correctOptions[Math.floor(Math.random() * correctOptions.length)];
      choices.push({ player: correctAnswer, isCorrect: true });
      
      // Add wrong answers (non-alliance members)
      const nonAllianceMembers = alivePlayers.filter(p => 
        p.id !== anchor.id && 
        !targetAlliance.members.includes(p.id)
      );
      
      // Shuffle and pick wrong answers
      const shuffledWrong = nonAllianceMembers.sort(() => Math.random() - 0.5);
      for(let i = 0; i < numOptions - 1 && i < shuffledWrong.length; i++){
        choices.push({ player: shuffledWrong[i], isCorrect: false });
      }
      
      // Shuffle choices
      choices.sort(() => Math.random() - 0.5);
      
      const difficultyLabel = difficulty === 'easy' ? 'Round 1' : difficulty === 'medium' ? 'Round 2' : 'Round 3';
      
      return {
        question: `Which houseguest is in an alliance with <strong>${anchor.name}</strong>?`,
        choices: choices,
        difficulty: difficultyLabel
      };
    }
    
    /**
     * Generate houseguest trivia questions
     * Questions about age, location, occupation, eviction timing, HOH wins, etc.
     */
    function generateHouseguestTrivia(players, roundIndex){
      const alivePlayers = players.filter(p => !p.evicted && p.name);
      const evictedPlayers = players.filter(p => p.evicted && p.name);
      const allPlayers = [...alivePlayers, ...evictedPlayers];
      
      if(allPlayers.length === 0) return null;
      
      const difficultyLabels = ['Round 1', 'Round 2', 'Round 3'];
      const difficulty = difficultyLabels[roundIndex] || 'Round 1';
      
      // Define question types
      const questionTypes = [
        // Age questions
        {
          type: 'age',
          check: () => allPlayers.some(p => p.meta && typeof p.meta.age === 'number'),
          generate: () => {
            const target = allPlayers.filter(p => p.meta && typeof p.meta.age === 'number')[Math.floor(Math.random() * allPlayers.filter(p => p.meta && typeof p.meta.age === 'number').length)];
            if(!target) return null;
            
            const correctAge = target.meta.age;
            const wrongAges = [correctAge - 3, correctAge + 4, correctAge - 6].filter(a => a > 18 && a < 60 && a !== correctAge);
            const choices = [
              { text: `${correctAge} years old`, isCorrect: true },
              { text: `${wrongAges[0]} years old`, isCorrect: false },
              { text: `${wrongAges[1]} years old`, isCorrect: false }
            ];
            
            if(roundIndex >= 2 && wrongAges[2]){
              choices.push({ text: `${wrongAges[2]} years old`, isCorrect: false });
            }
            
            return {
              question: `How old is <strong>${target.name}</strong>?`,
              choices: choices.sort(() => Math.random() - 0.5),
              difficulty
            };
          }
        },
        // Location questions
        {
          type: 'location',
          check: () => allPlayers.some(p => p.meta && p.meta.loc),
          generate: () => {
            const target = allPlayers.filter(p => p.meta && p.meta.loc)[Math.floor(Math.random() * allPlayers.filter(p => p.meta && p.meta.loc).length)];
            if(!target) return null;
            
            const LOCATIONS = ['NY','LA','Dallas','Miami','Chicago','Boston','Denver','Seattle','Atlanta','Phoenix','Austin','Portland'];
            const correctLoc = target.meta.loc;
            const wrongLocs = LOCATIONS.filter(l => l !== correctLoc).sort(() => Math.random() - 0.5);
            
            const choices = [
              { text: correctLoc, isCorrect: true },
              { text: wrongLocs[0], isCorrect: false },
              { text: wrongLocs[1], isCorrect: false }
            ];
            
            if(roundIndex >= 2){
              choices.push({ text: wrongLocs[2], isCorrect: false });
            }
            
            return {
              question: `Where is <strong>${target.name}</strong> from?`,
              choices: choices.sort(() => Math.random() - 0.5),
              difficulty
            };
          }
        },
        // Occupation questions
        {
          type: 'occupation',
          check: () => allPlayers.some(p => p.meta && p.meta.occupation),
          generate: () => {
            const target = allPlayers.filter(p => p.meta && p.meta.occupation)[Math.floor(Math.random() * allPlayers.filter(p => p.meta && p.meta.occupation).length)];
            if(!target) return null;
            
            const OCCUPATIONS = ['Teacher','Software Dev','Nurse','Artist','Sales Rep','Chef','Barista','Photographer','Fitness Coach','Student','Entrepreneur','Analyst','DJ','Designer','Marketer'];
            const correctOcc = target.meta.occupation;
            const wrongOccs = OCCUPATIONS.filter(o => o !== correctOcc).sort(() => Math.random() - 0.5);
            
            const choices = [
              { text: correctOcc, isCorrect: true },
              { text: wrongOccs[0], isCorrect: false },
              { text: wrongOccs[1], isCorrect: false }
            ];
            
            if(roundIndex >= 2){
              choices.push({ text: wrongOccs[2], isCorrect: false });
            }
            
            return {
              question: `What is <strong>${target.name}</strong>'s occupation?`,
              choices: choices.sort(() => Math.random() - 0.5),
              difficulty
            };
          }
        },
        // Eviction week questions
        {
          type: 'evictionWeek',
          check: () => evictedPlayers.some(p => typeof p.weekEvicted === 'number'),
          generate: () => {
            const target = evictedPlayers.filter(p => typeof p.weekEvicted === 'number')[Math.floor(Math.random() * evictedPlayers.filter(p => typeof p.weekEvicted === 'number').length)];
            if(!target) return null;
            
            const correctWeek = target.weekEvicted;
            const wrongWeeks = [correctWeek - 1, correctWeek + 1, correctWeek - 2].filter(w => w > 0 && w !== correctWeek);
            
            const choices = [
              { text: `Week ${correctWeek}`, isCorrect: true },
              { text: `Week ${wrongWeeks[0]}`, isCorrect: false },
              { text: `Week ${wrongWeeks[1]}`, isCorrect: false }
            ];
            
            if(roundIndex >= 2 && wrongWeeks[2]){
              choices.push({ text: `Week ${wrongWeeks[2]}`, isCorrect: false });
            }
            
            return {
              question: `When was <strong>${target.name}</strong> evicted?`,
              choices: choices.sort(() => Math.random() - 0.5),
              difficulty
            };
          }
        },
        // HOH wins questions
        {
          type: 'hohWins',
          check: () => allPlayers.some(p => p.stats && typeof p.stats.hohWins === 'number' && p.stats.hohWins > 0),
          generate: () => {
            const hohWinners = allPlayers.filter(p => p.stats && typeof p.stats.hohWins === 'number' && p.stats.hohWins > 0);
            if(hohWinners.length === 0) return null;
            
            const target = hohWinners[Math.floor(Math.random() * hohWinners.length)];
            const correctWins = target.stats.hohWins;
            const wrongWins = [correctWins + 1, correctWins - 1, correctWins + 2].filter(w => w >= 0 && w !== correctWins);
            
            const choices = [
              { text: `${correctWins} time${correctWins !== 1 ? 's' : ''}`, isCorrect: true },
              { text: `${wrongWins[0]} time${wrongWins[0] !== 1 ? 's' : ''}`, isCorrect: false },
              { text: `${wrongWins[1]} time${wrongWins[1] !== 1 ? 's' : ''}`, isCorrect: false }
            ];
            
            if(roundIndex >= 2 && wrongWins[2] !== undefined){
              choices.push({ text: `${wrongWins[2]} time${wrongWins[2] !== 1 ? 's' : ''}`, isCorrect: false });
            }
            
            return {
              question: `How many times has <strong>${target.name}</strong> won HOH?`,
              choices: choices.sort(() => Math.random() - 0.5),
              difficulty
            };
          }
        },
        // Status questions (alive/evicted)
        {
          type: 'status',
          check: () => evictedPlayers.length > 0 && alivePlayers.length > 0,
          generate: () => {
            const isAliveQuestion = Math.random() > 0.5;
            
            if(isAliveQuestion && alivePlayers.length >= 3){
              const target = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
              const wrongOptions = evictedPlayers.sort(() => Math.random() - 0.5).slice(0, roundIndex >= 2 ? 2 : 1);
              
              const choices = [
                { text: target.name, isCorrect: true },
                ...wrongOptions.map(p => ({ text: p.name, isCorrect: false }))
              ];
              
              // Add one more alive player as decoy if needed
              if(choices.length < 3){
                const decoy = alivePlayers.filter(p => p.id !== target.id)[0];
                if(decoy) choices.push({ text: decoy.name, isCorrect: false });
              }
              
              if(roundIndex >= 2 && choices.length === 3){
                const extraDecoy = alivePlayers.filter(p => p.id !== target.id && !choices.some(c => c.text === p.name))[0];
                if(extraDecoy) choices.push({ text: extraDecoy.name, isCorrect: false });
              }
              
              return {
                question: 'Which houseguest is <strong>still in the house</strong>?',
                choices: choices.sort(() => Math.random() - 0.5),
                difficulty
              };
            } else if(evictedPlayers.length >= 3){
              const target = evictedPlayers[Math.floor(Math.random() * evictedPlayers.length)];
              const wrongOptions = alivePlayers.sort(() => Math.random() - 0.5).slice(0, roundIndex >= 2 ? 2 : 1);
              
              const choices = [
                { text: target.name, isCorrect: true },
                ...wrongOptions.map(p => ({ text: p.name, isCorrect: false }))
              ];
              
              // Add another evicted player as decoy if needed
              if(choices.length < 3){
                const decoy = evictedPlayers.filter(p => p.id !== target.id)[0];
                if(decoy) choices.push({ text: decoy.name, isCorrect: false });
              }
              
              if(roundIndex >= 2 && choices.length === 3){
                const extraDecoy = evictedPlayers.filter(p => p.id !== target.id && !choices.some(c => c.text === p.name))[0];
                if(extraDecoy) choices.push({ text: extraDecoy.name, isCorrect: false });
              }
              
              return {
                question: 'Which houseguest has been <strong>evicted</strong>?',
                choices: choices.sort(() => Math.random() - 0.5),
                difficulty
              };
            }
            return null;
          }
        }
      ];
      
      // Shuffle and try question types until we find one that works
      const shuffledTypes = questionTypes.sort(() => Math.random() - 0.5);
      for(const qType of shuffledTypes){
        if(qType.check()){
          const question = qType.generate();
          if(question) return question;
        }
      }
      
      return null;
    }
    
    /**
     * Generate fallback questions when no alliances exist
     */
    function generateFallbackQuestions(){
      // Generic Big Brother alliance knowledge questions
      return [
        {
          question: 'In Big Brother, which pair would MOST LIKELY be in an alliance?',
          choices: [
            { text: 'Two players who trust each other', isCorrect: true },
            { text: 'The current nominees', isCorrect: false },
            { text: 'Players who never talk', isCorrect: false }
          ].sort(() => Math.random() - 0.5),
          difficulty: 'Round 1',
          isFallback: true
        },
        {
          question: 'What is the MAIN purpose of forming an alliance?',
          choices: [
            { text: 'To protect each other from eviction', isCorrect: true },
            { text: 'To compete in challenges alone', isCorrect: false },
            { text: 'To vote randomly each week', isCorrect: false }
          ].sort(() => Math.random() - 0.5),
          difficulty: 'Round 2',
          isFallback: true
        },
        {
          question: 'Which strategy shows TWO players are likely allied?',
          choices: [
            { text: 'They consistently vote the same way', isCorrect: true },
            { text: 'They nominate each other every week', isCorrect: false },
            { text: 'They refuse to talk game', isCorrect: false },
            { text: 'They argue publicly often', isCorrect: false }
          ].sort(() => Math.random() - 0.5),
          difficulty: 'Round 3',
          isFallback: true
        }
      ];
    }
    
    /**
     * Display current question
     */
    function showQuestion(){
      if(currentRound >= questions.length || currentRound >= totalRounds){
        // Quiz complete
        const score = Math.max(20, Math.min(100, (correctAnswers / totalRounds) * 80 + 20));
        
        questionText.innerHTML = '<strong>Challenge Complete!</strong>';
        answersContainer.innerHTML = '';
        progress.innerHTML = `You got <strong>${correctAnswers} out of ${totalRounds}</strong> correct!`;
        
        setTimeout(() => {
          onComplete(score);
        }, 2000);
        return;
      }
      
      const question = questions[currentRound];
      progress.textContent = `${question.difficulty} of 3`;
      questionText.innerHTML = question.question;
      answersContainer.innerHTML = '';
      
      // Create answer buttons
      question.choices.forEach((choice, index) => {
        const btn = document.createElement('button');
        btn.className = 'btn';
        
        // Handle both player objects and text fallbacks
        if(choice.player){
          btn.textContent = choice.player.name;
        } else if(choice.text){
          btn.textContent = choice.text;
        }
        
        btn.style.cssText = 'padding:12px 20px;text-align:center;font-size:0.95rem;';
        
        btn.addEventListener('click', () => {
          // Disable all buttons
          answersContainer.querySelectorAll('button').forEach(b => b.disabled = true);
          
          if(choice.isCorrect){
            // Correct!
            btn.style.background = '#77d58d';
            btn.style.color = '#fff';
            correctAnswers++;
          } else {
            // Wrong
            btn.style.background = '#ff6d6d';
            btn.style.color = '#fff';
            // Highlight correct answer
            const correctIndex = question.choices.findIndex(c => c.isCorrect);
            if(correctIndex >= 0){
              answersContainer.querySelectorAll('button')[correctIndex].style.background = '#77d58d';
              answersContainer.querySelectorAll('button')[correctIndex].style.color = '#fff';
            }
          }
          
          setTimeout(() => {
            currentRound++;
            showQuestion();
          }, 1500);
        }, { passive: false });
        
        answersContainer.appendChild(btn);
      });
    }
    
    // Initialize game
    generateQuestions();
    
    // Assemble UI
    wrapper.appendChild(title);
    wrapper.appendChild(instructions);
    wrapper.appendChild(progress);
    wrapper.appendChild(questionText);
    wrapper.appendChild(answersContainer);
    container.appendChild(wrapper);
    
    // Start first question
    showQuestion();
  }

  // Export
  if(typeof g.MiniGames === 'undefined') g.MiniGames = {};
  g.MiniGames.socialStrings = { render };

})(window);
