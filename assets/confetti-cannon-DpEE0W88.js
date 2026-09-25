(function(e){let t=6e4,n=2e3,r=1500,i=[{name:`Red`,hex:`#ff3366`,lightHex:`#ff6b6b`},{name:`Blue`,hex:`#3366ff`,lightHex:`#6b8fff`},{name:`Green`,hex:`#33ff66`,lightHex:`#74e48b`},{name:`Yellow`,hex:`#ffcc33`,lightHex:`#f7b955`},{name:`Purple`,hex:`#9933ff`,lightHex:`#a78bfa`},{name:`Orange`,hex:`#ff6633`,lightHex:`#ff8c5a`}];function a(e,t,n){let r=[`#ff6b6b`,`#6fd3ff`,`#74e48b`,`#f7b955`,`#a78bfa`];for(let i=0;i<12;i++){let a=document.createElement(`div`);a.style.cssText=`
        position:absolute;
        left:${e}px;
        top:${t}px;
        width:6px;
        height:6px;
        background:${r[Math.floor(Math.random()*r.length)]};
        border-radius:50%;
        pointer-events:none;
        z-index:1000;
      `,n.appendChild(a);let o=Math.PI*2*i/12,s=50+Math.random()*50,c=Math.cos(o)*s,l=Math.sin(o)*s,u=e,d=t,f=0,p=()=>{f+=16,u+=c*.016,d+=l*.016+f*.3,a.style.left=u+`px`,a.style.top=d+`px`,a.style.opacity=Math.max(0,1-f/600),f<600?requestAnimationFrame(p):n.removeChild(a)};p()}}function o(e,o,s={}){e.innerHTML=``;let{debugMode:c=!1,competitionMode:l=!1}=s,u=document.createElement(`div`);u.style.cssText=`display:flex;flex-direction:column;align-items:center;gap:16px;padding:20px;width:100%;max-width:600px;margin:0 auto;`;let d=document.createElement(`h3`);d.textContent=`Confetti Cannon`,d.style.cssText=`margin:0;font-size:1.3rem;color:#e3ecf5;`;let f=document.createElement(`div`);f.style.cssText=`position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);z-index:10000;display:flex;align-items:center;justify-content:center;`;let p=document.createElement(`div`);p.style.cssText=`background:#1d2734;padding:30px;border-radius:12px;max-width:400px;text-align:center;`,p.innerHTML=`
      <h2 style="color:#6fd3ff;margin:0 0 20px 0;">How to Play</h2>
      <p style="color:#e3ecf5;margin:10px 0;line-height:1.6;">
        • Tap targets that match the <strong>required color</strong><br>
        • The required color changes every 5 seconds<br>
        • Wrong color targets give penalties<br>
        • Build combos with consecutive correct hits<br>
        • Targets disappear quickly - be fast!<br>
        • Game gets faster and harder over time<br>
        • Don't tap too fast or you'll overheat<br>
        • 60 seconds to get the highest score
      </p>
      <button id="startGameBtn" class="btn primary" style="margin-top:20px;padding:12px 32px;font-size:1.1rem;">START GAME</button>
    `,f.appendChild(p),document.body.appendChild(f);let m=document.createElement(`div`);m.style.cssText=`display:flex;justify-content:space-between;width:100%;font-size:0.9rem;`;let h=document.createElement(`div`);h.style.cssText=`color:#83bfff;`,h.textContent=`Score: 0`;let g=document.createElement(`div`);g.style.cssText=`color:#74e48b;font-weight:bold;`,g.textContent=`Combo: 0x`;let _=document.createElement(`div`);_.style.cssText=`color:#f7b955;`,_.textContent=`60s`,m.appendChild(h),m.appendChild(g),m.appendChild(_);let v=document.createElement(`div`);v.style.cssText=`display:flex;align-items:center;justify-content:center;gap:12px;padding:12px 20px;background:#2c3a4d;border-radius:8px;width:100%;`;let y=document.createElement(`div`);y.style.cssText=`color:#95a9c0;font-size:0.9rem;font-weight:bold;`,y.textContent=`TAP THIS COLOR:`;let b=document.createElement(`div`);b.style.cssText=`width:32px;height:32px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 12px rgba(0,0,0,0.5);`;let x=document.createElement(`div`);x.style.cssText=`font-size:1.1rem;font-weight:bold;color:#fff;`,v.appendChild(y),v.appendChild(b),v.appendChild(x);let S=document.createElement(`div`);S.style.cssText=`position:relative;width:100%;height:400px;background:#0a1420;border:2px solid #2c3a4d;border-radius:8px;overflow:hidden;touch-action:none;`;let C=document.createElement(`div`);C.style.cssText=`position:absolute;top:10px;left:50%;transform:translateX(-50%);padding:8px 16px;background:#ff3366;color:#fff;border-radius:6px;font-weight:bold;display:none;z-index:2000;`,C.textContent=`OVERHEATED!`,S.appendChild(C);let w=document.createElement(`div`);w.style.cssText=`width:100%;background:#1a2332;border-radius:6px;padding:12px;font-size:0.85rem;color:#95a9c0;`,u.appendChild(d),u.appendChild(m),u.appendChild(v),u.appendChild(S),u.appendChild(w),e.appendChild(u);let T=!1,E=0,D=0,O=0,k=0,A=0,j=0,M=0,N=0,P=[],F=null,I=null,L=[],R=[],z=!1,B=n,V=r,H=i[0];function U(){b.style.background=H.hex,b.style.borderColor=H.lightHex,b.style.boxShadow=`0 0 16px ${H.hex}`,x.textContent=H.name,x.style.color=H.lightHex}U();function W(){if(!T)return;let e=S.getBoundingClientRect(),t=Math.random()*(e.width-50),n=Math.random()*(e.height-50),r=R.filter(e=>Math.sqrt((e.x-t)**2+(e.y-n)**2)<80&&Date.now()-e.time<5e3).length>=5,a=Date.now()-D,o=Math.random()<(r?.4:.6),s;if(o)s=H;else{let e=i.filter(e=>e.name!==H.name);s=e[Math.floor(Math.random()*e.length)]}let c=document.createElement(`div`);c.style.cssText=`
        position:absolute;
        left:${t}px;
        top:${n}px;
        width:50px;
        height:50px;
        border-radius:50%;
        background:${s.hex};
        border:3px solid ${s.lightHex};
        box-shadow:0 0 12px ${s.hex};
        cursor:pointer;
        display:flex;
        align-items:center;
        justify-content:center;
        font-size:1.5rem;
        transition:transform 0.1s;
        z-index:100;
      `,c.textContent=`✓`,S.appendChild(c);let l={div:c,x:t,y:n,color:s,isCorrectColor:o,spawnTime:Date.now(),lifetime:B};P.push(l),N++,c.addEventListener(`click`,e=>{e.stopPropagation(),G(l)}),a>3e4&&(l.velocity={vx:(Math.random()-.5)*2,vy:(Math.random()-.5)*2})}function G(e){if(!T||z)return;let t=Date.now();if(L=L.filter(e=>t-e<1e3),L.push(t),L.length>8){K();return}R.push({x:e.x,y:e.y,time:t}),R=R.filter(e=>t-e.time<5e3);let n=P.indexOf(e);if(n!==-1&&(P.splice(n,1),S.removeChild(e.div)),!e.isCorrectColor)E=Math.max(0,E-5),O=0,M++,S.style.background=`#ff3366`,setTimeout(()=>{S.style.background=`#0a1420`},100),S.style.transform=`translateX(-5px)`,setTimeout(()=>{S.style.transform=`translateX(5px)`,setTimeout(()=>{S.style.transform=`translateX(0)`},50)},50);else{O++,k=Math.max(k,O);let t=Math.floor(10*1.5**Math.min(O-1,5));E+=t,A++,a(e.x+50/2,e.y+50/2,S);let n=document.createElement(`div`);n.textContent=`+${t}`,n.style.cssText=`
          position:absolute;
          left:${e.x}px;
          top:${e.y}px;
          color:${H.lightHex};
          font-weight:bold;
          font-size:1.2rem;
          pointer-events:none;
          z-index:500;
        `,S.appendChild(n);let r=e.y,i=()=>{r-=2,n.style.top=r+`px`,n.style.opacity=Math.max(0,1-(e.y-r)/50),e.y-r<50?requestAnimationFrame(i):S.removeChild(n)};i()}h.textContent=`Score: ${E}`,g.textContent=`Combo: ${O}x`,g.style.fontSize=O>5?`1.2rem`:`0.9rem`}function K(){z=!0,C.style.display=`block`,setTimeout(()=>{z=!1,C.style.display=`none`},500)}function q(){if(!T)return;let e=Date.now()-D,r=Math.max(0,t-e);_.textContent=`${Math.ceil(r/1e3)}s`;let i=e/t;B=Math.max(800,n-i*(n-800));for(let e=P.length-1;e>=0;e--){let t=P[e],n=Date.now()-t.spawnTime;if(t.velocity){let e=S.getBoundingClientRect();t.x+=t.velocity.vx,t.y+=t.velocity.vy,(t.x<=0||t.x>=e.width-50)&&(t.velocity.vx*=-1),(t.y<=0||t.y>=e.height-50)&&(t.velocity.vy*=-1),t.x=Math.max(0,Math.min(e.width-50,t.x)),t.y=Math.max(0,Math.min(e.height-50,t.y)),t.div.style.left=t.x+`px`,t.div.style.top=t.y+`px`}let r=t.lifetime*.7;if(n>r){let e=1-(n-r)/(t.lifetime-r);t.div.style.opacity=e}n>t.lifetime&&(t.isCorrectColor&&(j++,O=0,g.textContent=`Combo: 0x`),S.removeChild(t.div),P.splice(e,1))}if(r<=0){J();return}F=requestAnimationFrame(q)}function J(){T=!1,F&&cancelAnimationFrame(F),I&&clearInterval(I),P.forEach(e=>{e.div.parentNode===S&&S.removeChild(e.div)}),P=[];let e=N>0?Math.round(A/N*100):0,t=Math.max(0,E);w.innerHTML=`
        <div style="text-align:center;">
          <div style="font-size:1.2rem;color:#6fd3ff;margin-bottom:10px;">Game Over!</div>
          <div>Final Score: <strong style="color:#83bfff;">${t}</strong></div>
          <div>Accuracy: ${e}%</div>
          <div>Max Combo: ${k}x</div>
          <div>Correct Hits: ${A}</div>
          <div>Wrong Color Hits: ${M}</div>
        </div>
      `,window.minigameResult={score:t,accuracy:e,maxCombo:k,targetsHit:A,wrongColorHits:M},window.dispatchEvent(new CustomEvent(`minigame:end`,{detail:{score:t,stats:window.minigameResult}})),setTimeout(()=>{typeof o==`function`&&o(t)},2e3)}document.getElementById(`startGameBtn`).addEventListener(`click`,()=>{document.body.removeChild(f);let e=document.createElement(`div`);e.style.cssText=`position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:4rem;color:#6fd3ff;z-index:1000;`,S.appendChild(e);let t=3;e.textContent=t;let n=setInterval(()=>{t--,t>0?e.textContent=t:(e.textContent=`GO!`,clearInterval(n),setTimeout(()=>{S.removeChild(e),Y()},500))},1e3)});function Y(){T=!0,D=Date.now(),H=i[Math.floor(Math.random()*i.length)],U(),I=setInterval(()=>{let e=i.filter(e=>e.name!==H.name);H=e[Math.floor(Math.random()*e.length)],U(),v.style.transform=`scale(1.1)`,setTimeout(()=>{v.style.transform=`scale(1)`},200)},5e3);function e(){if(!T)return;let n=Date.now()-D,i=n/t;V=Math.max(600,r-i*(r-600));let a=n>3e4?2:1;for(let e=0;e<a;e++)W();T&&setTimeout(e,V)}W(),e(),q()}}e.MiniGames===void 0&&(e.MiniGames={}),e.MiniGames.confettiCannon={render:o}})(window);