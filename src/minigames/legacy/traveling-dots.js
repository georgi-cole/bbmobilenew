// MODULE: minigames/traveling-dots.js
// Traveling Dots (TSP Approximation) - Draw optimal path through points

(function(g){
  'use strict';

  /**
   * Seeded random for deterministic point generation
   */
  function SeededRandom(seed) {
    this.seed = seed || Date.now();
    this.next = function() {
      this.seed = (this.seed * 9301 + 49297) % 233280;
      return this.seed / 233280;
    };
  }

  /**
   * Nearest Neighbor TSP heuristic
   */
  function nearestNeighbor(points) {
    if(points.length === 0) return { path: [], length: 0 };
    
    const visited = new Set();
    const path = [0];
    visited.add(0);
    let totalLength = 0;
    
    while(visited.size < points.length) {
      const current = path[path.length - 1];
      let nearest = -1;
      let minDist = Infinity;
      
      for(let i = 0; i < points.length; i++) {
        if(!visited.has(i)) {
          const dist = distance(points[current], points[i]);
          if(dist < minDist) {
            minDist = dist;
            nearest = i;
          }
        }
      }
      
      if(nearest !== -1) {
        path.push(nearest);
        visited.add(nearest);
        totalLength += minDist;
      }
    }
    
    // Return to start
    totalLength += distance(points[path[path.length - 1]], points[0]);
    
    return { path, length: totalLength };
  }

  function distance(p1, p2) {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Calculate tour length from ordered indices
   */
  function calculateTourLength(points, tour) {
    let length = 0;
    for(let i = 0; i < tour.length - 1; i++) {
      length += distance(points[tour[i]], points[tour[i + 1]]);
    }
    // Close the tour
    if(tour.length > 0) {
      length += distance(points[tour[tour.length - 1]], points[tour[0]]);
    }
    return length;
  }

  /**
   * Traveling Dots minigame
   * Draw a tour through all points, try to minimize total distance
   * 
   * @param {HTMLElement} container - Container element
   * @param {Function} onComplete - Callback function(score)
   * @param {Object} options - Configuration (seed for determinism)
   */
  function render(container, onComplete, options = {}) {
    container.innerHTML = '';
    
    const { debugMode = false, seed } = options;
    const rng = new SeededRandom(seed);
    
    // Generate points
    const NUM_POINTS = 12;
    const CANVAS_SIZE = 400;
    const MARGIN = 40;
    const points = [];
    
    for(let i = 0; i < NUM_POINTS; i++) {
      points.push({
        x: MARGIN + rng.next() * (CANVAS_SIZE - 2 * MARGIN),
        y: MARGIN + rng.next() * (CANVAS_SIZE - 2 * MARGIN),
        id: i
      });
    }
    
    // Calculate optimal tour (heuristic)
    const optimalTour = nearestNeighbor(points);
    
    // Game state
    let playerTour = [];
    let currentLength = 0;
    let gameStarted = false;
    let gameOver = false;
    let startTime = null;

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:12px;padding:15px;';
    
    const title = document.createElement('h3');
    title.textContent = 'Traveling Dots';
    title.style.cssText = 'margin:0;font-size:1.4rem;color:#e3ecf5;';
    
    const instructions = document.createElement('p');
    instructions.textContent = 'Tap all dots in order to create shortest path!';
    instructions.style.cssText = 'margin:0;font-size:0.85rem;color:#95a9c0;text-align:center;max-width:400px;';
    
    const statsDiv = document.createElement('div');
    statsDiv.style.cssText = 'display:flex;gap:16px;font-size:0.9rem;';
    
    const lengthDiv = document.createElement('div');
    lengthDiv.textContent = 'Length: 0';
    lengthDiv.style.cssText = 'color:#83bfff;font-weight:600;';
    
    const optimalDiv = document.createElement('div');
    optimalDiv.textContent = `Target: ${Math.round(optimalTour.length)}`;
    optimalDiv.style.cssText = 'color:#5bd68a;font-weight:600;';
    
    const visitedDiv = document.createElement('div');
    visitedDiv.textContent = 'Visited: 0/12';
    visitedDiv.style.cssText = 'color:#f7b955;font-weight:600;';
    
    statsDiv.appendChild(lengthDiv);
    statsDiv.appendChild(visitedDiv);
    statsDiv.appendChild(optimalDiv);
    
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;
    canvas.style.cssText = 'background:#1a1a1a;border:3px solid #5bd68a;border-radius:8px;cursor:crosshair;touch-action:none;max-width:100%;';
    const ctx = canvas.getContext('2d');
    
    const btnDiv = document.createElement('div');
    btnDiv.style.cssText = 'display:flex;gap:10px;';
    
    const undoBtn = document.createElement('button');
    undoBtn.textContent = 'Undo Last';
    undoBtn.style.cssText = `
      min-height:44px;
      padding:10px 20px;
      font-size:1rem;
      font-weight:bold;
      background:#666;
      color:#fff;
      border:2px solid #555;
      border-radius:10px;
      cursor:pointer;
    `;
    undoBtn.disabled = true;
    
    const finishBtn = document.createElement('button');
    finishBtn.textContent = 'Finish Tour';
    finishBtn.style.cssText = `
      min-height:44px;
      padding:10px 20px;
      font-size:1rem;
      font-weight:bold;
      background:linear-gradient(135deg, #5bd68a 0%, #4db878 100%);
      color:#1a1a1a;
      border:2px solid #4db878;
      border-radius:10px;
      cursor:pointer;
    `;
    finishBtn.disabled = true;
    
    btnDiv.appendChild(undoBtn);
    btnDiv.appendChild(finishBtn);
    
    wrapper.appendChild(title);
    wrapper.appendChild(instructions);
    wrapper.appendChild(statsDiv);
    wrapper.appendChild(canvas);
    wrapper.appendChild(btnDiv);
    container.appendChild(wrapper);
    
    function draw() {
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      
      // Draw optimal tour in background (faint)
      if(debugMode) {
        ctx.strokeStyle = 'rgba(91, 214, 138, 0.2)';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        for(let i = 0; i < optimalTour.path.length; i++) {
          const p = points[optimalTour.path[i]];
          if(i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);
      }
      
      // Draw player tour
      if(playerTour.length > 0) {
        ctx.strokeStyle = '#83bfff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        for(let i = 0; i < playerTour.length; i++) {
          const p = points[playerTour[i]];
          if(i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
        
        // Draw line back to start if all visited
        if(playerTour.length === NUM_POINTS) {
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          const last = points[playerTour[playerTour.length - 1]];
          const first = points[playerTour[0]];
          ctx.moveTo(last.x, last.y);
          ctx.lineTo(first.x, first.y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      
      // Draw points
      points.forEach((p, i) => {
        const visited = playerTour.includes(i);
        const isStart = i === playerTour[0];
        
        ctx.fillStyle = visited ? '#5bd68a' : '#ff6b9d';
        ctx.beginPath();
        ctx.arc(p.x, p.y, visited ? 6 : 8, 0, Math.PI * 2);
        ctx.fill();
        
        if(isStart) {
          ctx.strokeStyle = '#f7b955';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
          ctx.stroke();
        }
        
        // Draw number
        ctx.fillStyle = '#e3ecf5';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(i + 1, p.x, p.y - 16);
      });
    }
    
    function findNearestPoint(x, y) {
      let nearest = -1;
      let minDist = 20; // Click threshold
      
      points.forEach((p, i) => {
        if(!playerTour.includes(i)) {
          const dist = Math.sqrt((x - p.x) ** 2 + (y - p.y) ** 2);
          if(dist < minDist) {
            minDist = dist;
            nearest = i;
          }
        }
      });
      
      return nearest;
    }
    
    function handleClick(e) {
      if(gameOver) return;
      
      if(!gameStarted) {
        gameStarted = true;
        startTime = Date.now();
      }
      
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;
      
      const pointId = findNearestPoint(x, y);
      if(pointId !== -1) {
        playerTour.push(pointId);
        
        if(playerTour.length > 1) {
          const prev = points[playerTour[playerTour.length - 2]];
          const curr = points[playerTour[playerTour.length - 1]];
          currentLength += distance(prev, curr);
        }
        
        lengthDiv.textContent = `Length: ${Math.round(currentLength)}`;
        visitedDiv.textContent = `Visited: ${playerTour.length}/${NUM_POINTS}`;
        
        undoBtn.disabled = false;
        
        if(playerTour.length === NUM_POINTS) {
          // Add closing distance
          const last = points[playerTour[playerTour.length - 1]];
          const first = points[playerTour[0]];
          currentLength += distance(last, first);
          lengthDiv.textContent = `Length: ${Math.round(currentLength)}`;
          finishBtn.disabled = false;
        }
        
        draw();
      }
    }
    
    function handleTouch(e) {
      e.preventDefault();
      if(e.touches.length > 0) {
        const touch = e.touches[0];
        handleClick({ clientX: touch.clientX, clientY: touch.clientY });
      }
    }
    
    function undo() {
      if(playerTour.length === 0) return;
      
      if(playerTour.length === NUM_POINTS) {
        // Remove closing distance
        const last = points[playerTour[playerTour.length - 1]];
        const first = points[playerTour[0]];
        currentLength -= distance(last, first);
      }
      
      if(playerTour.length > 1) {
        const prev = points[playerTour[playerTour.length - 2]];
        const curr = points[playerTour[playerTour.length - 1]];
        currentLength -= distance(prev, curr);
      }
      
      playerTour.pop();
      
      lengthDiv.textContent = `Length: ${Math.round(currentLength)}`;
      visitedDiv.textContent = `Visited: ${playerTour.length}/${NUM_POINTS}`;
      
      if(playerTour.length === 0) undoBtn.disabled = true;
      finishBtn.disabled = true;
      
      draw();
    }
    
    function finishTour() {
      if(playerTour.length !== NUM_POINTS) return;
      
      gameOver = true;
      const elapsed = (Date.now() - startTime) / 1000;
      
      // Score: ratio of optimal to player length, with time factor
      const ratio = optimalTour.length / currentLength;
      let score = ratio * 100;
      
      // Time bonus (faster is better, cap at 60s)
      const timePenalty = Math.min(elapsed / 2, 15);
      score -= timePenalty;
      
      score = Math.max(0, Math.min(100, Math.round(score)));
      
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
      resultText.textContent = '🎯 Tour Complete!';
      resultText.style.cssText = 'font-size:1.8rem;color:#5bd68a;margin-bottom:15px;font-weight:bold;';
      
      const statsText = document.createElement('div');
      statsText.innerHTML = `
        <div style="color:#83bfff;font-size:1.1rem;margin-bottom:6px;">Your length: ${Math.round(currentLength)}</div>
        <div style="color:#5bd68a;font-size:1.1rem;margin-bottom:6px;">Target: ${Math.round(optimalTour.length)}</div>
        <div style="color:#f7b955;font-size:1.1rem;margin-bottom:12px;">Efficiency: ${(ratio * 100).toFixed(1)}%</div>
      `;
      
      const scoreText = document.createElement('div');
      scoreText.textContent = `Score: ${score}`;
      scoreText.style.cssText = 'font-size:1.3rem;color:#5bd68a;font-weight:600;';
      
      resultDiv.appendChild(resultText);
      resultDiv.appendChild(statsText);
      resultDiv.appendChild(scoreText);
      container.appendChild(resultDiv);
      
      setTimeout(() => {
        if(typeof onComplete === 'function') {
          onComplete(score);
        }
      }, 3500);
    }
    
    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('touchstart', handleTouch);
    undoBtn.addEventListener('click', undo);
    finishBtn.addEventListener('click', finishTour);
    
    draw();
  }

  // Register module
  if(typeof g.MinigameModules !== 'undefined' && typeof g.MinigameModules.register === 'function'){
    g.MinigameModules.register('travelingDots', { render });
  } else {
    g.MinigameModules = g.MinigameModules || {};
    g.MinigameModules.travelingDots = { render };
    g.MiniGames = g.MiniGames || {};
    g.MiniGames.travelingDots = { render };
  }

  console.info('[TravelingDots] Module loaded');

})(window);
