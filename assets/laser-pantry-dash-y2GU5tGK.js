(function(e){let t=1200,n=.25,r=[{name:`🍎`,correct:!0},{name:`🍌`,correct:!0},{name:`🥕`,correct:!0},{name:`🍞`,correct:!0},{name:`🥛`,correct:!0},{name:`🍕`,correct:!0},{name:`🍰`,correct:!0},{name:`🥗`,correct:!0},{name:`🍔`,correct:!1},{name:`🍟`,correct:!1},{name:`🌭`,correct:!1},{name:`🍿`,correct:!1},{name:`🍩`,correct:!1},{name:`🍪`,correct:!1},{name:`🧁`,correct:!1},{name:`🍫`,correct:!1}];function i(){let e=r.filter(e=>e.correct),t=[],n=new Set;for(;t.length<3;){let r=Math.floor(Math.random()*e.length);n.has(r)||(t.push(e[r]),n.add(r))}return t}function a(e,a,o={}){e.innerHTML=``;let{debugMode:s=!1,competitionMode:c=!1}=o,l=document.createElement(`div`);l.style.cssText=`display:flex;flex-direction:column;align-items:center;gap:16px;padding:20px;width:100%;max-width:600px;margin:0 auto;`;let u=document.createElement(`h3`);u.textContent=`Laser Pantry Dash`,u.style.cssText=`margin:0;font-size:1.3rem;color:#e3ecf5;`;let d=document.createElement(`div`);d.style.cssText=`position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);z-index:10000;display:flex;align-items:center;justify-content:center;`;let f=document.createElement(`div`);f.style.cssText=`background:#1d2734;padding:30px;border-radius:12px;max-width:400px;text-align:center;`,f.innerHTML=`
      <h2 style="color:#6fd3ff;margin:0 0 20px 0;">How to Play</h2>
      <p style="color:#e3ecf5;margin:10px 0;line-height:1.6;">
        • Drag your avatar to collect recipe ingredients<br>
        • Watch for laser <strong>warnings</strong> before sweeps<br>
        • Dodge the laser beams - they have safe gaps!<br>
        • Collect items matching the recipe for points<br>
        • Wrong items give penalties<br>
        • Laser hits give penalties and eventually cost lives<br>
        • Recipe changes at 30 seconds!
      </p>
      <button id="startGameBtn" class="btn primary" style="margin-top:20px;padding:12px 32px;font-size:1.1rem;">START GAME</button>
    `,d.appendChild(f),document.body.appendChild(d);let p=document.createElement(`div`);p.style.cssText=`display:flex;justify-content:space-between;width:100%;font-size:0.9rem;`;let m=document.createElement(`div`);m.style.cssText=`color:#ff6b6b;`,m.textContent=`Lives: 3`;let h=document.createElement(`div`);h.style.cssText=`color:#83bfff;`,h.textContent=`Score: 0`;let g=document.createElement(`div`);g.style.cssText=`color:#f7b955;`,g.textContent=`60s`,p.appendChild(m),p.appendChild(h),p.appendChild(g);let _=document.createElement(`div`);_.style.cssText=`background:#2c3a4d;padding:12px;border-radius:8px;width:100%;text-align:center;`;let v=document.createElement(`div`);v.textContent=`Recipe:`,v.style.cssText=`color:#95a9c0;font-size:0.8rem;margin-bottom:6px;`;let y=document.createElement(`div`);y.style.cssText=`font-size:1.8rem;`,_.appendChild(v),_.appendChild(y);let b=document.createElement(`div`);b.style.cssText=`position:relative;width:100%;height:350px;background:#0a1420;border:2px solid #2c3a4d;border-radius:8px;overflow:hidden;touch-action:none;`;let x=document.createElement(`style`);x.textContent=`
      @keyframes pulse {
        0%, 100% { opacity: 0.4; }
        50% { opacity: 0.8; }
      }
      @keyframes blink {
        0%, 100% { opacity: 0.3; }
        50% { opacity: 1; }
      }
    `,document.head.appendChild(x);let S=document.createElement(`div`);S.style.cssText=`position:absolute;width:20px;height:20px;border-radius:50%;background:#6fd3ff;box-shadow:0 0 12px #6fd3ff;z-index:100;`,b.appendChild(S);let C=document.createElement(`div`);C.style.cssText=`width:100%;background:#1a2332;border-radius:6px;padding:12px;font-size:0.85rem;color:#95a9c0;`,l.appendChild(u),l.appendChild(p),l.appendChild(_),l.appendChild(b),l.appendChild(C),e.appendChild(l);let w=!1,T=3,E=0,D=i(),O=!1,k=0,A=0,j=0,M=0,N=0,P=0,F=0,I=0,L=Date.now(),R=0,z=0,B=0,V=0,H=[],U=null,W=!1,G=0,K,q;function J(){y.innerHTML=D.map(e=>e.name).join(` `)}J();function Y(){if(!w)return;let e=b.getBoundingClientRect(),t=Date.now()-L>3e3,n,i,a=0;do{n=Math.random()*(e.width-24),i=Math.random()*(e.height-24);let r=Math.sqrt((n-B)**2+(i-V)**2);if(a++,!t||r>60||a>10)break}while(a<20);let o=Math.random()<.65,s;if(o)s=D[Math.floor(Math.random()*D.length)];else{let e=r.filter(e=>!e.correct);s=e[Math.floor(Math.random()*e.length)]}let c=document.createElement(`div`);c.textContent=s.name,c.style.cssText=`position:absolute;left:${n}px;top:${i}px;width:24px;height:24px;font-size:1.5rem;z-index:50;`,c.dataset.correct=o,b.appendChild(c),H.push({div:c,x:n,y:i,correct:o,name:s.name})}function X(){if(!w)return;let e=b.getBoundingClientRect(),r=Math.random()<.5,i=document.createElement(`div`);if(i.classList.add(`laser-telegraph`),r){let r=Math.random()*e.height;i.style.cssText=`
          position:absolute;
          left:0;
          top:${r}px;
          width:100%;
          height:8px;
          background:rgba(255, 200, 0, 0.3);
          border:1px dashed #ffcc00;
          z-index:85;
          animation:pulse 0.3s ease-in-out infinite;
        `,b.appendChild(i),setTimeout(()=>{if(!w){i.parentNode&&b.removeChild(i);return}b.removeChild(i);let a=e.width*n,o=Math.random()*(e.width-a),s=document.createElement(`div`);s.classList.add(`laser-beam`),s.style.cssText=`
            position:absolute;
            left:0;
            top:${r-2}px;
            width:0;
            height:4px;
            background:linear-gradient(90deg, transparent, #ff3366, #ff3366);
            box-shadow:0 0 12px #ff3366;
            z-index:90;
          `,b.appendChild(s);let c=document.createElement(`div`);c.classList.add(`laser-beam`),c.style.cssText=`
            position:absolute;
            left:${o+a}px;
            top:${r-2}px;
            width:0;
            height:4px;
            background:linear-gradient(90deg, #ff3366, #ff3366, transparent);
            box-shadow:0 0 12px #ff3366;
            z-index:90;
          `,b.appendChild(c);let l=0,u=Date.now(),d=null,f=()=>{if(!w){s.parentNode&&b.removeChild(s),c.parentNode&&b.removeChild(c);return}if(l=Math.min(1,(Date.now()-u)/t),s.style.width=o*l+`px`,c.style.width=(e.width-o-a)*l+`px`,!W&&Date.now()>G){let e=V+20/2,t=Math.abs(e-r)<14,n=B+20/2,i=n>=o&&n<=o+a;t&&!i?(d===null&&(d=Date.now()),Date.now()-d>350&&(Z(),d=null)):d=null}l<1?requestAnimationFrame(f):(s.parentNode&&b.removeChild(s),c.parentNode&&b.removeChild(c))};f()},700)}else{let r=Math.random()*e.width;i.style.cssText=`
          position:absolute;
          left:${r}px;
          top:0;
          width:8px;
          height:100%;
          background:rgba(255, 200, 0, 0.3);
          border:1px dashed #ffcc00;
          z-index:85;
          animation:pulse 0.3s ease-in-out infinite;
        `,b.appendChild(i),setTimeout(()=>{if(!w){i.parentNode&&b.removeChild(i);return}b.removeChild(i);let a=e.height*n,o=Math.random()*(e.height-a),s=document.createElement(`div`);s.classList.add(`laser-beam`),s.style.cssText=`
            position:absolute;
            left:${r-2}px;
            top:0;
            width:4px;
            height:0;
            background:linear-gradient(180deg, transparent, #ff3366, #ff3366);
            box-shadow:0 0 12px #ff3366;
            z-index:90;
          `,b.appendChild(s);let c=document.createElement(`div`);c.classList.add(`laser-beam`),c.style.cssText=`
            position:absolute;
            left:${r-2}px;
            top:${o+a}px;
            width:4px;
            height:0;
            background:linear-gradient(180deg, #ff3366, #ff3366, transparent);
            box-shadow:0 0 12px #ff3366;
            z-index:90;
          `,b.appendChild(c);let l=0,u=Date.now(),d=null,f=()=>{if(!w){s.parentNode&&b.removeChild(s),c.parentNode&&b.removeChild(c);return}if(l=Math.min(1,(Date.now()-u)/t),s.style.height=o*l+`px`,c.style.height=(e.height-o-a)*l+`px`,!W&&Date.now()>G){let e=B+20/2,t=Math.abs(e-r)<14,n=V+20/2,i=n>=o&&n<=o+a;t&&!i?(d===null&&(d=Date.now()),Date.now()-d>350&&(Z(),d=null)):d=null}l<1?requestAnimationFrame(f):(s.parentNode&&b.removeChild(s),c.parentNode&&b.removeChild(c))};f()},700)}}function Z(){if(!W){if(N++,E=Math.max(0,E-10),I=0,b.style.background=`#ff9933`,setTimeout(()=>{b.style.background=`#0a1420`},150),N>=2){if(T--,M++,N=0,H.forEach(e=>{e.div.parentNode&&b.removeChild(e.div)}),H=[],m.textContent=`Lives: ${T}`,W=!0,G=Date.now()+800,S.style.opacity=`0.5`,S.style.animation=`blink 0.2s ease-in-out infinite`,setTimeout(()=>{W=!1,S.style.opacity=`1`,S.style.animation=``},800),T<=0){te();return}B=b.clientWidth/2-20/2,V=b.clientHeight/2-20/2,S.style.left=B+`px`,S.style.top=V+`px`}h.textContent=`Score: ${E}`}}function ee(){for(let e=H.length-1;e>=0;e--){let t=H[e];Math.sqrt((B-t.x)**2+(V-t.y)**2)<20&&(b.removeChild(t.div),H.splice(e,1),D.some(e=>e.name===t.name)?(E+=10,A++,P=0,I++,F=Math.max(F,I)):(E=Math.max(0,E-(P>=3?10:5)),j++,P++,I=0),h.textContent=`Score: ${E}`)}}function Q(){if(!w)return;let e=Date.now()-k,t=Math.max(0,6e4-e);if(g.textContent=`${Math.ceil(t/1e3)}s`,e>=3e4&&!O&&(O=!0,D=i(),J(),_.style.background=`#ff6b6b`,setTimeout(()=>{_.style.background=`#2c3a4d`},300)),ee(),t<=0){te();return}U=requestAnimationFrame(Q)}function te(){w=!1,U&&cancelAnimationFrame(U),clearInterval(K),clearInterval(q);let e=Math.max(0,E);C.innerHTML=`
        <div style="text-align:center;">
          <div style="font-size:1.2rem;color:#6fd3ff;margin-bottom:10px;">Game Over!</div>
          <div>Final Score: <strong style="color:#83bfff;">${e}</strong></div>
          <div>Laser Hits: ${M}</div>
          <div>Correct Items: ${A}</div>
          <div>Wrong Items: ${j}</div>
          <div>Best Combo: ${F}</div>
        </div>
      `,window.minigameResult={score:e,laserHits:M,correctItems:A,wrongItems:j,bestCombo:F},window.dispatchEvent(new CustomEvent(`minigame:end`,{detail:{score:e,stats:window.minigameResult}})),setTimeout(()=>{typeof a==`function`&&a(e)},2e3)}document.getElementById(`startGameBtn`).addEventListener(`click`,()=>{document.body.removeChild(d);let e=document.createElement(`div`);e.style.cssText=`position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:4rem;color:#6fd3ff;z-index:1000;`,b.appendChild(e);let t=3;e.textContent=t;let n=setInterval(()=>{t--,t>0?e.textContent=t:(e.textContent=`GO!`,clearInterval(n),setTimeout(()=>{b.removeChild(e),ne()},500))},1e3)});function ne(){w=!0,k=Date.now(),B=b.clientWidth/2-20/2,V=b.clientHeight/2-20/2,S.style.left=B+`px`,S.style.top=V+`px`,R=B,z=V,K=setInterval(()=>{Y()},2e3),q=setInterval(()=>{X()},4e3),Y(),Y(),setTimeout(()=>{X()},2e3),Q()}let $=!1;function re(e){e.preventDefault(),$=!0}function ie(e){if(!$||!w)return;e.preventDefault();let t=e.touches?e.touches[0]:e,n=b.getBoundingClientRect(),r=t.clientX-n.left-20/2,i=t.clientY-n.top-20/2;B=Math.max(0,Math.min(n.width-20,r)),V=Math.max(0,Math.min(n.height-20,i)),S.style.left=B+`px`,S.style.top=V+`px`,Math.sqrt((B-R)**2+(V-z)**2)>10&&(L=Date.now(),R=B,z=V)}function ae(e){$=!1}b.addEventListener(`touchstart`,re),b.addEventListener(`touchmove`,ie),b.addEventListener(`touchend`,ae),b.addEventListener(`mousedown`,re),b.addEventListener(`mousemove`,ie),b.addEventListener(`mouseup`,ae)}e.MiniGames===void 0&&(e.MiniGames={}),e.MiniGames.laserPantryDash={render:a}})(window);