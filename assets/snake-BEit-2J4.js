(function(e){function t(){if(document.querySelector(`style[data-snake-nokia-styles]`))return;let e=document.createElement(`style`);e.setAttribute(`data-snake-nokia-styles`,`true`),e.textContent=`
      .snake-nokia-wrapper {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
        padding: 20px;
      }

      .snake-nokia-title {
        margin: 0;
        font-size: 1.3rem;
        color: #e3ecf5;
        font-family: 'Courier New', monospace;
        text-transform: uppercase;
        letter-spacing: 2px;
      }

      .snake-nokia-instructions {
        margin: 0;
        font-size: 0.9rem;
        color: #95a9c0;
        text-align: center;
        font-family: 'Courier New', monospace;
      }

      .snake-nokia-canvas-container {
        position: relative;
        background: #2a2a2a;
        padding: 16px;
        border-radius: 8px;
        box-shadow: inset 0 4px 12px rgba(0, 0, 0, 0.7),
                    0 2px 8px rgba(0, 0, 0, 0.3);
      }

      .snake-nokia-canvas {
        display: block;
        background: #b7d378;
        border: 2px solid #1a1a1a;
        image-rendering: pixelated;
        image-rendering: crisp-edges;
      }

      .snake-nokia-status {
        position: absolute;
        top: 20px;
        left: 20px;
        font-family: 'Courier New', monospace;
        font-size: 11px;
        font-weight: bold;
        color: #1a1a1a;
        background: rgba(183, 211, 120, 0.85);
        padding: 2px 6px;
        border-radius: 2px;
        letter-spacing: 1px;
      }

      .snake-nokia-scanlines {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        pointer-events: none;
        background: repeating-linear-gradient(
          0deg,
          rgba(0, 0, 0, 0.05) 0px,
          rgba(0, 0, 0, 0.05) 1px,
          transparent 1px,
          transparent 2px
        );
      }

      .snake-nokia-dpad {
        display: grid;
        grid-template-columns: repeat(3, 70px);
        grid-template-rows: repeat(3, 70px);
        gap: 4px;
        margin-top: 10px;
      }

      .snake-nokia-dpad-btn {
        position: relative;
        background: linear-gradient(135deg, #3a3a3a 0%, #2a2a2a 100%);
        border: 2px solid #4a4a4a;
        border-radius: 8px;
        cursor: pointer;
        padding: 0;
        transition: all 0.1s ease;
        box-shadow: 0 3px 6px rgba(0, 0, 0, 0.3),
                    inset 0 1px 2px rgba(255, 255, 255, 0.1);
      }

      .snake-nokia-dpad-btn:hover {
        background: linear-gradient(135deg, #4a4a4a 0%, #3a3a3a 100%);
        border-color: #5a5a5a;
      }

      .snake-nokia-dpad-btn:active,
      .snake-nokia-dpad-pressed {
        background: linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%);
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5),
                    inset 0 2px 4px rgba(0, 0, 0, 0.4);
        transform: translateY(2px);
      }

      .snake-nokia-dpad-btn::after {
        content: '';
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 0;
        height: 0;
        border-style: solid;
      }

      .snake-nokia-dpad-up::after {
        border-width: 0 12px 16px 12px;
        border-color: transparent transparent #b7d378 transparent;
      }

      .snake-nokia-dpad-down::after {
        border-width: 16px 12px 0 12px;
        border-color: #b7d378 transparent transparent transparent;
      }

      .snake-nokia-dpad-left::after {
        border-width: 12px 16px 12px 0;
        border-color: transparent #b7d378 transparent transparent;
      }

      .snake-nokia-dpad-right::after {
        border-width: 12px 0 12px 16px;
        border-color: transparent transparent transparent #b7d378;
      }

      .snake-nokia-dpad-center {
        background: radial-gradient(circle, #1a1a1a 0%, #2a2a2a 100%);
        border: 2px solid #3a3a3a;
        border-radius: 50%;
      }

      /* Nokia Image Shell Theme Styles */
      .snake-phone-shell {
        --phone-width: 300px;
        --phone-height: 665px;
        --lcd-top: 155px;
        --lcd-left: 53px;
        --lcd-width: 194px;
        --lcd-height: 125px;
        --keypad-top: 365px;
        --keypad-btn-size: 40px;
        
        position: relative;
        width: var(--phone-width);
        height: var(--phone-height);
        background-image: url('assets/skins/nokia3310-shell.png');
        background-size: contain;
        background-repeat: no-repeat;
        background-position: center;
        margin: 20px auto;
      }

      .snake-phone-shell .snake-nokia-canvas-container {
        position: absolute;
        top: var(--lcd-top);
        left: var(--lcd-left);
        width: var(--lcd-width);
        height: var(--lcd-height);
        background: transparent;
        padding: 0;
        border-radius: 4px;
        box-shadow: none;
      }

      .snake-phone-shell .snake-nokia-canvas {
        width: 100%;
        height: 100%;
        border: none;
      }

      .snake-phone-shell .snake-nokia-status {
        top: 5px;
        left: 5px;
        font-size: 9px;
      }

      .snake-phone-shell .snake-nokia-scanlines {
        border-radius: 4px;
      }

      .snake-keypad-overlay {
        position: absolute;
        top: var(--keypad-top);
        left: 50%;
        transform: translateX(-50%);
        width: 180px;
        height: 130px;
      }

      .snake-keypad-btn {
        position: absolute;
        background: transparent;
        border: none;
        cursor: pointer;
        width: var(--keypad-btn-size);
        height: var(--keypad-btn-size);
        padding: 0;
        transition: background 0.1s ease;
      }

      .snake-keypad-btn:active {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 5px;
      }

      .snake-keypad-btn-up {
        top: 0;
        left: 50%;
        transform: translateX(-50%);
        height: 45px;
      }

      .snake-keypad-btn-down {
        bottom: 0;
        left: 50%;
        transform: translateX(-50%);
        height: 45px;
      }

      .snake-keypad-btn-left {
        left: 0;
        top: 50%;
        transform: translateY(-50%);
        width: 50px;
      }

      .snake-keypad-btn-right {
        right: 0;
        top: 50%;
        transform: translateY(-50%);
        width: 50px;
      }

      /* Responsive scaling */
      @media (max-width: 768px) {
        .snake-phone-shell {
          --phone-width: 270px;
          --phone-height: 598px;
          --lcd-top: 140px;
          --lcd-left: 48px;
          --lcd-width: 175px;
          --lcd-height: 113px;
          --keypad-top: 328px;
          --keypad-btn-size: 36px;
        }
        
        .snake-keypad-overlay {
          width: 162px;
          height: 117px;
        }
      }

      @media (max-width: 480px) {
        .snake-phone-shell {
          --phone-width: 240px;
          --phone-height: 532px;
          --lcd-top: 124px;
          --lcd-left: 42px;
          --lcd-width: 155px;
          --lcd-height: 100px;
          --keypad-top: 292px;
          --keypad-btn-size: 32px;
        }
        
        .snake-keypad-overlay {
          width: 144px;
          height: 104px;
        }

        .snake-nokia-dpad {
          grid-template-columns: repeat(3, 60px);
          grid-template-rows: repeat(3, 60px);
        }

        .snake-nokia-canvas-container {
          padding: 12px;
        }
      }
    `,document.head.appendChild(e)}function n(n,r,i={}){n.innerHTML=``;let{debugMode:a=!1,competitionMode:o=!1,variant:s=`normal`,theme:c=`nokia`,timedMode:l=!1,timeLimitMs:u=6e4}=i,d=s===`portal`,f=c===`nokia-image-shell`;t();let p=document.createElement(`div`);if(p.className=f?`snake-phone-shell`:`snake-nokia-wrapper`,!f){let t=document.createElement(`h3`);if(t.textContent=d?`Snake (Portal Mode)`:`Snake`,t.className=`snake-nokia-title`,p.appendChild(t),e.HighScoreManager){let t=e.HighScoreManager.getHighScoreDisplay(`snake`);if(t){let e=document.createElement(`div`);e.textContent=t,e.style.cssText=`font-size:0.8rem;color:#ffd96b;font-weight:600;margin:-8px 0 0 0;text-align:center;`,p.appendChild(e)}}let n=document.createElement(`p`);if(n.textContent=l?d?`Eat food, grow, edges wrap around! (Timed!)`:`Eat food, avoid walls and yourself! (Timed!)`:d?`Eat food, grow, edges wrap around!`:`Eat food, avoid walls and yourself!`,n.className=`snake-nokia-instructions`,p.appendChild(n),l&&e.GameTimer){let e=document.createElement(`div`);e.style.cssText=`margin:4px 0;`,p.appendChild(e)}}let m=null;f||(m=p.querySelector(`.snake-nokia-instructions`));let h=document.createElement(`div`);h.className=`snake-nokia-canvas-container`;let g=document.createElement(`canvas`);g.width=300,g.height=300,g.className=`snake-nokia-canvas`;let _=g.getContext(`2d`),v=document.createElement(`div`);v.className=`snake-nokia-status`,v.textContent=`LEN 3  F 0`;let y=document.createElement(`div`);y.className=`snake-nokia-scanlines`,h.appendChild(g),h.appendChild(v),h.appendChild(y);let b=document.createElement(`div`);b.className=`snake-nokia-dpad`;let x=k(`up`),S=k(`left`),C=k(`down`),w=k(`right`),T=document.createElement(`div`),E=document.createElement(`div`),D=document.createElement(`div`),O=document.createElement(`div`);O.className=`snake-nokia-dpad-center`,b.appendChild(T),b.appendChild(x),b.appendChild(E),b.appendChild(S),b.appendChild(O),b.appendChild(w),b.appendChild(D),b.appendChild(C),b.appendChild(document.createElement(`div`));function k(e){let t=document.createElement(`button`);return t.className=`snake-nokia-dpad-btn snake-nokia-dpad-`+e,t.setAttribute(`aria-label`,e),t}if(p.appendChild(h),f){let e=document.createElement(`div`);e.className=`snake-keypad-overlay`;let t=document.createElement(`button`);t.className=`snake-keypad-btn snake-keypad-btn-up`,t.setAttribute(`aria-label`,`up`);let n=document.createElement(`button`);n.className=`snake-keypad-btn snake-keypad-btn-down`,n.setAttribute(`aria-label`,`down`);let r=document.createElement(`button`);r.className=`snake-keypad-btn snake-keypad-btn-left`,r.setAttribute(`aria-label`,`left`);let i=document.createElement(`button`);i.className=`snake-keypad-btn snake-keypad-btn-right`,i.setAttribute(`aria-label`,`right`),e.appendChild(t),e.appendChild(n),e.appendChild(r),e.appendChild(i),p.appendChild(e),x._keypadBtn=t,C._keypadBtn=n,S._keypadBtn=r,w._keypadBtn=i}else p.appendChild(b);n.appendChild(p);let A=[{x:10,y:10}],j={x:1,y:0},M={x:1,y:0},N=null,P=0,F=!1,I=null,L=null;if(l&&e.GameTimer)try{L=new e.GameTimer(`arcade`,{duration:u,countDirection:`down`}),L.onComplete(()=>{console.log(`[Snake] Time expired`),F||H()});let t=p.querySelector(`div[style*="margin:4px"]`);t&&L.render(t),console.log(`[Snake] GameTimer initialized (countdown mode)`)}catch(e){console.warn(`[Snake] Failed to initialize GameTimer:`,e),L=null}function R(){do N={x:Math.floor(Math.random()*20),y:Math.floor(Math.random()*20)};while(A.some(e=>e.x===N.x&&e.y===N.y))}function z(e){e.x===-j.x&&e.y===-j.y||(M=e)}function B(){if(F)return;j=M;let e={x:A[0].x+j.x,y:A[0].y+j.y};if(d)e.x<0&&(e.x=19),e.x>=20&&(e.x=0),e.y<0&&(e.y=19),e.y>=20&&(e.y=0);else if(e.x<0||e.x>=20||e.y<0||e.y>=20){H();return}if(A.some(t=>t.x===e.x&&t.y===e.y)){H();return}A.unshift(e),e.x===N.x&&e.y===N.y?(P++,v.textContent=`LEN ${A.length}  F ${P}`,R()):A.pop(),V()}function V(){_.fillStyle=`#b7d378`,_.fillRect(0,0,g.width,g.height),A.forEach((e,t)=>{_.fillStyle=t===0?`#1a1a1a`:`#2d2d2d`,_.fillRect(e.x*15,e.y*15,14,14)}),_.fillStyle=`#1a1a1a`,_.fillRect(N.x*15,N.y*15,14,14)}function H(){F=!0,clearInterval(I),L&&(L.stop(),L.destroy(),console.log(`[Snake] GameTimer stopped`)),m&&(m.textContent=`Game Over!`,m.style.color=`#ff6b6b`);let t=Math.min(100,P*10),n=!1;e.HighScoreManager&&(n=e.HighScoreManager.isNewBest(`snake`,P),n&&(e.HighScoreManager.setHighScore(`snake`,P,`${P} food`),console.info(`[Snake] New personal best: ${P} food!`)));let i=e.MinigameScoring?e.MinigameScoring.calculateFinalScore({rawScore:t,minScore:0,maxScore:100,compBeast:.5}):t*10;console.log(`[Snake] Food eaten: ${P}, Raw score: ${t}, Final score: ${Math.round(i)}`);let a={score:Math.round(i),rawScore:P,rawScoreDisplay:`${P} food eaten`,isNewPersonalBest:n};setTimeout(()=>r(a),1500)}document.addEventListener(`keydown`,e=>{F||(e.key===`ArrowUp`||e.key===`w`?(e.preventDefault(),z({x:0,y:-1})):e.key===`ArrowDown`||e.key===`s`?(e.preventDefault(),z({x:0,y:1})):e.key===`ArrowLeft`||e.key===`a`?(e.preventDefault(),z({x:-1,y:0})):(e.key===`ArrowRight`||e.key===`d`)&&(e.preventDefault(),z({x:1,y:0})))});function U(e,t){let n=n=>{F||(n.preventDefault(),z(t),f||(e.classList.add(`snake-nokia-dpad-pressed`),setTimeout(()=>e.classList.remove(`snake-nokia-dpad-pressed`),100)),navigator.vibrate&&navigator.vibrate(10))};e.addEventListener(`pointerdown`,n),e.addEventListener(`click`,n)}f?(U(x._keypadBtn,{x:0,y:-1}),U(C._keypadBtn,{x:0,y:1}),U(S._keypadBtn,{x:-1,y:0}),U(w._keypadBtn,{x:1,y:0})):(U(x,{x:0,y:-1}),U(C,{x:0,y:1}),U(S,{x:-1,y:0}),U(w,{x:1,y:0}));let W=0,G=0;g.addEventListener(`touchstart`,e=>{if(!e.touches||!e.touches[0])return;e.preventDefault();let t=e.touches[0];W=t.clientX,G=t.clientY}),g.addEventListener(`touchend`,e=>{if(F||!e.changedTouches||!e.changedTouches[0])return;e.preventDefault();let t=e.changedTouches[0],n=t.clientX-W,r=t.clientY-G,i=Math.abs(n),a=Math.abs(r);(i>30||a>30)&&(z(i>a?n>0?{x:1,y:0}:{x:-1,y:0}:r>0?{x:0,y:1}:{x:0,y:-1}),navigator.vibrate&&navigator.vibrate(10))}),R(),V(),I=setInterval(B,150),L&&(L.start(),console.log(`[Snake] GameTimer started`))}e.MiniGames===void 0&&(e.MiniGames={}),e.MiniGames.snake={render:n}})(window);