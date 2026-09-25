(function(e){let t=[`VETO`,`JURY`,`VOTE`,`EVICT`,`ALLIANCE`,`BACKDOOR`,`FLOATER`,`PAWN`,`TARGET`,`NOMINATED`,`COMPETITION`,`STRATEGY`,`HOUSEGUEST`,`FINAL`,`POWER`,`TWIST`,`BETRAYAL`,`CEREMONY`,`SHOWMANCE`];function n(n,r,i={}){n.innerHTML=``;let{debugMode:a=!1}=i,o=t[Math.floor(Math.random()*t.length)],s=new Set,c=0,l=Date.now(),u=!1,d=document.createElement(`div`);d.style.cssText=`display:flex;flex-direction:column;align-items:center;gap:20px;padding:20px;max-width:600px;margin:0 auto;`;let f=document.createElement(`h3`);f.textContent=`Hangman`,f.style.cssText=`margin:0;font-size:1.5rem;color:#e3ecf5;`;let p=document.createElement(`p`);p.textContent=`Guess the game word!`,p.style.cssText=`margin:0;font-size:1rem;color:#95a9c0;text-align:center;`;let m=document.createElement(`div`);m.textContent=`Wrong: 0/6`,m.style.cssText=`font-size:1.1rem;font-weight:bold;color:#ff6b9d;`,m.setAttribute(`aria-live`,`polite`);let h=document.createElement(`div`);h.style.cssText=`width:200px;height:250px;margin:10px auto;`,h.innerHTML=`
      <svg width="200" height="250" viewBox="0 0 200 250" style="background:#0a0a0a;border-radius:8px;">
        <!-- Base -->
        <line x1="20" y1="230" x2="120" y2="230" stroke="#5bd68a" stroke-width="4"/>
        <!-- Pole -->
        <line x1="50" y1="230" x2="50" y2="20" stroke="#5bd68a" stroke-width="4"/>
        <!-- Top beam -->
        <line x1="50" y1="20" x2="130" y2="20" stroke="#5bd68a" stroke-width="4"/>
        <!-- Rope -->
        <line x1="130" y1="20" x2="130" y2="50" stroke="#5bd68a" stroke-width="2"/>
        
        <!-- Figure parts (initially hidden) -->
        <!-- Head -->
        <circle id="hangman-head" cx="130" cy="70" r="20" stroke="#ff6b9d" stroke-width="3" fill="none" opacity="0"/>
        <!-- Torso -->
        <line id="hangman-torso" x1="130" y1="90" x2="130" y2="150" stroke="#ff6b9d" stroke-width="3" opacity="0"/>
        <!-- Left arm -->
        <line id="hangman-left-arm" x1="130" y1="110" x2="100" y2="130" stroke="#ff6b9d" stroke-width="3" opacity="0"/>
        <!-- Right arm -->
        <line id="hangman-right-arm" x1="130" y1="110" x2="160" y2="130" stroke="#ff6b9d" stroke-width="3" opacity="0"/>
        <!-- Left leg -->
        <line id="hangman-left-leg" x1="130" y1="150" x2="105" y2="190" stroke="#ff6b9d" stroke-width="3" opacity="0"/>
        <!-- Right leg -->
        <line id="hangman-right-leg" x1="130" y1="150" x2="155" y2="190" stroke="#ff6b9d" stroke-width="3" opacity="0"/>
      </svg>
    `,h.setAttribute(`aria-label`,`Hangman figure`),h.setAttribute(`role`,`img`);let g=document.createElement(`div`);g.style.cssText=`display:flex;gap:8px;flex-wrap:wrap;justify-content:center;min-height:60px;align-items:center;`,g.setAttribute(`aria-live`,`polite`),g.setAttribute(`aria-label`,`Word to guess`);let _=document.createElement(`div`);_.style.cssText=`display:grid;grid-template-columns:repeat(7, 1fr);gap:8px;max-width:500px;width:100%;`,_.setAttribute(`role`,`group`),_.setAttribute(`aria-label`,`Letter keyboard`);let v=document.createElement(`button`);v.textContent=`Give Up`,v.style.cssText=`min-height:44px;min-width:120px;padding:12px 24px;font-size:1rem;background:#666;color:#fff;border:none;border-radius:10px;cursor:pointer;font-weight:600;`,v.addEventListener(`click`,()=>{u||S(!1)}),d.appendChild(f),d.appendChild(p),d.appendChild(m),d.appendChild(h),d.appendChild(g),d.appendChild(_),d.appendChild(v),n.appendChild(d);for(let e=0;e<26;e++){let t=String.fromCharCode(65+e),n=document.createElement(`button`);n.textContent=t,n.dataset.letter=t,n.style.cssText=`
        min-height:44px;
        min-width:44px;
        padding:10px;
        font-size:1.1rem;
        font-weight:bold;
        background:linear-gradient(135deg, #5bd68a 0%, #4db878 100%);
        color:#1a1a1a;
        border:2px solid #4db878;
        border-radius:10px;
        cursor:pointer;
        transition:all 0.2s;
        touch-action:manipulation;
      `,n.setAttribute(`aria-label`,`Letter ${t}`),n.addEventListener(`click`,()=>{u||s.has(t)||x(t)}),_.appendChild(n)}function y(){g.innerHTML=``;for(let e of o){let t=document.createElement(`div`);t.style.cssText=`
          width:40px;
          height:50px;
          display:flex;
          align-items:center;
          justify-content:center;
          font-size:1.5rem;
          font-weight:bold;
          color:#e3ecf5;
          background:${s.has(e)?`#2a4a5a`:`#1a1a1a`};
          border:2px solid #5bd68a;
          border-radius:8px;
        `,t.textContent=s.has(e)?e:``,g.appendChild(t)}}function b(){let e=[`hangman-head`,`hangman-torso`,`hangman-left-arm`,`hangman-right-arm`,`hangman-left-leg`,`hangman-right-leg`];for(let t=0;t<e.length;t++){let n=document.getElementById(e[t]);n&&n.setAttribute(`opacity`,t<c?`1`:`0`)}}function x(e){if(u||s.has(e))return;s.add(e);let t=_.querySelector(`[data-letter="${e}"]`);t&&(o.includes(e)?(t.style.background=`#5bd68a`,t.style.borderColor=`#5bd68a`):(c++,t.style.background=`#ff6b9d`,t.style.borderColor=`#ff6b9d`,t.style.color=`#1a1a1a`),t.style.cursor=`not-allowed`,t.style.opacity=`0.5`,t.disabled=!0),m.textContent=`Wrong: ${c}/6`,b(),y(),c>=6?S(!1):o.split(``).every(e=>s.has(e))&&S(!0)}function S(t){if(u)return;u=!0;let i=Math.floor((Date.now()-l)/1e3),a=0;if(t){a=100;let e=c*8;a-=e;let t=Math.min(i,120)*.5;a-=t,a=Math.max(0,Math.round(a))}let s=e.MinigameScoring?e.MinigameScoring.calculateFinalScore({rawScore:a,minScore:0,maxScore:100,compBeast:.5}):a*10;console.log(`[Hangman] Won: ${t}, Wrong guesses: ${c}, Raw: ${a}, Final: ${Math.round(s)}`);let d=document.createElement(`div`);d.style.cssText=`
        position:fixed;
        top:50%;
        left:50%;
        transform:translate(-50%, -50%);
        background:#1a2a3a;
        padding:30px;
        border-radius:15px;
        border:3px solid ${t?`#5bd68a`:`#ff6b9d`};
        text-align:center;
        z-index:1000;
        min-width:250px;
      `;let f=document.createElement(`div`);f.textContent=t?`🎉 You Won!`:`😞 Game Over`,f.style.cssText=`font-size:1.8rem;color:${t?`#5bd68a`:`#ff6b9d`};margin-bottom:15px;font-weight:bold;`;let p=document.createElement(`div`);p.textContent=`Word: ${o}`,p.style.cssText=`font-size:1.3rem;color:#e3ecf5;margin-bottom:10px;`;let m=document.createElement(`div`);m.textContent=`Score: ${Math.round(s)}`,m.style.cssText=`font-size:1.2rem;color:#83bfff;font-weight:600;`,d.appendChild(f),d.appendChild(p),d.appendChild(m),n.appendChild(d),_.querySelectorAll(`button`).forEach(e=>{e.disabled=!0,e.style.cursor=`not-allowed`,e.style.opacity=`0.5`}),v.disabled=!0,setTimeout(()=>{typeof r==`function`&&r(Math.round(s))},3e3)}y()}e.MinigameModules!==void 0&&typeof e.MinigameModules.register==`function`?e.MinigameModules.register(`hangman`,{render:n}):(e.MinigameModules=e.MinigameModules||{},e.MinigameModules.hangman={render:n},e.MiniGames=e.MiniGames||{},e.MiniGames.hangman={render:n}),console.info(`[Hangman] Module loaded`)})(window);