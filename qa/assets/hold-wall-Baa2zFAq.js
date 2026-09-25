(function(e){function t(t,n,r={}){let i=document.createElement(`div`);i.style.cssText=`position:relative;display:grid;grid-template-rows:auto 1fr auto;height:100%;min-height:480px;background:linear-gradient(180deg,#0d1424,#0f1a2e);color:#e8f3ff;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;overflow:hidden;`;let a=`instructions`,o=0,s=0,c=null,l=[],u=!1,d=!1,f=[],p=!1,m=null,ee=[200,100,200,100,200],h=null,g=[],_=[],v=[],y=null,b={start:[`Alright houseguests, grip that wall like your life depends on it... because it kinda does! 💪`,`Welcome to the wall of pain! Hope you all had a good breakfast! 🏋️`,`Time to see who's got the strength... and who's got the noodle arms! 🍝`],holding:[`You're doing great! Your arms definitely won't regret this tomorrow... 😅`,`Look at you, still hanging on! Literally! 🤩`,`The wall loves you... the wall won't let you go... 👻`,`Your grip strength is impressive! Have you been opening jars? 🫙`],someone_dropped:[`{name} has hit the ground! That's gonna leave a mark! 💥`,`And {name} is out! Don't worry, we have ice packs! 🧊`,`{name} couldn't hold on! The wall claims another victim! 😱`,`There goes {name}! Gravity: 1, Houseguest: 0! 🪂`],difficulty:[`Oh no! Production is spraying water! 💦`,`Someone turned on the wind machine! Hold tight! 🌪️`,`The wall is starting to tilt! This is getting spicy! 🌶️`,`Is that paint? Oh yes, it's paint time! 🎨`,`The wall is vibrating! Earthquake mode activated! 📳`,`Incoming call! Just kidding, focus on the wall! 📞`],final_two:[`We're down to TWO! This is getting intense! 🔥`,`Mano a mano! Who wants it more?! 💪`,`Two houseguests, one wall, zero mercy! 😤`],victory:[`WE HAVE A WINNER! What an incredible performance! 🏆`,`VICTORY! Your arms may be dead but your spirit is alive! 🎉`,`CHAMPION! You've conquered the wall! 👑`],loss:[`And you're down! Great effort though! 💔`,`Gravity wins this round! Better luck next time! 🌍`,`The wall claims another victim! At least you tried! 😢`]},x=`hoh`;if(e.game&&e.game.phase){let t=e.game.phase;x=t===`veto_comp`||t===`veto`||t===`pov`?`pov`:`hoh`,console.log(`[HoldWall] Detected competition type: ${x} (phase: ${t})`)}function S(){let t=e.game&&e.game.players?e.game.players.filter(e=>!e.evicted):[];if(x===`hoh`){let n=e.game&&e.game.week||1,r=e.game&&e.game.lastHOHId,i=e.game&&e.game.lastHOHWeek;t.length>3&&n>1&&r&&i===n-1&&(t=t.filter(e=>e.id!==r),console.log(`[HoldWall] Excluding previous HOH (id: ${r})`))}l=t.map(t=>({id:t.id,name:t.name,isPlayer:t.human||t.isPlayer||!1,dropTimeMs:null,avatarUrl:e.resolveAvatar?e.resolveAvatar(t):null,personalDropTime:t.human||t.isPlayer?null:1e4+Math.random()*11e4})),console.log(`[HoldWall] ${l.length} participants for ${x} competition`)}S();let C=document.createElement(`div`);C.style.cssText=`position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(10,15,30,0.95);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;z-index:100;`,C.innerHTML=`
      <h2 style="margin:0 0 16px;font-size:1.8rem;color:#83bfff;">Hold the Wall</h2>
      <div style="max-width:400px;text-align:center;line-height:1.6;color:#95a9c0;margin-bottom:24px;">
        <p style="margin:0 0 12px;">Press and hold the wall for as long as you can!</p>
        <p style="margin:0 0 12px;"><strong style="color:#e8f3ff;">Click and HOLD</strong> the wall panel</p>
        <p style="margin:0 0 12px;"><strong style="color:#ff6b9d;">Don't let go</strong> - releasing means you drop!</p>
        <p style="margin:0;">Last person standing wins!</p>
      </div>
      <button id="startBtn" style="padding:12px 32px;font-size:1.1rem;background:#83bfff;color:#0b1020;border:none;border-radius:8px;cursor:pointer;font-weight:600;touch-action:manipulation;">
        START GAME
      </button>
    `,i.appendChild(C);let w=document.createElement(`div`);w.style.cssText=`position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(10,15,30,0.9);display:none;flex-direction:column;align-items:center;justify-content:center;z-index:99;`,w.innerHTML=`
      <div id="countdownText" style="font-size:6rem;font-weight:bold;color:#83bfff;">3</div>
    `,i.appendChild(w);let T=document.createElement(`div`);T.style.cssText=`display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:16px;background:rgba(10,15,30,0.8);backdrop-filter:blur(4px);`,T.innerHTML=`
      <div style="text-align:center;">
        <div style="font-size:0.75rem;color:#95a9c0;text-transform:uppercase;margin-bottom:4px;">Elapsed</div>
        <div id="timeDisplay" style="font-size:1.3rem;font-weight:600;color:#83bfff;">0.0s</div>
      </div>
      <div style="text-align:center;">
        <div style="font-size:0.75rem;color:#95a9c0;text-transform:uppercase;margin-bottom:4px;">Remaining</div>
        <div id="remainingDisplay" style="font-size:1.3rem;font-weight:600;color:#83bfff;">${l.length}</div>
      </div>
    `,i.appendChild(T);let E=document.createElement(`div`);E.id=`narrativeBox`,E.style.cssText=`padding:12px 16px;background:linear-gradient(135deg,rgba(131,191,255,0.15),rgba(131,191,255,0.05));border-left:4px solid #83bfff;margin:0 16px;font-size:0.95rem;color:#e8f3ff;line-height:1.4;min-height:60px;display:flex;align-items:center;font-style:italic;`,E.textContent=`Get ready to hold on for dear life...`,i.appendChild(E);let D=document.createElement(`div`);D.style.cssText=`position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;`;let O=document.createElement(`div`);O.id=`participantsDisplay`,O.style.cssText=`display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin-bottom:30px;max-width:600px;`;function k(){O.innerHTML=l.map(e=>{let t=e.dropTimeMs!==null,n=t?`opacity:0.3;filter:grayscale(100%);`:``;return`
          <div style="text-align:center;">
            <div style="width:60px;height:60px;border-radius:50%;border:3px solid ${e.isPlayer?`#83bfff`:`#555`};overflow:hidden;background:#1a2a3a;${n}">
              ${e.avatarUrl?`<img src="${e.avatarUrl}" alt="${e.name}" style="width:100%;height:100%;object-fit:cover;">`:`<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:1.5rem;color:#83bfff;">${e.name[0]}</div>`}
            </div>
            <div style="font-size:0.75rem;margin-top:4px;color:${t?`#666`:`#95a9c0`};">${e.name}</div>
          </div>
        `}).join(``)}k(),D.appendChild(O);let A=document.createElement(`div`);A.id=`wallPanel`,A.style.cssText=`
      width:100%;max-width:400px;height:200px;
      background:linear-gradient(135deg,#2a4a5a 0%,#3a5a6a 25%,#2a3a4a 50%,#3a5a6a 75%,#2a4a5a 100%);
      background-size:200% 200%;
      border:6px solid #3a5a6a;
      border-radius:12px;
      display:flex;align-items:center;justify-content:center;
      font-size:3.5rem;font-weight:900;
      cursor:grab;user-select:none;
      transition:all 0.3s cubic-bezier(0.4,0,0.2,1);
      box-shadow:
        0 8px 32px rgba(0,0,0,0.7),
        inset 0 2px 4px rgba(255,255,255,0.1),
        inset 0 -2px 4px rgba(0,0,0,0.3);
      position:relative;overflow:hidden;
      text-shadow:0 4px 12px rgba(0,0,0,0.9),0 2px 4px rgba(0,0,0,0.7);
      letter-spacing:0.2em;
      animation:wallPulse 3s ease-in-out infinite;
    `;let j=document.createElement(`div`);j.style.cssText=`
      position:absolute;inset:0;
      background:
        /* Horizontal mortar lines */
        repeating-linear-gradient(
          0deg,
          transparent 0px,
          transparent 38px,
          rgba(0,0,0,0.3) 38px,
          rgba(0,0,0,0.3) 40px
        ),
        /* Vertical mortar lines (offset pattern for brick effect) */
        repeating-linear-gradient(
          90deg,
          transparent 0px,
          transparent 78px,
          rgba(0,0,0,0.25) 78px,
          rgba(0,0,0,0.25) 80px
        ),
        /* Brick texture detail */
        repeating-linear-gradient(
          90deg,
          transparent 0px,
          rgba(255,255,255,0.02) 1px,
          transparent 2px,
          transparent 8px
        );
      pointer-events:none;
      opacity:0.8;
    `,A.appendChild(j);let M=document.createElement(`div`);M.textContent=`WALL`,M.style.cssText=`position:relative;z-index:1;color:#e8f3ff;`,A.appendChild(M),D.appendChild(A);let N=document.createElement(`style`);N.textContent=`
      @keyframes wallPulse {
        0%, 100% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
      }
      @keyframes wallShake {
        0%, 100% { transform: translateX(0) scale(0.98); }
        25% { transform: translateX(-3px) scale(0.98); }
        75% { transform: translateX(3px) scale(0.98); }
      }
      @keyframes flashScreen {
        0%, 100% { opacity: 0; }
        50% { opacity: 0.3; }
      }
      @keyframes slideDown {
        from { transform: translateX(-50%) translateY(-100px); opacity: 0; }
        to { transform: translateX(-50%) translateY(0); opacity: 1; }
      }
    `,i.appendChild(N);let P=document.createElement(`div`);P.id=`statusMsg`,P.style.cssText=`margin-top:20px;font-size:1.1rem;color:#95a9c0;text-align:center;min-height:30px;`,P.textContent=`Click START to begin`,D.appendChild(P),i.appendChild(D);let F=document.createElement(`div`);F.style.cssText=`position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(10,15,30,0.95);display:none;flex-direction:column;align-items:center;justify-content:center;padding:20px;z-index:98;`,F.innerHTML=`
      <div style="text-align:center;max-width:500px;">
        <h2 style="margin:0 0 20px;font-size:2rem;color:#83bfff;">Competition Complete!</h2>
        <div style="font-size:1.2rem;color:#95a9c0;margin-bottom:30px;">
          <div style="margin:10px 0;">Time: <span id="finalTime" style="color:#e8f3ff;font-weight:600;">0s</span></div>
          <div style="margin:10px 0;">Score: <span id="finalScore" style="color:#e8f3ff;font-weight:600;">0</span></div>
        </div>
        <div id="standingsContainer" style="margin-top:20px;"></div>
      </div>
    `,i.appendChild(F),t.appendChild(i);let I=i.querySelector(`#startBtn`);function L(){a=`countdown`,C.style.display=`none`,w.style.display=`flex`;let e=3,t=i.querySelector(`#countdownText`),n=setInterval(()=>{e--,e>0?t.textContent=e:(t.textContent=`GO!`,setTimeout(()=>{w.style.display=`none`,R()},500),clearInterval(n))},1e3)}function R(){a=`playing`,s=Date.now(),z(b.start),U(),te(),Q();function e(){if(d||a!==`playing`)return;let t=8e3+Math.random()*7e3;h=setTimeout(()=>{d||a!==`playing`||(u&&Math.random()>.5&&z(b.holding),e())},t)}e(),m=setTimeout(()=>{if(!p&&!d&&a===`playing`){console.log(`[HoldWall] ⚠️ AFK DETECTION: Grace period expired - human never started holding, auto-dropping`);let e=l.find(e=>e.isPlayer);if(e&&e.dropTimeMs===null){let t=Date.now()-s;e.dropTimeMs=t,f.push({name:e.name,timeMs:t,isPlayer:!0}),A.style.cursor=`not-allowed`,A.style.opacity=`0.5`,A.style.filter=`grayscale(100%)`,A.style.pointerEvents=`none`,P.textContent=`You were dropped for being AFK!`,P.style.color=`#ff4444`,z([`You never held the wall! What were you thinking?! 😱`]),console.log(`[HoldWall] ✓ AFK Player dropped at ${(t/1e3).toFixed(1)}s - will NOT be eligible to win`),console.log(`[HoldWall] ✓ Wall disabled - human cannot interact after AFK drop`),G()}}else p&&console.log(`[HoldWall] ✓ Grace period check: Human started holding, no AFK drop needed`)},3e3)}function z(e){if(!e||e.length===0)return;let t=e[Math.floor(Math.random()*e.length)],n=i.querySelector(`#narrativeBox`);n&&(n.textContent=t,n.style.transform=`scale(1.02)`,y&&clearTimeout(y),y=setTimeout(()=>{n&&n.parentNode&&(n.style.transform=`scale(1)`),y=null},200))}function te(){[{time:15e3,action:ne,message:`Oh no! Production is spraying water! 💦`},{time:3e4,action:re,message:`Someone turned on the wind machine! Hold tight! 🌪️`},{time:45e3,action:ie,message:`The wall is vibrating! Earthquake mode! 📳`},{time:6e4,action:B,message:`The wall is starting to tilt! 🌶️`},{time:75e3,action:V,message:`Bright lights! Don't let go! ✨`},{time:9e4,action:H,message:`Incoming call! Just kidding! Focus! 📞`}].forEach(e=>{let t=setTimeout(()=>{!d&&a===`playing`&&(z([e.message]),e.action())},e.time);g.push(t)})}function ne(){A.style.filter=`blur(1px) brightness(0.9)`;let e=setTimeout(()=>{a===`playing`&&(A.style.filter=`none`)},3e3);v.push(e)}function re(){A.style.transform=u?`scale(0.98) rotate(-2deg)`:`rotate(-2deg)`;let e=setTimeout(()=>{a===`playing`&&(A.style.transform=u?`scale(0.98)`:`scale(1)`)},4e3);v.push(e)}function ie(){navigator.vibrate&&navigator.vibrate(ee),A.style.animation=`wallShake 0.5s ease-in-out 5`;let e=setTimeout(()=>{a===`playing`&&(A.style.animation=`wallPulse 3s ease-in-out infinite`)},2500);v.push(e)}function B(){A.style.transform=u?`scale(0.98) rotate(3deg)`:`rotate(3deg)`;let e=setTimeout(()=>{a===`playing`&&(A.style.transform=u?`scale(0.98)`:`scale(1)`)},5e3);v.push(e)}function V(){let e=document.createElement(`div`);e.style.cssText=`position:absolute;inset:0;background:white;z-index:50;animation:flashScreen 0.5s ease-out;pointer-events:none;`,i.appendChild(e);let t=setTimeout(()=>e.remove(),500);v.push(t)}function H(){let e=document.createElement(`div`);e.style.cssText=`position:absolute;top:80px;left:50%;transform:translateX(-50%);background:#000;color:#fff;padding:12px 20px;border-radius:12px;font-size:0.9rem;z-index:60;box-shadow:0 4px 20px rgba(0,0,0,0.6);animation:slideDown 0.3s ease-out;`,e.innerHTML=`📞 Mom is calling...`,i.appendChild(e);let t=setTimeout(()=>e.remove(),3e3);v.push(t)}function U(){l.forEach(e=>{if(!e.isPlayer&&e.personalDropTime){let t=setTimeout(()=>{!d&&a===`playing`&&e.dropTimeMs===null&&W(e)},e.personalDropTime);_.push(t)}})}function W(e){if(!e||e.dropTimeMs!==null)return;let t=Date.now()-s;e.dropTimeMs=t,f.push({name:e.name,timeMs:t,isPlayer:e.isPlayer}),console.log(`[HoldWall] ${e.name} dropped at ${(t/1e3).toFixed(1)}s`),e.isPlayer||z(b.someone_dropped.map(t=>t.replace(`{name}`,e.name))),k(),$(),l.filter(e=>e.dropTimeMs===null).length===2&&z(b.final_two),G()}function G(){let e=l.filter(e=>e.dropTimeMs===null);if(e.length===1){let t=e[0];console.log(`[HoldWall] Last person standing: ${t.name} (isPlayer: ${t.isPlayer})`),t.isPlayer?Y():X()}else e.length===0&&X()}function K(e){if(a!==`playing`||d)return;let t=l.find(e=>e.isPlayer);if(t&&t.dropTimeMs!==null){console.log(`[HoldWall] Ignoring click - human was already dropped for AFK`);return}e.preventDefault(),u||(u=!0,p=!0,A.style.background=`linear-gradient(135deg,#3a6a8a 0%,#4a7a9a 25%,#3a5a7a 50%,#4a7a9a 75%,#3a6a8a 100%)`,A.style.transform=`scale(0.98)`,A.style.cursor=`grabbing`,A.style.borderColor=`#66ff66`,P.textContent=`Keep holding!`,console.log(`[HoldWall] ✓ Human started holding - AFK prevention successful`),m&&(clearTimeout(m),m=null,console.log(`[HoldWall] ✓ Grace period timer cleared - human is active`)))}function q(e){a!==`playing`||d||u&&ae()}function J(){m&&=(clearTimeout(m),null),h&&=(clearTimeout(h),null),y&&=(clearTimeout(y),null),g.forEach(clearTimeout),g=[],_.forEach(clearTimeout),_=[],v.forEach(clearTimeout),v=[],c&&=(cancelAnimationFrame(c),null)}function ae(){if(d)return;u=!1;let e=l.filter(e=>e.dropTimeMs===null);if(e.length===1&&e[0].isPlayer){console.log(`[HoldWall] Human is last standing - VICTORY!`),Y();return}let t=Date.now()-s,n=l.find(e=>e.isPlayer);n&&(n.dropTimeMs=t,f.push({name:n.name,timeMs:t,isPlayer:!0}),console.log(`[HoldWall] Player dropped at ${(t/1e3).toFixed(1)}s`),z(b.loss)),A.style.background=`linear-gradient(135deg,#2a4a5a 0%,#3a5a6a 25%,#2a3a4a 50%,#3a5a6a 75%,#2a4a5a 100%)`,A.style.transform=`scale(1)`,A.style.borderColor=`#ff6b6b`,P.textContent=`You released!`,k(),$(),G()}function Y(){if(d)return;d=!0,J();let e=Date.now()-s;console.log(`[HoldWall] Player wins! Held for ${(e/1e3).toFixed(1)}s`),z(b.victory),P.textContent=`YOU WIN!`,P.style.color=`#66ff66`,P.style.fontSize=`2rem`,A.style.borderColor=`#66ff66`;let t=l.find(e=>e.isPlayer);if(t){t.dropTimeMs=e;let n=[{name:t.name,timeMs:e,score:100,isPlayer:!0}];f.reverse().forEach(e=>{n.push({...e,score:0})}),Z(n,e)}}function X(){if(a===`end`)return;a=`end`;let e=Date.now()-s,t=l.filter(e=>e.dropTimeMs===null),n=l.filter(e=>e.dropTimeMs!==null);n.sort((e,t)=>t.dropTimeMs-e.dropTimeMs);let r=[...t.map(t=>({name:t.name,timeMs:e,score:100,isPlayer:t.isPlayer})),...n.map((e,n)=>({name:e.name,timeMs:e.dropTimeMs,score:t.length===0&&n===0?100:0,isPlayer:e.isPlayer}))];console.log(`[HoldWall] Final standings:`,r.map(e=>`${e.name}: ${e.score}`).join(`, `)),Z(r,e)}function Z(t,r){i.querySelector(`#finalTime`).textContent=`${(r/1e3).toFixed(1)}s`,i.querySelector(`#finalScore`).textContent=t[0].score;let a=t.slice(0,5).map((e,t)=>{let n=t+1,r=n===1?`🥇`:n===2?`🥈`:n===3?`🥉`:``;return`
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px;margin:5px 0;background:rgba(44,58,77,0.3);border-radius:6px;${e.isPlayer?`border:2px solid #83bfff;`:``}">
            <span style="font-weight:600;color:#e8f3ff;">${r} ${n}. ${e.name}</span>
            <span style="color:#95a9c0;">${(e.timeMs/1e3).toFixed(1)}s</span>
          </div>
        `}).join(``);if(i.querySelector(`#standingsContainer`).innerHTML=a,F.style.display=`flex`,e.lastCompScores){let n=new Map(l.map(e=>[e.name,e]));t.forEach(t=>{let r=n.get(t.name);r&&r.id!==void 0&&e.lastCompScores.set(r.id,t.score)})}e.dispatchEvent(new CustomEvent(`minigame:end`,{detail:{game:`hold-wall`,score:t[0].score,standings:t}})),setTimeout(()=>{typeof n==`function`&&n(t[0].score)},2e3)}function Q(){a!==`playing`||d||(o=Date.now()-s,Math.floor(o/100),oe(),c=requestAnimationFrame(Q))}function oe(){i.querySelector(`#timeDisplay`).textContent=`${(o/1e3).toFixed(1)}s`}function $(){let e=l.filter(e=>e.dropTimeMs===null).length;i.querySelector(`#remainingDisplay`).textContent=e}I.addEventListener(`click`,L),A.addEventListener(`mousedown`,K),A.addEventListener(`touchstart`,K),document.addEventListener(`mouseup`,q),document.addEventListener(`touchend`,q)}e.MiniGames||={},e.MiniGames.holdWall={render:t}})(window);