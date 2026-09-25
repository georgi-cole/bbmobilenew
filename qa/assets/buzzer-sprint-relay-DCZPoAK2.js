(function(e){let t=1500,n=[`#ff6b6b`,`#74e48b`,`#6fd3ff`,`#f7b955`,`#a78bfa`];function r(e,r,i={}){e.innerHTML=``;let{debugMode:a=!1,competitionMode:o=!1}=i,s=document.createElement(`div`);s.style.cssText=`display:flex;flex-direction:column;align-items:center;gap:16px;padding:20px;width:100%;max-width:600px;margin:0 auto;`;let c=document.createElement(`h3`);c.textContent=`Buzzer Sprint Relay`,c.style.cssText=`margin:0;font-size:1.3rem;color:#e3ecf5;`;let l=document.createElement(`div`);l.style.cssText=`position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);z-index:10000;display:flex;align-items:center;justify-content:center;`;let u=document.createElement(`div`);u.style.cssText=`background:#1d2734;padding:30px;border-radius:12px;max-width:400px;text-align:center;`,u.innerHTML=`
      <h2 style="color:#6fd3ff;margin:0 0 20px 0;">How to Play</h2>
      <p style="color:#e3ecf5;margin:10px 0;line-height:1.6;">
        • Watch the sequence of buzzer buttons light up<br>
        • Memorize the order<br>
        • Tap the buzzers in the same order as fast as you can<br>
        • Wrong taps add +${t/1e3}s penalty<br>
        • 3 rounds with increasing difficulty<br>
        • <strong>Lowest total time wins!</strong>
      </p>
      <button id="startGameBtn" class="btn primary" style="margin-top:20px;padding:12px 32px;font-size:1.1rem;">START GAME</button>
    `,l.appendChild(u),document.body.appendChild(l);let d=document.createElement(`div`);d.style.cssText=`display:flex;justify-content:space-between;width:100%;font-size:0.9rem;`;let f=document.createElement(`div`);f.style.cssText=`color:#83bfff;`,f.textContent=`Round: 1/3`;let p=document.createElement(`div`);p.style.cssText=`color:#f7b955;font-size:1.1rem;font-weight:bold;`,p.textContent=`0.0s`;let m=document.createElement(`div`);m.style.cssText=`color:#ff6b6b;`,m.textContent=`Mistakes: 0`,d.appendChild(f),d.appendChild(p),d.appendChild(m);let h=document.createElement(`div`);h.style.cssText=`font-size:0.9rem;color:#95a9c0;text-align:center;min-height:24px;`,h.textContent=`Watch carefully...`;let g=document.createElement(`div`);g.style.cssText=`display:grid;grid-template-columns:repeat(3, 1fr);gap:16px;width:100%;max-width:400px;margin:20px 0;`;let _=document.createElement(`div`);_.style.cssText=`width:100%;background:#1a2332;border-radius:6px;padding:12px;font-size:0.85rem;color:#95a9c0;`,s.appendChild(c),s.appendChild(d),s.appendChild(h),s.appendChild(g),s.appendChild(_),e.appendChild(s);let v=!1,y=0,b=0,x=0,S=[],C=0,w=0,T=[],E=[],D=!1,O=[],k=5,A=4,j=900,M=null;function N(){g.innerHTML=``,O=[];for(let e=0;e<k;e++){let t=document.createElement(`div`);t.style.cssText=`
          width:100%;
          aspect-ratio:1;
          border-radius:12px;
          background:#2c3a4d;
          border:3px solid ${n[e%n.length]};
          display:flex;
          align-items:center;
          justify-content:center;
          font-size:2rem;
          font-weight:bold;
          color:${n[e%n.length]};
          cursor:pointer;
          user-select:none;
          transition:all 0.2s;
        `,t.textContent=e+1,t.dataset.index=e,t.addEventListener(`click`,()=>R(e)),t.addEventListener(`touchstart`,e=>{e.preventDefault(),D&&(t.style.transform=`scale(0.95)`)}),t.addEventListener(`touchend`,n=>{n.preventDefault(),t.style.transform=`scale(1)`,R(e)}),g.appendChild(t),O.push(t)}}function P(e,t){return new Promise(r=>{let i=O[e],a=i.style.background;i.style.background=n[e%n.length],i.style.boxShadow=`0 0 20px ${n[e%n.length]}`,i.style.transform=`scale(1.05)`,setTimeout(()=>{i.style.background=a,i.style.boxShadow=`none`,i.style.transform=`scale(1)`,r()},t)})}function F(){T=[];for(let e=0;e<A;e++)T.push(Math.floor(Math.random()*k))}async function I(){D=!1,h.textContent=`Watch the sequence...`;for(let e=0;e<T.length;e++)await P(T[e],j),await new Promise(e=>setTimeout(e,200));h.textContent=`Now repeat it - GO!`,D=!0,x=Date.now(),M=setInterval(L,50)}function L(){D&&(p.textContent=((Date.now()-x+b)/1e3).toFixed(1)+`s`)}function R(e){if(!D||!v)return;E.push(e);let t=O[e];t.style.background=n[e%n.length],t.style.boxShadow=`0 0 20px ${n[e%n.length]}`,setTimeout(()=>{t.style.background=`#2c3a4d`,t.style.boxShadow=`none`},200);let r=E.length-1;if(T[r]!==e){z();return}E.length===T.length&&B()}function z(){if(w++,C++,m.textContent=`Mistakes: ${w}`,b+=t,g.style.background=`#ff3366`,setTimeout(()=>{g.style.background=`transparent`},200),h.textContent=`Wrong! +${t/1e3}s penalty`,h.style.color=`#ff6b6b`,setTimeout(()=>{h.style.color=`#95a9c0`},1e3),w>=5){V();return}E=[]}function B(){D=!1,M&&clearInterval(M);let e=Date.now()-x;b+=e,S.push(e/1e3),h.textContent=`Round complete! Time: ${(e/1e3).toFixed(1)}s`,h.style.color=`#74e48b`,setTimeout(()=>{h.style.color=`#95a9c0`,y++,y<3?H():U()},2e3)}function V(){D=!1,M&&clearInterval(M);let e=3e4;b+=e,h.textContent=`Round failed! +${e/1e3}s penalty`,h.style.color=`#ff6b6b`,setTimeout(()=>{h.style.color=`#95a9c0`,y++,y<3?H():U()},2e3)}function H(){w=0,E=[],f.textContent=`Round: ${y+1}/3`,m.textContent=`Mistakes: 0`,y===1?(A=5,j=700):y===2&&(A=6,j=500,k=6,N()),F(),setTimeout(()=>{I()},1e3)}function U(){v=!1,M&&clearInterval(M);let e=b/1e3,t=S.reduce((e,t)=>Math.min(e,t),1/0),n=T.length>0?Math.round((T.length*3-C)/(T.length*3)*100):0,i=Math.max(0,1-(e-30)/120),a=Math.max(0,Math.floor(i*1e3));_.innerHTML=`
        <div style="text-align:center;">
          <div style="font-size:1.2rem;color:#6fd3ff;margin-bottom:10px;">Game Over!</div>
          <div>Total Time: <strong style="color:#f7b955;">${e.toFixed(1)}s</strong></div>
          <div>Score: <strong style="color:#83bfff;">${a}</strong></div>
          <div>Total Mistakes: ${C}</div>
          <div>Best Round: ${t.toFixed(1)}s</div>
          <div>Accuracy: ${n}%</div>
        </div>
      `,p.textContent=e.toFixed(1)+`s`,p.style.color=`#74e48b`,window.minigameResult={score:a,totalTime:e,totalMistakes:C,bestRoundTime:t,accuracy:n},window.dispatchEvent(new CustomEvent(`minigame:end`,{detail:{score:a,stats:window.minigameResult}})),setTimeout(()=>{typeof r==`function`&&r(a)},2e3)}document.getElementById(`startGameBtn`).addEventListener(`click`,()=>{document.body.removeChild(l);let e=document.createElement(`div`);e.style.cssText=`position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);font-size:4rem;color:#6fd3ff;z-index:1000;`,document.body.appendChild(e);let t=3;e.textContent=t;let n=setInterval(()=>{t--,t>0?e.textContent=t:(e.textContent=`GO!`,clearInterval(n),setTimeout(()=>{document.body.removeChild(e),W()},500))},1e3)});function W(){v=!0,y=0,b=0,C=0,S=[],N(),H()}}e.MiniGames===void 0&&(e.MiniGames={}),e.MiniGames.buzzerSprintRelay={render:r}})(window);