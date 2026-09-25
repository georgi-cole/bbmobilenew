(function(e){function t(e){this.seed=e||Date.now(),this.next=function(){return this.seed=(this.seed*9301+49297)%233280,this.seed/233280}}function n(e){if(e.length===0)return{path:[],length:0};let t=new Set,n=[0];t.add(0);let i=0;for(;t.size<e.length;){let a=n[n.length-1],o=-1,s=1/0;for(let n=0;n<e.length;n++)if(!t.has(n)){let t=r(e[a],e[n]);t<s&&(s=t,o=n)}o!==-1&&(n.push(o),t.add(o),i+=s)}return i+=r(e[n[n.length-1]],e[0]),{path:n,length:i}}function r(e,t){let n=e.x-t.x,r=e.y-t.y;return Math.sqrt(n*n+r*r)}function i(e,i,a={}){e.innerHTML=``;let{debugMode:o=!1,seed:s}=a,c=new t(s),l=[];for(let e=0;e<12;e++)l.push({x:40+c.next()*320,y:40+c.next()*320,id:e});let u=n(l),d=[],f=0,p=!1,m=!1,h=null,g=document.createElement(`div`);g.style.cssText=`display:flex;flex-direction:column;align-items:center;gap:12px;padding:15px;`;let _=document.createElement(`h3`);_.textContent=`Traveling Dots`,_.style.cssText=`margin:0;font-size:1.4rem;color:#e3ecf5;`;let v=document.createElement(`p`);v.textContent=`Tap all dots in order to create shortest path!`,v.style.cssText=`margin:0;font-size:0.85rem;color:#95a9c0;text-align:center;max-width:400px;`;let y=document.createElement(`div`);y.style.cssText=`display:flex;gap:16px;font-size:0.9rem;`;let b=document.createElement(`div`);b.textContent=`Length: 0`,b.style.cssText=`color:#83bfff;font-weight:600;`;let x=document.createElement(`div`);x.textContent=`Target: ${Math.round(u.length)}`,x.style.cssText=`color:#5bd68a;font-weight:600;`;let S=document.createElement(`div`);S.textContent=`Visited: 0/12`,S.style.cssText=`color:#f7b955;font-weight:600;`,y.appendChild(b),y.appendChild(S),y.appendChild(x);let C=document.createElement(`canvas`);C.width=400,C.height=400,C.style.cssText=`background:#1a1a1a;border:3px solid #5bd68a;border-radius:8px;cursor:crosshair;touch-action:none;max-width:100%;`;let w=C.getContext(`2d`),T=document.createElement(`div`);T.style.cssText=`display:flex;gap:10px;`;let E=document.createElement(`button`);E.textContent=`Undo Last`,E.style.cssText=`
      min-height:44px;
      padding:10px 20px;
      font-size:1rem;
      font-weight:bold;
      background:#666;
      color:#fff;
      border:2px solid #555;
      border-radius:10px;
      cursor:pointer;
    `,E.disabled=!0;let D=document.createElement(`button`);D.textContent=`Finish Tour`,D.style.cssText=`
      min-height:44px;
      padding:10px 20px;
      font-size:1rem;
      font-weight:bold;
      background:linear-gradient(135deg, #5bd68a 0%, #4db878 100%);
      color:#1a1a1a;
      border:2px solid #4db878;
      border-radius:10px;
      cursor:pointer;
    `,D.disabled=!0,T.appendChild(E),T.appendChild(D),g.appendChild(_),g.appendChild(v),g.appendChild(y),g.appendChild(C),g.appendChild(T),e.appendChild(g);function O(){if(w.fillStyle=`#1a1a1a`,w.fillRect(0,0,400,400),o){w.strokeStyle=`rgba(91, 214, 138, 0.2)`,w.lineWidth=1,w.setLineDash([5,5]),w.beginPath();for(let e=0;e<u.path.length;e++){let t=l[u.path[e]];e===0?w.moveTo(t.x,t.y):w.lineTo(t.x,t.y)}w.closePath(),w.stroke(),w.setLineDash([])}if(d.length>0){w.strokeStyle=`#83bfff`,w.lineWidth=3,w.beginPath();for(let e=0;e<d.length;e++){let t=l[d[e]];e===0?w.moveTo(t.x,t.y):w.lineTo(t.x,t.y)}if(w.stroke(),d.length===12){w.setLineDash([5,5]),w.beginPath();let e=l[d[d.length-1]],t=l[d[0]];w.moveTo(e.x,e.y),w.lineTo(t.x,t.y),w.stroke(),w.setLineDash([])}}l.forEach((e,t)=>{let n=d.includes(t),r=t===d[0];w.fillStyle=n?`#5bd68a`:`#ff6b9d`,w.beginPath(),w.arc(e.x,e.y,n?6:8,0,Math.PI*2),w.fill(),r&&(w.strokeStyle=`#f7b955`,w.lineWidth=3,w.beginPath(),w.arc(e.x,e.y,12,0,Math.PI*2),w.stroke()),w.fillStyle=`#e3ecf5`,w.font=`12px Arial`,w.textAlign=`center`,w.textBaseline=`middle`,w.fillText(t+1,e.x,e.y-16)})}function k(e,t){let n=-1,r=20;return l.forEach((i,a)=>{if(!d.includes(a)){let o=Math.sqrt((e-i.x)**2+(t-i.y)**2);o<r&&(r=o,n=a)}}),n}function A(e){if(m)return;p||(p=!0,h=Date.now());let t=C.getBoundingClientRect(),n=C.width/t.width,i=C.height/t.height,a=k((e.clientX-t.left)*n,(e.clientY-t.top)*i);if(a!==-1){if(d.push(a),d.length>1){let e=l[d[d.length-2]],t=l[d[d.length-1]];f+=r(e,t)}if(b.textContent=`Length: ${Math.round(f)}`,S.textContent=`Visited: ${d.length}/12`,E.disabled=!1,d.length===12){let e=l[d[d.length-1]],t=l[d[0]];f+=r(e,t),b.textContent=`Length: ${Math.round(f)}`,D.disabled=!1}O()}}function j(e){if(e.preventDefault(),e.touches.length>0){let t=e.touches[0];A({clientX:t.clientX,clientY:t.clientY})}}function M(){if(d.length!==0){if(d.length===12){let e=l[d[d.length-1]],t=l[d[0]];f-=r(e,t)}if(d.length>1){let e=l[d[d.length-2]],t=l[d[d.length-1]];f-=r(e,t)}d.pop(),b.textContent=`Length: ${Math.round(f)}`,S.textContent=`Visited: ${d.length}/12`,d.length===0&&(E.disabled=!0),D.disabled=!0,O()}}function N(){if(d.length!==12)return;m=!0;let t=(Date.now()-h)/1e3,n=u.length/f,r=n*100,a=Math.min(t/2,15);r-=a,r=Math.max(0,Math.min(100,Math.round(r)));let o=document.createElement(`div`);o.style.cssText=`
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
      `;let s=document.createElement(`div`);s.textContent=`🎯 Tour Complete!`,s.style.cssText=`font-size:1.8rem;color:#5bd68a;margin-bottom:15px;font-weight:bold;`;let c=document.createElement(`div`);c.innerHTML=`
        <div style="color:#83bfff;font-size:1.1rem;margin-bottom:6px;">Your length: ${Math.round(f)}</div>
        <div style="color:#5bd68a;font-size:1.1rem;margin-bottom:6px;">Target: ${Math.round(u.length)}</div>
        <div style="color:#f7b955;font-size:1.1rem;margin-bottom:12px;">Efficiency: ${(n*100).toFixed(1)}%</div>
      `;let l=document.createElement(`div`);l.textContent=`Score: ${r}`,l.style.cssText=`font-size:1.3rem;color:#5bd68a;font-weight:600;`,o.appendChild(s),o.appendChild(c),o.appendChild(l),e.appendChild(o),setTimeout(()=>{typeof i==`function`&&i(r)},3500)}C.addEventListener(`click`,A),C.addEventListener(`touchstart`,j),E.addEventListener(`click`,M),D.addEventListener(`click`,N),O()}e.MinigameModules!==void 0&&typeof e.MinigameModules.register==`function`?e.MinigameModules.register(`travelingDots`,{render:i}):(e.MinigameModules=e.MinigameModules||{},e.MinigameModules.travelingDots={render:i},e.MiniGames=e.MiniGames||{},e.MiniGames.travelingDots={render:i}),console.info(`[TravelingDots] Module loaded`)})(window);