import{i as e,n as t,r as n,s as r,t as i}from"./replacement-timing-CKjZNpVa.js";import{t as a}from"./SoundManager-CqGLuvpv.js";import{n as o,r as s,t as c}from"./finale-closing-brand-C3JgWP-5.js";var l=(e,t,n)=>{let r=e[t]?.cloneNode();return r?(r.className=n,r.alt=``,r.draggable=!1,r):null},u=e=>`${e*100}%`;function d(e,n,r){let a={},o=new Set([...(n.actionHistory??[]).flatMap(e=>i(n,e.actorId)),...i(n,n.decision?.actorId)]);for(let i of o){let o=e[i];if(!o)continue;let s=t(n,i)&&o.poses[`royal-seated`],c=s?`replacement-authority-${i}`:`replacement-holder-${i}`,l=s?`royal-seated`:o.poses[`decision-back`]?`decision-back`:`front`;if(a[c]={...o.poses[l],character:o.id,pose:l},s)for(let e of[`royal-room.webp`,`throne.webp`,`crown.webp`])r[e]&&(a[e]={src:`assets/ceremonies/shared/${e}`,...r[e]})}return[...o].some(e=>t(n,e)&&n.safetyHolderIds?.includes(e))&&(a.replacementShield={src:`assets/ceremonies/shared/safety-shield-reveal.webp`,...r[`safety-shield-reveal.webp`]}),a}function f(e,t,n,r,a){let o=i(r,a).filter(e=>n[e]),s=document.createElement(`div`);if(s.className=`replacement-decision-figure royal-unit${o.length>1?` is-paired`:``}`,o.forEach((e,r)=>{let i=n[e].poses[`royal-seated`],a=document.createElement(`div`);a.className=`royal-member`,a.dataset.actorId=e,a.style.setProperty(`--royal-index`,r);let o=l(t,`throne.webp`,`replacement-decision-throne`);o&&i?.throne&&(o.style.transform=`translate(${u(i.throne.x)},${u(i.throne.y)}) scale(${i.throne.scale})`,a.append(o));let c=l(t,`replacement-authority-${e}`,`replacement-decision-person`);c&&a.append(c);let d=l(t,`crown.webp`,`replacement-decision-crown`);if(d&&i?.crown){let{x:e,baseY:t,width:n,angle:r}=i.crown;d.style.cssText=`left:${u(e-n/2)};top:${u(t-n*i.width/i.height*44/144*.88)};width:${u(n)};transform:rotate(${r}deg)`,a.append(d)}s.append(a)}),e.append(s),o.some(e=>r.safetyHolderIds?.includes(e))&&t.replacementShield){let n=document.createElement(`div`);n.className=`royal-safety-plinth${o.length>1?` is-paired`:``}`;let r=document.createElement(`i`);r.className=`royal-safety-halo`,n.append(r,l(t,`replacementShield`,`royal-safety-shield`)),e.append(n)}return o}function p(e,t=!1){let n=Object.values(e).filter((e,t,n)=>n.findIndex(t=>(t.playerId??t.id)===(e.playerId??e.id))===t).slice(0,t?2:1).map(e=>e.playerId??e.id);return{owner:`replacement`,variant:`ordinary`,actionHistory:[],decisionOnly:!0,decision:{actorId:n[0],kind:`use`},leaderIds:n,safetyHolderIds:n,authorityPairs:n.length>1?[{id:`shared-crown`,memberIds:n}]:[],durationMs:5600}}function m(e){return Object.fromEntries(Object.values(e).map(e=>[e.playerId??e.id,e]))}var h={shockMist:{src:`assets/ceremonies/vfx/natural-mist-v2.webp`,width:960,height:320,bytes:70978},shockHeart:{src:`assets/ceremonies/vfx/rose-glass-heart-v1.webp`,width:256,height:256,bytes:13992},shockHalo:{src:`assets/ceremonies/vfx/champagne-halo-v1.webp`,width:384,height:192,bytes:15012},shockDna:{src:`assets/ceremonies/vfx/amethyst-dna-v1.webp`,width:192,height:384,bytes:24944},shockBallot:{src:`assets/ceremonies/vfx/obsidian-ballot-box-v1.webp`,width:256,height:256,bytes:10990},shockAntidote:{src:`assets/ceremonies/vfx/jade-antidote-v1.webp`,width:256,height:384,bytes:18230},shockForce:{src:`assets/ceremonies/vfx/pressure-wave-v1.webp`,width:512,height:512,bytes:99334}};function g(e,n,r){return t(e,n)?i(e,n).length>1?`LEADERS OF THE HUB`:`LEADER OF THE HUB`:r===`mission`||e.variant===`mission`?`MISSION POWER`:`POWER OF SAFETY`}function _(e,r,i,a){let o=a.decisionOnly?[{...a.decision,index:0,actions:[],showAuthority:!0,royal:t(a,a.decision?.actorId)}]:n(a);for(let n of o){let s=i[n.actorId],c=s&&t(a,n.actorId);if(s&&n.showAuthority){let t=document.createElement(`section`);t.className=`replacement-decision-shot ${c?`is-royal`:`is-over-shoulder`}`,t.dataset.beatIndex=String(n.index),t.dataset.actorId=n.actorId;let u=!c&&a.openingNomineeIds?.includes(n.actorId);u&&t.classList.add(`is-self-save`);let d=[n.actorId];if(c){t.append(l(r,r[`royal-room.webp`]?`royal-room.webp`:`replacementSet`,`replacement-decision-backdrop`));let e=document.createElement(`div`);e.className=`replacement-decision-shade`,t.append(e),d=f(t,r,i,a,n.actorId)}else if(!u){let e=document.createElement(`div`);e.className=`replacement-holder-foreground`,e.style.setProperty(`--holder-head-x`,s.poses[`decision-back`]?.crown?.x??.4),e.append(l(r,`replacement-holder-${n.actorId}`,`replacement-holder-back`));let i=document.createElement(`i`);i.className=`replacement-holder-shadow`,t.append(i,e)}let p=document.createElement(`div`);p.className=`replacement-decision-label`;let m=document.createElement(`span`);m.textContent=g(a,n.actorId,n.actions[0]?.actorRole);let h=document.createElement(`strong`);h.textContent=d.map(e=>i[e]?.name).join(` & `);let _=document.createElement(`em`),v=a.powerType??a.variant,y=(a.safetyUseNumber??0)+o.slice(0,n.index+1).filter(e=>e.kind===`save`).length;_.textContent=a.decisionOnly?`THE CONFESSIONAL AWAITS YOUR DECISION`:n.kind===`decline`?`THE NOMINATIONS WILL STAND`:n.kind===`save`?[`doubleTrouble`,`vip`].includes(v)?`DOUBLE TROUBLE · ${y>1?`SECOND`:`FIRST`} USE`:[`detox`,`coup`].includes(v)?`DETOX · THE BLOCK WILL BE RESET`:`A SAFETY DECISION`:a.initialNomination?`${i[n.actorId]?.name} IS MAKING THEIR NOMINATION`:`A PLACE ON THE BLOCK MUST BE FILLED`;let b=document.createElement(`i`);b.className=`replacement-decision-line`,p.append(m,h,_,b),t.append(p),e.append(t)}let u=n.reveals??[];for(let[t,r]of u.entries()){let o=document.createElement(`div`);o.className=`replacement-beat-caption`,o.dataset.beatIndex=String(n.index),o.dataset.revealIndex=String(t);let s=document.createElement(`span`),c=document.createElement(`strong`),l=document.createElement(`em`),d=r.action,f=n.kind===`save`||a.pairUnits?.some(e=>n.actions.every(t=>e.memberIds.includes(t.playerId)))?n.actions.map(e=>i[e.playerId]?.name).join(` & `):i[d.playerId]?.name;if(s.textContent=n.kind===`decline`?`POWER NOT USED`:n.kind===`save`?`SAFETY USED`:a.initialNomination?`NOMINATION CEREMONY`:a.variant===`vox`?`THE ORIGINAL SECRET BALLOT`:`REPLACEMENT NOMINATION`,c.textContent=n.kind===`decline`?`The nominations stand.`:n.kind===`save`?`${f} — safe.`:`${f} — nominated.`,l.textContent=a.variant===`vox`&&d.kind===`replacement`?d.ballotRank?`${d.tiedRank?`TIED `:``}BALLOT RANK #${d.ballotRank} · NEXT ELIGIBLE NOMINEE`:`NEXT ELIGIBLE NOMINEE FROM THE SECRET BALLOT`:d.kind===`replacement`&&n.actorId?`CHOSEN BY ${i[n.actorId]?.name}`:``,o.append(s,c,l),e.append(o),n.kind===`save`||u[t+1]?.at===r.at)break}}}var v={ordinary:`REPLACEMENT NOMINATION`,halo:`HALO EXCHANGE`,force:`FORCE MAJEURE`,mission:`THE BACKUP CHOICE`,coLoh:`THE CO-LEADER’S CHOICE`,detox:`DETOX · THE BLOCK IS RESET`,doubleTrouble:`DOUBLE TROUBLE`,vox:`VOX POPULI · REPLACEMENT NOMINATION`,cupid:`CUPID · LINKED BY FATE`},y=e=>[...new Set(e.filter(Boolean))],b=e=>e.variant===`cupid`&&e.pairUnits?.length>0;function x(e,t,n){let r=t.replacementOutcome,i=r.variant===`vox`?`vox-studio.webp`:`danger-chamber.webp`,a={replacementSet:{src:`assets/ceremonies/shared/${i}`,...n[i]},replacementPlatform:{src:`assets/ceremonies/shared/danger-platform.webp`,...n[`danger-platform.webp`]}};r.variant===`halo`&&(a.replacementShield={src:`assets/ceremonies/shared/safety-shield-reveal.webp`,...n[`safety-shield-reveal.webp`]});let o=y([...r.continuingNomineeIds,...r.replacementIds,...r.openingNomineeIds,...(r.actionHistory??[]).filter(e=>e.kind===`replacement`).map(e=>e.playerId)]);for(let t of o){let n=e[t];n?.poses?.front&&(a[`replacement-body-${t}`]={...n.poses.front,character:n.id,pose:`front`})}return Object.assign(a,d(e,r,n)),a.replacementMist=h.shockMist,a}function S(e,t,n){let r=e[t]?.cloneNode();if(!r)throw Error(`Missing replacement artwork: ${t}`);return r.className=n,r.alt=``,r.draggable=!1,r}function C(e,t){return t<=1?{left:28,width:44,platformBottom:33.4}:t===2?{left:e===0?3:53,width:44,platformBottom:33.4}:{left:1+e*34,width:31,platformBottom:35.3}}function w(e){if(b(e)){let t=Math.max(1,Math.ceil(Math.max(e.slotCount??0,e.openingNomineeIds.length,e.nomineeIds.length,...(e.actionHistory??[]).map(e=>e.slotIndex+1))/2)),n=Array.from({length:t},(e,t)=>({index:t,pair:{id:`open-${t}`,memberIds:[],color:`#d6b96f`},openingIds:[],finalIds:[]}));for(let t of e.pairUnits){let r=t.memberIds.filter(t=>e.openingNomineeIds.includes(t));if(!r.length)continue;let i=Math.min(...r.map(t=>e.openingSlots?.[t]??e.openingNomineeIds.indexOf(t))),a=n[Math.floor(i/2)];a&&(a.pair=t,a.openingIds=r,a.finalIds=r.filter(t=>e.nomineeIds.includes(t)))}for(let t of e.pairUnits.filter(t=>t.memberIds.some(t=>e.replacementIds.includes(t)))){let r=e.actionHistory?.find(e=>e.kind===`replacement`&&t.memberIds.includes(e.playerId)),i=r?n[Math.floor(r.slotIndex/2)]:n.find(e=>!e.finalIds.length);i?.finalIds.length&&!i.finalIds.some(e=>t.memberIds.includes(e))&&(i=n.find(e=>!e.finalIds.length)),i&&(i.pair=t,i.finalIds=t.memberIds.filter(t=>e.nomineeIds.includes(t)))}return n}let t=Math.max(1,e.slotCount??0,e.openingNomineeIds.length,e.nomineeIds.length),n=(e.actionHistory??[]).map(e=>e.slotIndex+1),r=Math.max(t,...n),i=Array.from({length:r},(t,n)=>({index:n,openingIds:e.openingNomineeIds.filter((t,r)=>(e.openingSlots?.[t]??r)===n),finalIds:[]})),a=Array(r).fill(null);e.openingNomineeIds.forEach((t,n)=>{let i=e.openingSlots?.[t]??n;i<r&&(a[i]=t)});for(let t of e.actionHistory??[]){let e=a.indexOf(t.playerId);e<0&&(e=Number.isInteger(t.slotIndex)?t.slotIndex:a.indexOf(null)),(e<0||e>=r)&&(e=a.indexOf(null)),e<0&&(e=Math.max(0,r-1)),t.kind===`save`?a[e]=null:t.kind===`replacement`&&(a[e]=t.playerId)}for(let t of e.nomineeIds){if(a.includes(t))continue;let n=e.openingNomineeIds.indexOf(t);(n<0||a[n])&&(n=a.indexOf(null)),n<0&&(n=i.findIndex(e=>!e.finalIds.length)),n>=0&&(a[n]=t)}a.forEach((t,n)=>{t&&e.nomineeIds.includes(t)&&i[n].finalIds.push(t)});for(let t of e.nomineeIds){if(i.some(e=>e.finalIds.includes(t)))continue;let e=i.find(e=>!e.finalIds.length);e&&e.finalIds.push(t)}return i}function T(e,t,n,r,i,a=0,o=1,s){let c=i[t];if(!c||!r[`replacement-body-${t}`])return;let l=document.createElement(`div`);l.className=`replacement-person replacement-person-${n}`,l.dataset.actorId=t,l.dataset.role=n,l.dataset.pairIndex=String(a),l.dataset.pairCount=String(o),l.style.setProperty(`--pair-index`,String(a)),l.style.setProperty(`--pair-count`,String(o));let u=C(Number(e.dataset.slotIndex),Number(e.dataset.count));l.style.setProperty(`--slot-width`,`${u.width}cqw`),l.style.aspectRatio=`${c.poses.front.width} / ${c.poses.front.height}`;let d=S(r,`replacement-body-${t}`,`replacement-body`),f=Number.isFinite(c.poses.front.feetY)?c.poses.front.feetY:.94762;d.style.setProperty(`--feet-y`,`${f*100}%`);let p=document.createElement(`span`);p.className=`replacement-person-name`,p.textContent=c.name;let m=s?.coLohAssignments?.find(e=>e.nomineeId===t);if(m&&i[m.coLohId]){let e=document.createElement(`small`);e.textContent=`${i[m.coLohId].name}’S NOMINEE`,p.append(e)}l.append(d,p),e.append(l)}function E(e,t,n,r,i,a){let o=document.createElement(`div`);if(o.className=`replacement-slot${e.pair?` replacement-pair-slot`:``}`,o.dataset.slotIndex=String(e.index),o.dataset.count=String(t),e.pair){o.dataset.pairId=e.pair.id;let t=/^#[\da-f]{3,8}$/i.test(e.pair.color??``)?e.pair.color:`#d6b96f`;o.style.setProperty(`--pair-accent`,t)}let s=e.pair&&t===2?{left:e.index===0?1:51,width:48}:C(e.index,t);o.style.setProperty(`--slot-left`,`${s.left}%`),o.style.setProperty(`--slot-width`,`${s.width}cqw`),o.style.setProperty(`--platform-surface-offset`,`${s.width*(64/400)}cqw`),o.style.setProperty(`--platform-rim-offset`,`${s.width*(16/400)}cqw`),o.append(S(r,`replacementPlatform`,`replacement-platform`));let c=document.createElement(`i`);c.className=`replacement-platform-rim`,c.setAttribute(`aria-hidden`,`true`),o.append(c);let l=document.createElement(`i`);l.className=`replacement-contact`,l.setAttribute(`aria-hidden`,`true`),o.append(l);let u=document.createElement(`i`);u.className=`replacement-reveal-light`,u.setAttribute(`aria-hidden`,`true`),o.append(u);let d=!!n.actionHistory?.some(e=>e.kind===`save`),f=new Set((n.actionHistory??[]).filter(e=>e.kind===`save`).map(e=>e.playerId)),p=e.openingIds.filter(e=>n.continuingNomineeIds.includes(e)||d&&f.has(e)),m=y([...(n.actionHistory??[]).filter(t=>t.kind===`replacement`&&(b(n)?Math.floor(t.slotIndex/2)===e.index:t.slotIndex===e.index)).map(e=>e.playerId),...e.finalIds.filter(e=>n.replacementIds.includes(e))]),h=e.pair?.memberIds.length??1;return p.forEach(e=>T(o,e,`opening`,r,i,a.get(e)??0,h,n)),m.forEach(e=>T(o,e,`incoming`,r,i,a.get(e)??0,h,n)),o}function ee(e,t){let n=t.replacementIds.map(t=>e[t]?.name).filter(Boolean),r=n.length>1?`${n.slice(0,-1).join(`, `)} and ${n.at(-1)}`:n[0];return n.length?t.variant===`detox`?`The block has been reset.`:t.variant===`doubleTrouble`&&t.actionHistory?.filter(e=>e.kind===`save`).length>1?`Two saves. A changed block.`:t.variant===`cupid`?`Nominated together.`:t.variant===`coLoh`?`${e[t.chooserId]?.name??`The co-leader`} names ${r}.`:t.variant===`force`?`Safety is used. ${r} ${n.length===1?`joins`:`join`} the block.`:t.variant===`mission`?`The backup is chosen: ${r}.`:t.variant===`halo`?`${r} ${n.length===1?`takes`:`take`} the open place.`:(t.variant,n.length===1?`${r} joins the block.`:`${r} join the block.`):`The nominations stand.`}function te(e,t,n){let r=document.createElement(`div`);r.className=`c-scene replacement-film replacement-${n.variant}`,r.setAttribute(`aria-hidden`,`true`),r.dataset.variant=n.variant,n.decisionOnly&&r.classList.add(`replacement-decision-wait`);let i=document.createElement(`div`);i.className=`replacement-camera`,i.append(S(e,`replacementSet`,`replacement-set`));let a=document.createElement(`div`);a.className=`replacement-room-light`,i.append(a);let o=document.createElement(`div`);o.className=`replacement-block`;let s=w(n),c=s.length;o.dataset.count=String(c);let l=new Map;if(b(n))for(let e of n.pairUnits)e.memberIds.forEach((e,t)=>l.set(e,t));for(let r of s)o.append(E(r,c,n,e,t,l));let u=document.createElement(`div`);u.className=`replacement-world`,u.append(o),i.append(u);let d=document.createElement(`div`);d.className=`replacement-save-sweep`,i.append(d);let f=document.createElement(`div`);f.className=`replacement-power-accent`,i.append(f);let p=document.createElement(`div`);p.className=`replacement-force-accent`,i.append(p);let m=document.createElement(`div`);m.className=`replacement-caption`;let h=document.createElement(`span`);h.textContent=v[n.variant]??`THE BLOCK`;let g=document.createElement(`strong`);g.textContent=ee(t,n),m.append(h,g);let y=S(e,`replacementMist`,`replacement-mist`),x=document.createElement(`i`);x.className=`replacement-light-blade`;let C=document.createElement(`i`);return C.className=`replacement-lens-veil`,i.append(y,x),r.append(i,m,C),_(r,e,t,n),r}function ne(r,i,a,o){let s=o/e(a),c=e=>Math.min(o,Math.max(0,Math.round(e*s))),l=a.decisionOnly?[{...a.decision,index:0,actions:[],reveals:[],showAuthority:!0,royal:t(a,a.decision?.actorId),shotStart:0,shotEnd:o-250,revealAt:o,end:o}]:n(a),u=l[0]?.showAuthority&&l[0].royal,d=new Map(l.flatMap(e=>e.reveals.map(e=>[e.action,e.at]))),f=`cubic-bezier(.18,.72,.2,1)`;i(r,[[0,+!!a.segment],[c(280),1],[o,1]]),i(`.replacement-camera`,[[0,1,`scale(1.025)`],[o,1,`scale(1)`]]),i(`.replacement-set`,[[0,.85,`scale(1.07) translateY(1%)`],[o,.9,`scale(1.025) translateY(-.7%)`]]),i(`.replacement-room-light`,[[0,.46],[o,.62]]),i(`.replacement-caption`,[[0,0],[o,+!l.length]]);let p=u?[[0,0],[c(l[0].shotEnd+120),0],[c(l[0].shotEnd+260),1]]:[[0,1]];p.push([o,1]),i(`.replacement-block`,p);let m=Number(r.querySelector(`.replacement-block`).dataset.count),h=[[0,1,`translateX(0%) scale(${m>3?3/m:1})`]],g=[[0,0]],_=[[0,0,`translateX(-130%) rotate(-14deg)`]];for(let e of l){let t=r.querySelector(`.replacement-decision-shot[data-beat-index="${e.index}"]`);if(t)if(a.decisionOnly){i(t,[[0,1],[o,1]]);let e=t.querySelector(`.replacement-decision-figure, .replacement-holder-foreground`);e&&i(e,[[0,1,`scale(1.035)`],[o,1,`scale(1)`]]),i(t.querySelector(`.replacement-decision-label`),[[0,0,`translateY(10px)`],[450,1,`translateY(0)`],[o,1,`translateY(0)`]])}else if(e.royal)i(t,[[0,+(e.index===0)],[c(e.shotStart),+(e.index===0)],[c(e.shotStart+220),1],[c(e.shotEnd+160),1],[c(e.shotEnd+420),0],[o,0]]),i(t.querySelector(`.replacement-decision-figure`),[[0,1,`scale(1.055)`],[c(e.shotStart+400),1,`scale(1.045)`],[c(e.shotEnd),1,`scale(1.005)`,f],[o,1,`scale(1.005)`]]),g.push([c(e.shotEnd-100),0],[c(e.shotEnd+130),.6],[c(e.shotEnd+500),0]);else{m<=3&&h.push([c(e.shotStart+500),1,`translate(15%, -7%) scale(.84)`,f],[c(e.shotEnd-300),1,`translate(15%, -7%) scale(.84)`]),i(t,[[0,0],[c(e.shotStart),0],[c(e.shotStart+450),1],[c(e.shotEnd+100),1],[c(e.revealAt+600),0],[o,0]]);let n=t.querySelector(`.replacement-holder-foreground`);n&&i(n,[[0,1,`translateX(-14%) scale(1.06)`],[c(e.shotStart+850),1,`translateX(0) scale(1)`,f],[c(e.shotEnd),1,`translateX(0) scale(1)`],[c(e.revealAt+600),1,`translateX(-12%) scale(1.02)`,f],[o,1,`translateX(-12%) scale(1.02)`]])}let n=[...r.querySelectorAll(`.replacement-beat-caption[data-beat-index="${e.index}"]`)];n.forEach((t,r)=>{let a=e.reveals[r]?.at??e.revealAt,s=e.reveals[r+1]?.at,u=s&&n.length>1?s-100:e.end;i(t,[[0,0,`translateY(10px)`],[c(a+160),0,`translateY(10px)`],[c(a+450),1,`translateY(0)`,f],[c(u),1,`translateY(0)`],...e.index===l.length-1&&r===n.length-1?[[o,1,`translateY(0)`]]:[[c(u+180),0,`translateY(-5px)`],[o,0]]])});for(let t of e.reveals){let e=a.variant===`cupid`?Math.floor(t.action.slotIndex/2):t.action.slotIndex,n=m>3?Math.max(0,(e-1)*34):(e-(m-1)/2)*2.5;h.push([c(t.at-260),1,`translateX(${-n}%) scale(1.035)`,f],[c(t.at+750),1,`translateX(${-n}%) scale(1.035)`]),_.push([c(t.at-160),0,`translateX(-130%) rotate(-14deg)`],[c(t.at+100),.55,`translateX(-5%) rotate(-14deg)`,f],[c(t.at+650),0,`translateX(135%) rotate(-14deg)`])}}let v=e=>[...new Map(e.map(e=>[e[0],e])).values()].sort((e,t)=>e[0]-t[0]),y=m>3?3/m:1;h.push([o-300,1,`translateX(0%) scale(${y})`,f],[o,1,`translateX(0%) scale(${y})`]);let b=r.querySelector(`.replacement-block`).parentElement;i(b,v(h)),g.push([o,0]),i(`.replacement-lens-veil`,v(g)),_.push([o,0,`translateX(135%) rotate(-14deg)`]),i(`.replacement-light-blade`,v(_)),i(`.replacement-mist`,[[0,.1,`translateX(-4%) scale(1.05)`],[o,.16,`translateX(4%) scale(1.08)`]]);for(let e of r.querySelectorAll(`.replacement-person`)){let t=e.dataset.actorId,n=e.dataset.role===`incoming`,r=a.actionHistory?.find(e=>e.kind===`replacement`&&e.playerId===t),s=a.actionHistory?.find(e=>e.kind===`save`&&e.playerId===t),l=r?d.get(r):null,u=s?d.get(s):null,f=[[0,+!n]];n&&l!=null&&f.push([c(l),0],[c(l+120),1]),u!=null&&f.push([c(u),1],[c(u+600),0]),f.push([o,+(u==null)]),i(e,v(f)),i(e.querySelector(`.replacement-person-name`),[[0,1],[o,1]])}for(let e of r.querySelectorAll(`.replacement-slot`)){let t=l.flatMap(e=>e.reveals).filter(t=>t.action.kind===`replacement`&&(a.variant===`cupid`?Math.floor(t.action.slotIndex/2):t.action.slotIndex)===Number(e.dataset.slotIndex)),n=[[0,0,`scale(.82)`]];for(let e of t)n.push([c(e.at-200),0,`scale(.82)`],[c(e.at+70),.95,`scale(1)`,f],[c(e.at+900),0,`scale(1.12)`]);n.push([o,0]),i(e.querySelector(`.replacement-reveal-light`),v(n)),i(e.querySelector(`.replacement-platform-rim`),[[0,.18],[o,.4]])}let x=[[0,0,`scaleX(.2)`]];for(let e of l.filter(e=>e.kind===`save`))x.push([c(e.revealAt),0,`scaleX(.2)`],[c(e.revealAt+200),.8,`scaleX(1)`],[c(e.revealAt+850),0,`scaleX(1.08)`]);x.push([o,0]),i(`.replacement-save-sweep`,v(x))}var D={transition:{file:`transition.wav`,durationMs:520,volume:.22},suspense:{file:`suspense.wav`,durationMs:1600,volume:.18},reveal:{file:`reveal.wav`,durationMs:720,volume:.28},shield:{file:`shield.wav`,durationMs:950,volume:.25},save:{file:`save.wav`,durationMs:850,volume:.24},impact:{file:`impact.wav`,durationMs:800,volume:.28},door:{file:`door.wav`,durationMs:650,volume:.22}};function re(e,t,r,i,a=0){let o=[{at:0,cue:e===`shock`?`impact`:`transition`}];if(r)if(r.decisionOnly)o.push({at:350,cue:`suspense`});else for(let e of n(r)){e.showAuthority&&o.push({at:e.shotStart+300,cue:`suspense`});for(let t of e.reveals)o.push({at:t.at,cue:e.kind===`save`?`save`:e.kind===`decline`?`transition`:`reveal`})}else i?((i.exitAt||a)&&o.push({at:350,cue:`suspense`}),o.push({at:i.exitAt+a+3900,cue:`door`},{at:i.zoomAt+a,cue:`transition`})):e===`allPower`||e===`cupidPower`?o.push({at:350,cue:`suspense`},{at:1700,cue:`shield`}):e===`safety`||e===`cupidSafety`?o.push({at:1680,cue:`shield`}):e===`save`||e===`cupidSave`?o.push({at:1570,cue:`save`}):e===`loh`||e===`cupidLoh`?o.push({at:1060,cue:`shield`}):e===`voxResults`?o.push({at:350,cue:`suspense`},{at:6400,cue:`impact`}):e===`voxImmunity`?o.push({at:1450,cue:`shield`},{at:4350,cue:`reveal`}):e===`voxFinal4`?o.push({at:2450,cue:`reveal`}):e===`shock`?o.push({at:t-2200,cue:`reveal`}):e===`ambush`&&o.push({at:350,cue:`suspense`},{at:2400,cue:`impact`});return o.filter((e,n,r)=>e.at>=0&&e.at<t-220&&r.findIndex(t=>t.at===e.at&&t.cue===e.cue)===n).sort((e,t)=>e.at-t.at)}function O(){let e=[],t=!1,n=!1,r=e=>{let t=D[e.cue],n=`tv:ceremony_${e.cue}`;e.start=performance.now(),e.controller=new AbortController,a.play(n,{signal:e.controller.signal,startAtSec:e.offset/1e3,durationMs:t.durationMs-e.offset,fadeOutMs:45}).catch(()=>{})};return{play(i){if(n||t)return;for(let t=e.length-1;t>=0;t--){let n=e[t];n.offset+performance.now()-n.start>=D[n.cue].durationMs&&(n.controller.abort(),e.splice(t,1))}let a={cue:i,start:0,offset:0,controller:new AbortController};e.push(a),r(a)},pause(){if(!(t||n)){t=!0;for(let t of e)t.offset+=performance.now()-t.start,t.controller.abort()}},resume(){if(!(!t||n)){t=!1;for(let t of e)t.offset<D[t.cue].durationMs&&r(t)}},stop(){n=!0,e.forEach(e=>e.controller.abort()),e.length=0}}}function ie(e){for(let t of e.querySelectorAll(`.nom-label`))/^\s*0?\d+\s*NOMINATED\s*$/i.test(t.textContent??``)&&t.remove()}var k=`.replacement-film {
  container-type: size;
  overflow: hidden;
  isolation: isolate;
  background: #07050b;
  color: #f1e5d2;
}

/* A separate camera shot, never a small translucent figure behind nominees. */
.replacement-decision-shot {
  position: absolute;
  inset: 0;
  z-index: 10;
  overflow: hidden;
  isolation: isolate;
  background: #09060e;
  opacity: 0;
}
.replacement-decision-shot.is-over-shoulder {
  z-index: 7;
  background: transparent;
}
.tiebreak-authority-intro {
  position: absolute;
  inset: 0;
  z-index: 25;
  container-type: size;
}
.has-royal-decision .decision-holder,
.has-royal-decision .decision-insignia {
  display: none;
}
.tiebreak-authority-intro .replacement-decision-shot,
.royal-power-film .replacement-decision-shot {
  opacity: 1;
}
.replacement-decision-shot.is-over-shoulder .replacement-decision-label {
  top: 9%;
  bottom: auto;
}
.replacement-holder-foreground {
  --holder-width: min(130cqw, 61cqh);
  position: absolute;
  left: calc(4cqw - var(--holder-width) * var(--holder-head-x, 0.4));
  bottom: -14cqh;
  width: var(--holder-width);
  aspect-ratio: 2 / 3;
  transform-origin: 45% 65%;
}
.replacement-holder-back {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}
.replacement-holder-shadow {
  position: absolute;
  left: 0;
  bottom: 0;
  width: 42%;
  height: 40%;
  background: radial-gradient(ellipse at 15% 85%, #050309a3, transparent 75%);
}
.replacement-world {
  position: absolute;
  inset: 0;
  transform-origin: 0 60.1cqh;
}
.royal-member {
  position: absolute;
  inset: 0;
}
.royal-unit.is-paired {
  width: 108cqw;
  margin-left: -54cqw;
}
.royal-unit.is-paired .royal-member {
  inset: auto auto 0 calc(var(--royal-index) * 46%);
  width: 54%;
  aspect-ratio: 2 / 3;
}
.royal-safety-plinth {
  position: absolute;
  z-index: 5;
  right: 3%;
  bottom: 30%;
  width: 16cqw;
  padding-bottom: 12px;
  background: radial-gradient(ellipse at 50% 94%, #ccb17760, #170d20 40%, transparent 72%);
}
.royal-safety-plinth.is-paired {
  right: 42%;
  bottom: 25%;
}
.royal-safety-shield {
  width: 100%;
  height: auto;
  display: block;
}
.royal-safety-halo {
  position: absolute;
  inset: -30% -50%;
  background: radial-gradient(ellipse, #f4d59233, transparent 68%);
}
.replacement-mist {
  position: absolute;
  z-index: 3;
  left: -10%;
  bottom: 17%;
  width: 120%;
  height: 24%;
  object-fit: cover;
  pointer-events: none;
  mask-image: linear-gradient(transparent, #000b 28%, #000 67%, transparent);
}
.replacement-light-blade {
  position: absolute;
  z-index: 8;
  inset: -10% 32%;
  opacity: 0;
  pointer-events: none;
  background: linear-gradient(90deg, transparent, #dac28a38 42%, #f3dab24d 50%, transparent 72%);
}
.replacement-lens-veil {
  position: absolute;
  z-index: 20;
  inset: 0;
  opacity: 0;
  pointer-events: none;
  background: radial-gradient(ellipse at 50% 44%, #b1835944, #281038db 65%, #0b0714);
}
.replacement-beat-caption em {
  color: #ccb78f;
  font:
    600 clamp(8px, 2cqw, 11px) / 1.45 system-ui,
    sans-serif;
  font-style: normal;
  letter-spacing: 0.1em;
}
.replacement-decision-backdrop,
.replacement-decision-shade {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.replacement-decision-shade {
  background:
    radial-gradient(ellipse at 50% 42%, transparent 12%, #08050c55 64%),
    linear-gradient(180deg, #09060e1a 20%, transparent 45%, #08050ce8 83%);
}
.replacement-decision-figure {
  position: absolute;
  z-index: 2;
  bottom: 22%;
  left: 50%;
  width: min(76cqw, 46cqh);
  aspect-ratio: 2 / 3;
  margin-left: calc(min(76cqw, 46cqh) / -2);
  transform-origin: 50% 85%;
}
.replacement-decision-person,
.replacement-decision-throne {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.replacement-decision-person {
  z-index: 2;
}
.replacement-decision-crown {
  position: absolute;
  height: auto;
  z-index: 3;
  transform-origin: 50% 88%;
}
.replacement-decision-label {
  position: absolute;
  z-index: 4;
  bottom: 10%;
  left: 8%;
  width: 84%;
  display: grid;
  justify-items: center;
  gap: 10px;
  text-align: center;
  text-shadow: 0 2px 16px #06030b;
}
.replacement-decision-label span,
.replacement-decision-label em,
.replacement-beat-caption span {
  color: #d7bf8e;
  font:
    600 clamp(8px, 2.1cqw, 11px) / 1.4 system-ui,
    sans-serif;
  font-style: normal;
  letter-spacing: 0.18em;
}
.replacement-decision-label strong {
  color: #f2e7d4;
  font:
    400 clamp(26px, 7cqw, 40px) / 1.1 Georgia,
    serif;
}
.replacement-decision-line {
  display: block;
  width: 80px;
  height: 1px;
  margin-top: 5px;
  background: linear-gradient(90deg, transparent, #dfc58b, transparent);
}
.replacement-beat-caption {
  position: absolute;
  z-index: 9;
  bottom: max(7%, env(safe-area-inset-bottom));
  left: 6%;
  width: 88%;
  display: grid;
  gap: 10px;
  justify-items: center;
  text-align: center;
  opacity: 0;
  text-shadow: 0 2px 16px #06030b;
}
.replacement-beat-caption strong {
  color: #f2e7d4;
  font:
    400 clamp(20px, 5.8cqw, 32px) / 1.15 Georgia,
    serif;
  overflow-wrap: anywhere;
}

.replacement-camera {
  position: absolute;
  inset: 0;
  overflow: hidden;
  transform-origin: 50% 58%;
}

.replacement-set {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.87;
}

.replacement-room-light {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(ellipse at 50% 58%, #a6213824, transparent 44%),
    linear-gradient(180deg, #07050b20 27%, #09061018 52%, #06040bc9 100%);
}

.replacement-block {
  position: absolute;
  z-index: 2;
  inset: 0;
}

.replacement-slot {
  --support-y: 60.1cqh;
  position: absolute;
  inset: 0 auto 0 var(--slot-left);
  width: var(--slot-width);
  height: 100%;
  isolation: isolate;
}

.replacement-platform {
  position: absolute;
  top: calc(var(--support-y) - var(--platform-surface-offset));
  left: 0;
  z-index: 3;
  display: block;
  width: 100%;
  height: auto;
  pointer-events: none;
}

.replacement-platform-rim {
  position: absolute;
  top: calc(var(--support-y) + var(--platform-rim-offset));
  left: 8%;
  z-index: 3;
  width: 84%;
  height: 1px;
  background: linear-gradient(90deg, transparent, #c84047aa, #efa45a9a, #bd343f88, transparent);
  box-shadow: 0 0 9px 2px #a92c3338;
  opacity: 0.14;
  pointer-events: none;
}

.replacement-contact {
  position: absolute;
  top: calc(var(--support-y) - 0.45cqh);
  left: 23%;
  z-index: 4;
  width: 54%;
  height: 1.4%;
  border-radius: 50%;
  background: radial-gradient(ellipse, #09060bd1 0, #100b1473 48%, transparent 74%);
  filter: blur(2px);
  pointer-events: none;
}

.replacement-person {
  position: absolute;
  bottom: calc(100% - var(--support-y));
  left: 0;
  z-index: 5;
  width: 100%;
  aspect-ratio: 2 / 3;
  transform-origin: 50% 100%;
  opacity: 0;
}

.replacement-body {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: 50% 100%;
  transform: translateY(calc(100% - var(--feet-y, 94.762%)));
}

.replacement-person-name {
  position: absolute;
  top: calc(100% + 8.5cqh);
  left: -34%;
  width: 168%;
  color: #eee2d0;
  font:
    500 clamp(11px, 3.1vw, 16px) / 1.2 Georgia,
    serif;
  text-align: center;
  text-shadow: 0 2px 12px #05030bed;
  overflow-wrap: anywhere;
}
.replacement-person-name small {
  display: block;
  margin-top: 5px;
  color: #c9b286;
  font:
    500 7px / 1.3 system-ui,
    sans-serif;
  letter-spacing: 0.12em;
}

.replacement-pair-slot .replacement-person {
  left: calc(-9% + var(--pair-index) * 46%);
  width: 72%;
}

.replacement-pair-slot .replacement-person-name {
  left: -42%;
  width: 184%;
  color: var(--pair-accent, #edc78c);
  font-size: clamp(10px, 2.65vw, 14px);
}

.replacement-authority {
  position: absolute;
  z-index: 6;
  inset: 0;
  pointer-events: none;
  opacity: 0;
}

.replacement-authority-beam {
  position: absolute;
  top: 23%;
  left: 16%;
  width: 68%;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent,
    #dfbf806e 18%,
    #f0dda8,
    #d5a96c80 82%,
    transparent
  );
  box-shadow: 0 0 22px 5px #d9b46b22;
  transform-origin: 50% 50%;
}

.replacement-authority-label {
  position: absolute;
  top: 9.5%;
  left: 12%;
  width: 76%;
  display: grid;
  justify-items: center;
  gap: 5px;
  text-align: center;
  text-shadow: 0 2px 15px #06040bed;
}

.replacement-authority-label span,
.replacement-authority-label em,
.replacement-power-holder span {
  color: #d7bf8e;
  font:
    600 8px / 1.3 system-ui,
    sans-serif;
  font-style: normal;
  letter-spacing: 0.19em;
  text-transform: uppercase;
}

.replacement-authority-label strong {
  color: #f5e9d4;
  font:
    400 clamp(17px, 4.3vw, 24px) / 1.08 Georgia,
    serif;
}

.replacement-power-holder {
  position: absolute;
  top: 17%;
  right: 7%;
  display: grid;
  gap: 3px;
  justify-items: end;
  color: #f0e3cc;
  text-align: right;
  text-shadow: 0 2px 12px #06040bed;
}

.replacement-power-holder strong,
.replacement-prior-authority {
  font:
    500 12px / 1.2 Georgia,
    serif;
}

.replacement-power-insignia {
  position: absolute;
  top: 16.5%;
  left: 50%;
  width: 5cqw;
  height: auto;
  transform: translateX(-50%);
  filter: drop-shadow(0 0 13px #d9bd795c);
}

.replacement-prior-authority {
  position: absolute;
  top: 17%;
  left: 7%;
  color: #c8b9a1;
  font:
    500 9px / 1.3 system-ui,
    sans-serif;
  letter-spacing: 0.08em;
  text-shadow: 0 2px 12px #06040bed;
}

.replacement-save-sweep,
.replacement-power-accent,
.replacement-force-accent {
  position: absolute;
  z-index: 4;
  top: 59.5%;
  left: 7%;
  width: 86%;
  height: 3px;
  pointer-events: none;
  opacity: 0;
  transform-origin: 50% 50%;
}

.replacement-save-sweep {
  background: linear-gradient(90deg, transparent, #f7e7bd, #fff6dd, #f5d290, transparent);
  box-shadow: 0 0 18px 6px #f5dfaf66;
}

.replacement-reveal-light {
  position: absolute;
  z-index: 4;
  left: -10%;
  bottom: calc(100% - var(--support-y) - 1cqh);
  width: 120%;
  height: 30cqh;
  opacity: 0;
  pointer-events: none;
  background: radial-gradient(ellipse at 50% 75%, #f4d6a947, #9d597829 33%, transparent 69%);
  transform-origin: 50% 100%;
}

.replacement-power-accent {
  z-index: 1;
  top: 47%;
  height: 24%;
  background: radial-gradient(ellipse at 50% 52%, #fff5d224, #c9ab6220 22%, transparent 68%);
}

.replacement-force-accent {
  z-index: 1;
  top: 42%;
  height: 30%;
  background: radial-gradient(ellipse at 50% 54%, #fff1d65c, #d7ad7230 28%, transparent 70%);
}

.replacement-caption {
  position: absolute;
  z-index: 9;
  right: 6%;
  bottom: max(6.5%, env(safe-area-inset-bottom));
  left: 6%;
  display: grid;
  justify-items: center;
  gap: 8px;
  color: #f0e4ce;
  text-align: center;
  text-shadow: 0 2px 16px #07040df2;
  opacity: 0;
}

.replacement-caption span {
  color: #d5bb84;
  font:
    600 8px / 1.4 system-ui,
    sans-serif;
  letter-spacing: 0.2em;
  text-transform: uppercase;
}

.replacement-caption strong {
  max-width: 92%;
  font:
    400 clamp(20px, 5.5vw, 30px) / 1.12 Georgia,
    serif;
  overflow-wrap: anywhere;
}

.replacement-halo .replacement-room-light,
.replacement-mission .replacement-room-light {
  background:
    radial-gradient(ellipse at 50% 47%, #dfc57b2c, transparent 46%),
    linear-gradient(180deg, #07050b10 28%, #07050b19 53%, #06040bba 100%);
}

.replacement-force .replacement-room-light,
.replacement-detox .replacement-room-light,
.replacement-doubleTrouble .replacement-room-light {
  background:
    radial-gradient(ellipse at 50% 61%, #a62c3332, transparent 43%),
    linear-gradient(180deg, #07050b10 28%, #07050b16 53%, #06040bc2 100%);
}

.replacement-cupid .replacement-room-light {
  background:
    radial-gradient(ellipse at 50% 60%, #844b7d28, transparent 46%),
    linear-gradient(180deg, #07050b10 28%, #07050b18 53%, #06040bc2 100%);
}

.replacement-vox .replacement-room-light {
  background:
    radial-gradient(ellipse at 50% 46%, #73529a28, transparent 49%),
    linear-gradient(180deg, #07050b1d 25%, #08051127 53%, #06040bc2 100%);
}

.replacement-vox .replacement-caption span {
  color: #c8b2df;
}

.replacement-cupid .replacement-platform-rim {
  background: linear-gradient(
    90deg,
    transparent,
    var(--pair-accent, #e7a7d1),
    #fff0d8,
    var(--pair-accent, #d98bc0),
    transparent
  );
  box-shadow: 0 0 11px 3px color-mix(in srgb, var(--pair-accent, #d98bc0) 40%, transparent);
}

@media (prefers-reduced-motion: reduce) {
  .replacement-film * {
    scroll-behavior: auto !important;
  }
}
`;function A(e,t,n=!1){let r=p(e,n);return{...d(m(e),r,t),replacementSet:{src:`assets/ceremonies/shared/royal-room.webp`,...t[`royal-room.webp`]}}}function ae(e,t,n=!1){let r=document.createElement(`div`);r.className=`c-scene replacement-film royal-power-film`,r.setAttribute(`aria-hidden`,`true`);let i=p(t,n);_(r,e,m(t),i);let a=r.querySelector(`.replacement-decision-label`);return a.querySelector(`span`).textContent=`ALL THE POWER`,a.querySelector(`em`).textContent=n?`THE CROWN AND SAFETY BELONG TO YOUR PAIR.`:`THE CROWN. THE SHIELD. THE POWER IS YOURS.`,r}function oe(e,t,n){t(e,[[0,0],[350,1],[n,1]]),t(`.replacement-decision-shot`,[[0,1],[n,1]]),t(`.replacement-decision-backdrop`,[[0,.72,`scale(1.09) translateY(1%)`],[n,.94,`scale(1.015) translateY(-.5%)`]]),t(`.replacement-decision-figure`,[[0,1,`scale(1.06)`],[1600,1,`scale(1.025)`],[n,1,`scale(1)`]]),t(`.replacement-decision-label`,[[0,0,`translateY(12px)`],[2100,0,`translateY(12px)`],[2600,1,`translateY(0)`],[n,1,`translateY(0)`]]),t(`.royal-safety-plinth`,[[0,0,`translateY(18px) scale(.86)`],[1400,0,`translateY(18px) scale(.86)`],[2300,1,`translateY(0) scale(1)`,`cubic-bezier(.16,.8,.24,1)`],[n,1,`translateY(0) scale(1)`]]),t(`.royal-safety-halo`,[[0,0],[1700,0],[2150,.9],[3200,.35],[n,.3]])}function se(t,n){if(!(n.coLohAssignments?.length>1))return null;let r=n.coLohAssignments,i=[...new Set(r.map(e=>e.nomineeId))];if(n.nomineeCount>i.length)for(let e of[`a`,`b`,`c`]){let r=t[e]?.playerId??t[e]?.id;r&&!i.includes(r)&&i.length<n.nomineeCount&&i.push(r)}let a=r.map(e=>e.coLohId),o={owner:`replacement`,eventKey:`co-leader-nominations`,variant:`coLoh`,initialNomination:!0,openingNomineeIds:[],nomineeIds:i,replacementIds:i,continuingNomineeIds:[],savedIds:[],chooserId:a[0],powerHolderId:null,priorAuthorityId:a[0],coLohIds:a,leaderIds:a,coLohAssignments:r,pairUnits:[],authorityPairs:[],slotCount:i.length,actionHistory:i.map((e,t)=>({kind:`replacement`,playerId:e,actorId:r.find(t=>t.nomineeId===e)?.coLohId??null,actorRole:r.some(t=>t.nomineeId===e)?`coLoh`:`ballot`,slotIndex:t}))};return o.durationMs=e(o),o}var ce=`:root {
  font-family: Arial, Helvetica, sans-serif;
  color: #eee8de;
  background: #100f13;
  font-synthesis: none;
  color-scheme: dark;
  --muted: #a29c99;
  --gold: #d8b979;
  --line: #ffffff14;
}
* {
  box-sizing: border-box;
}
body {
  margin: 0;
}
button,
a,
input {
  -webkit-tap-highlight-color: transparent;
}
button {
  font: inherit;
  cursor: pointer;
}
button:disabled {
  opacity: 0.4;
  cursor: default;
}
button:focus-visible,
a:focus-visible,
input:focus-visible {
  outline: 2px solid #e9c780;
  outline-offset: 5px;
}
button[hidden],
div[hidden] {
  display: none;
}
a {
  color: inherit;
  text-decoration: none;
}
.lab {
  max-width: 1120px;
  margin: auto;
  padding: 30px 38px 38px;
}
.masthead {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 0 28px;
  border-bottom: 1px solid var(--line);
}
.wordmark {
  font-weight: 700;
  letter-spacing: 0.2em;
  font-size: 12px;
  line-height: 1.6;
}
.wordmark span {
  display: block;
  font-size: 9px;
  letter-spacing: 0.27em;
  color: var(--muted);
  font-weight: 400;
}
.isolation {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 11px;
  color: var(--muted);
}
.isolation i {
  width: 5px;
  height: 5px;
  border-radius: 100%;
  background: #c4ac79;
}
.workspace {
  display: grid;
  grid-template-columns: minmax(0, 418px) minmax(0, 1fr);
  gap: 72px;
  padding-top: 35px;
  align-items: start;
}
.preview-column {
  min-width: 0;
}
.stage {
  position: relative;
  aspect-ratio: 390/600;
  isolation: isolate;
  overflow: hidden;
  border-radius: 14px;
  background: radial-gradient(ellipse at 50% 45%, #573b35 0%, #2c2026 34%, #17141b 69%);
  border: 1px solid #9f796e33;
  box-shadow: 0 20px 60px #0003;
  contain: layout paint;
}
.stage-grain {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(0deg, #0c0a10b3, transparent 23%, transparent 78%, #0c0a1050),
    repeating-linear-gradient(90deg, #ffffff02 0 1px, transparent 1px 4px);
  pointer-events: none;
}
.stage-topline,
.stage-bottomline {
  position: absolute;
  z-index: 3;
  left: 22px;
  right: 22px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 8px;
  letter-spacing: 0.13em;
  color: #dfc99a;
  pointer-events: none;
}
.stage-topline {
  top: 23px;
}
.stage-topline span:last-child {
  border: 1px solid #d5b5754d;
  border-radius: 3px;
  padding: 5px 6px;
  font-size: 9px;
  letter-spacing: 0.1em;
}
.stage-bottomline {
  bottom: 23px;
  color: #b8a594;
  font-size: 7px;
}
.stage-idle {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}
.eyebrow {
  font-size: 9px;
  letter-spacing: 0.18em;
  color: var(--gold);
  line-height: 1.7;
}
.stage-idle h1 {
  font-family: Georgia, serif;
  font-size: clamp(38px, 5vw, 59px);
  font-weight: 400;
  line-height: 1.04;
  letter-spacing: -0.04em;
  margin: 22px 0 10px;
}
.stage-idle h1 em {
  font-weight: 400;
  color: #e6c897;
}
.idle-seal {
  font-family: Georgia, serif;
  font-size: 45px;
  font-weight: 400;
  margin: 18px 0;
  color: #dbc28e;
}
.stage-invitation {
  font-size: 7px;
  letter-spacing: 0.17em;
  color: #bdac9e;
  margin-top: 15px;
}
.scene-mount {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.stage.is-playing .stage-idle {
  visibility: hidden;
}
.transport {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 17px;
  flex-wrap: wrap;
}
.play-button {
  background: #e4c58f;
  border: 1px solid #e4c58f;
  color: #201912;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 700;
  padding: 12px 15px;
  display: flex;
  align-items: center;
  gap: 9px;
}
.play-button span {
  font-size: 10px;
}
.skip-button {
  background: none;
  border: none;
  color: #c2b9ad;
  font-size: 11px;
  padding: 10px 4px;
}
.toggle {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 11px;
  color: #b4aca3;
  position: relative;
  cursor: pointer;
}
.toggle input {
  position: absolute;
  opacity: 0;
  width: 29px;
  height: 20px;
  left: 0;
  cursor: pointer;
  margin: 0;
}
.toggle-track {
  display: inline-block;
  width: 28px;
  height: 16px;
  border-radius: 12px;
  background: #403b36;
  position: relative;
  pointer-events: none;
}
.toggle-track:after {
  content: '';
  width: 10px;
  height: 10px;
  border-radius: 50%;
  position: absolute;
  top: 3px;
  left: 3px;
  background: #c6bba9;
}
.toggle input:checked + .toggle-track {
  background: #b69961;
}
.toggle input:checked + .toggle-track:after {
  left: 15px;
  background: #201a12;
}
.toggle input:focus-visible + .toggle-track {
  outline: 2px solid #e9c780;
  outline-offset: 4px;
}
.play-status {
  font-size: 10px;
  color: #9f958a;
  line-height: 1.6;
  margin: 12px 0 0;
  min-height: 32px;
}
.notes-column {
  padding-top: 17px;
  min-width: 0;
}
.notes-column h2 {
  font-family: Georgia, serif;
  font-size: 36px;
  font-weight: 400;
  line-height: 1.14;
  letter-spacing: -0.025em;
  margin: 14px 0 16px;
}
.intro {
  max-width: 340px;
  color: #b4aca6;
  font-size: 13px;
  line-height: 1.8;
  margin: 0;
}
.beats {
  list-style: none;
  margin: 25px 0 30px;
  padding: 0;
  display: grid;
  gap: 17px;
}
.beats li {
  display: flex;
  gap: 17px;
  align-items: baseline;
}
.beats li > span {
  font-variant-numeric: tabular-nums;
  font-size: 10px;
  color: #c5a974;
  min-width: 29px;
}
.beats strong {
  font-size: 12px;
  font-weight: 400;
  color: #e3d8c9;
}
.beats p {
  font-size: 11px;
  color: var(--muted);
  line-height: 1.5;
  margin: 5px 0 0;
}
.measure-section {
  border-top: 1px solid var(--line);
  padding-top: 20px;
}
.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.section-heading h3 {
  font-size: 12px;
  font-weight: 400;
  margin: 0;
}
.section-heading > span {
  font-size: 8px;
  letter-spacing: 0.12em;
  color: #918779;
}
.asset-summary {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 17px;
  margin: 18px 0;
}
.asset-summary > div {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.asset-summary strong {
  font-weight: 400;
  font-size: 23px;
  font-variant-numeric: tabular-nums;
  color: #e1c594;
}
.asset-summary span {
  font-size: 9px;
  line-height: 1.5;
  color: #a89e92;
}
.benchmark-button {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 13px;
  border: 1px solid #b5a28a40;
  border-radius: 6px;
  background: #ffffff03;
  color: #cdbfae;
  font-size: 11px;
  text-align: left;
}
.benchmark-button:hover:not(:disabled) {
  background: #ffffff08;
}
.benchmark-button span {
  font-size: 16px;
}
.measurement-status {
  font-size: 10px;
  color: #a49a8f;
  line-height: 1.6;
  margin: 10px 0;
}
.fineprint {
  font-size: 9px;
  line-height: 1.7;
  color: #948b82;
  margin: 12px 0 0;
}
.lab-footnote {
  font-size: 7px;
  letter-spacing: 0.1em;
  color: #8c837b;
  margin-top: 22px;
  line-height: 1.8;
}
.results {
  overflow-x: auto;
}
.results table {
  border-collapse: collapse;
  width: 100%;
  font-size: 10px;
  text-align: left;
  font-variant-numeric: tabular-nums;
}
.results th {
  font-size: 8px;
  font-weight: 400;
  color: #a39786;
  padding: 10px 6px;
  border-bottom: 1px solid var(--line);
  white-space: nowrap;
}
.results td {
  padding: 9px 6px;
  border-bottom: 1px solid var(--line);
  white-space: nowrap;
}
.download-button {
  border: 0;
  padding: 9px 0;
  background: transparent;
  color: #d2b67d;
  font-size: 10px;
  text-decoration: underline;
  text-underline-offset: 4px;
}
/* Animation artwork uses only transform and opacity changes. */
.loh-scene {
  position: absolute;
  inset: 0;
  overflow: hidden;
}
.loh-halo {
  position: absolute;
  left: 10%;
  top: 9%;
  width: 80%;
  height: 74%;
  border-radius: 50%;
  background: radial-gradient(ellipse, #e7bc6e40, transparent 68%);
  opacity: 0;
}
.loh-floor {
  position: absolute;
  left: 17%;
  width: 66%;
  height: 6%;
  bottom: 17%;
  border-radius: 50%;
  background: radial-gradient(ellipse, #d8b67d4d, #d8b67d00 70%);
  opacity: 0;
}
.loh-figure {
  position: absolute;
  height: 74%;
  aspect-ratio: 2/3;
  left: 50%;
  bottom: 18%;
  margin-left: -40%;
  width: 80%;
  opacity: 0;
  transform-origin: 50% 92%;
}
.loh-person {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  pointer-events: none;
}
.loh-royal {
  opacity: 0;
}
.loh-crown {
  position: absolute;
  width: 13.6%;
  height: auto;
  left: 43.2%;
  top: 3.5%;
  opacity: 0;
  transform-origin: 50% 85%;
  overflow: visible;
}
.loh-glint {
  position: absolute;
  top: 9%;
  left: 45%;
  width: 10%;
  aspect-ratio: 1;
  background: radial-gradient(circle, #fff8ddcc, transparent 67%);
  opacity: 0;
}
.loh-star {
  position: absolute;
  width: 7px;
  height: 7px;
  background: #ffe4a3;
  clip-path: polygon(50% 0, 61% 39%, 100% 50%, 61% 61%, 50% 100%, 39% 61%, 0 50%, 39% 39%);
  opacity: 0;
}
.loh-flash {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at 50% 38%, #fff5d4cc, #e6bf7933 47%, transparent 70%);
  opacity: 0;
  pointer-events: none;
}
.loh-titles {
  position: absolute;
  left: 7%;
  right: 7%;
  bottom: 7.3%;
  text-align: center;
  opacity: 0;
}
.loh-kicker {
  font-size: 7px;
  letter-spacing: 0.28em;
  color: #d8bf91;
  margin-bottom: 5px;
}
.loh-name {
  font-family: Georgia, serif;
  color: #f3e6ce;
  font-size: 34px;
  line-height: 1.05;
  font-weight: 400;
  letter-spacing: -0.035em;
}
.loh-title {
  font-size: 8px;
  letter-spacing: 0.15em;
  color: #e0c48a;
  margin-top: 7px;
}
.loh-static .loh-figure,
.loh-static .loh-royal,
.loh-static .loh-crown,
.loh-static .loh-halo,
.loh-static .loh-floor,
.loh-static .loh-titles {
  opacity: 1;
}
.loh-static .loh-before {
  opacity: 0;
}
@media (min-width: 1000px) {
  .loh-figure {
    width: 80%;
    margin-left: -40%;
  }
}
@media (max-width: 800px) {
  .lab {
    padding: 22px 22px 30px;
  }
  .workspace {
    gap: 30px;
    grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
  }
  .notes-column h2 {
    font-size: 29px;
  }
  .notes-column {
    padding-top: 5px;
  }
  .eyebrow {
    font-size: 8px;
  }
  .beats {
    gap: 13px;
    margin: 20px 0;
  }
  .intro {
    font-size: 12px;
  }
  .asset-summary strong {
    font-size: 20px;
  }
}
@media (max-width: 620px) {
  .lab {
    padding: 18px 20px 28px;
    max-width: 450px;
  }
  .masthead {
    padding-bottom: 19px;
  }
  .isolation {
    font-size: 9px;
  }
  .workspace {
    display: block;
    padding-top: 23px;
  }
  .stage {
    max-width: 390px;
    margin: auto;
  }
  .notes-column {
    padding-top: 30px;
  }
  .stage-idle h1 {
    font-size: 49px;
  }
  .notes-column h2 {
    font-size: 34px;
  }
  .notes-column h2 br {
    display: none;
  }
  .intro {
    max-width: none;
  }
  .stage-topline {
    font-size: 7px;
  }
  .transport {
    gap: 9px;
  }
  .play-button {
    font-size: 11px;
    padding: 11px 13px;
  }
  .toggle {
    font-size: 10px;
  }
  .loh-name {
    font-size: 31px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .toggle-track:after {
    transition: none;
  }
}
.loh-room-pieces {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.loh-throne {
  position: absolute;
  width: 68%;
  height: 60%;
  bottom: 19%;
  left: 16%;
  opacity: 0;
  transform-origin: 50% 95%;
}
.loh-curtain {
  position: absolute;
  width: 30%;
  height: 67%;
  top: 11%;
  opacity: 0;
  transform-origin: 50% 0;
}
.loh-curtain-left {
  left: -2%;
}
.loh-curtain-right {
  right: -2%;
}
.loh-throne img,
.loh-curtain img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}
.loh-throne img {
  object-position: 50% 100%;
}
.loh-curtain img {
  object-position: 50% 0;
}
.loh-curtain-right img {
  transform: scaleX(-1);
}
.loh-static .loh-throne,
.loh-static .loh-curtain {
  opacity: 1;
}

.loh-seated {
  position: absolute;
  left: 12%;
  width: 76%;
  height: 70%;
  bottom: 18%;
  opacity: 0;
  transform-origin: 50% 96%;
}
.loh-seated-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: 50% 100%;
  display: block;
}
.loh-seat-flash {
  position: absolute;
  inset: 0;
  z-index: 2;
  background: radial-gradient(
    ellipse at 46% 42%,
    #cfb489 0%,
    #ac8db1 36%,
    #806195 68%,
    #503c66 100%
  );
  opacity: 0;
  pointer-events: none;
}
.loh-static .loh-figure,
.loh-static .loh-throne {
  opacity: 0;
}
.loh-static .loh-seated {
  opacity: 1;
}
`,le=`.lab-header-links {
  display: flex;
  align-items: center;
  gap: 23px;
}
.lab-header-links > a {
  font-size: 10px;
  color: #cbb994;
}
.scene-tabs {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
  margin-top: 24px;
}
.scene-tabs button {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  border: 1px solid #b49b7427;
  border-radius: 7px;
  background: #ffffff02;
  padding: 13px 15px;
  color: #aaa197;
  font-size: 11px;
  text-align: left;
}
.scene-tabs button span {
  font-size: 9px;
  color: #8e8071;
}
.scene-tabs button[aria-pressed='true'] {
  background: #d8b97912;
  border-color: #d8b97966;
  color: #eadbc4;
}
.scene-tabs button[aria-pressed='true'] span {
  color: #d8b979;
}
.ceremony-lab .workspace {
  padding-top: 24px;
  gap: 64px;
}
.ceremony-lab .transport {
  gap: 10px;
}
.pause-button {
  padding: 10px 1px;
  border: 0;
  background: none;
  color: #c6bba9;
  font-size: 11px;
}
.ceremony-lab .scene-mount {
  z-index: 4;
}
.ceremony-lab .notes-column {
  padding-top: 12px;
}
.ceremony-lab .notes-column h2 {
  font-size: 35px;
}
.ceremony-lab .stage-idle h1 {
  max-width: 82%;
  font-size: 49px;
}
.gallery-stage[data-ceremony='safety'] {
  background: radial-gradient(ellipse at 50% 44%, #263e59, #181e2d 47%, #11131d 80%);
}
.gallery-stage[data-ceremony='nominations'] {
  background: radial-gradient(ellipse at 50% 67%, #481c28, #20151e 46%, #100e15 80%);
}
.gallery-stage[data-ceremony='save'] {
  background: radial-gradient(ellipse at 50% 45%, #27383b, #1b202b 50%, #11121b 80%);
}
.gallery-stage[data-ceremony='exit'] {
  background: radial-gradient(ellipse at 50% 48%, #312738, #191621 50%, #100e16 80%);
}
.c-scene {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}
.c-scene img {
  display: block;
  pointer-events: none;
}
.c-caption {
  position: absolute;
  bottom: 8%;
  left: 5%;
  right: 5%;
  text-align: center;
  opacity: 0;
  z-index: 7;
}
.c-caption > span {
  display: block;
  color: #d9c492;
  font-size: 8px;
  letter-spacing: 0.21em;
  margin-bottom: 7px;
}
.c-caption > strong {
  display: block;
  font-family: Georgia, serif;
  font-size: 32px;
  line-height: 1.1;
  font-weight: 400;
  letter-spacing: -0.035em;
  color: #f0e4ce;
}
.c-caption > em {
  display: block;
  color: #cdb993;
  font-size: 7px;
  letter-spacing: 0.15em;
  font-style: normal;
  margin-top: 9px;
  line-height: 1.6;
}
.c-halo {
  position: absolute;
  left: 7%;
  top: 12%;
  width: 86%;
  height: 68%;
  border-radius: 50%;
  opacity: 0;
  pointer-events: none;
}
.c-ground {
  position: absolute;
  bottom: 23%;
  left: 18%;
  width: 64%;
  height: 6%;
  border-radius: 50%;
  background: radial-gradient(ellipse, #cfba7945, transparent 70%);
  opacity: 0;
}
.c-hero {
  position: absolute;
  left: 15%;
  width: 70%;
  height: 70%;
  bottom: 23%;
  object-fit: contain;
  object-position: 50% 100%;
  opacity: 0;
  transform-origin: 50% 94%;
}
.c-wash {
  position: absolute;
  inset: 0;
  z-index: 6;
  background: radial-gradient(ellipse at 46% 42%, #c8ad83, #9b8aa9 38%, #675d88 72%, #37415d);
  opacity: 0;
}
.safety-halo {
  background: radial-gradient(ellipse, #7295b854, #52668923 50%, transparent 70%);
}
.safety-arch {
  position: absolute;
  left: 16%;
  top: 13%;
  height: 62%;
  width: 68%;
  border: 1px solid #d5b57745;
  border-radius: 47% 47% 5% 5%;
  box-shadow: inset 0 0 0 8px #d3b98b05;
  opacity: 0;
}
.safety-ordinary {
  z-index: 2;
}
.safety-knight {
  z-index: 3;
}
.safety-flying-shield {
  position: absolute;
  left: 55%;
  top: 40%;
  width: 24%;
  height: 24%;
  object-fit: contain;
  opacity: 0;
  z-index: 4;
  transform-origin: 50% 50%;
}
.nom-chasm {
  position: absolute;
  inset: 26% 0 0;
  background:
    radial-gradient(ellipse at 50% 70%, #b7283f32, transparent 65%),
    linear-gradient(0deg, #08080fd9, transparent 80%);
  opacity: 0;
}
.nom-warning {
  position: absolute;
  top: 11%;
  left: 5%;
  right: 5%;
  text-align: center;
  color: #d7b1a5;
  font-size: 7px;
  letter-spacing: 0.19em;
  opacity: 0;
}
.nom-pod {
  position: absolute;
  top: 17%;
  width: 44%;
  height: 62%;
  opacity: 0;
  transform-origin: 50% 70%;
}
.nom-first {
  left: 3%;
}
.nom-second {
  right: 3%;
}
.nom-person {
  position: absolute;
  bottom: 26%;
  left: 0;
  width: 100%;
  height: 82%;
  object-fit: contain;
  object-position: 50% 100%;
  z-index: 2;
}
.nom-platform {
  position: absolute;
  left: -2%;
  bottom: 10%;
  width: 104%;
  height: 28%;
  object-fit: contain;
  object-position: 50% 0;
  z-index: 3;
}
.nom-aura {
  position: absolute;
  top: 0;
  bottom: 13%;
  left: 3%;
  right: 3%;
  background: radial-gradient(ellipse, #cf3b4c38, transparent 68%);
  opacity: 0;
}
.nom-label {
  position: absolute;
  bottom: 0;
  left: 4%;
  right: 4%;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 7px;
  color: #efb9b1;
  font-size: 7px;
  letter-spacing: 0.13em;
}
.nom-label span {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 19px;
  height: 19px;
  border: 1px solid #d679774d;
  border-radius: 100%;
  font-size: 7px;
  letter-spacing: 0;
}
.c-nominations .c-caption {
  bottom: 7.8%;
}
.c-nominations .c-caption > strong {
  font-size: 29px;
}
.c-nominations .c-caption > span {
  color: #c48d87;
}
.save-danger-halo {
  background: radial-gradient(ellipse, #ac233f52, transparent 68%);
}
.save-safe-halo {
  background: radial-gradient(ellipse, #bba15b38, #5a9a9a25 47%, transparent 70%);
}
.save-person {
  z-index: 3;
  height: 62%;
  bottom: 25.5%;
}
.save-platform {
  position: absolute;
  width: 62%;
  left: 19%;
  height: 14%;
  bottom: 17.5%;
  object-fit: contain;
  object-position: 50% 0;
  opacity: 0;
  z-index: 4;
}
.save-shield {
  position: absolute;
  left: 19%;
  top: 25%;
  width: 62%;
  height: 47%;
  object-fit: contain;
  opacity: 0;
  z-index: 2;
}
.save-bracket {
  position: absolute;
  top: 13%;
  height: 60%;
  width: 15%;
  border-top: 2px solid #e28d8c;
  border-bottom: 2px solid #e28d8c;
  opacity: 0;
  z-index: 4;
}
.save-bracket-left {
  left: 16%;
  border-left: 2px solid #e28d8c;
  border-radius: 14px 0 0 14px;
}
.save-bracket-right {
  right: 16%;
  border-right: 2px solid #e28d8c;
  border-radius: 0 14px 14px 0;
}
.save-danger-caption > strong {
  font-size: 31px;
}
.save-danger-caption > em {
  color: #d89592;
}
.save-safe-caption > strong {
  font-size: 37px;
}
.save-safe-caption > span {
  color: #d9cf9c;
}
.save-ground {
  bottom: 26.2%;
}
.exit-room-light {
  position: absolute;
  inset: 10% 1% 8%;
  background: radial-gradient(ellipse at 50% 40%, #71588340, transparent 69%);
  opacity: 0;
}
.exit-door-set {
  position: absolute;
  width: 72%;
  height: 68%;
  left: 14%;
  bottom: 22%;
}
.exit-void {
  position: absolute;
  left: 15%;
  right: 15%;
  top: 7%;
  bottom: 4%;
  border-radius: 12px 12px 1px 1px;
  background: #030309;
}
.exit-door-front {
  z-index: 3;
  perspective: 720px;
  opacity: 0;
}
.exit-frame {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: fill;
  z-index: 2;
}
.exit-leaf {
  position: absolute;
  left: 15.6%;
  width: 68.8%;
  top: 7%;
  bottom: 4%;
  transform-origin: 0 50%;
  transform: rotateY(-88deg);
  backface-visibility: hidden;
  background: linear-gradient(90deg, #17121b, #382e3b 45%, #211925);
  border: 1px solid #b9a47a7d;
  border-radius: 10px 10px 1px 1px;
  box-shadow: inset 0 0 0 8px #0002;
  z-index: 1;
}
.exit-leaf:before {
  content: '';
  position: absolute;
  left: 17%;
  right: 17%;
  top: 12%;
  bottom: 12%;
  border: 1px solid #b5a17b30;
  border-radius: 26% 26% 4px 4px;
}
.exit-leaf-emblem {
  position: absolute;
  top: 32%;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 28px;
  color: #c8b48280;
}
.exit-handle {
  position: absolute;
  right: 12%;
  top: 54%;
  width: 5px;
  height: 27px;
  border-radius: 4px;
  background: linear-gradient(90deg, #90713e, #d6bf89, #8f713e);
}
.exit-traveler {
  position: absolute;
  width: 76%;
  height: 70%;
  left: 3%;
  bottom: 26%;
  object-fit: contain;
  object-position: 50% 100%;
  transform-origin: 50% 100%;
  opacity: 0;
}
.exit-near {
  z-index: 4;
}
.exit-far-wrap {
  position: absolute;
  inset: 0;
  clip-path: inset(15% 24% 26% 25% round 9px);
  z-index: 2;
}
.exit-far {
  z-index: 1;
}
.exit-sign {
  position: absolute;
  top: 7%;
  left: 0;
  right: 0;
  text-align: center;
  color: #cdb88c;
  font-size: 8px;
  letter-spacing: 0.24em;
  opacity: 0;
  z-index: 5;
}
.c-exit .c-caption {
  z-index: 5;
}
.exit-blackout {
  position: absolute;
  inset: 0;
  background: #05040a;
  z-index: 9;
  opacity: 0;
}
/* Still comparisons show the representative final pose; no active animations. */
.c-static .c-caption,
.c-static .c-halo,
.c-static .c-ground,
.c-static .safety-knight,
.c-static .safety-arch,
.c-static .nom-pod,
.c-static .nom-chasm,
.c-static .nom-warning,
.c-static .save-person,
.c-static .save-safe-halo,
.c-static .save-safe-caption,
.c-static .exit-door-front,
.c-static .exit-sign {
  opacity: 1;
}
.c-static .nom-aura {
  opacity: 0.5;
}
.c-static .save-shield {
  opacity: 0.9;
}
.c-static .save-danger-caption,
.c-static .save-danger-halo {
  opacity: 0;
}
.c-static .exit-leaf {
  transform: rotateY(0);
}
.c-static.c-exit .c-caption {
  opacity: 1;
}
@media (max-width: 800px) {
  .ceremony-lab .workspace {
    gap: 30px;
  }
  .scene-tabs button {
    padding: 12px 10px;
    gap: 8px;
  }
  .lab-header-links {
    gap: 15px;
  }
  .ceremony-lab .notes-column h2 {
    font-size: 29px;
  }
}
@media (max-width: 620px) {
  .scene-tabs {
    gap: 6px;
    margin-top: 19px;
  }
  .scene-tabs button {
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    padding: 10px 9px;
    font-size: 10px;
  }
  .ceremony-lab .workspace {
    padding-top: 20px;
  }
  .lab-header-links {
    flex-direction: column;
    align-items: flex-end;
    gap: 7px;
  }
  .lab-header-links > a {
    font-size: 9px;
  }
  .ceremony-lab .stage-idle h1 {
    font-size: 43px;
  }
  .ceremony-lab .notes-column {
    padding-top: 28px;
  }
  .ceremony-lab .notes-column h2 {
    font-size: 32px;
  }
  .ceremony-lab .transport {
    gap: 9px;
  }
  .pause-button {
    font-size: 10px;
  }
  .c-caption > strong {
    font-size: 29px;
  }
  .c-nominations .c-caption > strong {
    font-size: 27px;
  }
  .save-safe-caption > strong {
    font-size: 35px;
  }
}

.gallery-stage[data-ceremony='tiebreak'] {
  background: radial-gradient(ellipse at 50% 48%, #49351d, #211a19 51%, #100f16 82%);
}
.gallery-stage[data-ceremony='ambush'] {
  background: radial-gradient(ellipse at 50% 44%, #48202b, #20151f 48%, #100e16 80%);
}
.gallery-stage[data-ceremony='allPower'] {
  background: radial-gradient(ellipse at 50% 47%, #4c3a25, #211b26 50%, #100e16 82%);
}
.gallery-stage[data-ceremony='shock'] {
  background: radial-gradient(ellipse at 50% 48%, #35294b, #1d1828 50%, #100e16 82%);
}
.gallery-stage[data-ceremony='final4'] {
  background: radial-gradient(ellipse at 50% 52%, #283647, #1c1c2a 50%, #100e16 82%);
}
.gallery-stage[data-ceremony='final3'] {
  background: radial-gradient(ellipse at 50% 45%, #433523, #211a24 50%, #100e16 82%);
}
.shock-picker {
  margin: 16px 0 4px;
  padding: 12px;
  border: 1px solid #d8b97926;
  border-radius: 8px;
  background: #ffffff04;
}
.shock-picker label {
  display: block;
  margin: 0 0 7px;
  color: #cbb994;
  font-size: 9px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
.shock-picker select {
  width: 100%;
  padding: 10px;
  border: 1px solid #b49b7440;
  border-radius: 6px;
  background: #17151e;
  color: #eadbc4;
  font: inherit;
  font-size: 12px;
}
.shock-picker[hidden] {
  display: none;
}
.tie-halo {
  position: absolute;
  inset: 14% 8% 28%;
  border-radius: 50%;
  background: radial-gradient(ellipse, #d7b76022, transparent 68%);
  opacity: 0;
}
.tie-scales {
  position: absolute;
  z-index: 2;
  left: 28%;
  top: 14%;
  width: 44%;
  height: 42%;
  object-fit: contain;
  opacity: 0;
  transform-origin: 50% 47%;
}
.tie-candidate {
  position: absolute;
  z-index: 2;
  top: 34%;
  width: 31%;
  height: 44%;
  opacity: 0;
}
.tie-left {
  left: 2%;
}
.tie-right {
  right: 2%;
}
.tie-person {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: 50% 100%;
}
.tie-candidate > span {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  text-align: center;
  color: #d1bd91;
  font-size: 7px;
  letter-spacing: 0.14em;
}
.tie-candidate > strong {
  position: absolute;
  top: 3px;
  left: 50%;
  transform: translateX(-50%);
  padding: 5px 7px;
  border-radius: 100%;
  background: #211a1e;
  color: #d4bd7f;
  font-size: 9px;
}
.tie-token {
  position: absolute;
  z-index: 4;
  left: 47%;
  top: 19%;
  width: 18%;
  height: 12%;
  display: grid;
  place-content: center;
  border: 1px solid #d9bb75;
  border-radius: 100%;
  background: radial-gradient(circle, #806234, #2e2130 68%);
  box-shadow: 0 0 20px #d2ad5833;
  color: #f2deb0;
  text-align: center;
  font-size: 7px;
  line-height: 1.25;
  letter-spacing: 0.08em;
  opacity: 0;
}
.tie-vote-line {
  position: absolute;
  left: 50%;
  top: 20%;
  height: 34%;
  border-left: 1px solid #d3b76835;
  opacity: 0;
}
.ambush-curtains {
  position: absolute;
  inset: 0;
  z-index: 5;
  overflow: hidden;
}
.ambush-curtain {
  position: absolute;
  top: 8%;
  height: 70%;
  width: 22%;
  object-fit: fill;
  opacity: 0.96;
}
.ambush-curtain-left {
  left: 0;
  transform-origin: left center;
}
.ambush-curtain-right {
  right: 0;
  transform: scaleX(-1);
  transform-origin: right center;
}
.ambush-side-nominees {
  position: absolute;
  z-index: 1;
  left: 5%;
  right: 5%;
  top: 33%;
  height: 31%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  opacity: 0;
}
.ambush-small {
  height: 100%;
  width: 30%;
  object-fit: contain;
  filter: brightness(0.43) saturate(0.72);
}
.ambush-side-nominees > span {
  position: absolute;
  left: 0;
  right: 0;
  bottom: -12%;
  text-align: center;
  color: #cb9a90;
  font-size: 7px;
  letter-spacing: 0.18em;
}
.ambush-beam {
  position: absolute;
  z-index: 1;
  top: 11%;
  left: 32%;
  width: 36%;
  height: 59%;
  background: linear-gradient(180deg, #f0d37d15, #d92d4526 65%, transparent);
  clip-path: polygon(38% 0, 62% 0, 100% 100%, 0 100%);
  transform-origin: top;
  opacity: 0;
}
.ambush-platform {
  position: absolute;
  z-index: 2;
  left: 31%;
  bottom: 20%;
  width: 38%;
  height: 22%;
  object-fit: contain;
  opacity: 0;
}
.ambush-target {
  position: absolute;
  z-index: 3;
  left: 30%;
  bottom: 24%;
  width: 40%;
  height: 56%;
  object-fit: contain;
  object-position: 50% 100%;
  opacity: 0;
}
.ambush-stamp {
  position: absolute;
  z-index: 6;
  top: 13%;
  left: 50%;
  width: 116px;
  padding: 8px 5px;
  border: 1px solid #e09992a0;
  background: #331923df;
  color: #f0c8bc;
  text-align: center;
  font-size: 8px;
  line-height: 1.4;
  letter-spacing: 0.2em;
  transform: translateX(-50%);
  opacity: 0;
}
.ambush-stamp b {
  color: #ffd9a0;
}
.power-aura {
  position: absolute;
  inset: 6% 10% 12%;
  border-radius: 50%;
  background: radial-gradient(ellipse, #e2be6d36, #8b6bb01c 48%, transparent 72%);
  opacity: 0;
}
.power-eye {
  position: absolute;
  z-index: 1;
  left: 25%;
  top: 9%;
  width: 50%;
  height: 37%;
  object-fit: contain;
  opacity: 0;
}
.power-king {
  position: absolute;
  z-index: 2;
  left: 18%;
  bottom: 20%;
  width: 64%;
  height: 73%;
  object-fit: contain;
  object-position: 50% 100%;
  opacity: 0;
}
.power-shield {
  position: absolute;
  z-index: 3;
  right: 10%;
  top: 40%;
  width: 29%;
  height: 31%;
  object-fit: contain;
  opacity: 0;
}
.power-label {
  position: absolute;
  z-index: 4;
  left: 7%;
  right: 7%;
  top: 14%;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 9px;
  color: #f0d99f;
  font-size: 6px;
  letter-spacing: 0.12em;
  opacity: 0;
}
.power-label b {
  font-size: 15px;
  color: #f2dfa9;
}
.shock-curtains {
  position: absolute;
  inset: 0;
  z-index: 4;
  overflow: hidden;
}
.shock-curtain {
  position: absolute;
  top: 9%;
  height: 66%;
  width: 21%;
  object-fit: fill;
  opacity: 0.9;
}
.shock-curtain-left {
  left: 0;
  transform-origin: left center;
}
.shock-curtain-right {
  right: 0;
  transform: scaleX(-1);
  transform-origin: right center;
}
.shock-rays {
  position: absolute;
  left: 16%;
  right: 16%;
  top: 10%;
  height: 50%;
  background: repeating-conic-gradient(
    from 0deg at 50% 43%,
    #d9ba7330 0deg 3deg,
    transparent 3deg 12deg
  );
  mask-image: radial-gradient(ellipse, #000 0%, transparent 69%);
  opacity: 0;
}
.shock-eye {
  position: absolute;
  z-index: 3;
  left: 30%;
  top: 13%;
  width: 40%;
  height: 27%;
  object-fit: contain;
  opacity: 0;
  filter: drop-shadow(0 0 16px #c4a44d43);
}
.shock-card {
  position: absolute;
  z-index: 5;
  left: 8%;
  right: 8%;
  top: 43%;
  padding: 15px 8px 16px;
  border-top: 1px solid #d5bd7a70;
  border-bottom: 1px solid #d5bd7a70;
  background: linear-gradient(90deg, transparent, #1a1520e8 17%, #1a1520e8 83%, transparent);
  text-align: center;
  opacity: 0;
}
.shock-card > span {
  display: block;
  color: #d3bc7c;
  font-size: 6px;
  letter-spacing: 0.22em;
}
.shock-title {
  display: block;
  margin-top: 8px;
  color: #f0e0bc;
  font:
    400 22px Georgia,
    serif;
  letter-spacing: 0.03em;
}
.shock-copy {
  display: block;
  margin-top: 7px;
  color: #c7b9a4;
  font-size: 8px;
  letter-spacing: 0.1em;
  font-style: normal;
}
.c-shock[data-shock='danger'] .shock-card {
  border-color: #ce7774aa;
}
.c-shock[data-shock='danger'] .shock-title {
  color: #f0b4a8;
}
.c-shock[data-shock='dawn'] .shock-card {
  border-color: #dba77d99;
}
.c-shock[data-shock='dawn'] .shock-title {
  color: #f2c39a;
}
.c-shock[data-shock='gold'] .shock-card {
  border-color: #d9bd6eaa;
}
.c-shock[data-shock='gold'] .shock-title {
  color: #f3d78e;
}
.c-shock[data-shock='storm'] .shock-rays {
  filter: hue-rotate(205deg);
  opacity: 0.45;
}
.c-shock[data-shock='rose'] .shock-card {
  border-color: #d688a399;
}
.c-shock[data-shock='rose'] .shock-title {
  color: #eeb5c2;
}
.f4-arch,
.f3-arch {
  position: absolute;
  left: 14%;
  top: 14%;
  width: 72%;
  height: 56%;
  border: 1px solid #d4bd7855;
  border-bottom: 0;
  border-radius: 48% 48% 0 0;
  box-shadow: inset 0 0 0 7px #d5bd7808;
  opacity: 0;
}
.f4-eligible {
  position: absolute;
  z-index: 4;
  top: 8%;
  left: 4%;
  right: 4%;
  text-align: center;
  color: #c9bb9a;
  font-size: 6px;
  letter-spacing: 0.12em;
  opacity: 0;
}
.f4-row {
  position: absolute;
  z-index: 2;
  left: 4%;
  right: 4%;
  top: 22%;
  height: 56%;
  display: flex;
  align-items: flex-end;
  justify-content: space-around;
}
.f4-player {
  position: relative;
  width: 32%;
  height: 100%;
  opacity: 0;
}
.f4-person {
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: 50% 100%;
}
.f4-player > span {
  position: absolute;
  bottom: -1px;
  left: 50%;
  transform: translateX(-50%);
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1px solid #d4bd7b66;
  background: #1a1b25;
  color: #ead8a8;
  font-size: 7px;
}
.f4-ballot {
  position: absolute;
  z-index: 5;
  left: 43%;
  top: 20%;
  width: 14%;
  height: 12%;
  display: grid;
  place-content: center;
  border: 1px solid #e1c579;
  border-radius: 3px;
  background: linear-gradient(145deg, #c8a55b, #634727);
  box-shadow: 0 0 20px #e2c86e66;
  color: #fff0c7;
  text-align: center;
  font-size: 5px;
  letter-spacing: 0.12em;
  line-height: 1.25;
  opacity: 0;
}
.f4-result {
  position: absolute;
  z-index: 5;
  left: 0;
  right: 0;
  bottom: 24%;
  color: #efc3a2;
  text-align: center;
  font-size: 7px;
  letter-spacing: 0.18em;
  opacity: 0;
}
.f3-title {
  position: absolute;
  z-index: 1;
  top: 8%;
  left: 0;
  right: 0;
  color: #e3d1a5;
  text-align: center;
  font-size: 8px;
  letter-spacing: 0.2em;
  opacity: 0;
}
.f3-player {
  position: absolute;
  z-index: 2;
  top: 22%;
  height: 55%;
  width: 35%;
  opacity: 0;
}
.f3-person {
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: 50% 100%;
}
.f3-loh {
  left: 32%;
  top: 18%;
  height: 59%;
  z-index: 3;
}
.f3-left {
  left: -1%;
  top: 26%;
  height: 50%;
}
.f3-right {
  right: -1%;
  top: 26%;
  height: 50%;
}
.f3-player > span {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  text-align: center;
  color: #d8c696;
  font-size: 6px;
  letter-spacing: 0.15em;
}
.f3-crown {
  position: absolute;
  z-index: 3;
  left: 38%;
  top: 15%;
  width: 24%;
  height: 8%;
  object-fit: contain;
  opacity: 0;
}
.f3-decree {
  position: absolute;
  z-index: 5;
  top: 33%;
  left: 50%;
  transform: translateX(-50%);
  padding: 7px 12px;
  border: 1px solid #d6b867a0;
  background: #201a22ed;
  color: #f4dda0;
  text-align: center;
  font-size: 7px;
  line-height: 1.5;
  letter-spacing: 0.16em;
  opacity: 0;
}
.f3-door {
  position: absolute;
  z-index: 4;
  right: 1%;
  top: 20%;
  width: 27%;
  height: 57%;
  object-fit: contain;
  opacity: 0;
}
.f3-last-two {
  position: absolute;
  z-index: 6;
  bottom: 22%;
  left: 0;
  right: 0;
  text-align: center;
  color: #f0d897;
  font:
    400 16px Georgia,
    serif;
  letter-spacing: 0.1em;
  opacity: 0;
}
.f3-blackout {
  position: absolute;
  z-index: 5;
  inset: 0;
  background: radial-gradient(ellipse at 50% 50%, transparent 30%, #09070dbb 100%);
  opacity: 0;
  pointer-events: none;
}
.c-static .tie-halo,
.c-static .tie-scales,
.c-static .tie-candidate,
.c-static .ambush-side-nominees,
.c-static .ambush-target,
.c-static .ambush-platform,
.c-static .power-aura,
.c-static .power-eye,
.c-static .power-king,
.c-static .power-shield,
.c-static .shock-eye,
.c-static .shock-card,
.c-static .f4-arch,
.c-static .f4-player,
.c-static .f4-result,
.c-static .f3-arch,
.c-static .f3-player,
.c-static .f3-door,
.c-static .f3-last-two {
  opacity: 1;
}
.c-static .tie-token,
.c-static .f4-ballot {
  opacity: 1;
}
.c-static .f3-right {
  opacity: 0;
}
.c-static .f3-last-two {
  opacity: 1;
}
@media (max-width: 620px) {
  .scene-tabs {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
  .scene-tabs button {
    font-size: 9px;
    padding: 8px 6px;
  }
  .shock-title {
    font-size: 17px;
  }
  .shock-picker {
    margin-top: 12px;
  }
  .power-label {
    gap: 5px;
    font-size: 5px;
  }
  .f4-eligible {
    font-size: 5px;
  }
}
.f3-crown {
  top: 39%;
}
`,j=`.cinema-v2 {
  background: #100e15;
}
.cinema-v2 img {
  display: block;
}
.cine-shot,
.cine-world {
  position: absolute;
  inset: 0;
  transform-origin: 50% 50%;
}
.cine-shot {
  opacity: 0;
}
.cine-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.cine-person {
  position: absolute;
  aspect-ratio: 2/3;
  z-index: 3;
  transform-origin: 50% 95%;
}
.cine-body {
  width: 100%;
  height: 100%;
  position: relative;
  z-index: 2;
  object-fit: contain;
}
.cine-contact {
  position: absolute;
  z-index: 1;
  bottom: 1%;
  left: 24%;
  width: 52%;
  height: 4%;
  border-radius: 50%;
  background: #07040bd4;
  filter: blur(3px);
}
.role-left {
  width: 50%;
  left: -2%;
  bottom: 33%;
}
.role-right {
  width: 50%;
  right: -2%;
  bottom: 33%;
}
.role-center {
  width: 49%;
  left: 25.5%;
  bottom: 32%;
}
.cine-voting {
  position: absolute;
  left: 31%;
  bottom: 21%;
  width: 38%;
  aspect-ratio: 2/3;
  z-index: 5;
}
.cine-console {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.cine-token {
  position: absolute;
  width: 18%;
  left: 41%;
  top: 12%;
  height: auto;
  z-index: 3;
}
.cine-token-light {
  position: absolute;
  top: 11%;
  left: 34%;
  width: 32%;
  height: 9%;
  border-radius: 50%;
  background: radial-gradient(ellipse, #d4ad603f, transparent 72%);
  opacity: 0;
  z-index: 4;
}
.cine-verdict {
  position: absolute;
  z-index: 4;
  left: 58%;
  right: 0;
  top: 22%;
  height: 46%;
  background:
    linear-gradient(90deg, transparent, #9b253f35),
    radial-gradient(ellipse at 55% 80%, #bc334c42, transparent 70%);
  mix-blend-mode: screen;
  opacity: 0;
}
.cine-atmosphere {
  position: absolute;
  z-index: 8;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
  opacity: 0.2;
}
.cine-grade {
  position: absolute;
  z-index: 9;
  inset: 0;
  background:
    linear-gradient(0deg, #08070ee8 0%, #08070e75 17%, transparent 38%, transparent 83%, #09071070),
    radial-gradient(ellipse at 50% 44%, transparent 35%, #0b071143 100%);
  pointer-events: none;
}
.cine-letterbox {
  position: absolute;
  left: 0;
  right: 0;
  height: 4.1%;
  background: #08070c;
  z-index: 15;
}
.letterbox-top {
  top: 0;
}
.letterbox-bottom {
  bottom: 0;
}
.cine-sequence {
  position: absolute;
  bottom: 2%;
  left: 0;
  right: 0;
  z-index: 16;
  color: #c3b199;
  font-size: 5px;
  letter-spacing: 0.25em;
  text-align: center;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 9px;
}
.cine-sequence i {
  width: 24px;
  height: 1px;
  background: #a68c60;
}
.cinema-v2 ~ * {
  pointer-events: none;
}
.cine-titles {
  position: absolute;
  z-index: 12;
  left: 6%;
  right: 6%;
  bottom: 8.5%;
  text-align: center;
  color: #f4e7ce;
  opacity: 0;
  text-shadow: 0 2px 18px #0008;
}
.cine-titles > span {
  display: block;
  font-size: 6px;
  letter-spacing: 0.22em;
  line-height: 1.7;
  color: #dac49b;
}
.cine-titles h3 {
  font-family: Georgia, serif;
  font-size: 31px;
  font-weight: 400;
  line-height: 1.06;
  letter-spacing: -0.025em;
  margin: 8px 0 0;
}
.cine-titles p {
  font-size: 6px;
  letter-spacing: 0.14em;
  line-height: 1.8;
  color: #c7b49a;
  margin: 9px 0 0;
}
.cine-titles > i {
  display: block;
  height: 1px;
  width: 29px;
  background: #c8ad73;
  margin: 13px auto 0;
}
.cine-cut {
  position: absolute;
  inset: -3%;
  z-index: 11;
  background: linear-gradient(100deg, #100d17, #2c2436 48%, #69556b 49%, #241d2b 52%, #0b0910);
  opacity: 0;
  pointer-events: none;
  transform: translateX(-130%);
}
.cine-cut i {
  position: absolute;
  left: 48%;
  top: 0;
  bottom: 0;
  width: 1px;
  background: #b6a27e80;
}
.cine-sweep {
  position: absolute;
  z-index: 10;
  inset: 0;
  width: 58%;
  background: linear-gradient(90deg, transparent, #bea27925, transparent);
  opacity: 0;
  pointer-events: none;
}
.cine-gates {
  position: absolute;
  z-index: 2;
  left: 39%;
  width: 22%;
  top: -1%;
  height: 43%;
  overflow: hidden;
}
.cine-gate {
  position: absolute;
  top: 0;
  width: 52%;
  height: 100%;
  object-fit: fill;
}
.gate-left {
  left: 0;
}
.gate-right {
  right: 0;
  transform: scaleX(-1);
}
.cine-danger {
  position: absolute;
  z-index: 2;
  inset: 2% 32% 34%;
  background: linear-gradient(180deg, #9c20351a, #c52a4b38);
  clip-path: polygon(35% 0, 65% 0, 100% 100%, 0 100%);
  mix-blend-mode: screen;
  opacity: 0;
}
.role-portrait {
  left: 22%;
  width: 87%;
  bottom: 1%;
}
.role-target {
  width: 60%;
  left: 20%;
  bottom: 35%;
}
.role-back-left {
  width: 42%;
  left: -10%;
  bottom: 43%;
  filter: brightness(0.58);
}
.role-back-right {
  width: 42%;
  right: -10%;
  bottom: 43%;
  filter: brightness(0.58);
}
.f4-left {
  width: 45%;
  left: -9%;
  bottom: 33%;
}
.f4-center {
  width: 47%;
  left: 26.5%;
  bottom: 31%;
}
.f4-right {
  width: 45%;
  right: -9%;
  bottom: 33%;
}
.cine-small-shield {
  position: absolute;
  z-index: 4;
  width: 12%;
  height: 14%;
  left: 52%;
  bottom: 35%;
  object-fit: contain;
  transform: rotate(-6deg);
}
.f3-loh {
  width: 51%;
  left: 24.5%;
  bottom: 30%;
}
.f3-survivor,
.f3-third {
  width: 43%;
  bottom: 34%;
}
.f3-survivor {
  left: -8%;
}
.f3-third {
  right: -8%;
}
.cine-crown {
  position: absolute;
  z-index: 3;
  left: 42.7%;
  top: 2.8%;
  width: 14.6%;
  height: auto;
}
.f3-finalist {
  width: 49%;
  bottom: 28%;
}
.cine-departure {
  position: absolute;
  z-index: 3;
  width: 34%;
  aspect-ratio: 2/3;
  left: 33%;
  bottom: 37%;
  transform-origin: 50% 100%;
  opacity: 0;
}
.cine-rear {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.cine-throne {
  position: absolute;
  z-index: 2;
  left: 11%;
  width: 78%;
  height: 72%;
  bottom: 14%;
  object-fit: contain;
  object-position: center bottom;
}
.cine-royal {
  position: absolute;
  z-index: 3;
  left: 15%;
  width: 70%;
  aspect-ratio: 2/3;
  bottom: 9%;
}
.cine-seated {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.cine-royal-crown {
  position: absolute;
  z-index: 4;
  width: 17%;
  height: auto;
  left: 41.5%;
  top: 5%;
}
.cine-royal-shield {
  position: absolute;
  z-index: 4;
  left: 67%;
  width: 20%;
  height: 24%;
  bottom: 16%;
  object-fit: contain;
  transform: rotate(-8deg);
}
.film-allPower .shot-wide .cine-world {
  transform: scale(1.85);
  transform-origin: 50% 28%;
}
.film-allPower .shot-detail .cine-world {
  transform: scale(1);
}
.film-tiebreak .shot-detail .cine-bg,
.film-final4 .shot-detail .cine-bg {
  filter: brightness(0.45);
  transform: scale(1.15);
}
.film-tiebreak .shot-detail .cine-voting,
.film-final4 .shot-detail .cine-voting {
  width: 105%;
  left: -2.5%;
  bottom: -25%;
}
.film-tiebreak .shot-detail .cine-token,
.film-final4 .shot-detail .cine-token {
  width: 20%;
  left: 40%;
  top: 13%;
}
.film-shock .shot-wide .cine-world {
  transform: scale(1.9);
  transform-origin: 50% 27%;
}
.film-shock .shot-detail .cine-world {
  transform: scale(1.02);
}
.film-shock .cine-titles {
  bottom: 14%;
}
.film-shock .cine-titles h3 {
  font-size: 28px;
  letter-spacing: 0.03em;
}
.film-shock .cine-titles p {
  font-size: 9px;
  letter-spacing: 0.035em;
  text-transform: none;
}
.cine-eye-bloom {
  position: absolute;
  left: 38%;
  top: 19%;
  width: 24%;
  height: 16%;
  background: radial-gradient(ellipse, #cfb68150, #a27bda1a, transparent 70%);
  mix-blend-mode: screen;
  opacity: 0;
}
.film-shock[data-shock='danger'] .cine-eye-bloom {
  background: radial-gradient(ellipse, #d8596055, transparent 72%);
}
.film-shock[data-shock='storm'] .cine-world {
  filter: saturate(0.35);
}
.film-shock[data-shock='rose'] .cine-eye-bloom {
  background: radial-gradient(ellipse, #da91bc55, transparent 72%);
}
.film-final3 .shot-detail .cine-bg {
  transform: scale(1.04);
  transform-origin: 50% 40%;
}
.film-final3 .shot-detail .f3-finalist {
  filter: brightness(0.8);
}
.film-ambush .cine-titles h3 {
  font-size: 29px;
}
.cine-layer.is-layer-hidden {
  visibility: hidden !important;
}
.cinema-v2.c-static {
  opacity: 1;
}
.cinema-v2.c-static .shot-wide {
  opacity: 1;
}
.cinema-v2.c-static .shot-detail {
  opacity: 0;
}
.cinema-v2.c-static .cine-titles {
  opacity: 1;
}
.cinema-v2.c-static .cine-cut {
  opacity: 0;
}
.cinema-v2.c-static.film-ambush .shot-wide,
.cinema-v2.c-static.film-final3 .shot-wide,
.cinema-v2.c-static.film-allPower .shot-wide,
.cinema-v2.c-static.film-shock .shot-wide {
  opacity: 0;
}
.cinema-v2.c-static.film-ambush .shot-detail,
.cinema-v2.c-static.film-final3 .shot-detail,
.cinema-v2.c-static.film-allPower .shot-detail,
.cinema-v2.c-static.film-shock .shot-detail {
  opacity: 1;
}
.cinema-v2.c-static.film-ambush .gate-left {
  transform: translateX(-105%);
}
.cinema-v2.c-static.film-ambush .gate-right {
  transform: translateX(105%) scaleX(-1);
}
.cinema-options {
  margin: 17px 0 8px;
  padding: 14px;
  border: 1px solid #c6ab7133;
  border-radius: 8px;
  background: #d5bc8105;
}
.cinema-options[hidden] {
  display: none;
}
.cinema-options > label {
  display: block;
  color: #bca786;
  letter-spacing: 0.12em;
  font-size: 9px;
  margin-bottom: 7px;
}
.cinema-options select {
  width: 100%;
  padding: 9px;
  border-radius: 5px;
  background: #17151d;
  border: 1px solid #c1aa7544;
  color: #e5d5bc;
  font-size: 11px;
}
.cinema-options > p {
  font-size: 10px;
  color: #a4988c;
  line-height: 1.6;
  margin: 8px 0 0;
}
.layer-switches {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 12px;
  font-size: 10px;
  color: #c8b79d;
}
.layer-switches label {
  display: flex;
  align-items: center;
  gap: 4px;
}
.layer-switches input {
  accent-color: #c5ab76;
  width: 11px;
  height: 11px;
  margin: 0;
}
@media (min-width: 621px) {
  .cine-titles h3 {
    font-size: 35px;
  }
  .film-shock .cine-titles h3 {
    font-size: 31px;
  }
  .cine-titles > span {
    font-size: 7px;
  }
  .cine-titles p {
    font-size: 7px;
  }
}
@media (max-width: 360px) {
  .cine-titles h3 {
    font-size: 27px;
  }
  .cine-titles > span {
    font-size: 5px;
  }
  .film-shock .cine-titles h3 {
    font-size: 24px;
  }
}
.cine-contact {
  bottom: 4.4%;
  height: 3%;
  left: 25%;
  width: 50%;
  background: #08050ddd;
  filter: blur(2px);
}
.cine-reflection {
  position: absolute;
  left: 0;
  right: 0;
  top: 90%;
  height: 23%;
  overflow: hidden;
  opacity: 0.16;
  mask-image: linear-gradient(#0009, transparent 95%);
  z-index: 0;
  pointer-events: none;
}
.cine-reflected-body {
  width: 100%;
  height: auto;
  transform: scaleY(-1);
  transform-origin: 50% 50%;
}
.cine-person .cine-body {
  z-index: 2;
}
.cine-throne {
  left: 16%;
  width: 68%;
  height: auto;
  aspect-ratio: 2/3;
  bottom: 20%;
  object-fit: contain;
}
.cine-royal {
  left: 16%;
  width: 68%;
  bottom: 20%;
}
.cine-royal-shield {
  left: 65%;
  width: 18%;
  height: 22%;
  bottom: 25%;
}
.f4-left {
  width: 42%;
  left: -3%;
  bottom: 33%;
}
.f4-center {
  width: 45%;
  left: 27.5%;
  bottom: 31%;
}
.f4-right {
  width: 42%;
  right: auto;
  left: 61%;
  bottom: 33%;
}
.cine-outcome {
  position: absolute;
  z-index: 6;
  top: 67.5%;
  left: 65%;
  right: 3%;
  font-size: 5px;
  letter-spacing: 0.15em;
  color: #e1a59d;
  text-align: center;
  opacity: 0;
}
.film-tiebreak .cine-outcome {
  left: 59%;
  right: 6%;
}
.cine-token {
  transform: scaleY(0.5);
}
.cine-danger-ring {
  position: absolute;
  z-index: 3;
  left: 7%;
  right: 7%;
  bottom: 35.5%;
  height: 8%;
  border-radius: 50%;
  border: 1px solid #e7696a;
  background: radial-gradient(ellipse, transparent 48%, #ad2b3e33 67%, transparent 72%);
  box-shadow: 0 2px 12px #d12c4c4d;
  opacity: 0;
}
.cine-danger {
  background: linear-gradient(180deg, #9c20351a, #c52a4b55);
}
.cine-gate {
  width: 51%;
  object-fit: fill;
}
.cine-royal-shield {
  width: 17%;
  height: 19%;
  bottom: 20%;
}
`,M=`/* Revision 3: spatial entrances and explicit action. */
.cinema-v3 {
  perspective: 900px;
}
.cinema-v3 .cine-world,
.cinema-v3 .shot-detail .cine-world {
  transform: none;
  transform-origin: 50% 35%;
}
.cinema-v3.film-allPower .shot-wide .cine-world {
  transform: none;
}
.cinema-v3.film-final3 .shot-detail .cine-bg {
  transform: none;
}
.cinema-v3 .cine-titles {
  bottom: 8%;
}
.cinema-v3 .cine-titles h3 {
  font-size: 29px;
}
.cinema-v3 .cine-titles p {
  font-size: 6.5px;
  letter-spacing: 0.11em;
  max-width: 96%;
  margin: 9px auto 0;
}
.actor-badge {
  position: absolute;
  left: 8%;
  right: 8%;
  bottom: -6%;
  text-align: center;
  font-size: 5.5px;
  letter-spacing: 0.12em;
  color: #e0cda9;
  text-shadow: 0 1px 6px #000;
  white-space: nowrap;
}
.depth-entrance {
  position: absolute;
  inset: 0;
  z-index: 14;
  pointer-events: none;
}
.entrance-wing {
  position: absolute;
  top: -4%;
  bottom: -4%;
  width: 50.5%;
  background: #181019;
  box-shadow: 0 0 22px #000b;
}
.wing-left {
  left: 0;
}
.wing-right {
  right: 0;
}
.entrance-panel {
  width: 100%;
  height: 100%;
  object-fit: fill;
}
.wing-right .entrance-panel {
  transform: scaleX(-1);
}
.foreground-jamb {
  position: absolute;
  top: -5%;
  bottom: -5%;
  width: 7%;
  z-index: 13;
  background: linear-gradient(90deg, #100c13, #5c4729 30%, #c8ac705e 45%, #281c25 56%, #0c0910);
  box-shadow: 0 0 20px #0009;
  pointer-events: none;
}
.jamb-left {
  left: -2%;
}
.jamb-right {
  right: -2%;
  background: linear-gradient(90deg, #0c0910, #281c25 44%, #c8ac705e 55%, #5c4729 70%, #100c13);
}
.cinema-v3 .cine-cut {
  background: radial-gradient(ellipse at 52% 40%, #af9488, #826784 38%, #4b3c5d 72%, #201b2f);
  inset: -5%;
  z-index: 11;
  transform: none;
}
.cinema-v3 .cine-cut i {
  display: none;
}
.transition-blade {
  position: absolute;
  top: -6%;
  left: 38%;
  width: 26%;
  height: 112%;
  z-index: 12;
  opacity: 0;
  filter: blur(1px);
  box-shadow:
    -10px 0 26px #10071380,
    10px 0 26px #10071380;
  pointer-events: none;
}
.transition-texture {
  width: 100%;
  height: 100%;
  object-fit: fill;
}
.ceremony-energy {
  position: absolute;
  inset: 0;
  z-index: 10;
  pointer-events: none;
}
.energy-ring {
  position: absolute;
  left: 11%;
  top: 15%;
  width: 78%;
  height: 53%;
  border-radius: 50%;
  border: 1px solid #d6bc9c75;
  box-shadow:
    0 0 12px #b68ac244,
    inset 0 0 10px #d6b58322;
  opacity: 0;
}
.ring-b {
  left: 4%;
  width: 92%;
  border-color: #ab8ec681;
}
.energy-core {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at 50% 45%, #d1b17e2e, #8f6db62e 30%, transparent 68%);
  opacity: 0;
}
.cine-beat {
  position: absolute;
  z-index: 13;
  top: 8.2%;
  left: 7%;
  right: 7%;
  text-align: center;
  font-size: 6.5px;
  line-height: 1.6;
  letter-spacing: 0.15em;
  color: #f0d9ad;
  text-shadow: 0 1px 6px #000;
  opacity: 0;
  padding: 7px 3px;
  background: linear-gradient(90deg, transparent, #13101b8c 25%, #13101b8c 75%, transparent);
}
.beat-action {
  color: #e7d3b5;
}
.vote-caption {
  position: absolute;
  left: -10%;
  right: -10%;
  top: 3%;
  text-align: center;
  color: #e4c88e;
  font-size: 5px;
  letter-spacing: 0.14em;
  text-shadow: 0 1px 5px #000;
}
.shot-wide .vote-caption {
  display: none;
}
.vote-tally {
  position: absolute;
  z-index: 8;
  left: 29%;
  width: 42%;
  top: 15%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 18px;
  color: #ead09d;
  text-shadow: 0 2px 10px #000;
  font-size: 24px;
  font-family: Georgia, serif;
  opacity: 0;
}
.vote-tally i {
  font-size: 13px;
  font-style: normal;
  color: #a1927f;
}
.tally-after b:last-child {
  color: #ec9e9b;
}
.vote-flight {
  position: absolute;
  z-index: 8;
  left: 46.5%;
  top: 51%;
  width: 7%;
  height: auto;
  opacity: 0;
  filter: drop-shadow(0 0 7px #e2c46e80);
}
.verdict-trail {
  position: absolute;
  z-index: 7;
  left: 49%;
  top: 51%;
  height: 1px;
  width: 28%;
  background: linear-gradient(90deg, #cfb16600, #d8c17b, #d1787f);
  box-shadow: 0 0 8px #d6ad7c70;
  transform-origin: left;
  opacity: 0;
}
.verdict-bracket {
  position: absolute;
  z-index: 5;
  left: 62%;
  right: 3%;
  top: 23%;
  height: 42%;
  border-radius: 45% 45% 2px 2px;
  background: radial-gradient(ellipse at 50% 90%, #b724383b, transparent 72%);
  opacity: 0;
  transform-origin: 50% 100%;
}
.verdict-bracket > i {
  position: absolute;
  top: 3%;
  bottom: 0;
  width: 14%;
  border-top: 1px solid #cf8682;
  border-bottom: 1px solid #cf8682;
}
.verdict-bracket > i:first-child {
  left: 0;
  border-left: 1px solid #cf8682;
  border-radius: 10px 0 0 2px;
}
.verdict-bracket > i:nth-child(2) {
  right: 0;
  border-right: 1px solid #cf8682;
  border-radius: 0 10px 2px 0;
}
.verdict-bracket > span {
  position: absolute;
  top: 106%;
  left: 0;
  right: 0;
  text-align: center;
  color: #e6b0a8;
  font-size: 5.5px;
  letter-spacing: 0.12em;
}
.film-final4 .tally-after {
  top: 14.5%;
  left: 37%;
  width: 26%;
  font-size: 22px;
  gap: 13px;
}
.film-final4 .verdict-bracket {
  left: 64%;
  right: 3%;
  top: 25%;
  height: 40%;
}
.safety-spotlight {
  position: absolute;
  z-index: 2;
  left: 28%;
  width: 44%;
  top: 12%;
  height: 57%;
  background: radial-gradient(ellipse, #d6b56e27, transparent 70%);
  mix-blend-mode: screen;
  opacity: 0;
}
.ambush-save-shield {
  position: absolute;
  z-index: 5;
  left: 13%;
  top: 43%;
  width: 15%;
  height: 19%;
  object-fit: contain;
  opacity: 0;
}
.slot-open {
  position: absolute;
  z-index: 7;
  left: 4%;
  width: 42%;
  top: 69%;
  color: #dfc68e;
  text-align: center;
  font:
    400 13px Georgia,
    serif;
  letter-spacing: 0.08em;
  opacity: 0;
}
.slot-open > span {
  display: block;
  font:
    5px Arial,
    sans-serif;
  letter-spacing: 0.12em;
  margin-top: 5px;
}
.nomination-lock {
  position: absolute;
  z-index: 5;
  top: 17%;
  height: 46%;
  width: 8%;
  border-top: 2px solid #db8c8c;
  border-bottom: 2px solid #db8c8c;
  opacity: 0;
}
.lock-left {
  left: 21%;
  border-left: 2px solid #db8c8c;
  border-radius: 14px 0 0 3px;
}
.lock-right {
  right: 21%;
  border-right: 2px solid #db8c8c;
  border-radius: 0 14px 3px 0;
}
.cinema-v3 .role-back-left .actor-badge {
  color: #dbce9d;
}
.cinema-v3 .role-back-right .actor-badge {
  color: #d79c95;
}
.power-standing {
  width: 61%;
  left: 19.5%;
  bottom: 29%;
}
.power-award-shield {
  position: absolute;
  z-index: 5;
  left: 60%;
  top: 43%;
  width: 22%;
  height: 27%;
  object-fit: contain;
  opacity: 0;
}
.royal-group {
  position: absolute;
  inset: 0;
  z-index: 3;
}
.royal-room-plane {
  position: absolute;
  inset: 0;
  z-index: 1;
  transform-origin: 50% 25%;
}
.royal-aura {
  position: absolute;
  z-index: 2;
  inset: 8% 8% 20%;
  border-radius: 50%;
  background: radial-gradient(ellipse, #c6a36d2e, #9365bb15 45%, transparent 70%);
  mix-blend-mode: screen;
  opacity: 0;
}
.city-depth,
.eye-city-depth {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
}
.city-plate,
.eye-city-plate {
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: brightness(0.75) saturate(0.8);
}
.royal-window-room {
  z-index: 1;
  --royal-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1000 1500'%3E%3Cpath fill='white' fill-rule='evenodd' d='M0 0H1000V1500H0Z M270 900V310C270 100 730 100 730 310V900Z'/%3E%3C/svg%3E");
  mask-image: var(--royal-mask);
  -webkit-mask-image: var(--royal-mask);
  mask-size: 100% 100%;
  -webkit-mask-size: 100% 100%;
}
.royal-glass {
  position: absolute;
  z-index: 2;
  top: 8%;
  height: 52%;
  left: 27%;
  width: 46%;
  border-radius: 45% 45% 0 0;
  background: linear-gradient(115deg, transparent 30%, #e3d1ba0c 45%, transparent 58%);
  box-shadow: inset 0 0 0 1px #b89d6540;
  overflow: hidden;
}
.royal-glass i {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: linear-gradient(90deg, #6d542b, #d4b476, #614b2c);
}
.royal-glass i:first-child {
  left: 24%;
}
.royal-glass i:last-child {
  right: 24%;
}
.city-light {
  position: absolute;
  width: 2px;
  height: 2px;
  border-radius: 100%;
  background: #f8d891;
  box-shadow: 0 0 5px #f8d89190;
  opacity: 0.3;
}
.city-light-a {
  left: 42%;
  top: 41%;
}
.city-light-b {
  left: 62%;
  top: 49%;
}
.eye-window-room {
  z-index: 1;
  --eye-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1000 1500'%3E%3Cpath fill='white' fill-rule='evenodd' d='M0 0H1000V1500H0Z M568 400A68 68 0 1 0 432 400A68 68 0 1 0 568 400Z'/%3E%3C/svg%3E");
  mask-image: var(--eye-mask);
  -webkit-mask-image: var(--eye-mask);
  mask-size: 100% 100%;
  -webkit-mask-size: 100% 100%;
}
.eye-city-depth .eye-city-plate {
  object-position: 50% 62%;
  filter: brightness(1) saturate(0.8);
}
.eye-orbit {
  position: absolute;
  z-index: 3;
  left: 26%;
  top: 11%;
  width: 48%;
  height: 32%;
  border: 1px solid #d7bc8280;
  border-radius: 50%;
  box-shadow: 0 0 12px #ba85bb30;
  opacity: 0;
}
.orbit-b {
  left: 18%;
  top: 6%;
  width: 64%;
  height: 43%;
  border-color: #a285c890;
}
.shock-motif {
  position: absolute;
  z-index: 4;
  left: 36%;
  top: 56%;
  width: 28%;
  height: 9%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 13%;
  opacity: 0;
}
.shock-motif i {
  display: block;
  width: 25%;
  height: 75%;
  border: 1px solid #d5b77f;
  border-radius: 50%;
  background: linear-gradient(145deg, #c09c4b26, #79669d26);
  box-shadow: 0 0 10px #b9a56b1c;
}
.shock-motif b {
  display: none;
}
.cinema-v3[data-motif='twin-shields'] .shock-motif i {
  border-radius: 25% 25% 50% 50%;
  height: 90%;
}
.cinema-v3[data-motif='slashes'] .shock-motif i {
  width: 8%;
  border-radius: 0;
  transform: rotate(18deg);
  border-color: #d7968e;
  background: #a64f5b40;
}
.cinema-v3[data-motif='halo'] .shock-motif i {
  height: 20%;
  width: 65%;
  border-radius: 50%;
  transform: rotate(-15deg);
}
.cinema-v3[data-motif='halo'] .shock-motif i:nth-child(2) {
  display: none;
}
.cinema-v3[data-motif='return'] .shock-motif {
  border: 1px solid #d7b981;
  border-right-color: transparent;
  border-radius: 50%;
  height: 8%;
  width: 16%;
  left: 42%;
}
.cinema-v3[data-motif='return'] .shock-motif i {
  width: 0;
  height: 0;
  border: 5px solid transparent;
  border-right: 7px solid #d7b981;
  background: none;
  position: absolute;
  left: -5px;
  top: 35%;
}
.cinema-v3[data-motif='return'] .shock-motif i:nth-child(2) {
  display: none;
}
.cinema-v3[data-motif='ballots'] .shock-motif i {
  border-radius: 1px;
  transform: rotate(-8deg);
  height: 60%;
  width: 40%;
}
.cinema-v3[data-motif='storm'] .shock-motif i {
  border-radius: 50% 50% 30% 30%;
  width: 75%;
  height: 50%;
  background: #7b789044;
  border-color: #9993a0;
}
.cinema-v3[data-motif='storm'] .shock-motif i:nth-child(2) {
  display: none;
}
.cinema-v3[data-motif='sunrise'] .shock-motif i {
  width: 55%;
  height: 80%;
  border-bottom: 0;
  border-radius: 50% 50% 0 0;
  background: #d6aa5430;
}
.cinema-v3[data-motif='sunrise'] .shock-motif i:nth-child(2) {
  display: none;
}
.cinema-v3[data-motif='arrows'] .shock-motif i {
  width: 70%;
  height: 1px;
  border: 0;
  background: #d596b1;
  transform: rotate(-25deg);
}
.cinema-v3[data-motif='broken-heart'] .shock-motif i {
  border-radius: 60% 60% 0 0;
  border-color: #d596b1;
  transform: rotate(-25deg);
}
.cinema-v3[data-motif='broken-heart'] .shock-motif i:nth-child(2) {
  transform: rotate(25deg);
}
.cinema-v3.film-shock .cine-titles {
  bottom: 12%;
}
.cinema-v3.film-shock .cine-titles h3 {
  font-size: 27px;
}
.cinema-v3.film-shock .cine-titles p {
  font-size: 9px;
  letter-spacing: 0.03em;
}
.final-decision {
  position: absolute;
  z-index: 7;
  top: 65%;
  left: 61%;
  width: 35%;
  padding: 7px 3px;
  text-align: center;
  color: #e9b4aa;
  font:
    400 12px Georgia,
    serif;
  opacity: 0;
  background: #36182799;
  border-top: 1px solid #bd7d7666;
  border-bottom: 1px solid #bd7d7666;
}
.final-decision > span {
  display: block;
  font:
    5px Arial,
    sans-serif;
  letter-spacing: 0.1em;
  margin-top: 4px;
}
.cinema-v3.film-final3 .cine-departure {
  width: 34%;
  left: 33%;
  bottom: 37%;
  transform-origin: 50% 100%;
  z-index: 3;
}
.doorway-volume {
  position: absolute;
  inset: 0;
  z-index: 4;
  clip-path: inset(0 39% 57.5% 39%);
  overflow: hidden;
  pointer-events: none;
}
.cinema-v3 .cine-gates {
  top: 0;
  height: 42.5%;
  left: 39%;
  width: 22%;
  z-index: 6;
}
.cinema-v3 .cine-gate {
  width: 50.5%;
  height: 100%;
  background: #261a17;
}
.portal-floor-light {
  position: absolute;
  z-index: 1;
  left: 37%;
  width: 26%;
  height: 4%;
  top: 40%;
  border-radius: 50%;
  background: radial-gradient(ellipse, #d8b27540, transparent 75%);
}
.cinema-v3 .departure-far {
  opacity: 0;
}
.cinema-v3 .departure-near {
  opacity: 1;
}
.cinema-v3.c-static .depth-entrance,
.cinema-v3.c-static .foreground-jamb,
.cinema-v3.c-static .transition-blade,
.cinema-v3.c-static .ceremony-energy {
  display: none;
}
.cinema-v3.c-static .beat-initial,
.cinema-v3.c-static .beat-action {
  display: none;
}
.cinema-v3.c-static .tally-after,
.cinema-v3.c-static .verdict-bracket {
  opacity: 1;
}
.cinema-v3.c-static .departure-near,
.cinema-v3.c-static .departure-far {
  visibility: hidden;
}
.cinema-v3.c-static.film-final3 .gate-left {
  transform: translateX(0);
}
.cinema-v3.c-static.film-final3 .gate-right {
  transform: translateX(0) scaleX(-1);
}
.cinema-v3.c-static .royal-group {
  transform: none;
}
@media (min-width: 621px) {
  .cinema-v3 .cine-titles h3 {
    font-size: 32px;
  }
  .cine-beat {
    font-size: 7px;
  }
  .actor-badge {
    font-size: 6px;
  }
}
@media (max-width: 360px) {
  .cinema-v3 .cine-titles h3 {
    font-size: 25px;
  }
  .cinema-v3 .cine-titles p {
    font-size: 5.5px;
  }
  .cine-beat {
    font-size: 5.5px;
  }
  .actor-badge {
    font-size: 5px;
  }
  .cinema-v3.film-shock .cine-titles h3 {
    font-size: 23px;
  }
}
.cinema-v3[data-motif='pulse'] .shock-motif i {
  height: 1px;
  width: 40%;
  border: 0;
  border-radius: 0;
  background: linear-gradient(90deg, transparent, #d5bb88, transparent);
  box-shadow: 0 0 9px #c5ab7b50;
}
.cinema-v3[data-motif='pulse'] .shock-motif b {
  display: block;
  position: absolute;
  left: 48%;
  top: 46%;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #dac18e;
  box-shadow: 0 0 14px #d5b67e80;
}
`,ue=`/* Revision 4: shared decisions / physical exit / portrait handoff. */
.decision-film {
  background: #0a080e;
  perspective: none;
}
.decision-shot,
.decision-camera,
.exit-shot,
.exit-camera,
.avatar-sequence,
.avatar-stage {
  position: absolute;
  inset: 0;
}
.decision-camera {
  transform-origin: 54% 45%;
}
.decision-bg,
.exit-background {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.decision-room-dim {
  position: absolute;
  inset: 0;
  z-index: 1;
  background: #06050be8;
  opacity: 0;
}
.decision-person {
  position: absolute;
  aspect-ratio: 2/3;
  transform-origin: 50% 95%;
  z-index: 3;
}
.decision-body {
  width: 100%;
  height: 100%;
  object-fit: contain;
  position: relative;
}
.decision-dark-body {
  position: absolute;
  inset: 0;
  filter: brightness(0.2) saturate(0.6);
  opacity: 0;
}
.decision-holder .decision-insignia.crown {
  left: 37%;
  top: 1.6%;
  width: 17%;
  height: auto;
}
.decision-holder .decision-insignia.shield {
  left: 22%;
  top: 48%;
  width: 24%;
  height: 28%;
}
.decision-holder.is-layer-hidden .decision-insignia:not(.is-layer-hidden) {
  visibility: visible;
}
.decision-contact {
  position: absolute;
  left: 25%;
  width: 50%;
  height: 2%;
  bottom: 4.5%;
  background: #000b;
  border-radius: 50%;
  filter: blur(2px);
}
.decision-holder {
  left: 0%;
  width: 63%;
  bottom: 10%;
  z-index: 5;
}
.decision-survivor {
  left: 25%;
  width: 43%;
  bottom: 35%;
}
.decision-evictee {
  left: 61%;
  width: 43%;
  bottom: 35%;
  z-index: 4;
}
.decision-badge {
  position: absolute;
  left: -5%;
  right: -5%;
  bottom: -3%;
  text-align: center;
  white-space: nowrap;
  color: #e6d2ae;
  font-size: 5.5px;
  letter-spacing: 0.12em;
  text-shadow: 0 2px 7px #000;
}
.decision-holder .decision-badge {
  left: -2%;
  font-size: 6px;
  bottom: 1%;
  color: #edcd8e;
}
.decision-insignia {
  position: absolute;
  z-index: 6;
  object-fit: contain;
}
.decision-insignia.crown {
  width: 12%;
  height: auto;
  left: 21%;
  top: 27%;
}
.decision-insignia.shield {
  width: 15%;
  height: 18%;
  left: 12%;
  top: 57%;
  filter: drop-shadow(0 1px 8px #040108);
}
.decision-holder-shade,
.decision-survivor-shade {
  display: none;
}
.decision-spotlight {
  position: absolute;
  z-index: 2;
  left: 61%;
  top: 7%;
  width: 43%;
  height: 62%;
  background: linear-gradient(180deg, #f2c88508, #f0c28a2b);
  clip-path: polygon(43% 0, 57% 0, 100% 100%, 0 100%);
  transform-origin: 50% 0;
  opacity: 0;
}
.decision-selection {
  position: absolute;
  z-index: 7;
  left: 67%;
  top: 22%;
  width: 30%;
  height: 40%;
  opacity: 0;
  transform-origin: 50% 100%;
}
.decision-selection i {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 17%;
  border-top: 1px solid #e0b986;
  border-bottom: 1px solid #e0b986;
}
.decision-selection i:first-child {
  left: 0;
  border-left: 1px solid #e0b986;
  border-radius: 20px 0 0 3px;
}
.decision-selection i:last-child {
  right: 0;
  border-right: 1px solid #e0b986;
  border-radius: 0 20px 3px 0;
}
.decision-intro {
  position: absolute;
  z-index: 9;
  left: 6%;
  right: 6%;
  top: 8%;
  font-size: 6.5px;
  letter-spacing: 0.14em;
  text-align: center;
  color: #ecd5a8;
  text-shadow: 0 2px 8px #000;
  opacity: 0;
}
.decision-verdict {
  position: absolute;
  z-index: 9;
  left: 6%;
  right: 6%;
  bottom: 8%;
  text-align: center;
  text-shadow: 0 2px 12px #000;
  opacity: 0;
}
.decision-verdict span {
  font-size: 5.7px;
  letter-spacing: 0.15em;
  color: #c7b394;
}
.decision-verdict h3 {
  font:
    normal 33px Georgia,
    serif;
  margin: 7px 0;
  color: #f1e2cc;
}
.decision-verdict p {
  font-size: 7px;
  letter-spacing: 0.18em;
  color: #dfb793;
  margin: 0;
}
.decision-cut {
  position: absolute;
  inset: 0;
  z-index: 12;
  background: linear-gradient(120deg, #1b102a, #8c728e 48%, #ae8f68 52%, #211328);
  opacity: 0;
}
.exit-shot {
  opacity: 0;
}
.exit-camera {
  transform-origin: 50% 21.25%;
}
.decision-film .cine-departure {
  position: absolute;
  aspect-ratio: 2/3;
  width: 34%;
  left: 33%;
  bottom: 37%;
  transform-origin: 50% 100%;
  z-index: 3;
}
.decision-film .cine-rear {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.decision-film .doorway-volume {
  position: absolute;
  inset: 0;
  z-index: 4;
  clip-path: inset(0 39% 57.5% 39%);
  overflow: hidden;
}
.decision-film .cine-gates {
  top: 0;
  height: 42.5%;
  left: 39%;
  width: 22%;
  z-index: 6;
}
.decision-film .cine-gate {
  width: 50.5%;
  height: 100%;
  background: #261a17;
}
.exit-light {
  position: absolute;
  inset: 0;
  z-index: 1;
  background:
    radial-gradient(ellipse at 50% 40%, #d2b57a18, transparent 45%),
    linear-gradient(0deg, #09060ebf, transparent 70%);
  pointer-events: none;
}
.exit-caption {
  position: absolute;
  z-index: 8;
  bottom: 10%;
  left: 5%;
  right: 5%;
  text-align: center;
  opacity: 0;
  text-shadow: 0 2px 9px #000;
}
.exit-caption span,
.exit-caption p {
  color: #d4ba8c;
  font-size: 7px;
  letter-spacing: 0.18em;
}
.exit-caption h3 {
  font:
    normal 30px Georgia,
    serif;
  color: #efe2c9;
  margin: 9px 0;
}
.handoff-veil {
  position: absolute;
  inset: 0;
  z-index: 20;
  pointer-events: none;
  background: radial-gradient(ellipse at 50% 23%, #bba284, #8e7494 35%, #35233e 80%);
  opacity: 0;
}
.avatar-sequence {
  z-index: 18;
  opacity: 0;
  background: #0e0b14;
}
.avatar-stage {
  overflow: hidden;
}
.avatar-dim {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at 50% 78%, #30213f, #08070c 70%);
}
.avatar-hero {
  position: absolute;
  inset: 0;
  transform-origin: 50% 50%;
  overflow: hidden;
  background: #24272d;
}
.avatar-photo {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: 50% 0;
}
.avatar-grade {
  filter: saturate(0.15) contrast(1.1) brightness(0.82);
  opacity: 0;
}
.avatar-vignette {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at 50% 55%, transparent 28%, #000b 100%);
  opacity: 0;
}
.avatar-scanlines {
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 3px,
    #0000000e 3px,
    #0000000e 4px
  );
}
.avatar-live {
  position: absolute;
  top: 7%;
  left: 6%;
  padding: 4px 6px;
  border-radius: 2px;
  font:
    bold 7px Arial,
    sans-serif;
  letter-spacing: 0.12em;
  color: #fff;
  background: #dc2626e6;
  opacity: 0;
}
.avatar-lower-third {
  position: absolute;
  bottom: 12%;
  left: 7%;
  right: 7%;
  padding: 15px 0;
  border-top: 1px solid #ffffff40;
  opacity: 0;
  color: white;
  text-shadow: 0 2px 9px #000;
}
.avatar-lower-third span {
  font:
    600 7px Arial,
    sans-serif;
  letter-spacing: 0.16em;
  color: #d1c9c6;
}
.avatar-lower-third h3 {
  font:
    800 32px Arial,
    sans-serif;
  margin: 6px 0 0;
  letter-spacing: -0.025em;
}
.avatar-stamp {
  position: absolute;
  z-index: 4;
  top: 49%;
  left: 50%;
  width: 77%;
  height: auto;
  opacity: 0;
  transform: translate(-50%, -50%) rotate(-12deg);
}
.avatar-roster-label {
  position: absolute;
  top: 92%;
  left: 0;
  right: 0;
  text-align: center;
  font:
    6px Arial,
    sans-serif;
  letter-spacing: 0.17em;
  color: #c5b7a5;
  opacity: 0;
}
.decision-film.c-static .decision-shot {
  opacity: 1;
}
.decision-film.c-static .exit-shot,
.decision-film.c-static .avatar-sequence {
  opacity: 0;
}
.decision-film.c-static.film-exit .exit-shot {
  opacity: 1;
}
.decision-film.c-static .exit-caption {
  opacity: 1;
}
.decision-film.c-static .gate-left {
  transform: translateX(-105%);
}
.decision-film.c-static .gate-right {
  transform: translateX(105%) scaleX(-1);
}
.decision-film.c-static .decision-intro {
  opacity: 1;
}
.ceremony-backdrop {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 0;
  opacity: 0.58;
}
.ceremony-backdrop-shade {
  position: absolute;
  inset: 0;
  z-index: 0;
  background:
    radial-gradient(ellipse at 50% 38%, transparent 25%, #0b07104d 85%),
    linear-gradient(0deg, #0a0714b5, transparent 38%);
  pointer-events: none;
}
.shock-quake {
  position: absolute;
  inset: 0;
  transform-origin: 50% 32%;
}
.shock-impact {
  position: absolute;
  inset: 0;
  z-index: 14;
  pointer-events: none;
}
.shock-pressure {
  position: absolute;
  left: 2%;
  top: 0%;
  width: 96%;
  height: 64%;
  border-radius: 50%;
  border: 2px solid #ead0a2;
  box-shadow:
    inset 0 0 25px #c79be84d,
    0 0 25px #d5b57e50;
  opacity: 0;
}
.shock-fracture {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    100deg,
    transparent 35%,
    #b397c36e 45%,
    #e1c395c4 50%,
    #9c78b747 55%,
    transparent 65%
  );
  opacity: 0;
}
.shock-interruption {
  position: absolute;
  top: 47%;
  left: 0;
  right: 0;
  color: #f0dbb1;
  font:
    bold 7px Arial,
    sans-serif;
  letter-spacing: 0.4em;
  text-align: center;
  opacity: 0;
  text-shadow: 0 0 12px #a783ce;
}
.shock-v4 .cine-cut {
  background: radial-gradient(ellipse at 50% 27%, #bb9c97, #654b7b 50%, #140e22);
}
/* Two bounded compositor planes give the announcement cards a gentle forward drift. */
.announcement-space {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
  perspective: 600px;
}
.space-plane {
  position: absolute;
  inset: -6%;
  opacity: 0.35;
  transform-origin: 50% 42%;
  background:
    radial-gradient(ellipse at 25% 30%, #9061b530, transparent 42%),
    radial-gradient(ellipse at 75% 65%, #5a387e2b, transparent 40%),
    radial-gradient(1px 1px at 22% 24%, #cfbddc99, transparent),
    radial-gradient(1px 1px at 73% 17%, #dec8a480, transparent),
    radial-gradient(1px 1px at 83% 51%, #cebad88c, transparent),
    radial-gradient(1px 1px at 33% 78%, #d5bd9966, transparent),
    radial-gradient(1px 1px at 59% 58%, #c8a2d46e, transparent);
}
.space-plane-b {
  inset: -9%;
  background:
    radial-gradient(ellipse at 65% 34%, #9d74b01f, transparent 47%),
    radial-gradient(1px 1px at 31% 40%, #f4d7a26e, transparent),
    radial-gradient(1px 1px at 68% 72%, #e5cadd88, transparent),
    radial-gradient(1px 1px at 13% 65%, #b7a1cc88, transparent);
}
.announcement-line {
  position: absolute;
  top: 28%;
  left: 33%;
  width: 34%;
  height: 1px;
  background: linear-gradient(90deg, transparent, #c5a97099, transparent);
  transform-origin: left;
  opacity: 0;
}
.gallery-stage .stage-idle {
  z-index: 1;
  perspective: 800px;
}
.gallery-stage .stage-idle h1 {
  transform-origin: 50% 60%;
}
@media (prefers-reduced-motion: reduce) {
  .announcement-space {
    display: none;
  }
}
`,N=`/* Revision 5: one organic Eye interruption; no architectural wipes or HUD effects. */
.shock-film {
  --shock-accent: #c9ad86;
  background: #07050b;
  perspective: none;
}
.shock-film[data-shock='danger'] {
  --shock-accent: #b88f88;
}
.shock-film[data-shock='rose'] {
  --shock-accent: #c4a0b4;
}
.shock-film[data-shock='storm'] {
  --shock-accent: #a5a0ba;
}
.shock-film[data-shock='dawn'] {
  --shock-accent: #c8a68b;
}
.shock-chamber,
.shock-lens,
.shock-room-plane,
.shock-city-window {
  position: absolute;
  inset: 0;
}
.shock-chamber {
  transform-origin: 50% 25.6667%;
}
.shock-lens {
  transform-origin: 50% 25.6667%;
}
.shock-film .eye-window-room {
  --eye-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1000 1500'%3E%3Cpath fill='white' fill-rule='evenodd' d='M0 0H1000V1500H0Z M569 385A69 69 0 1 0 431 385A69 69 0 1 0 569 385Z'/%3E%3C/svg%3E");
}
.shock-wall {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: fill;
}
.shock-city-window {
  z-index: 0;
  overflow: hidden;
}
.shock-city {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: 50% 64%;
  opacity: 0.9;
}
.shock-interrupted-feed {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: #100b1b;
}
.shock-feed-city {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: 50% 64%;
  filter: brightness(0.7) saturate(0.75);
}
.shock-clash-light {
  position: absolute;
  inset: 0;
  z-index: 11;
  pointer-events: none;
  background: radial-gradient(ellipse at 50% 27%, #d0b788aa, #8e6fa252 43%, #11091d40 80%);
  opacity: 0;
}
.shock-film.c-static .shock-interrupted-feed,
.shock-film.c-static .shock-clash-light {
  opacity: 0;
}
.shock-room-plane {
  z-index: 1;
}
.shock-iris {
  position: absolute;
  z-index: 2;
  left: 33.3%;
  top: 14.5333%;
  width: 33.4%;
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: 50%;
  mask-image: radial-gradient(
    circle closest-side,
    transparent 0 40%,
    #000 42% 94%,
    transparent 100%
  );
  transform-origin: 50% 50%;
}
.shock-iris-texture {
  position: absolute;
  left: -99.7006%;
  top: -65.2693%;
  width: 299.4012%;
  height: 449.1018%;
  max-width: none;
  object-fit: fill;
}
.shock-chamber-shadow {
  position: absolute;
  z-index: 3;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(ellipse 52% 28% at 50% 26.6667%, transparent 35%, #050309d9 100%);
}
.shock-eye-light {
  position: absolute;
  z-index: 4;
  left: 9%;
  top: 12%;
  width: 82%;
  height: 31%;
  opacity: 0;
  background: radial-gradient(ellipse, #b7894a05 23%, #c7a36b2b 49%, transparent 70%);
  pointer-events: none;
}
.shock-breath {
  position: absolute;
  z-index: 5;
  inset: 0;
  opacity: 0;
  pointer-events: none;
  background:
    radial-gradient(ellipse at 28% 45%, #856d9b24, transparent 58%),
    linear-gradient(112deg, transparent 35%, #c0a17f0b 49%, transparent 60%);
}
.shock-blackout {
  position: absolute;
  z-index: 8;
  inset: 0;
  background: #040208;
  opacity: 0;
  pointer-events: none;
}
.shock-hush,
.shock-presence {
  position: absolute;
  z-index: 9;
  left: 7%;
  right: 7%;
  text-align: center;
  color: #c8b8a0;
  font:
    5.7px Arial,
    sans-serif;
  letter-spacing: 0.24em;
  opacity: 0;
}
.shock-hush {
  top: 58%;
}
.shock-presence {
  top: 60%;
  color: #d0bfa6;
}
.shock-film .cine-titles {
  z-index: 10;
  bottom: 13%;
  left: 9%;
  right: 9%;
}
.shock-film .cine-titles > span {
  font-size: 5.8px;
  letter-spacing: 0.21em;
  color: #a99c8d;
}
.shock-film .cine-titles h3 {
  color: #e4d5c2;
  font:
    normal 29px/1.12 Georgia,
    serif;
  letter-spacing: 0.02em;
  margin: 15px 0 0;
  text-wrap: balance;
}
.shock-film .cine-titles p {
  font:
    9px/1.6 Arial,
    sans-serif;
  color: #b7a9a2;
  letter-spacing: 0.03em;
  margin: 16px auto 0;
  max-width: 95%;
}
.shock-film .cine-titles > .shock-rule {
  height: 1px;
  width: 40px;
  margin: 17px auto 0;
  background: linear-gradient(90deg, transparent, var(--shock-accent), transparent);
  transform-origin: center;
  opacity: 0;
}
.shock-film[data-motif='slashes'] .shock-rule {
  height: 3px;
  border-top: 1px solid var(--shock-accent);
  border-bottom: 1px solid var(--shock-accent);
  background: none;
}
.shock-edge-shade {
  position: absolute;
  z-index: 7;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(0deg, #07050bf2, transparent 62%),
    radial-gradient(ellipse at 50% 35%, transparent 40%, #08050c7a);
}
.shock-film.c-static .shock-chamber {
  opacity: 1;
  transform: scale(1.04);
}
.shock-film.c-static .cine-titles {
  opacity: 1;
}
.shock-film.c-static .shock-chamber-shadow {
  opacity: 0.73;
}
.shock-film.c-static .shock-city {
  opacity: 0.025;
}
.shock-film.c-static .shock-copy {
  opacity: 1;
}
.shock-film.c-static .shock-blackout,
.shock-film.c-static .shock-hush,
.shock-film.c-static .shock-presence {
  opacity: 0;
}
@media (max-width: 360px) {
  .shock-film .cine-titles h3 {
    font-size: 25px;
  }
  .shock-film .cine-titles p {
    font-size: 8px;
  }
}
/* Finals: move closer to the holder, then carry the gaze to the nominee. */
.suspense-decision .decision-verdict {
  left: 7%;
  right: 48%;
  bottom: 13%;
  text-align: left;
}
.suspense-decision .decision-verdict h3 {
  font-size: 31px;
}
.suspense-decision .decision-verdict span {
  line-height: 1.8;
  display: block;
  font-size: 5.6px;
  letter-spacing: 0.12em;
}
.suspense-decision .decision-verdict p {
  font-size: 6px;
  line-height: 1.7;
  letter-spacing: 0.14em;
}
.decision-spotlight {
  left: 59%;
  top: 8%;
  width: 47%;
  height: 60%;
  clip-path: none;
  background: radial-gradient(ellipse at 50% 44%, #ebc49020, transparent 68%);
  transform-origin: 50% 70%;
}
.decision-spotlight:after {
  content: '';
  position: absolute;
  bottom: 2%;
  left: 12%;
  width: 76%;
  height: 6%;
  border-radius: 50%;
  background: radial-gradient(ellipse, #ebc49049, transparent 72%);
}
.decision-suspense {
  position: absolute;
  z-index: 9;
  left: 7%;
  right: 7%;
  top: 10%;
  color: #dac7a8;
  font:
    6px Arial,
    sans-serif;
  letter-spacing: 0.2em;
  text-align: center;
  opacity: 0;
  text-shadow: 0 2px 8px #000;
}
`,P=`/* Final-day closing ident lives on the transition veil, outside the doorway camera. */
.finale-closing-brand {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.decision-film .exit-brand,
.finale-closing-brand .exit-brand {
  position: absolute;
  inset: 0;
  z-index: 21;
  display: grid;
  place-items: center;
  pointer-events: none;
  opacity: 0;
}
.exit-brand-lockup {
  position: relative;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  transform-origin: 50% 50%;
}
.exit-brand-emblem {
  position: relative;
  width: 47%;
  max-width: 236px;
  aspect-ratio: 1;
  perspective: 900px;
}
.exit-brand-turn {
  position: absolute;
  inset: 0;
  transform-style: preserve-3d;
}
.exit-brand-face {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  backface-visibility: hidden;
  transform: translateZ(1px);
  filter: drop-shadow(0 6px 10px #1f10284d);
}
.exit-brand-back {
  transform: rotateY(180deg) translateZ(1px);
}
.exit-brand-glow {
  position: absolute;
  inset: -28%;
  border-radius: 50%;
  background: radial-gradient(ellipse, #fff2c442 0, #f9d99524 34%, transparent 70%);
  opacity: 0;
}
.exit-brand-reflection {
  position: absolute;
  top: 101%;
  left: 8%;
  width: 84%;
  height: 36%;
  overflow: hidden;
  opacity: 0;
  mask-image: linear-gradient(#0009, transparent 86%);
}
.exit-brand-reflection-image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: fill;
  transform: scaleY(-1);
}
.exit-brand-shine {
  position: absolute;
  inset: 6% 8%;
  overflow: hidden;
  border-radius: 50%;
  mix-blend-mode: screen;
  opacity: 0;
}
.exit-brand-shine i {
  position: absolute;
  inset: -25% 25%;
  background: linear-gradient(90deg, transparent, #fff4d17a 48%, transparent 100%);
}
.exit-brand-title {
  position: relative;
  margin-top: clamp(19px, 3.4dvh, 36px);
  padding-left: 0.22em;
  color: #fff0cb;
  font:
    400 clamp(17px, 2.75dvh, 29px) / 1.2 Georgia,
    'Times New Roman',
    serif;
  letter-spacing: 0.22em;
  white-space: nowrap;
  text-align: center;
  text-shadow: 0 2px 12px #24132f80;
  opacity: 0;
}
.exit-brand-rule {
  display: block;
  width: 22%;
  height: 1px;
  margin-top: clamp(13px, 2.2dvh, 23px);
  background: linear-gradient(90deg, transparent, #ffe6b9, transparent);
  opacity: 0;
}

/* The spectator competition and live final-day departure share the same
   lens-bound Eye fly-through and opaque final black frame. */
.exit-brand-emblem {
  transform-origin: 50% 50%;
}
.exit-brand-blackout {
  position: absolute;
  inset: -2px;
  z-index: 30;
  background: #050408;
  opacity: 0;
  pointer-events: none;
}
`,de=`:host {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: grid;
  place-items: center;
  background: radial-gradient(ellipse at 50% 30%, #24152e, #050309 80%);
}
.stage {
  position: relative !important;
  width: min(100vw, 56.25dvh) !important;
  height: 100vh !important;
  height: 100dvh !important;
  max-width: none !important;
  aspect-ratio: auto !important;
  max-height: 100dvh !important;
  border: 0 !important;
  border-radius: 0 !important;
  overflow: hidden !important;
  background: #0a0710 !important;
  transform: none !important;
}
.c-scene,
.loh-scene {
  position: absolute;
  inset: 0;
}
.c-nominations .nom-person {
  bottom: 28%;
  z-index: 4;
}
.c-nominations .nom-platform {
  z-index: 3;
}
.nom-decision {
  position: absolute;
  inset: 0;
  z-index: 8;
  overflow: hidden;
  background: #100b15;
}
.nom-decision-room,
.nom-decision-shadow {
  position: absolute;
  inset: 0;
}
.nom-decision-backdrop {
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: brightness(0.5);
}
.nom-decision-shadow {
  background: linear-gradient(0deg, #09060de8, transparent 34%, #0d08166b 85%);
}
.nom-decision-figure {
  position: absolute;
  bottom: 21%;
  left: 12%;
  width: 76%;
  aspect-ratio: 2/3;
  transform-origin: 50% 86%;
}
.nom-decision-throne,
.nom-decision-person {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: fill;
}
.nom-decision-person {
  z-index: 1;
}
.nom-decision-caption {
  position: absolute;
  right: 6%;
  bottom: 9%;
  left: 6%;
  display: grid;
  justify-items: center;
  gap: 8px;
  color: #f4e9dc;
  text-align: center;
  text-shadow: 0 2px 18px #08050b;
}
.nom-decision-caption span,
.nom-decision-caption em {
  color: #d6bb88;
  font:
    600 clamp(8px, 1.8vw, 12px) / 1.3 system-ui,
    sans-serif;
  font-style: normal;
  letter-spacing: 0.18em;
}
.nom-decision-caption strong {
  font:
    500 clamp(25px, 6.5vw, 42px) / 1.05 Georgia,
    serif;
}
.nom-decision-progress {
  width: min(40%, 160px);
  height: 1px;
  margin-top: 8px;
  background: linear-gradient(90deg, transparent, #e6cc97, transparent);
  transform-origin: 0 50%;
}

.nom-coloh-intro {
  position: absolute;
  z-index: 8;
  inset: 0;
  pointer-events: none;
}
.nom-coloh-active .nom-warning {
  visibility: hidden;
}
.nom-coloh-header {
  position: absolute;
  top: 8%;
  left: 9%;
  width: 82%;
  color: #d7bf8e;
  font:
    600 9px / 1.4 system-ui,
    sans-serif;
  letter-spacing: 0.21em;
  text-align: center;
  text-shadow: 0 2px 14px #05030bea;
}
.nom-coloh-beat {
  position: absolute;
  top: 14%;
  left: 8%;
  display: grid;
  align-content: center;
  justify-items: center;
  box-sizing: border-box;
  width: 84%;
  gap: 5px;
  text-align: center;
  text-shadow: 0 2px 15px #07040deb;
}
.nom-coloh-beat span,
.nom-coloh-beat em {
  color: #c9b282;
  font:
    600 7px / 1.4 system-ui,
    sans-serif;
  font-style: normal;
  letter-spacing: 0.17em;
}
.nom-coloh-beat strong {
  margin: 3px 0;
  color: #f0e5d4;
  font:
    400 clamp(22px, 5.8vw, 31px) / 1.05 Georgia,
    serif;
  overflow-wrap: anywhere;
}
.loh-figure {
  width: 76%;
  height: auto;
  aspect-ratio: 2/3;
  left: 12%;
  margin: 0;
  bottom: 18%;
}
.loh-pose {
  position: absolute;
  inset: 0;
}
.loh-pose .loh-person {
  width: 100%;
  height: 100%;
  object-fit: fill;
}
.loh-seated {
  left: 12%;
  width: 76%;
  height: auto;
  aspect-ratio: 2/3;
  bottom: 18%;
}
.loh-seat-throne,
.loh-seated-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: fill;
}
.loh-backdrop {
  position: absolute;
  inset: 0;
  transform-origin: 50% 40%;
}
.loh-backdrop-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: brightness(0.55);
}
.loh-flash {
  z-index: 3;
}
.loh-seat-flash {
  z-index: 4;
}
.loh-titles {
  z-index: 5;
}
.cine-royal {
  aspect-ratio: 2/3;
}
.cine-seated {
  width: 100%;
  height: auto;
  display: block;
}
.cine-person > .cine-body {
  width: 100%;
  height: auto;
  display: block;
}
.fitted-knight-shield {
  position: absolute;
  left: 53%;
  top: 39%;
  width: 22%;
  height: 25%;
  object-fit: contain;
  z-index: 4;
  opacity: 0;
}
/* The walk and doorway mask use the chamber plate's 2:3 coordinate space.
   Crop that whole space on a narrow phone: squeezing only the actors leaves
   their feet below the landing when the depth mask takes over. */
.decision-film .exit-camera {
  width: auto;
  height: 100%;
  aspect-ratio: 2/3;
  min-width: 100%;
  left: 50%;
  right: auto;
  translate: -50% 0;
}
/* Occlusion is a binary depth transfer at the real doorway, not a dissolve. */
.decision-film .departure-near,
.decision-film .departure-far {
  transform-origin: 50% 100%;
}
.decision-film .cine-rear {
  object-fit: fill;
}

/* Keep the drapery anchored above the ceiling while retaining its floor line. */
.fitted-loh .loh-curtain {
  top: -2%;
  height: 80%;
}
.fitted-loh .loh-curtain img {
  object-fit: fill;
}

.c-nominations.nom-three .nom-pod {
  width: 31%;
  height: 57%;
  top: 20%;
}
.c-nominations.nom-three .nom-first {
  left: 1%;
}
.c-nominations.nom-three .nom-second {
  left: 34%;
  right: auto;
}
.c-nominations.nom-three .nom-third {
  left: 67%;
}

/* Optical announcement layers share the title's lifetime and stay behind the lettering. */
.shock-film[data-shock-kind] .cine-titles {
  --shock-accent: var(--shock-theme-accent);
  isolation: isolate;
}
.shock-title-fx {
  position: absolute;
  inset: -55% -16% -42%;
  z-index: -1;
  pointer-events: none;
  contain: layout style;
}
.shock-title-fx > div {
  position: absolute;
  inset: 0;
  opacity: 0;
}
.shock-title-fx svg {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}
.shock-fx-veil {
  background:
    radial-gradient(
      ellipse at 28% 55%,
      color-mix(in srgb, var(--shock-theme-color) 27%, transparent),
      transparent 51%
    ),
    radial-gradient(
      ellipse at 74% 47%,
      color-mix(in srgb, var(--shock-theme-accent) 12%, transparent),
      transparent 47%
    ),
    radial-gradient(ellipse at 50% 70%, #07050b9c, transparent 65%);
}
.shock-title-fx > .shock-fx-horizon {
  top: 71%;
  bottom: auto;
  height: 15%;
  left: 4%;
  right: 4%;
  background:
    radial-gradient(ellipse at 50% 50%, #fff1d470, transparent 9%),
    radial-gradient(ellipse at 50% 50%, var(--shock-theme-color), transparent 66%);
  mask-image: linear-gradient(transparent, #000 45%, #000 55%, transparent);
}
.shock-title-fx > .shock-fx-horizon::after {
  content: '';
  position: absolute;
  left: 3%;
  right: 3%;
  top: 50%;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent,
    var(--shock-theme-color),
    #e8d9b9,
    var(--shock-theme-color),
    transparent
  );
}
.shock-title-fx > .shock-fx-glint {
  inset: 13% -4% 22%;
  background:
    radial-gradient(ellipse at 50% 50%, #fff4de94, transparent 3%),
    radial-gradient(
      ellipse at 50% 50%,
      color-mix(in srgb, var(--shock-theme-accent) 44%, transparent),
      transparent 14%
    ),
    radial-gradient(
      ellipse at 50% 50%,
      color-mix(in srgb, var(--shock-theme-color) 33%, transparent),
      transparent 43%
    );
}
.shock-film[data-shock-flow='fall'] .shock-fx-veil {
  background:
    radial-gradient(ellipse at 30% 30%, #46628e33, transparent 54%),
    radial-gradient(ellipse at 70% 65%, #03050db0, transparent 65%);
}

/* Full, overlapping mist fields; no hard clipping or separate cloud fragments. */
.shock-fx-mist img,
.shock-fx-optical img {
  width: 100%;
  height: 100%;
  object-fit: fill;
  display: block;
}
.shock-fx-mist,
.shock-fx-optical {
  filter: sepia(0.55) saturate(0.8) hue-rotate(280deg);
}
.shock-film[data-shock-flow='rise'] .shock-fx-mist,
.shock-film[data-shock-flow='rise'] .shock-fx-optical,
.shock-film[data-shock-flow='converge'] .shock-fx-mist,
.shock-film[data-shock-flow='converge'] .shock-fx-optical {
  filter: sepia(0.6) saturate(0.85) hue-rotate(83deg);
}
.shock-film[data-shock-flow='fall'] .shock-fx-mist {
  filter: sepia(0.8) saturate(0.65) hue-rotate(165deg);
}
.shock-film[data-shock-flow='rupture'] .shock-fx-optical {
  filter: sepia(0.8) saturate(1.4) hue-rotate(309deg);
}
.shock-film[data-shock-flow='prism'] .shock-fx-mist {
  filter: sepia(0.65) saturate(0.8) hue-rotate(115deg);
}
.shock-fx-mist,
.shock-fx-optical {
  mask-image: radial-gradient(ellipse 47% 47% at 50% 58%, #0006 35%, #000 90%);
}
.shock-film .shock-copy {
  text-shadow:
    0 1px 5px #07050b,
    0 1px 13px #07050b;
}
.shock-fx-motifs {
  perspective: 500px;
}
.shock-motif {
  position: absolute;
  height: auto;
  opacity: 0;
  transform-origin: 50% 50%;
}
.shock-motif img {
  display: block;
  width: 100%;
  height: auto;
}
.shock-motif-heart-left img {
  clip-path: polygon(0 0, 52% 0, 47% 31%, 54% 44%, 46% 56%, 53% 69%, 48% 100%, 0 100%);
}
.shock-motif-heart-right img {
  clip-path: polygon(52% 0, 100% 0, 100% 100%, 48% 100%, 53% 69%, 46% 56%, 54% 44%, 47% 31%);
}
.shock-motif-beam {
  height: 150%;
  background: linear-gradient(180deg, #fce7b96b, #fce7b90a);
  clip-path: polygon(44% 0, 56% 0, 100% 100%, 0 100%);
  mask-image: radial-gradient(ellipse, #000 15%, transparent 70%);
}

/* The room slowly loses colour only after the Depression announcement begins. */
.shock-depression-grade,
.shock-depression-weight {
  position: absolute;
  inset: 0;
  z-index: 9;
  pointer-events: none;
  opacity: 0;
}
.shock-depression-grade {
  background: #777;
  mix-blend-mode: color;
}
.shock-depression-weight {
  background: linear-gradient(180deg, #07091122, #02040db3);
}
.shock-film[data-shock-kind='depressionShock'] .shock-title {
  color: #ced2d9;
}
.shock-film[data-shock-kind='depressionShock'] .shock-copy {
  color: #aab0bc;
}

.shock-motif-ballot img {
  position: relative;
  z-index: 1;
}
.shock-election-ballot {
  position: absolute;
  z-index: 0;
  left: 52%;
  top: 10%;
  width: 27%;
  height: 34%;
  opacity: 0;
  background: linear-gradient(110deg, #c1b397, #f3ebd8 36%, #e2d9c2 84%);
  border: 1px solid #d7c39b;
  box-shadow: 0 2px 5px #0005;
}
.shock-election-ballot svg {
  width: 100%;
  height: 100%;
  display: block;
}

.shock-film[data-shock-flow='cleanse'] .shock-fx-mist,
.shock-film[data-shock-flow='cleanse'] .shock-fx-optical {
  filter: sepia(0.6) saturate(0.9) hue-rotate(80deg);
}
.shock-detox-aura,
.shock-force-release {
  position: absolute;
  pointer-events: none;
  opacity: 0;
  z-index: -1;
}
.shock-detox-aura {
  inset: -35% -80%;
  background: radial-gradient(
    ellipse at 50% 62%,
    #d3efba70,
    #80cda944 21%,
    #67a6901c 42%,
    transparent 65%
  );
}
.shock-force-release {
  inset: -60% -100%;
  background: radial-gradient(ellipse, #f2dfb693, #c9a56335 18%, #9c6bb623 38%, transparent 62%);
}

/* Keep a real single-nominee outcome grounded without inventing a second player. */
.nom-solo .nom-first {
  left: 28%;
  width: 44%;
}
.nom-calibrated {
  container-type: size;
}
.c-nominations.nom-calibrated .nom-pod {
  top: 0;
  height: 100%;
}
.nom-calibrated .nom-person {
  bottom: 39.9cqh;
  width: 100%;
  height: auto;
  aspect-ratio: 2 / 3;
  transform: translateY(calc(100% - var(--feet-y)));
  opacity: 0;
}
.nom-calibrated .nom-platform {
  top: calc(60.1cqh - var(--platform-surface-offset));
  bottom: auto;
  left: 0;
  width: 100%;
  height: auto;
}
.nom-calibrated .nom-label {
  top: 70%;
  bottom: auto;
}
.nom-contact {
  position: absolute;
  z-index: 3;
  top: 59.65cqh;
  left: 23%;
  width: 54%;
  height: 1cqh;
  border-radius: 50%;
  background: radial-gradient(ellipse, #09060bd1, transparent 74%);
  pointer-events: none;
}
.nom-coloh-active .nom-label {
  color: #eee2d0;
  font:
    500 14px / 1.2 Georgia,
    serif;
  letter-spacing: 0;
}
`;function fe(e){return e===`cupidArrow`||e===`cupidBroken`?[`shockHeart`]:e===`diamond`?[`shockHalo`]:e===`vip`?[`cinema_shield`]:e===`twinShock`?[`shockDna`]:e===`democracia`?[`shockBallot`]:e===`coup`?[`shockAntidote`]:e===`spotlight`?[`shockForce`,`cinema_shield`]:[]}function pe(e,t,n){let r=document.createElement(`div`);r.className=`shock-fx-motifs`;let i=(e,t,i,a,o,s)=>{let c=document.createElement(`div`);if(c.className=`shock-motif shock-motif-${e}`,c.dataset.kind=e,c.dataset.index=s,Object.assign(c.style,{left:`${i}%`,top:`${a}%`,width:`${o}%`}),t){let e=n[t].cloneNode();e.alt=``,e.draggable=!1,c.append(e)}return r.append(c),c};if(t===`cupidArrow`)[[12,45,12],[86,30,10],[78,88,7],[22,87,8]].forEach(([e,t,n],r)=>i(`heart`,`shockHeart`,e,t,n,r));else if(t===`cupidBroken`)i(`heart-left`,`shockHeart`,50,12,19,0),i(`heart-right`,`shockHeart`,50,12,19,1);else if(t===`diamond`)i(`halo`,`shockHalo`,22,16,29,0),i(`halo`,`shockHalo`,78,85,24,1);else if(t===`vip`)i(`shield`,`cinema_shield`,12,40,11,0),i(`shield`,`cinema_shield`,88,40,11,1);else if(t===`twinShock`)i(`dna`,`shockDna`,12,48,20,0),i(`dna`,`shockDna`,88,53,18,1);else if(t===`democracia`){let e=i(`ballot`,`shockBallot`,50,10,27,0),t=document.createElement(`div`);t.className=`shock-election-ballot`,t.innerHTML=`<svg viewBox="0 0 30 40" aria-hidden="true"><path d="M7 12h16M7 17h12M8 27l5 5 10-12" fill="none" stroke="#8a6938" stroke-width="1.4"/></svg>`,e.prepend(t)}else if(t===`coup`){let e=i(`antidote`,`shockAntidote`,50,11,18,0),t=document.createElement(`div`);t.className=`shock-detox-aura`,e.prepend(t)}else if(t===`spotlight`){i(`pressure`,`shockForce`,50,10,49,0);let e=i(`forced-shield`,`cinema_shield`,50,10,16,1),t=document.createElement(`div`);t.className=`shock-force-release`,e.prepend(t)}r.children.length&&e.append(r)}function me(e,t,n,r){if(e.querySelector(`.shock-fx-motifs`)){n(`.shock-fx-motifs`,[[0,0],[3900,0],[4250,1],[r,1]]),t===`democracia`&&n(`.shock-election-ballot`,[[0,0],[4300,0,`translate(-50%,-100%) rotate(-9deg)`],[4700,1,`translate(-50%,-65%) rotate(-5deg)`],[5550,1,`translate(-50%,70%) rotate(-2deg)`],[5900,0,`translate(-50%,100%) rotate(0)`],[r,0]]),t===`coup`&&n(`.shock-detox-aura`,[[0,0],[4700,0,`scale(.5)`],[5300,.75,`scale(1)`],[6400,.24,`scale(1.7)`],[r,0,`scale(2)`]]),t===`spotlight`&&n(`.shock-force-release`,[[0,0],[5150,0,`scale(.4)`],[5400,.75,`scale(1)`],[5850,0,`scale(2.2)`],[r,0]]);for(let t of e.querySelectorAll(`.shock-motif`)){let e=Number(t.dataset.index),i=t.dataset.kind,a=e%2?1:-1;if(i===`pressure`){n(t,[[0,0],[4e3,0,`translate(-50%,-50%) scale(1.22) rotate(-9deg)`],[4800,.6,`translate(-50%,-50%) scale(.88) rotate(-3deg)`],[5200,.7,`translate(-50%,-50%) scale(.76) rotate(0)`],[5900,.3,`translate(-50%,-50%) scale(1.28) rotate(8deg)`],[7e3,.08,`translate(-50%,-50%) scale(1.55) rotate(14deg)`],[r,0,`translate(-50%,-50%) scale(1.7) rotate(17deg)`]]);continue}let o=4e3+(i===`heart`?e*190:0),s=`translate(-50%,-50%) `,c,l,u;if(i===`heart`)c=`translate(${a*10}%,22%) rotate(${a*18}deg) scale(.8)`,l=`translate(0,0) rotate(${a*8}deg) scale(1)`,u=`translate(${a*24}%,-65%) rotate(${a*-8}deg) scale(1.04)`;else if(i.startsWith(`heart-`)){let e=i===`heart-left`?-1:1;c=`translate(0,12%) scale(.9)`,l=`translate(0,0) scale(1)`,u=`translate(${e*58}%,23%) rotate(${e*22}deg) scale(.94)`}else i===`halo`?(c=`translate(0,14%) rotate(${a*8}deg) scale(.88)`,l=`translate(${a*-25}%,0) rotate(${a*3}deg) scale(1)`,u=`translate(${a*-175}%,-7%) rotate(${a*-8}deg) scale(${e?1.08:.92})`):i===`dna`?(c=`translate(0,16%) rotate(${a*9}deg) scale(.88)`,l=`translate(0,0) rotate(${a*3}deg) scale(1)`,u=`translate(${a*5}%,-9%) rotate(${a*-4}deg) scale(1.03)`):i===`ballot`?(c=`translateY(8%) scale(.94)`,l=`translateY(0) scale(1)`,u=`translateY(0) scale(1.02)`):i===`antidote`?(c=`translateY(13%) rotate(-7deg) scale(.86)`,l=`translateY(0) rotate(-2deg) scale(1)`,u=`translateY(-5%) rotate(3deg) scale(1.02)`):i===`forced-shield`?(c=`translateY(-28%) rotate(-10deg) scale(.8)`,l=`translateY(0) rotate(0) scale(1.05)`,u=`translateY(1%) rotate(0) scale(1)`):(c=`translate(0,15%) rotate(${a*8}deg) scale(.85)`,l=`translate(0,0) rotate(${a*3}deg) scale(1)`,u=`translate(${a*12}%,-16%) rotate(${a*-3}deg) scale(1.03)`);let d=i.startsWith(`heart-`);n(t,[[0,0],[o,0,s+c],[o+750,.82,s+l,`cubic-bezier(.4,0,.2,1)`],[d?6800:7600,d?0:.44,s+u],[r,0,s+u]])}}}var he={cupidArrow:{accent:`#efb0cf`,color:`#c74b8b`,flow:`entwine`},cupidBroken:{accent:`#d3aec8`,color:`#8a467c`,flow:`shatter`},depressionShock:{accent:`#a5bbda`,color:`#36567e`,flow:`fall`},democracia:{accent:`#baded0`,color:`#3d937e`,flow:`converge`},doubleEviction:{accent:`#e8b2a2`,color:`#aa3049`,flow:`rupture`},voxDouble:{accent:`#cbb2e3`,color:`#873ca3`,flow:`rupture`},battleBack:{accent:`#c3e4cd`,color:`#388d73`,flow:`rise`},battleBackRules:{accent:`#c3e4cd`,color:`#388d73`,flow:`rise`},battleBackChallenge:{accent:`#ded3aa`,color:`#708752`,flow:`rise`},vip:{accent:`#e2c7e9`,color:`#925a9f`,flow:`entwine`},diamond:{accent:`#cce8e7`,color:`#469da5`,flow:`prism`},coup:{accent:`#c6e5cb`,color:`#568b7b`,flow:`cleanse`},spotlight:{accent:`#ecdec2`,color:`#b09a60`,flow:`converge`},twinShock:{accent:`#d8bfe7`,color:`#8860a7`,flow:`entwine`},dayStartShock:{accent:`#e8b2a2`,color:`#aa3049`,flow:`rupture`},generic:{accent:`#ded0b2`,color:`#85638e`,flow:`rise`}};function ge(e,t){return`<svg viewBox="0 0 600 300" preserveAspectRatio="none" aria-hidden="true">${[[24,201,1.2],[63,85,.7],[111,230,1.5],[149,60,.8],[202,242,.6],[237,89,1],[302,246,.8],[354,67,1.4],[401,230,.7],[449,98,.9],[503,197,1.2],[561,65,.7]].map(([n,r,i],a)=>`<g transform="translate(${t?600-n:n} ${t?300-r:r})" opacity="${.25+a%4*.16}">
      <circle r="${i*4}" fill="${e.color}" opacity=".13"/>
      <circle r="${i}" fill="${a%3?e.accent:`#f1dbac`}"/>
      ${a%4==0?`<path d="M-5 0H5M0-3V3" stroke="${e.accent}" stroke-width=".45" opacity=".65"/>`:``}
    </g>`).join(``)}</svg>`}function _e(e,t,n){let r=he[t]??he.generic;e.dataset.shockKind=t,e.dataset.shockFlow=r.flow,e.style.setProperty(`--shock-theme-accent`,r.accent),e.style.setProperty(`--shock-theme-color`,r.color);let i=document.createElement(`div`);i.className=`shock-title-fx`,i.setAttribute(`aria-hidden`,`true`),i.innerHTML=`<div class="shock-fx-veil"></div>
    <div class="shock-fx-mist shock-fx-mist-a"></div>
    <div class="shock-fx-mist shock-fx-mist-b"></div>
    <div class="shock-fx-optical"></div>
    <div class="shock-fx-dust shock-fx-dust-back">${ge(r,!0)}</div>
    <div class="shock-fx-dust shock-fx-dust-front">${ge(r,!1)}</div>
    <div class="shock-fx-horizon"></div><div class="shock-fx-glint"></div>`;for(let e of i.querySelectorAll(`.shock-fx-mist`)){let t=n.shockMist.cloneNode();t.alt=``,t.draggable=!1,e.append(t)}let a=n.shockAtmosphere.cloneNode();if(a.alt=``,a.draggable=!1,i.querySelector(`.shock-fx-optical`).append(a),pe(i,t,n),e.querySelector(`.cine-titles`).append(i),t===`depressionShock`)for(let t of[`grade`,`weight`]){let n=document.createElement(`div`);n.className=`shock-depression-${t}`,e.append(n)}}function ve(e,t,n,r){let i=he[t]??he.generic;t===`depressionShock`&&(n(`.shock-depression-grade`,[[0,0],[4200,0],[6800,.97],[r,.97]]),n(`.shock-depression-weight`,[[0,0],[4400,0],[7e3,.32],[r,.32]]));let a=r,o=3800,s=`cubic-bezier(.16,1,.3,1)`;n(`.shock-fx-veil`,[[0,0],[o,0,`scale(.68)`],[4800,.78,`scale(1)`,s],[6500,.48,`scale(1.08)`],[a,0,`scale(1.14)`]]);for(let[e,t]of[`.shock-fx-mist-a`,`.shock-fx-mist-b`].entries()){let r=e?1:-1,s=i.flow===`fall`?1:-1,c=e?`scaleX(-1) `:``;n(t,[[0,0],[o+e*100,0,`${c}translate(${r*-5}%,${s*-5}%) scale(1.02)`],[4800+e*150,e?.2:.32,`${c}translate(${r*-2}%,${s*-2}%) scale(1.05)`],[6500,e?.16:.25,`${c}translate(${r*1}%,${s*2}%) scale(1.09)`],[a,0,`${c}translate(${r*5}%,${s*7}%) scale(1.14)`]])}n(`.shock-fx-optical`,[[0,0],[3900,0,`scale(.98)`],[4700,.2,`scale(1.01)`],[6500,.1,`scale(1.05)`],[a,0,`scale(1.08)`]]),me(e,t,n,a),n(`.shock-fx-horizon`,[[0,0],[3900,0,`scaleX(.08)`],[4450,.9,`scaleX(1)`,s],[5200,.32,`scaleX(1.07)`],[a,0,`scaleX(1.12)`]]),n(`.shock-fx-glint`,[[0,0],[4050,0,`translateX(-28%) scaleX(.15)`],[4450,.85,`translateX(-6%) scaleX(.8)`],[5050,0,`translateX(27%) scaleX(.35)`],[a,0]]);for(let[e,t]of[`.shock-fx-dust-back`,`.shock-fx-dust-front`].entries()){let r=i.flow===`fall`,o=i.flow===`shatter`;n(t,[[0,0],[4100+e*170,0,`translateY(9%) scale(.92)`],[5e3+e*180,e?.85:.5,`translateY(0) scale(1)`],[a-350,0,`translate(${o?e?13:-13:0}%,${r?21:-17}%) scale(${e?1.15:1.05})`],[a,0]])}}var F={a:{label:`Role A`,poses:{ceremonyFront:`cinema_standA`,decisionBack:`cinema_decisionA`,royalSeated:`cinema_seatedA`}},b:{label:`Role B`,poses:{ceremonyFront:`cinema_standB`,decisionBack:`cinema_decisionB`}},c:{label:`Role C`,poses:{ceremonyFront:`cinema_standC`,exitBack:`cinema_exitC`}}},I=[[`a`,`b`,`c`],[`b`,`a`,`c`]],ye=[`tiebreak`,`ambush`,`allPower`,`shock`,`final4`,`final3`],L=Object.values(F).map(e=>e.poses.ceremonyFront),be=[`cinema_hall`,`cinema_atmosphere`,`cinema_portal`],xe={tiebreak:{duration:7e3,art:[...be,...L.slice(0,2),`cinema_console`,`cinema_token`],description:`The votes are tied 4–4. The LOH’s gold deciding vote lands and travels to its target; the tally changes to 5–4 and the eliminated nominee is identified.`,beats:[[`00.0`,`Enter the chamber: a 4–4 tie`],[`01.9`,`The LOH’s deciding vote lands`],[`03.7`,`The vote reaches its target: 5–4`]],moments:[1e3,2800,5200]},ambush:{duration:7e3,art:[...be,...L,`cinema_shield`],description:`Safety rescues one initial nominee, visibly opening a replacement slot. The camera crosses the room as the portal reveals the hidden target; red light locks the new nominee onto the block.`,beats:[[`00.0`,`The original nominees`],[`01.4`,`Safety opens a replacement slot`],[`03.1`,`The ambush target is nominated`]],moments:[900,2e3,4700]},allPower:{duration:8600,art:[`cinema_royalRoom`,`cinema_city`,`cinema_throne`,`cinema_standA`,`cinema_seatedA`,`cinema_shield`,`cinema_crown`,`cinema_atmosphere`,`cinema_portal`],description:`Enter the royal room, receive Safety and reveal the seated holder of both powers. The camera then passes the throne and approaches the city through the real window aperture before the final title.`,beats:[[`00.0`,`Enter the royal room`],[`01.5`,`Safety joins the crown`],[`02.9`,`The sovereign is revealed`],[`04.4`,`Pass the throne and approach the city`]],moments:[900,2300,4100,6400,7800]},shock:{duration:6200,art:[`cinema_shockRoom`,`cinema_city`,`cinema_atmosphere`,`cinema_portal`],description:`The camera pulls away from the city watched through the Eye. The broadcast is interrupted by an aperture sweep, moving light rings and a visual cue specific to the selected shock.`,beats:[[`00.0`,`The Eye watches the city`],[`01.8`,`The broadcast is interrupted`],[`02.5`,`The actual twist is announced`]],moments:[900,2100,4400]},final4:{duration:7200,art:[...be,...L,`cinema_console`,`cinema_token`,`cinema_shield`],description:`Three eligible players enter. The Safety holder is protected in gold; their single vote travels to one of the two nominees. A clear 1–0 verdict identifies who leaves. The LOH stays off-stage.`,beats:[[`00.0`,`Safety holder and two nominees`],[`01.9`,`The holder casts the only vote`],[`03.8`,`The 1–0 verdict is revealed`]],moments:[1e3,2800,5400]},final3:{duration:8400,art:[...be,...L,`cinema_exitC`,`cinema_crown`],description:`The final LOH names the third-place finisher. After the camera changes, the player walks all the way to the threshold, passes inside the doorway without fading, and is hidden by the closing doors.`,beats:[[`00.0`,`The final LOH faces two finalists`],[`02.0`,`Third place is named`],[`03.0`,`The player reaches and crosses the doorway`]],moments:[1300,4e3,5100,6100,7400]}},R=(e,t,n=`props`)=>`<img data-cinema-art="${e}" class="${t} cine-layer" data-layer="${n}" alt="">`,z=(e,t,{crown:n=!1,badge:r=``}={})=>`<div class="cine-person ${t} cine-layer" data-layer="actors"><div class="cine-reflection">${R(e,`cine-reflected-body`,`actors`)}</div><i class="cine-contact"></i>${R(e,`cine-body`,`actors`)}${n?R(`cinema_crown`,`cine-crown`,`props`):``}${r?`<div class="actor-badge">${r}</div>`:``}</div>`,B=e=>R(e,`cine-bg`,`set`),Se=()=>`<div class="cine-gates cine-layer" data-layer="props">${R(`cinema_portal`,`cine-gate gate-left`)}${R(`cinema_portal`,`cine-gate gate-right`)}</div>`,V=(e,t,n)=>`<div class="cine-titles cine-layer" data-layer="titles"><span>${e}</span><h3>${t}</h3><p>${n}</p><i></i></div>`,H=(e,t)=>`<div class="cine-beat ${e} cine-layer" data-layer="titles">${t}</div>`,Ce=()=>`<div class="cine-voting cine-layer" data-layer="props">${R(`cinema_console`,`cine-console`)}${R(`cinema_token`,`cine-token`)}<i class="cine-token-light"></i><div class="vote-caption">ONE DECIDING VOTE</div></div>`,we=(e,t,n)=>`<div class="vote-tally ${e} cine-layer" data-layer="titles"><b>${t}</b><i>–</i><b>${n}</b></div>`,Te=e=>`<div class="verdict-bracket cine-layer" data-layer="light"><i></i><i></i><span>${e} · ELIMINATED</span></div>`,Ee=()=>`<div class="city-depth cine-layer" data-layer="set">${R(`cinema_city`,`city-plate`,`set`)}<i class="city-light city-light-a"></i><i class="city-light city-light-b"></i></div><div class="royal-room-plane">${R(`cinema_royalRoom`,`cine-bg royal-window-room`,`set`)}<div class="royal-glass cine-layer" data-layer="light"><i></i><i></i></div></div>`,De=()=>`<div class="eye-city-depth cine-layer" data-layer="set">${R(`cinema_city`,`eye-city-plate`,`set`)}</div>${R(`cinema_shockRoom`,`cine-bg eye-window-room`,`set`)}`,Oe=()=>`<div class="ceremony-energy cine-layer" data-layer="light"><i class="energy-ring ring-a"></i><i class="energy-ring ring-b"></i><i class="energy-core"></i></div>`,ke=()=>`<div class="depth-entrance cine-layer" data-layer="props"><div class="entrance-wing wing-left">${R(`cinema_portal`,`entrance-panel`)}</div><div class="entrance-wing wing-right">${R(`cinema_portal`,`entrance-panel`)}</div></div><div class="foreground-jamb jamb-left cine-layer" data-layer="props"></div><div class="foreground-jamb jamb-right cine-layer" data-layer="props"></div>`;function Ae(e,t,n,r=0){let i=I[r]||I[0],a=F[i[0]].poses.ceremonyFront,o=F[i[1]].poses.ceremonyFront,s=F.c.poses.ceremonyFront,c=i.map(e=>`Player `+e.toUpperCase()),l=document.createElement(`div`);l.className=`c-scene c-${e} cinema-v2 cinema-v3 film-${e}`,l.dataset.cast=r,l.setAttribute(`aria-hidden`,`true`);let u=``,d=``,f=``,p=``;if(e===`tiebreak`&&(u=B(`cinema_hall`)+z(a,`role-left`,{badge:c[0]})+z(o,`role-right`,{badge:c[1]})+Ce()+we(`tally-before`,`4`,`4`)+we(`tally-after`,`4`,`5`)+R(`cinema_token`,`vote-flight`)+Te(c[1])+`<div class="verdict-trail"></div>`,d=B(`cinema_hall`)+Ce(),f=V(`TIEBREAK · LOH’S DECIDING VOTE`,c[1]+` is eliminated.`,`5–4. THE LOH BROKE THE TIE.`),p=H(`beat-initial`,`THE VOTE IS TIED · 4–4`)+H(`beat-action`,`THE LOH CASTS THE DECIDING VOTE`)),e===`final4`&&(u=B(`cinema_hall`)+z(a,`role-left f4-left`,{badge:c[0]+` · NOMINEE`})+z(o,`role-center f4-center`,{badge:c[1]+` · SAFETY`})+z(s,`role-right f4-right`,{badge:c[2]+` · NOMINEE`})+R(`cinema_shield`,`cine-small-shield`)+R(`cinema_token`,`vote-flight`)+we(`tally-after`,`0`,`1`)+Te(c[2])+`<div class="verdict-trail"></div><div class="safety-spotlight"></div>`,d=B(`cinema_hall`)+Ce(),f=V(`FINAL FOUR · THE SOLE VOTE`,c[2]+` is eliminated.`,`1–0. `+c[1].toUpperCase()+` CAST THE ONLY VOTE.`),p=H(`beat-initial`,`THE LOH IS SAFE · THREE PLAYERS IN THE CEREMONY`)+H(`beat-action`,c[1].toUpperCase()+` HOLDS SAFETY AND THE SOLE VOTE`)),e===`ambush`&&(u=B(`cinema_hall`)+z(a,`role-left ambush-original-left`,{badge:c[0]})+z(o,`role-right ambush-original-right`,{badge:c[1]})+R(`cinema_shield`,`ambush-save-shield`)+`<div class="slot-open">SAVED<br><span>REPLACEMENT SLOT OPEN</span></div>`,d=B(`cinema_hall`)+z(a,`role-back-left`,{badge:`SAVED`})+z(o,`role-back-right`,{badge:`NOMINATED`})+`<div class="cine-danger cine-layer" data-layer="light"></div><div class="cine-danger-ring cine-layer" data-layer="light"></div>`+z(s,`role-target`,{badge:c[2]})+Se()+`<div class="nomination-lock lock-left"></div><div class="nomination-lock lock-right"></div>`,f=V(`AMBUSH · THE REPLACEMENT NOMINEE`,c[2]+` is nominated.`,`SAFETY SAVED `+c[0].toUpperCase()+`. THE HIDDEN TARGET TAKES THE SLOT.`),p=H(`beat-initial`,`THE ORIGINAL NOMINEES`)+H(`beat-action`,`SAFETY OPENS A REPLACEMENT SLOT`)),e===`allPower`&&(u=Ee()+z(F.a.poses.ceremonyFront,`power-standing`,{crown:!0})+R(`cinema_shield`,`power-award-shield`),d=Ee()+`<div class="royal-group">${R(`cinema_throne`,`cine-throne`)}<div class="cine-royal cine-layer" data-layer="actors">${R(F.a.poses.royalSeated,`cine-seated`,`actors`)}${R(`cinema_crown`,`cine-royal-crown`)}</div>${R(`cinema_shield`,`cine-royal-shield`)}</div><div class="royal-aura"></div>`,f=V(`LEADER OF THE HUB + POWER OF SAFETY`,`All the power.`,`PLAYER A HOLDS BOTH THE CROWN AND THE SHIELD.`),p=H(`beat-initial`,`LEADER OF THE HUB`)+H(`beat-action`,`THE SAFETY SHIELD JOINS THE CROWN`)),e===`shock`&&(l.dataset.shock=n.tone,l.dataset.motif=n.motif,u=De(),d=De()+`<div class="cine-eye-bloom cine-layer" data-layer="light"></div><div class="eye-orbit orbit-a"></div><div class="eye-orbit orbit-b"></div><div class="shock-motif"><i></i><i></i><b></b></div>`,f=V(`THE BIG EYE · SHOCK ANNOUNCEMENT`,n.title,n.copy),p=H(`beat-initial`,`THE EYE IS WATCHING`)+H(`beat-action`,`BROADCAST INTERRUPTED`)),e===`final3`){u=B(`cinema_hall`)+z(a,`role-center f3-loh`,{crown:!0,badge:c[0]+` · LOH`})+z(o,`role-left f3-survivor`,{badge:c[1]})+z(s,`role-right f3-third`,{badge:c[2]})+`<div class="final-decision">`+c[2].toUpperCase()+`<span>FINISHES IN THIRD PLACE</span></div>`;let e=e=>`<div class="cine-departure ${e} cine-layer" data-layer="actors">${R(F.c.poses.exitBack,`cine-rear`,`actors`)}</div>`;d=B(`cinema_hall`)+z(a,`role-left f3-finalist`,{badge:c[0]})+z(o,`role-right f3-finalist`,{badge:c[1]})+e(`departure-near`)+`<div class="doorway-volume">`+e(`departure-far`)+`</div>`+Se()+`<div class="portal-floor-light"></div>`,f=V(`THE FINAL TWO`,c[0]+` & `+c[1],c[2].toUpperCase()+` LEFT THE HUB IN THIRD PLACE.`),p=H(`beat-initial`,`THE FINAL LOH MUST CHOOSE`)+H(`beat-action`,c[0].toUpperCase()+` ELIMINATES `+c[2].toUpperCase())}l.innerHTML=`<div class="cine-shot shot-wide"><div class="cine-world">${u}</div></div><div class="cine-shot shot-detail"><div class="cine-world">${d}</div></div>${R(`cinema_atmosphere`,`cine-atmosphere`,`light`)}<div class="cine-grade cine-layer" data-layer="light"></div>${ke()}<div class="cine-cut"><i></i></div><div class="transition-blade">${R(`cinema_portal`,`transition-texture`)}</div>${Oe()}<div class="cine-sweep cine-layer" data-layer="light"></div>${p}${f}<div class="cine-letterbox letterbox-top"></div><div class="cine-letterbox letterbox-bottom"></div><div class="cine-sequence">THE BIG EYE <i></i> CEREMONY FILM</div>`;for(let e of l.querySelectorAll(`[data-cinema-art]`)){let n=t[e.dataset.cinemaArt];if(!n)throw Error(`Missing resource `+e.dataset.cinemaArt);let r=n.cloneNode();r.className=e.className,r.dataset.layer=e.dataset.layer,r.alt=``,r.draggable=!1,e.replaceWith(r)}return e===`shock`&&(l.querySelector(`.cine-titles h3`).classList.add(`shock-title`),l.querySelector(`.cine-titles p`).classList.add(`shock-copy`)),l}function je(e,t,n){let r=xe[e].duration,i=`cubic-bezier(.16,1,.3,1)`;n(t,[[0,0],[120,1],[r-250,1],[r,0]]),n(`.wing-left`,[[0,1,`translateX(0)`],[120,1,`translateX(0)`,i],[1050,1,`translateX(-108%)`],[r,1,`translateX(-108%)`]]),n(`.wing-right`,[[0,1,`translateX(0)`],[120,1,`translateX(0)`,i],[1050,1,`translateX(108%)`],[r,1,`translateX(108%)`]]),n(`.jamb-left`,[[0,1,`translateX(0) scale(1.6)`],[1400,1,`translateX(-115%) scale(1)`],[r,1,`translateX(-115%) scale(1)`]]),n(`.jamb-right`,[[0,1,`translateX(0) scale(1.6)`],[1400,1,`translateX(115%) scale(1)`],[r,1,`translateX(115%) scale(1)`]]),n(`.cine-atmosphere`,[[0,.25,`translateX(-4%) scale(1.1)`],[r,.38,`translateX(3%) scale(1.04)`]]),n(`.beat-initial`,[[0,0,`translateY(-8px)`],[700,1,`translateY(0)`],[1500,1,`translateY(0)`],[1800,0,`translateY(-5px)`],[r,0]]),n(`.beat-action`,[[0,0,`translateY(-5px)`],[1500,0,`translateY(-5px)`],[1900,1,`translateY(0)`],[e===`final3`?2850:3300,1,`translateY(0)`],[e===`final3`?3050:3550,0,`translateY(-4px)`],[r,0]]);let a={tiebreak:4800,final4:4900,ambush:4300,allPower:7200,shock:2500,final3:6900}[e];n(`.cine-titles`,[[0,0,`translateY(16px)`],[a,0,`translateY(16px)`],[a+550,1,`translateY(0)`],[r,1,`translateY(0)`]]),n(`.cine-sweep`,[[0,0,`translateX(-150%) skewX(-15deg)`],[a-250,0,`translateX(-150%) skewX(-15deg)`],[a+100,.35,`translateX(0) skewX(-15deg)`],[a+800,0,`translateX(200%) skewX(-15deg)`],[r,0]]);let o={tiebreak:[1900,3700],final4:[1900,3800],ambush:[2900],allPower:[2900],shock:[1800],final3:[2900]}[e],s=o[0],c=o[1],l=[[0,1,`translateX(-2%) translateY(2%) scale(1.22)`],[1100,1,`translateX(0) translateY(0) scale(1.04)`],[s-80,1,`translateX(1%) translateY(-1%) scale(1.1)`,`steps(1,end)`],[s,0,`translateX(1%) translateY(-1%) scale(1.1)`]],u=[[0,0,`translateX(-2%) translateY(1%) scale(1.12)`,`steps(1,end)`],[s,1,`translateX(-2%) translateY(1%) scale(1.12)`]];c?(l.push([c-80,0,`translateX(2%) translateY(0) scale(1.03)`,`steps(1,end)`],[c,1,`translateX(2%) translateY(0) scale(1.03)`],[r,1,`translateX(-1%) translateY(-1%) scale(1.11)`]),u.push([c-80,1,`translateX(0) translateY(-1%) scale(1.02)`,`steps(1,end)`],[c,0,`translateX(0) translateY(-1%) scale(1.02)`],[r,0])):(l.push([r,0]),u.push([s+750,1,`translateX(0) translateY(0) scale(1.02)`],[r,1,`translateX(1%) translateY(-1%) scale(1.065)`])),n(`.shot-wide`,l),n(`.shot-detail`,u);let d=[[0,0]],f=[[0,0,`translateX(-250%) rotateY(15deg)`]];for(let e of o)d.push([e-200,0],[e-65,1],[e+75,1],[e+340,0]),f.push([e-320,0,`translateX(-250%) rotateY(15deg)`],[e-120,1,`translateX(-20%) rotateY(0)`],[e+80,1,`translateX(130%) rotateY(-15deg)`],[e+400,0,`translateX(320%) rotateY(-15deg)`]);d.push([r,0]),f.push([r,0,`translateX(320%) rotateY(-15deg)`]),n(`.cine-cut`,d),n(`.transition-blade`,f);let p=e===`allPower`?2900:e===`ambush`?3400:o.at(-1);if(n(`.ring-a`,[[0,0,`scale(.3)`],[p-120,0,`scale(.3)`],[p+100,.6,`scale(.7)`],[p+750,0,`scale(1.8)`],[r,0]]),n(`.ring-b`,[[0,0,`scale(.4)`],[p,0,`scale(.4)`],[p+220,.4,`scale(.8)`],[p+950,0,`scale(2)`],[r,0]]),n(`.energy-core`,[[0,0],[p-80,0],[p+100,.4],[p+600,0],[r,0]]),(e===`tiebreak`||e===`final4`)&&(n(`.shot-detail .cine-token`,[[0,0,`translateY(-35px) rotate(-12deg) scaleY(.5)`],[1900,0,`translateY(-35px) rotate(-12deg) scaleY(.5)`],[2250,1,`translateY(3px) rotate(0) scaleY(.5)`],[2450,1,`translateY(0) rotate(0) scaleY(.5)`],[r,1,`translateY(0) rotate(0) scaleY(.5)`]]),n(`.shot-detail .cine-token-light`,[[0,0],[2200,0],[2450,.85],[r,.25]]),n(`.vote-flight`,[[0,0,`translateX(0) translateY(0) rotate(0) scaleY(.5)`],[c+50,0,`translateX(0) translateY(0) rotate(0) scaleY(.5)`],[c+220,1,`translateX(60%) translateY(-90%) rotate(8deg) scaleY(.5)`],[c+750,1,`translateX(330%) translateY(-70%) rotate(0) scale(.75) scaleY(.5)`],[c+920,0,`translateX(330%) translateY(-70%) rotate(0) scale(.75) scaleY(.5)`],[r,0]]),n(`.verdict-trail`,[[0,0,`scaleX(0)`],[c+100,0,`scaleX(0)`],[c+700,.8,`scaleX(1)`],[c+1100,.15,`scaleX(1)`],[r,.15]]),n(`.verdict-bracket`,[[0,0,`scaleY(.65)`],[c+700,0,`scaleY(.65)`],[c+1050,1,`scaleY(1)`],[r,1,`scaleY(1)`]]),n(`.tally-after`,[[0,0],[c+750,0],[c+1e3,1],[r,1]]),n(e===`tiebreak`?`.shot-wide .role-right .actor-badge`:`.shot-wide .f4-right .actor-badge`,[[0,1],[c+700,1],[c+1e3,0],[r,0]]),e===`tiebreak`?n(`.tally-before`,[[0,1],[1800,1],[1900,0],[c,0],[c+200,1],[c+750,1],[c+950,0],[r,0]]):(n(`.cine-small-shield`,[[0,0,`translateX(-50px) translateY(-8px) rotate(-15deg) scale(.6)`],[900,1,`translateX(0) translateY(0) rotate(-6deg) scale(1.08)`],[1400,1,`translateX(0) translateY(0) rotate(-6deg) scale(1)`],[r,1,`translateX(0) translateY(0) rotate(-6deg) scale(1)`]]),n(`.safety-spotlight`,[[0,0],[1e3,.75],[r,.4]]))),e===`ambush`&&(n(`.ambush-save-shield`,[[0,0,`translateX(-90px) translateY(-35px) rotate(-20deg) scale(.5)`],[900,0,`translateX(-90px) translateY(-35px) rotate(-20deg) scale(.5)`],[1500,1,`translateX(0) translateY(0) rotate(0) scale(1.08)`],[1900,1,`translateX(0) translateY(0) rotate(0) scale(1)`],[r,1,`translateX(0) translateY(0) rotate(0) scale(1)`]]),n(`.slot-open`,[[0,0],[1500,0],[1950,1],[r,1]]),n(`.ambush-original-left .actor-badge`,[[0,1],[1450,1],[1750,0],[r,0]]),n(`.cine-danger`,[[0,0],[3e3,0],[3650,.9],[r,.6]]),n(`.cine-danger-ring`,[[0,0,`scale(.7)`],[3200,0,`scale(.7)`],[3700,1,`scale(1)`],[r,.65,`scale(1)`]]),n(`.lock-left`,[[0,0,`translateX(-70px)`],[3300,0,`translateX(-70px)`],[3900,1,`translateX(0)`],[r,1,`translateX(0)`]]),n(`.lock-right`,[[0,0,`translateX(70px)`],[3300,0,`translateX(70px)`],[3900,1,`translateX(0)`],[r,1,`translateX(0)`]])),e===`ambush`||e===`final3`){let t=e===`final3`,i=t?6100:2900,a=t?6800:3500;n(`.gate-left`,[[0,1,`translateX(${t?-105:0}%)`],[i,1,`translateX(${t?-105:0}%)`],[a,1,`translateX(${t?0:-105}%)`],[r,1,`translateX(${t?0:-105}%)`]]),n(`.gate-right`,[[0,1,`translateX(${t?105:0}%) scaleX(-1)`],[i,1,`translateX(${t?105:0}%) scaleX(-1)`],[a,1,`translateX(${t?0:105}%) scaleX(-1)`],[r,1,`translateX(${t?0:105}%) scaleX(-1)`]])}e===`allPower`&&(n(`.power-award-shield`,[[0,0,`translateX(-140px) translateY(-40px) rotate(-30deg) scale(.5)`],[1200,0,`translateX(-140px) translateY(-40px) rotate(-30deg) scale(.5)`],[2050,1,`translateX(0) translateY(0) rotate(-8deg) scale(1.12)`],[2500,1,`translateX(0) translateY(0) rotate(-8deg) scale(1)`],[r,1,`translateX(0) translateY(0) rotate(-8deg) scale(1)`]]),n(`.royal-group`,[[0,1,`translateX(0) translateY(18px) scale(.97)`],[2900,1,`translateX(0) translateY(18px) scale(.97)`],[3650,1,`translateX(0) translateY(0) scale(1.015)`],[4400,1,`translateX(0) translateY(0) scale(1)`,`cubic-bezier(.55,.05,.65,1)`],[6600,1,`translateX(-140%) translateY(35%) scale(2.2)`],[r,1,`translateX(-140%) translateY(35%) scale(2.2)`]]),n(`.shot-detail .royal-room-plane`,[[0,1,`translateX(0) scale(1)`],[4400,1,`translateX(0) scale(1)`,`cubic-bezier(.55,.05,.65,1)`],[6600,1,`translateX(-3%) scale(3.2)`],[r,1,`translateX(-3%) scale(3.2)`]]),n(`.royal-aura`,[[0,0],[2900,0],[3550,.65],[r,.25]])),(e===`allPower`||e===`shock`)&&(n(`.city-plate, .eye-city-plate`,[[0,1,`translateX(-1%) scale(1.02)`],[r,1,`translateX(1%) scale(1.04)`]]),e===`allPower`?(n(`.royal-glass`,[[0,.3,`translateX(-1%)`],[r,.5,`translateX(1%)`]]),n(`.city-light`,[[0,.2],[1500,.6],[3200,.25],[4700,.65],[r,.3]])):(n(`.shot-wide .cine-world`,[[0,1,`translateY(0) scale(2.8)`],[1800,1,`translateY(0) scale(1.65)`],[r,1,`translateY(0) scale(1.65)`]]),n(`.cine-eye-bloom`,[[0,0],[1800,0],[2300,.8],[2900,.3],[r,.25]]),n(`.orbit-a`,[[0,0,`scale(.5) rotate(-20deg)`],[1850,0,`scale(.5) rotate(-20deg)`],[2400,.65,`scale(1) rotate(0deg)`],[3500,0,`scale(1.8) rotate(30deg)`],[r,0]]),n(`.orbit-b`,[[0,0,`scale(.6) rotate(20deg)`],[2050,0,`scale(.6) rotate(20deg)`],[2700,.5,`scale(1.1) rotate(0)`],[3800,0,`scale(2) rotate(-30deg)`],[r,0]]),n(`.shock-motif`,[[0,0,`translateY(15px) scale(.8)`],[2300,0,`translateY(15px) scale(.8)`],[2900,.9,`translateY(0) scale(1)`],[r,.9,`translateY(0) scale(1)`]]))),e===`final3`&&(n(`.final-decision`,[[0,0,`translateY(10px)`],[1700,0,`translateY(10px)`],[2200,1,`translateY(0)`],[r,1,`translateY(0)`]]),n(`.cine-departure`,[[0,1,`translateY(7%) scale(1)`],[2900,1,`translateY(7%) scale(1)`],[3550,1,`translateY(-8%) scale(.92)`],[4200,1,`translateY(-28%) scale(.8)`],[4800,1,`translateY(-47%) scale(.68)`],[5200,1,`translateY(-61%) scale(.6)`],[5900,1,`translateY(-82%) scale(.48)`],[r,1,`translateY(-82%) scale(.48)`]]),n(`.departure-near`,[[0,1],[5199,1,void 0,`steps(1,end)`],[5200,0],[r,0]]),n(`.departure-far`,[[0,0],[5199,0,void 0,`steps(1,end)`],[5200,1],[r,1]]),n(`.portal-floor-light`,[[0,.3],[2900,.3],[5200,.65],[6800,.2],[r,.2]]))}var U=[`exit`,`tiebreak`,`final4`,`final3`],Me=3400,Ne=[`cinema_hall`,`cinema_portal`,`cinema_exitC`,`cinema_avatarC`,`cinema_eliminatedStamp`],Pe=[`cinema_standA`,`cinema_standB`,`cinema_standC`,`cinema_decisionA`,`cinema_decisionB`],W=Object.fromEntries(U.map(e=>{let t=e===`final4`||e===`final3`,n=e===`exit`?0:t?4400:3200,r=n+4600;return[e,{duration:r+5600,exitAt:n,avatarAt:r,art:[...Ne,...e===`exit`?[]:Pe,...[`final4`,`exit`].includes(e)?[]:[`cinema_crown`]],description:e===`exit`?`The new Hub exit: a continuous walk through the doorway, doors close, then the camera pushes into the exit and hands off to the game’s portrait elimination treatment.`:(e===`final4`?`The Safety holder faces the two nominees; the protected LOH stays off-stage.`:e===`final3`?`The final LOH faces the other two finalists.`:`The LOH faces both nominees after a 4–4 tie.`)+` A decision isolates Player C in light. They leave through the Hub doors, followed by a camera push into the familiar avatar elimination treatment.`,beats:[...n?[[`00.0`,e===`final4`?`Safety holder faces the two nominees`:`The LOH faces both nominees`],[t?`03.2`:`01.9`,`The decision lands; only the eliminated player stays lit`]]:[],[(n/1e3).toFixed(1),`A continuous walk through the Hub exit`],[((n+3900)/1e3).toFixed(1),`Doors close; the camera approaches`],[(r/1e3).toFixed(1),`The game’s avatar elimination treatment`]],moments:n?[1100,...t?[2100,3100,3900]:[2650],n+1800,n+3400,r+2700]:[1100,2600,4e3,r+2700]}]}));function Fe(e,{closingBrand:t=!1}={}){let n=W[e],r=t&&[`exit`,`final3`].includes(e),i=r?Me:0;return{duration:n.duration+i,exitAt:n.exitAt,zoomAt:n.avatarAt,avatarAt:n.avatarAt+i,handoffAt:n.avatarAt+i+140,closingBrand:r}}var G=(e,t,n=`props`)=>`<img data-resource="`+e+`" class="`+t+` cine-layer" data-layer="`+n+`" alt="">`,Ie=(e,t,n)=>`<div class="decision-person `+t+` cine-layer" data-layer="actors"><i class="decision-contact"></i>`+G(e,`decision-body`,`actors`)+`<span class="decision-badge">`+n+`</span></div>`;function Le(e,t,n=0,{nativeHandoff:r=!1,closingBrand:i=!1}={}){let a=Fe(e,{closingBrand:i}).closingBrand,o=e===`final4`||e===`final3`,c=I[n]||I[0],l=e===`final4`?c[1]:c[0],u=e===`final4`?c[0]:c[1],d=`PLAYER `+l.toUpperCase(),f=F[l].poses.decisionBack,p=document.createElement(`div`);p.className=`c-scene cinema-v2 cinema-v3 cinema-v4 decision-film film-`+e,p.dataset.cast=n,p.dataset.evictee=`c`,o&&p.classList.add(`suspense-decision`),a&&p.classList.add(`has-exit-brand`),p.setAttribute(`aria-hidden`,`true`);let m=e===`final4`?`SAFETY HOLDER · SOLE VOTE`:`LEADER OF THE HUB`,h=e=>`<div class="cine-departure `+e+` cine-layer" data-layer="actors">`+G(`cinema_exitC`,`cine-rear`,`actors`)+`</div>`;p.innerHTML=(e===`exit`?``:`<div class="decision-shot"><div class="decision-camera">`+G(`cinema_hall`,`decision-bg`,`set`)+`<div class="decision-room-dim cine-layer" data-layer="light"></div>`+Ie(F[u].poses.ceremonyFront,`decision-survivor`,`PLAYER `+u.toUpperCase()+` · NOMINEE`)+`<div class="decision-survivor-shade"></div><div class="decision-spotlight cine-layer" data-layer="light"></div>`+Ie(`cinema_standC`,`decision-evictee`,`PLAYER C · NOMINEE`)+Ie(f,`decision-holder`,d+` · `+m)+(e===`final4`?``:G(`cinema_crown`,`decision-insignia crown`))+`<div class="decision-holder-shade"></div></div><div class="decision-intro cine-layer" data-layer="titles">`+(e===`tiebreak`?`4–4 · THE LOH BREAKS THE TIE`:e===`final4`?`FINAL FOUR · THE LOH IS ALREADY SAFE`:`FINAL THREE · THE LOH MUST CHOOSE`)+`</div><div class="decision-verdict cine-layer" data-layer="titles"><span>`+d+(e===`final4`?` CASTS THE ONLY VOTE`:` MAKES THE DECISION`)+`</span><h3>Player C</h3><p>`+(e===`tiebreak`?`ELIMINATED · 5–4`:e===`final4`?`ELIMINATED · 1–0`:`ELIMINATED · THIRD PLACE`)+`</p></div></div>`)+(o?`<div class="decision-suspense cine-layer" data-layer="titles">`+(e===`final4`?`ONE VOTE. NO WAY BACK.`:`ONE PLACE IN THE FINAL TWO.`)+`</div>`:``)+`<div class="exit-shot"><div class="exit-camera">`+G(`cinema_hall`,`exit-background`,`set`)+h(`departure-near`)+`<div class="doorway-volume">`+h(`departure-far`)+`</div><div class="cine-gates cine-layer" data-layer="props">`+G(`cinema_portal`,`cine-gate gate-left`)+G(`cinema_portal`,`cine-gate gate-right`)+`</div><div class="exit-light cine-layer" data-layer="light"></div></div><div class="exit-caption cine-layer" data-layer="titles"><span>PLAYER C</span><h3>One last goodbye.</h3><p>LEAVING THE HUB</p></div></div><div class="decision-cut cine-layer" data-layer="light"></div><div class="handoff-veil cine-layer" data-layer="light"></div>`+(a?s(G):``)+(r?``:`<div class="avatar-sequence"><div class="avatar-stage"><div class="avatar-dim"></div><div class="avatar-hero cine-layer" data-layer="actors">`+G(`cinema_avatarC`,`avatar-photo avatar-colour`,`actors`)+G(`cinema_avatarC`,`avatar-photo avatar-grade`,`actors`)+`<div class="avatar-vignette"></div><div class="avatar-scanlines"></div></div><div class="avatar-live cine-layer" data-layer="titles">LIVE</div><div class="avatar-lower-third cine-layer" data-layer="titles"><span>`+(e===`final3`?`THIRD PLACE`:`ELIMINATED FROM THE HUB`)+`</span><h3>Player C</h3></div>`+G(`cinema_eliminatedStamp`,`avatar-stamp`,`titles`)+`<div class="avatar-roster-label">PLAYER C · ELIMINATED</div></div></div>`)+`<div class="cine-letterbox letterbox-top"></div><div class="cine-letterbox letterbox-bottom"></div><div class="cine-sequence">THE BIG EYE <i></i> CEREMONY FILM</div>`;for(let e of p.querySelectorAll(`[data-resource]`)){let n=e.dataset.resource;if(!t[n])throw Error(`Missing resource `+n);let r=t[n].cloneNode();r.className=e.className,r.dataset.layer=e.dataset.layer,r.dataset.resource=n,r.alt=``,r.draggable=!1,e.replaceWith(r)}let g=p.querySelector(`.decision-holder`);if(g){let e=p.querySelector(`.decision-insignia`);e&&g.append(e);for(let e of p.querySelectorAll(`.decision-holder,.decision-survivor`)){let t=e.querySelector(`.decision-body`).cloneNode();t.classList.add(`decision-dark-body`),e.insertBefore(t,e.querySelector(`.decision-badge`))}}return p}function Re(e,t,n,{nativeHandoff:r=!1,closingBrand:i=!1}={}){let a=e===`final4`||e===`final3`,s=t.classList.contains(`paired-film`),{duration:c,exitAt:l,avatarAt:u,zoomAt:d,closingBrand:f}=Fe(e,{closingBrand:i}),p=`cubic-bezier(.16,1,.3,1)`,m=(e,t)=>n(e,[...t,[c,t.at(-1)[1],t.at(-1)[2]]]);if(n(t,[[0,1],[c-220,1],[c,0]]),l){m(`.decision-shot`,[[0,1],[l-1,1,void 0,`steps(1,end)`],[l,0]]),m(`.decision-camera`,a?[[0,1,`translateY(1%) scale(1.08)`,p],[850,1,`translateX(0) translateY(0) scale(1)`,`cubic-bezier(.45,0,.25,1)`],[1750,1,`translateX(8%) translateY(2%) scale(1.18)`],[2250,1,`translateX(8%) translateY(2%) scale(1.18)`,`cubic-bezier(.45,0,.25,1)`],[3150,1,`translateX(-24%) translateY(5%) scale(1.42)`],[l,1,`translateX(-27%) translateY(6%) scale(1.5)`]]:[[0,1,`translateY(2%) scale(1.13)`,p],[1050,1,`translateY(0) scale(1)`],[1900,1,`translateX(0) scale(1)`],[2900,1,`translateX(-3%) scale(1.07)`]]);let e=(e,t)=>m(e,t.map(([e,...t])=>[a&&e>=1700?e+(e<=1900?900:1e3):e,...t]));a&&m(`.decision-suspense`,[[0,0,`translateY(5px)`],[1750,0,`translateY(5px)`],[2150,.8,`translateY(0)`],[2550,.8],[2900,0]]),m(`.decision-intro`,[[0,0,`translateY(-12px)`],[650,1,`translateY(0)`],[1550,1],[1850,0]]),e(`.decision-holder`,[[0,1,`translateX(-4%) rotate(-2deg)`,p],[1300,1,`translateX(0) rotate(0deg)`],[1700,1,`translateX(0) rotate(0deg)`],[2150,1,`translateX(1%) rotate(1deg)`]]),e(`.decision-room-dim`,[[0,0],[1800,0],[2250,.82]]),e(`.decision-holder-shade`,[[0,0],[1900,0],[2350,.77]]),e(`.decision-holder .decision-dark-body`,[[0,0],[1900,0],[2350,1]]),e(`.decision-holder .decision-badge,.decision-holder .decision-insignia,.decision-survivor .decision-badge`,[[0,1],[1900,1],[2350,.18]]),e(`.decision-survivor .decision-dark-body`,[[0,0],[1850,0],[2300,1]]),e(`.decision-survivor-shade`,[[0,0],[1850,0],[2300,.82]]),e(`.decision-spotlight`,[[0,0,`scaleX(.65)`],[1800,0,`scaleX(.65)`],[2300,.8,`scaleX(1)`]]),e(`.decision-verdict`,[[0,0,`translateY(16px)`],[2150,0,`translateY(16px)`,p],[2600,1,`translateY(0)`]]),m(`.decision-cut`,[[0,0],[l-180,0],[l-45,1],[l+65,1],[l+310,0]])}m(`.exit-shot`,[[0,+!l,void 0,`steps(1,end)`],...l?[[l,1]]:[],[d+120,1,void 0,`steps(1,end)`],[d+121,0]]);let h=[[l,1,`translateY(7%) scale(1)`],...s?[[l+650,1,`translateY(2%) scale(.98)`],[l+1300,1,`translateY(-12%) scale(.9)`],[l+1900,1,`translateY(-30%) scale(.78)`],[l+2300,1,`translateY(-46%) scale(.65)`],[l+3e3,1,`translateY(-63%) scale(.55)`],[l+3400,1,`translateY(-67%) scale(.52)`]]:[[l+650,1,`translateY(-8%) scale(.92)`],[l+1300,1,`translateY(-28%) scale(.8)`],[l+1900,1,`translateY(-47%) scale(.68)`],[l+2300,1,`translateY(-61%) scale(.6)`],[l+3e3,1,`translateY(-82%) scale(.48)`]]];for(let e of[`.departure-near`,`.departure-far`])n(e,[[0,1,`translateY(7%) scale(1)`],...h.filter(e=>e[0]>0),[c,1,h.at(-1)[2]]]);let g=s?l+3e3:l+2300;m(`.departure-near .cine-rear`,[[0,1],[g-1,1,void 0,`steps(1,end)`],[g,0]]),m(`.departure-far .cine-rear`,[[0,0,void 0,`steps(1,end)`],[g,1]]);for(let[e,t,n]of[[`.gate-left`,-1,``],[`.gate-right`,1,` scaleX(-1)`]]){let r=`translateX(`+t*105+`%)`+n,i=`translateX(0)`+n;m(e,s?[[0,1,i],[l+500,1,r],[l+3300,1,r,`cubic-bezier(.45,0,.2,1)`],[l+3900,1,i]]:[[0,1,r],[l+3200,1,r,`cubic-bezier(.45,0,.2,1)`],[l+3900,1,i]])}if(m(`.exit-camera`,[[0,1,`scale(1.02)`],[l+3300,1,`scale(1.02)`],[l+3900,1,`scale(1.05)`,`cubic-bezier(.6,.05,.55,1)`],[d+140,1,`scale(4.8)`]]),m(`.exit-light`,[[0,.5],[l+3e3,.35],[l+3900,.05]]),m(`.exit-caption`,[[0,0],[l+250,0,`translateY(10px)`],[l+750,1,`translateY(0)`],[l+3e3,1],[l+3450,0]]),m(`.handoff-veil`,[[0,0],[d-200,0],[d+40,.96],[u+170,.96],[u+470,0]]),f){let e=d+140;m(`.cine-sequence`,[[0,1],[d-200,1],[e,0]]),o(m,{startAt:e,holdUntil:u-220,fadeOut:!1,flyToBlack:!0})}r||(m(`.avatar-sequence`,[[0,0,void 0,`steps(1,end)`],[u+80,1]]),m(`.avatar-hero`,[[0,1,`translateY(-8%) scale(1.12)`],[u+80,1,`translateY(-8%) scale(1.12)`,p],[u+560,1,`translateY(0) scale(1)`],[u+4800,1,`translateY(0) scale(1)`,`cubic-bezier(.25,.46,.45,.94)`],[u+5400,1,`translateY(30%) scale(.19)`]]),m(`.avatar-photo`,[[0,1,`translateY(0) scale(1)`],[u+900,1,`translateY(0) scale(1)`],[u+1800,1,`translateY(-1%) scale(1.04)`]]),m(`.avatar-grade`,[[0,0],[u+1800,0],[u+2150,1]]),m(`.avatar-vignette`,[[0,0],[u+1800,0],[u+2150,1]]),m(`.avatar-live`,[[0,0],[u+750,0],[u+900,1],[u+4650,1],[u+4800,0]]),m(`.avatar-lower-third`,[[0,0,`translateY(110%)`],[u+2100,0,`translateY(110%)`],[u+2320,1,`translateY(0)`],[u+4650,1],[u+4800,0,`translateY(110%)`]]),m(`.avatar-stamp`,[[0,0,`translate(-50%,-50%) scale(2.4) rotate(-14deg)`],[u+2160,0,`translate(-50%,-50%) scale(2.4) rotate(-14deg)`],[u+2390,1,`translate(-50%,-50%) scale(.96) rotate(-12deg)`],[u+2490,1,`translate(-50%,-50%) scale(1) rotate(-12deg)`],[u+4650,1,`translate(-50%,-50%) scale(1) rotate(-12deg)`],[u+4770,0,`translate(-50%,-50%) scale(.7) rotate(-12deg)`]]),m(`.avatar-roster-label`,[[0,0],[u+5200,0],[u+5400,1]]))}var ze={duration:8400,art:[`cinema_shockRoom`,`cinema_city`],description:`The Eye crashes into the normal city view with one purple-gold impact and a brief camera recoil. The Hub falls dark, the iris turns, and a smooth pullback becomes the actual Shock announcement. Shared across all shock types.`,beats:[[`00.0`,`A normal moment in the Hub`],[`00.2`,`The Eye forces its way in`],[`00.6`,`The lights die; the Hub is interrupted`],[`01.3`,`The iris turns and the Eye takes control`],[`03.5`,`The actual Shock is revealed`]],moments:[100,350,1150,2250,3800,5600]},Be=(e,t,n,r)=>{let i=e[t].cloneNode();return i.className=n+` cine-layer`,i.dataset.layer=r,i.alt=``,i.draggable=!1,i};function Ve(e,t){let n=document.createElement(`div`);n.className=`c-scene cinema-v2 cinema-v3 shock-film film-shock`,n.dataset.shock=t.tone,n.dataset.motif=t.motif,n.setAttribute(`aria-hidden`,`true`),n.innerHTML=`<div class="shock-chamber"><div class="shock-lens"><div class="shock-city-window"></div><div class="shock-room-plane"></div><div class="shock-iris"></div><div class="shock-chamber-shadow cine-layer" data-layer="light"></div><div class="shock-eye-light cine-layer" data-layer="light"></div><div class="shock-breath cine-layer" data-layer="light"></div></div></div><div class="shock-blackout cine-layer" data-layer="light"></div><div class="shock-hush cine-layer" data-layer="titles">THE HUB FALLS SILENT</div><div class="shock-presence cine-layer" data-layer="titles">THE EYE HAS TAKEN CONTROL.</div><div class="cine-titles cine-layer" data-layer="titles"><span>THE BIG EYE · SHOCK ANNOUNCEMENT</span><h3 class="shock-title"></h3><i class="shock-rule"></i><p class="shock-copy"></p></div><div class="shock-edge-shade"></div><div class="cine-letterbox letterbox-top"></div><div class="cine-letterbox letterbox-bottom"></div><div class="cine-sequence">THE BIG EYE <i></i> CEREMONY FILM</div>`;let r=document.createElement(`div`);r.className=`shock-interrupted-feed cine-layer`,r.dataset.layer=`set`,r.append(Be(e,`cinema_city`,`shock-feed-city`,`set`)),n.prepend(r);let i=document.createElement(`div`);return i.className=`shock-clash-light cine-layer`,i.dataset.layer=`light`,n.append(i),n.querySelector(`.shock-city-window`).append(Be(e,`cinema_city`,`shock-city`,`set`)),n.querySelector(`.shock-room-plane`).append(Be(e,`cinema_shockRoom`,`shock-wall eye-window-room`,`set`)),n.querySelector(`.shock-iris`).append(Be(e,`cinema_shockRoom`,`shock-iris-texture`,`set`)),n.querySelector(`.shock-title`).textContent=t.title,n.querySelector(`.shock-copy`).textContent=t.copy,n}function He(e,t){let n=ze.duration,r=`cubic-bezier(.4,0,.2,1)`,i=`cubic-bezier(.16,1,.3,1)`,a=(e,r)=>t(e,r.at(-1)[0]===n?r:[...r,[n,r.at(-1)[1],r.at(-1)[2]]]);t(e,[[0,1],[n-320,1],[n,0]]),a(`.shock-interrupted-feed`,[[0,1],[219,1,void 0,`steps(1,end)`],[220,0]]),a(`.shock-chamber`,[[0,0,`translateY(2%) scale(2.92)`,`steps(1,end)`],[220,1,`translateY(2%) scale(2.92)`,i],[580,1,`translateY(2%) scale(2.6)`,r],[1400,1,`translateY(1%) scale(2.56)`,r],[3300,1,`translateY(0) scale(1.04)`],[n,1,`translateY(-.4%) scale(1.075)`]]),a(`.shock-lens`,[[0,1,`translate(0,0)`],[220,1,`translate(-6px,4px) rotate(-.35deg)`],[280,1,`translate(4px,-2px) rotate(.25deg)`],[350,1,`translate(-3px,1px) rotate(-.15deg)`],[440,1,`translate(1px,0) rotate(.05deg)`],[580,1,`translate(0,0) rotate(0)`]]),a(`.shock-clash-light`,[[0,0,`scale(.98)`],[200,0,`scale(.98)`],[265,.62,`scale(1)`],[520,0,`scale(1.04)`]]),a(`.shock-blackout`,[[0,0],[200,0],[380,.68],[820,.91],[1080,.91],[1900,.16],[2850,0]]),a(`.shock-chamber-shadow`,[[0,.14],[450,.14],[950,.7],[3300,.73]]),a(`.shock-city`,[[0,.9,`translateY(0) scale(1.03)`],[580,.9,`translateY(0) scale(1.03)`],[1150,.06,`translateY(0) scale(1.03)`],[n,.025,`translateY(-1%) scale(1.05)`]]),a(`.shock-iris`,[[0,1,`rotate(0deg)`],[900,1,`rotate(0deg)`,r],[3e3,1,`rotate(34deg)`],[n,1,`rotate(39deg)`]]),a(`.shock-eye-light`,[[0,0],[1050,0],[1850,.65],[2850,.29],[3800,.42],[6e3,.23]]),a(`.shock-breath`,[[0,0,`translateX(-3%)`],[1450,0,`translateX(-3%)`],[3100,.17,`translateX(0)`],[6500,.23,`translateX(3%)`]]),a(`.shock-hush`,[[0,0,`translateY(3px)`],[670,0,`translateY(3px)`],[1040,.85,`translateY(0)`],[1500,.85],[2050,0]]),a(`.shock-presence`,[[0,0,`translateY(7px)`],[1900,0,`translateY(7px)`,i],[2600,.9,`translateY(0)`],[3150,.9],[3500,0,`translateY(-3px)`]]),a(`.cine-titles`,[[0,0,`translateY(14px) scale(.985)`],[3450,0,`translateY(14px) scale(.985)`,i],[4200,1,`translateY(0) scale(1)`]]),a(`.shock-title`,[[0,1,`translateY(9px)`],[3450,1,`translateY(9px)`,i],[4400,1,`translateY(0)`]]),a(`.shock-rule`,[[0,0,`scaleX(0)`],[3880,0,`scaleX(0)`],[4580,.75,`scaleX(1)`]]),a(`.shock-copy`,[[0,0,`translateY(5px)`],[4100,0,`translateY(5px)`],[4650,1,`translateY(0)`]])}var Ue=[...new Set([...ye,...U])],We={...xe,...W,shock:ze};function Ge(e,t,n,r=0){return U.includes(e)?Le(e,t,r):e===`shock`?Ve(t,n):Ae(e,t,n,r)}function Ke(e,t,n){if(U.includes(e))return Re(e,t,n);if(e===`shock`)return He(t,n);je(e,t,n)}var K={safety:{label:`Winning Safety`,number:`01`,title:`Power becomes protection.`,subtitle:`The shield chooses its knight.`,duration:4200,art:[`male`,`shield`,`knight`,`cinema_sanctuary`],description:`The winner receives the Power of Safety. A shield flies into place, then a purple-and-gold camera flash reveals a knight holding it.`,beats:[[`00.0`,`The winner steps forward`],[`00.8`,`The shield arrives`],[`01.7`,`A knight of Safety is revealed`]],moments:[1200,2600,3500]},nominations:{label:`Nominations`,number:`02`,title:`A place on the edge.`,subtitle:`Two nominees. One uncertain future.`,duration:4800,art:[`male`,`female`,`platform`,`cinema_danger`],description:`Two suspended stone ledges hang over a dark chasm. Each nominee is revealed in turn, then both remain in view above the danger below.`,beats:[[`00.4`,`The first nominee takes the ledge`],[`01.6`,`The second nominee is revealed`],[`02.6`,`Both are left on the edge`]],moments:[1100,2300,3500]},save:{label:`Saved by Safety`,number:`03`,title:`A way back to safety.`,subtitle:`One shield. A second chance.`,duration:4500,art:[`female`,`platform`,`shield`,`cinema_sanctuary`],description:`The nominee begins on a danger ledge. Safety arrives, breaks the red danger frame, and lets the ledge fall away. The player remains protected in warm light.`,beats:[[`00.0`,`A nominee stands in danger`],[`01.2`,`Safety reaches the player`],[`01.9`,`The block breaks away`]],moments:[900,1700,3200]},exit:{label:`Leaving the Hub`,number:`04`,title:`One last goodbye.`,subtitle:`The door closes. Their chapter ends.`,duration:5e3,art:[`door`,`departing`],description:`The departing player carries a bag and suitcase toward the Hub exit. They disappear through the doorway, the door swings shut, and the scene fades to darkness.`,beats:[[`00.0`,`Bags packed. A last walk out.`],[`02.1`,`Through the exit doorway`],[`03.3`,`The door closes, then darkness`]],moments:[1e3,2650,3900]},tiebreak:{label:`Tiebreak`,number:`05`,title:`The deciding vote.`,subtitle:`One final choice breaks the tie.`,duration:4200,art:[`male`,`female`,`scales`],description:`The tied nominees stand across a ceremonial balance. A single golden LOH vote lands, the scales tilt, and the decided outcome is revealed.`,beats:[[`00.4`,`Two nominees. Equal footing.`],[`01.4`,`The LOH casts the deciding vote`],[`02.4`,`The balance tips`]],moments:[900,2100,3300]},ambush:{label:`Ambush`,number:`06`,title:`You never saw it coming.`,subtitle:`The hidden target steps into danger.`,duration:4300,art:[`male`,`female`,`finalist`,`platform`,`curtain`],description:`The initial nominees hold their places. A hidden target appears from behind the Hub curtains as a new danger ledge rises beneath them: the true ambush nominee.`,beats:[[`00.5`,`The block appears settled`],[`01.8`,`The curtain parts`],[`02.5`,`A new name is on the block`]],moments:[1200,2450,3500]},allPower:{label:`All the Power`,number:`07`,title:`The sovereign.`,subtitle:`Leader and Safety holder. One player.`,duration:4200,art:[`seatedKing`,`shield`,`eyeSeal`],description:`The crowned Leader sits on the throne as the Safety shield joins the scene. Both powers flare together behind the Hub’s sovereign.`,beats:[[`00.5`,`The Leader takes the throne`],[`01.4`,`Safety joins the crown`],[`02.5`,`All the power, in one seat`]],moments:[900,2200,3400]},shock:{label:`Shock announcement`,number:`08`,title:`The Eye interrupts.`,subtitle:`Choose a real shock type to preview.`,duration:3400,art:[`eyeSeal`,`curtain`],shock:!0,description:`A single fast broadcast reveal adapts to the selected shock: its real announcement title and copy appear with a matching color and light cue. No extra generated clip per twist.`,beats:[[`00.0`,`The Hub lights dip`],[`00.8`,`The Eye opens`],[`01.4`,`The twist is announced`]],moments:[500,1300,2400]},final4:{label:`Final 4 Safety`,number:`09`,title:`One vote. Two nominees.`,subtitle:`The protected LOH is off-stage.`,duration:4400,art:[`male`,`female`,`finalist`,`shield`],description:`Only the three eligible players appear. The LOH is already safe and is not shown as a participant. One golden ballot is cast and the selected player is revealed.`,beats:[[`00.3`,`Three eligible players enter`],[`01.5`,`The sole vote is cast`],[`02.5`,`One journey ends`]],moments:[1100,2300,3500]},final3:{label:`Final 3 elimination`,number:`10`,title:`The final invitation.`,subtitle:`The LOH chooses who finishes third.`,duration:5e3,art:[`male`,`female`,`finalist`,`crown`,`door`],description:`The crowned LOH faces the other two finalists. A royal decree selects the third-place finisher, who leaves through the Hub exit as the last two step into the finale.`,beats:[[`00.5`,`Three journeys remain`],[`01.9`,`The LOH makes the final choice`],[`03.0`,`A finalist exits. Two remain.`]],moments:[1200,2550,4300]}};for(let[e,t]of Object.entries(We))K[e]={...K[e],...t,cinema:!0};var qe={doubleEviction:{label:`Double Elimination`,title:`DOUBLE ELIMINATION`,copy:`Two exits. One night.`,tone:`danger`,motif:`slashes`},voxDouble:{label:`Vox Populi Double Elimination`,title:`THE PUBLIC DECIDES`,copy:`The audience will eliminate two.`,tone:`danger`,motif:`pulse`},dayStartShock:{label:`Morning Shock`,title:`MORNING SHOCK`,copy:`A new day. A sudden exit.`,tone:`dawn`,motif:`sunrise`},battleBack:{label:`Back 2 the Game`,title:`BACK 2 THE GAME`,copy:`One eliminated player may return.`,tone:`gold`,motif:`return`},battleBackRules:{label:`Back 2 the Game Rules`,title:`THE RULES HAVE CHANGED`,copy:`Only one can earn a way back.`,tone:`gold`,motif:`return`},battleBackChallenge:{label:`Back 2 the Game Challenge`,title:`THE RETURN CHALLENGE`,copy:`The showdown starts now.`,tone:`gold`,motif:`return`},vip:{label:`Double Trouble Safety`,title:`DOUBLE TROUBLE`,copy:`Safety can be used twice.`,tone:`violet`,motif:`twin-shields`},diamond:{label:`Halo Exchange Safety`,title:`HALO EXCHANGE`,copy:`The Safety holder names the replacement.`,tone:`violet`,motif:`halo`},coup:{label:`Detox Safety`,title:`DETOX`,copy:`Both nominees are cleared. Two replacements.`,tone:`danger`,motif:`cleared`},spotlight:{label:`Force Majeure Safety`,title:`FORCE MAJEURE`,copy:`The Safety power must be used.`,tone:`gold`,motif:`spotlight`},democracia:{label:`Democracia`,title:`DEMOCRACIA`,copy:`The Hub elects its new Leader.`,tone:`gold`,motif:`ballots`},twinShock:{label:`Twin Shock`,title:`TWIN SHOCK`,copy:`Two new faces change the game.`,tone:`violet`,motif:`twins`},depressionShock:{label:`Depression Shock`,title:`DEPRESSION SHOCK`,copy:`The Hub’s mood takes a turn.`,tone:`storm`,motif:`storm`},cupidArrow:{label:`Cupid’s Arrow`,title:`CUPID’S ARROW`,copy:`The Hub is bound into pairs.`,tone:`rose`,motif:`arrows`},cupidBroken:{label:`Cupid’s Spell Is Broken`,title:`THE SPELL IS BROKEN`,copy:`The pairs are over. Everyone plays alone.`,tone:`rose`,motif:`broken-heart`},generic:{label:`General Shock Alert`,title:`SHOCK ALERT!`,copy:`The Big Eye has a surprise.`,tone:`violet`,motif:`pulse`}},q=(e,t)=>`<span data-art="`+e+`" class="`+t+`"></span>`,J=(e,t,n,r=``)=>`<div class="c-caption `+r+`"><span>`+e+`</span><strong>`+t+`</strong><em>`+n+`</em></div>`,Je=(e,t,n)=>`<div class="nom-pod `+n+`"><div class="nom-aura"></div>`+q(e,`nom-person`)+q(`platform`,`nom-platform`)+`<div class="nom-label"><span>0`+t+`</span>NOMINATED</div></div>`;function Ye(e,t,n,r=0){if(Ue.includes(e))return Ge(e,t,n,r);let i=document.createElement(`div`);i.className=`c-scene c-`+e,i.setAttribute(`aria-hidden`,`true`),e===`safety`&&(i.innerHTML=`<div class="c-halo safety-halo"></div><div class="safety-arch"></div><div class="c-ground"></div>`+q(`male`,`safety-ordinary c-hero`)+q(`knight`,`safety-knight c-hero`)+q(`shield`,`safety-flying-shield`)+`<div class="c-wash"></div>`+J(`THE POWER OF SAFETY`,`Knight of Safety`,`THE SHIELD IS YOURS.`)),e===`nominations`&&(i.innerHTML=`<div class="nom-chasm"></div><div class="nom-warning">THE NOMINATION CEREMONY</div>`+Je(`male`,1,`nom-first`)+Je(`female`,2,`nom-second`)+J(`ON THE EDGE`,`Two names. One block.`,`THEIR FUTURE HANGS IN THE BALANCE.`)),e===`save`&&(i.innerHTML=`<div class="c-halo save-danger-halo"></div><div class="c-halo save-safe-halo"></div><div class="c-ground save-ground"></div>`+q(`shield`,`save-shield`)+q(`platform`,`save-platform`)+q(`female`,`save-person c-hero`)+`<div class="save-bracket save-bracket-left"></div><div class="save-bracket save-bracket-right"></div><div class="c-wash"></div>`+J(`ON THE BLOCK`,`One chance to stay.`,`NOMINATED`,`save-danger-caption`)+J(`SAVED BY THE POWER OF SAFETY`,`Off the block.`,`YOUR STORY ISN’T OVER.`,`save-safe-caption`)),e===`exit`&&(i.innerHTML=`<div class="exit-room-light"></div><div class="exit-door-set"><div class="exit-void"></div></div><div class="exit-far-wrap">`+q(`departing`,`exit-traveler exit-far`)+`</div><div class="exit-door-set exit-door-front"><div class="exit-leaf"><span class="exit-leaf-emblem">◉</span><i class="exit-handle"></i></div>`+q(`door`,`exit-frame`)+`</div>`+q(`departing`,`exit-traveler exit-near`)+`<div class="exit-sign">HUB EXIT</div>`+J(`THE END OF THIS CHAPTER`,`One last goodbye.`,`YOU LEFT YOUR MARK ON THE HUB.`)+`<div class="exit-blackout"></div>`),e===`tiebreak`&&(i.innerHTML=`<div class="tie-halo"></div><div class="tie-vote-line"></div>`+q(`scales`,`tie-scales`)+`<div class="tie-candidate tie-left">`+q(`male`,`tie-person`)+`<span>THE NOMINEES</span><strong>01</strong></div><div class="tie-candidate tie-right">`+q(`female`,`tie-person`)+`<span>THE NOMINEES</span><strong>02</strong></div><div class="tie-token">LOH<br>VOTE</div>`+J(`THE DECIDING VOTE`,`The tie is broken.`,`THE LOH MAKES THE CALL.`)),e===`ambush`&&(i.innerHTML=`<div class="ambush-curtains">`+q(`curtain`,`ambush-curtain ambush-curtain-left`)+q(`curtain`,`ambush-curtain ambush-curtain-right`)+`</div><div class="ambush-beam"></div><div class="ambush-side-nominees">`+q(`male`,`ambush-small`)+q(`female`,`ambush-small`)+`<span>THE BLOCK</span></div>`+q(`platform`,`ambush-platform`)+q(`finalist`,`ambush-target`)+`<div class="ambush-stamp">AMBUSH<br><b>NOMINATED</b></div>`+J(`THE BLOCK JUST CHANGED`,`A new nominee.`,`THE AMBUSH IS REVEALED.`)),e===`allPower`&&(i.innerHTML=`<div class="power-aura"></div>`+q(`eyeSeal`,`power-eye`)+q(`seatedKing`,`power-king`)+q(`shield`,`power-shield`)+`<div class="power-label"><span>LEADER OF THE HUB</span><b>+</b><span>POWER OF SAFETY</span></div>`+J(`ONE PLAYER HOLDS IT ALL`,`The sovereign.`,`ALL THE POWER.`)),e===`shock`&&(i.innerHTML=`<div class="shock-curtains">`+q(`curtain`,`shock-curtain shock-curtain-left`)+q(`curtain`,`shock-curtain shock-curtain-right`)+`</div><div class="shock-rays"></div>`+q(`eyeSeal`,`shock-eye`)+`<div class="shock-card"><span>THE BIG EYE INTERRUPTS</span><strong class="shock-title"></strong><em class="shock-copy"></em></div>`+J(`A TWIST CHANGES EVERYTHING`,`Shock announcement`,`THE HUB WILL NEVER BE THE SAME.`)),e===`final4`&&(i.innerHTML=`<div class="f4-arch"></div><div class="f4-eligible">THREE ELIGIBLE PLAYERS · LOH ALREADY SAFE</div><div class="f4-row"><div class="f4-player f4-one">`+q(`male`,`f4-person`)+`<span>01</span></div><div class="f4-player f4-two">`+q(`female`,`f4-person`)+`<span>02</span></div><div class="f4-player f4-three">`+q(`finalist`,`f4-person`)+`<span>03</span></div></div><div class="f4-ballot">THE<br>SOLE<br>VOTE</div>`+J(`FINAL FOUR · SOLE VOTE`,`One journey ends.`,`THREE ELIGIBLE PLAYERS. THE LOH IS SAFE.`)),e===`final3`&&(i.innerHTML=`<div class="f3-arch"></div><div class="f3-title">THE FINAL THREE</div><div class="f3-player f3-loh">`+q(`male`,`f3-person`)+q(`crown`,`f3-crown`)+`<span>LOH</span></div><div class="f3-player f3-left">`+q(`female`,`f3-person`)+`<span>FINALIST</span></div><div class="f3-player f3-right">`+q(`finalist`,`f3-person`)+`<span>FINALIST</span></div><div class="f3-decree">THE LOH’S<br>DECISION</div>`+q(`door`,`f3-door`)+J(`THE FINAL TWO`,`The final invitation.`,`THE LOH CHOSE WHO FINISHED THIRD.`)+`<div class="f3-blackout"></div>`),[`safety`,`nominations`,`save`].includes(e)&&i.insertAdjacentHTML(`afterbegin`,q(e===`nominations`?`cinema_danger`:`cinema_sanctuary`,`ceremony-backdrop`)+`<div class="ceremony-backdrop-shade"></div>`);for(let e of i.querySelectorAll(`[data-art]`)){let n=t[e.dataset.art].cloneNode();n.className=e.className,n.alt=``,n.draggable=!1,e.replaceWith(n)}return e===`shock`&&n&&(i.dataset.shock=n.tone,i.querySelector(`.shock-title`).textContent=n.title,i.querySelector(`.shock-copy`).textContent=n.copy),i}function Xe(e,t,n,r){if(Ue.includes(e))return Ke(e,t,n);if([`safety`,`nominations`,`save`].includes(e)&&n(`.ceremony-backdrop`,[[0,.45,`translateY(1%) scale(1.07)`],[e===`safety`?4200:e===`save`?4500:4800,.6,`translateY(-1%) scale(1.015)`]]),e===`safety`&&(n(t,[[0,0],[240,1],[3860,1],[4200,0]]),n(`.c-halo`,[[0,0,`scale(.8)`],[600,.85,`scale(1)`],[2500,1,`scale(1.1)`],[4200,.75,`scale(1.15)`]]),n(`.safety-arch`,[[0,0],[600,.65],[4200,.65]]),n(`.c-ground`,[[0,0],[600,1],[4200,1]]),n(`.safety-ordinary`,[[0,0,`translateY(18px) scale(.96)`],[550,1,`translateY(0) scale(1)`],[1550,1,`translateY(0) scale(1)`,`steps(1,end)`],[1680,0,`translateY(0) scale(1)`],[4200,0]]),n(`.safety-flying-shield`,[[0,0,`translateX(-150px) translateY(30px) rotate(-18deg) scale(.6)`],[700,0,`translateX(-150px) translateY(30px) rotate(-18deg) scale(.6)`],[1120,1,`translateX(4px) translateY(-3px) rotate(3deg) scale(1.04)`],[1350,1,`translateX(0) translateY(0) rotate(0) scale(1)`,`steps(1,end)`],[1680,0,`translateX(0) translateY(0) rotate(0) scale(1)`],[4200,0]]),n(`.c-wash`,[[0,0],[1530,0],[1630,1],[1740,1],[1960,0],[4200,0]]),n(`.safety-knight`,[[0,0,`translateY(0) scale(1.025)`,`steps(1,end)`],[1680,1,`translateY(0) scale(1.025)`],[2160,1,`translateY(0) scale(1)`],[3860,1,`translateY(0) scale(1.018)`],[4200,1,`translateY(0) scale(1.018)`]]),n(`.c-caption`,[[0,0,`translateY(10px)`],[1880,0,`translateY(10px)`],[2280,1,`translateY(0)`],[4200,1,`translateY(0)`]])),e===`nominations`&&(n(t,[[0,0],[250,1],[4430,1],[4800,0]]),n(`.nom-chasm`,[[0,0],[600,.9],[4800,1]]),n(`.nom-warning`,[[0,0],[350,1],[4800,1]]),n(`.nom-first`,[[0,0,`translateX(65px) translateY(20px) scale(1.12)`],[350,0,`translateX(65px) translateY(20px) scale(1.12)`],[900,1,`translateX(65px) translateY(0) scale(1.12)`],[1350,1,`translateX(65px) translateY(0) scale(1.12)`],[2050,1,`translateX(0) translateY(0) scale(1)`],[4800,1,`translateX(0) translateY(0) scale(1)`]]),n(`.nom-second`,[[0,0,`translateX(34px) translateY(18px) scale(.96)`],[1600,0,`translateX(34px) translateY(18px) scale(.96)`],[2280,1,`translateX(0) translateY(0) scale(1)`],[4800,1,`translateX(0) translateY(0) scale(1)`]]),n(`.nom-first .nom-aura`,[[0,0],[650,.9],[1150,.4],[2050,.7],[4800,.5]]),n(`.nom-second .nom-aura`,[[0,0],[1750,0],[2250,.9],[2850,.45],[4800,.5]]),n(`.c-caption`,[[0,0,`translateY(12px)`],[2450,0,`translateY(12px)`],[2900,1,`translateY(0)`],[4800,1,`translateY(0)`]])),e===`save`){n(t,[[0,0],[240,1],[4140,1],[4500,0]]),n(`.save-danger-halo`,[[0,0],[550,.85],[1510,.85],[1900,0],[4500,0]]),n(`.save-safe-halo`,[[0,0],[1670,0],[2150,1],[4500,.85]]),n(`.save-ground`,[[0,0],[1780,0],[2200,1],[4500,1]]),n(`.save-person`,[[0,0,`translateY(10px) scale(.98)`],[450,1,`translateY(0) scale(1)`],[1550,1,`translateY(0) scale(1)`],[2050,1,`translateY(-12px) scale(1.015)`],[2550,1,`translateY(-8px) scale(1)`],[4500,1,`translateY(-8px) scale(1.012)`]]),n(`.save-platform`,[[0,0],[450,1],[1570,1,`translateY(0)`],[2040,0,`translateY(65px)`],[4500,0,`translateY(65px)`]]),n(`.save-shield`,[[0,0,`translateX(-150px) translateY(20px) rotate(-15deg) scale(.3)`],[1e3,0,`translateX(-150px) translateY(20px) rotate(-15deg) scale(.3)`],[1590,1,`translateX(0) translateY(0) rotate(0) scale(1.06)`],[2030,.9,`translateX(0) translateY(0) rotate(0) scale(1)`],[4500,.9,`translateX(0) translateY(0) rotate(0) scale(1)`]]);for(let[e,t]of[[`.save-bracket-left`,-1],[`.save-bracket-right`,1]])n(e,[[0,0],[450,.9],[1570,.9,`translateX(0) rotate(0)`],[2020,0,`translateX(`+t*65+`px) rotate(`+t*14+`deg)`],[4500,0]]);n(`.c-wash`,[[0,0],[1530,0],[1640,.95],[1740,.95],[1940,0],[4500,0]]),n(`.save-danger-caption`,[[0,0],[600,1],[1560,1],[1700,0],[4500,0]]),n(`.save-safe-caption`,[[0,0,`translateY(10px)`],[1950,0,`translateY(10px)`],[2350,1,`translateY(0)`],[4500,1,`translateY(0)`]])}e===`exit`&&(n(t,[[0,0],[300,1],[5e3,1]]),n(`.exit-room-light`,[[0,0],[600,.7],[3300,.7],[4100,.15],[5e3,0]]),n(`.exit-door-front`,[[0,0],[450,1],[5e3,1]]),n(`.exit-near`,[[0,0,`translateX(-45px) translateY(20px) scale(1.02)`],[350,1,`translateX(-40px) translateY(16px) scale(1)`],[950,1,`translateX(-18px) translateY(8px) scale(.85)`],[2050,1,`translateX(20px) translateY(0) scale(.54)`,`steps(1,end)`],[2100,0,`translateX(20px) translateY(0) scale(.54)`],[5e3,0]]),n(`.exit-far`,[[0,0,`translateX(20px) translateY(0) scale(.54)`,`steps(1,end)`],[2100,1,`translateX(20px) translateY(0) scale(.54)`],[2780,1,`translateX(22px) translateY(-38px) scale(.36)`],[3260,0,`translateX(22px) translateY(-60px) scale(.25)`],[5e3,0]]),n(`.exit-leaf`,[[0,1,`rotateY(-88deg)`],[3210,1,`rotateY(-88deg)`],[3850,1,`rotateY(1deg)`],[4e3,1,`rotateY(0deg)`],[5e3,1,`rotateY(0deg)`]]),n(`.exit-sign`,[[0,0],[500,1],[3800,1],[4250,0],[5e3,0]]),n(`.c-caption`,[[0,0,`translateY(8px)`],[750,1,`translateY(0)`],[3480,1,`translateY(0)`],[3990,0,`translateY(0)`],[5e3,0]]),n(`.exit-blackout`,[[0,0],[3980,0],[4650,1],[5e3,1]])),e===`tiebreak`&&(n(t,[[0,0],[250,1],[3850,1],[4200,0]]),n(`.tie-halo`,[[0,0],[600,.8],[4200,.35]]),n(`.tie-scales`,[[0,0,`translateY(-35px) scale(.9)`],[850,1,`translateY(0) scale(1)`],[2050,1,`rotate(0deg)`],[2800,1,`rotate(8deg)`],[4200,1,`rotate(8deg)`]]),n(`.tie-candidate`,[[0,0,`translateY(24px) scale(.96)`],[700,1,`translateY(0) scale(1)`],[4200,1,`translateY(0) scale(1)`]]),n(`.tie-token`,[[0,0,`translateY(-75px) scale(.7) rotate(-12deg)`],[1450,0,`translateY(-75px) scale(.7) rotate(-12deg)`],[1930,1,`translateY(5px) scale(1.12) rotate(0)`],[2180,1,`translateY(0) scale(1) rotate(0)`],[4200,1,`translateY(0) scale(1) rotate(0)`]]),n(`.c-caption`,[[0,0,`translateY(10px)`],[2550,0,`translateY(10px)`],[2900,1,`translateY(0)`],[4200,1,`translateY(0)`]])),e===`ambush`&&(n(t,[[0,0],[280,1],[3950,1],[4300,0]]),n(`.ambush-side-nominees`,[[0,0],[650,.85],[4300,.45]]),n(`.ambush-curtain-left`,[[0,1,`translateX(0)`],[1650,1,`translateX(0)`],[2350,1,`translateX(-115px)`],[4300,1,`translateX(-115px)`]]),n(`.ambush-curtain-right`,[[0,1,`translateX(0)`],[1650,1,`translateX(0)`],[2350,1,`translateX(115px)`],[4300,1,`translateX(115px)`]]),n(`.ambush-beam`,[[0,0,`scaleY(.3)`],[1750,0,`scaleY(.3)`],[2450,.85,`scaleY(1)`],[4300,.65,`scaleY(1)`]]),n(`.ambush-platform`,[[0,0,`translateY(70px) scale(.8)`],[2200,0,`translateY(70px) scale(.8)`],[2580,1,`translateY(0) scale(1)`],[4300,1,`translateY(0) scale(1)`]]),n(`.ambush-target`,[[0,0,`translateY(35px) scale(.92)`],[2380,0,`translateY(35px) scale(.92)`],[2780,1,`translateY(0) scale(1)`],[4300,1,`translateY(0) scale(1)`]]),n(`.ambush-stamp`,[[0,0,`scale(1.35) rotate(-9deg)`],[2780,0,`scale(1.35) rotate(-9deg)`],[3200,1,`scale(1) rotate(-4deg)`],[4300,1,`scale(1) rotate(-4deg)`]]),n(`.c-caption`,[[0,0],[3100,0],[3500,1],[4300,1]])),e===`allPower`&&(n(t,[[0,0],[260,1],[3850,1],[4200,0]]),n(`.power-aura`,[[0,0,`scale(.75)`],[750,.8,`scale(1)`],[2500,1,`scale(1.1)`],[4200,.5,`scale(1.15)`]]),n(`.power-eye`,[[0,0,`scale(.65) rotate(-18deg)`],[500,0,`scale(.65) rotate(-18deg)`],[1230,.75,`scale(1) rotate(0)`],[4200,.65,`scale(1) rotate(0)`]]),n(`.power-king`,[[0,0,`translateY(40px) scale(.97)`],[900,1,`translateY(0) scale(1)`],[3300,1,`translateY(-4px) scale(1.015)`],[4200,1,`translateY(-4px) scale(1.015)`]]),n(`.power-shield`,[[0,0,`translateX(145px) rotate(16deg) scale(.7)`],[1300,0,`translateX(145px) rotate(16deg) scale(.7)`],[1950,1,`translateX(0) rotate(0) scale(1.05)`],[2250,1,`translateX(0) rotate(0) scale(1)`],[4200,1,`translateX(0) rotate(0) scale(1)`]]),n(`.power-label`,[[0,0,`translateY(12px)`],[2100,0,`translateY(12px)`],[2500,1,`translateY(0)`],[4200,1,`translateY(0)`]]),n(`.c-caption`,[[0,0],[2800,0],[3200,1],[4200,1]])),e===`shock`&&(n(t,[[0,0],[120,1],[3150,1],[3400,0]]),n(`.shock-curtain-left`,[[0,1,`translateX(0)`],[740,1,`translateX(0)`],[1190,1,`translateX(-115px)`],[3400,1,`translateX(-115px)`]]),n(`.shock-curtain-right`,[[0,1,`translateX(0)`],[740,1,`translateX(0)`],[1190,1,`translateX(115px)`],[3400,1,`translateX(115px)`]]),n(`.shock-rays`,[[0,0,`scale(.65)`],[950,.25,`scale(.75)`],[1450,.85,`scale(1)`],[3400,.3,`scale(1.08)`]]),n(`.shock-eye`,[[0,0,`scale(.62) rotate(-8deg)`],[1050,0,`scale(.62) rotate(-8deg)`],[1500,1,`scale(1.04) rotate(0)`],[3400,.9,`scale(1) rotate(0)`]]),n(`.shock-card`,[[0,0,`translateY(22px) scale(.96)`],[1500,0,`translateY(22px) scale(.96)`],[1900,1,`translateY(0) scale(1)`],[3400,1,`translateY(0) scale(1)`]]),n(`.c-caption`,[[0,0],[2350,0],[2750,1],[3400,1]])),e===`final4`&&(n(t,[[0,0],[250,1],[4050,1],[4400,0]]),n(`.f4-arch`,[[0,0,`scale(.85)`],[600,.7,`scale(1)`],[4400,.7,`scale(1)`]]),n(`.f4-player`,[[0,0,`translateY(30px) scale(.94)`],[750,1,`translateY(0) scale(1)`],[4400,1,`translateY(0) scale(1)`]]),n(`.f4-ballot`,[[0,0,`translateY(-80px) rotate(-12deg) scale(.7)`],[1450,0,`translateY(-80px) rotate(-12deg) scale(.7)`],[1950,1,`translateY(2px) rotate(0) scale(1.08)`],[2180,1,`translateY(0) rotate(0) scale(1)`],[4400,1,`translateY(0) rotate(0) scale(1)`]]),n(`.f4-three`,[[0,1,`scale(1)`],[2350,1,`scale(1)`],[2850,.22,`scale(.9)`],[4400,.22,`scale(.9)`]]),n(`.c-caption`,[[0,0],[3100,0],[3500,1],[4400,1]])),e===`final3`&&(n(t,[[0,0],[250,1],[4700,1],[5e3,0]]),n(`.f3-arch`,[[0,0,`scale(.9)`],[650,.75,`scale(1)`],[5e3,.75,`scale(1)`]]),n(`.f3-player`,[[0,0,`translateY(24px) scale(.96)`],[750,1,`translateY(0) scale(1)`],[5e3,1,`translateY(0) scale(1)`]]),n(`.f3-crown`,[[0,0,`translateY(-22px) scale(.8)`],[850,0,`translateY(-22px) scale(.8)`],[1250,1,`translateY(0) scale(1)`],[5e3,1,`translateY(0) scale(1)`]]),n(`.f3-decree`,[[0,0,`scale(.8) rotate(8deg)`],[1900,0,`scale(.8) rotate(8deg)`],[2420,1,`scale(1) rotate(0)`],[5e3,1,`scale(1) rotate(0)`]]),n(`.f3-right`,[[0,1,`translateX(0) scale(1)`],[2720,1,`translateX(0) scale(1)`],[3300,0,`translateX(110px) scale(.8)`],[5e3,0,`translateX(110px) scale(.8)`]]),n(`.f3-door`,[[0,0,`translateX(65px) scale(.85)`],[2900,0,`translateX(65px) scale(.85)`],[3450,1,`translateX(0) scale(1)`],[5e3,1,`translateX(0) scale(1)`]]),n(`.c-caption`,[[0,0],[3650,0],[4050,1],[5e3,1]]),n(`.f3-blackout`,[[0,0],[3150,0],[3700,.94],[3900,.55],[5e3,.55]]))}var Y={"crown.webp":{bytes:3866,width:144,height:44,sha256:`093c809ae1701b890f388ccd58a1f92676183cc81cf43a8923ab2d1565b301c5`,mode:`reused-approved-prototype-artwork`},"shield.webp":{bytes:15036,width:240,height:300,sha256:`e757ad580a9b0731aec01810ab06fbf4fc34464cb52213c2a696bb0b96a567d3`,mode:`reused-approved-prototype-artwork`},"throne.webp":{bytes:94524,width:600,height:900,sha256:`8795123c51db09abf84256bea26f57b34e14f3e7d13c9c9f71bf4725d99ae2b6`,mode:`reused-approved-prototype-artwork`},"hub-chamber.webp":{bytes:93882,width:720,height:1080,sha256:`9e6d37a838ef660693fd9bf03f32d534933f674d617aa841f232b921ead41b5e`,mode:`reused-approved-prototype-artwork`},"royal-room.webp":{bytes:93730,width:720,height:1080,sha256:`8658168aae0912595fa85113996ed646479e0f89be0e516684520d99f57cf066`,mode:`reused-approved-prototype-artwork`},"door-leaf.webp":{bytes:5396,width:95,height:480,sha256:`d44eb5d5df49d3cd8f81b223e4123a46a00a669f5599d7f99e417c7028fa1457`,mode:`reused-approved-prototype-artwork`},"sanctuary.webp":{bytes:31070,width:480,height:720,sha256:`6fd02da940f25b3d596376ed664f57ef994a7a10bfcedf60aabb324d9aac9849`,mode:`reused-approved-prototype-artwork`},"danger-chamber.webp":{bytes:18322,width:480,height:720,sha256:`1deb5dc0218ee3d2b7d1d741b229bdb7ccbf7e51efa70d43a86c8a942c797b20`,mode:`reused-approved-prototype-artwork`},"power-console.webp":{bytes:147344,width:640,height:960,sha256:`00af78424c331cb8ea36aa5de82aad628970819956c047fc753ac66a6a91927b`,mode:`reused-approved-prototype-artwork`},"shock-chamber.webp":{bytes:99502,width:720,height:1080,sha256:`3b7fe123c8d35dd8497ddf98bcdb7ebbc1b605a66055346d73930df87363385e`,mode:`reused-approved-prototype-artwork`},"atmosphere.webp":{bytes:25952,width:360,height:540,sha256:`83debd9b9b0cc7de29f129d4cd3b8fd1e67cdf410ff0861c8d315cc89513dd09`,mode:`reused-approved-prototype-artwork`},"decision-token.webp":{bytes:6074,width:192,height:128,sha256:`5a6c713b089b34f1eb9f645051040ec532f260f49cc839f62743eb8078d91221`,mode:`reused-approved-prototype-artwork`},"hub-city.webp":{bytes:213462,width:600,height:1297,sha256:`5ca6210500803030c88e7d4261e1a91186ad87b953c3200fe559302503d41c4b`,mode:`reused-approved-prototype-artwork`},"safety-shield-reveal.webp":{bytes:26190,width:256,height:320,sha256:`7bff8a67066074378de92e03b44b139748e1d81c4b66630e30ac281ee0481fa5`,mode:`reused-approved-prototype-artwork`},"danger-platform.webp":{bytes:15378,width:400,height:220,sha256:`016e5ce194331f650dbb8bf09e49035da2a217eb203bbe1c6017a6c6dfee04d8`,mode:`reused-approved-prototype-artwork`},"exit-doorframe.webp":{bytes:32250,width:480,height:720,sha256:`1397f69abfa2b87bf6e73ea02044489b531d040aa3902d90f0d284a474734740`,mode:`reused-approved-prototype-artwork`},"tiebreak-scales.webp":{bytes:23732,width:384,height:288,sha256:`2de6e9e7c9b3aa7b5f88319bb2246b51ba4b74d34fb146e8c1a77e5fc0b9fcf8`,mode:`reused-approved-prototype-artwork`},"shock-eye-seal.webp":{bytes:24188,width:384,height:288,sha256:`b98bc2be9dc68046e07180b62426b9eaded8ae0639a901cd1d710686e42782bd`,mode:`reused-approved-prototype-artwork`},"curtain.webp":{bytes:28114,width:176,height:592,sha256:`f6edf2c08ec15c15d621c4bfb494c1df61c9d01c0399dde68fcd0c9bebe98074`,mode:`reused-approved-prototype-artwork`},"vox-studio.webp":{width:720,height:1080,bytes:45186}},Ze={src:`assets/ceremonies/vfx/announcement-atmosphere-v1.webp`,width:960,height:320,bytes:85548},Qe={cupidLoh:{label:`Cupid · shared LOH`,duration:3200},cupidPower:{label:`Cupid · all the power`,duration:4400},cupidSafety:{label:`Cupid · shared Safety`,duration:4200},cupidNominations:{label:`Cupid · nominated pairs`,duration:4800},cupidSave:{label:`Cupid · pair saved`,duration:4500},cupidExit:{label:`Cupid · paired departure`,duration:10200},cupidAmbush:{label:`Cupid · pair ambush`,duration:4800},voxImmunity:{label:`Vox · immunity and last place`,duration:7900},voxFinal4:{label:`Vox · Final 4 competition`,duration:4400},voxNominations:{label:`Vox · secret nominations`,duration:4800},voxResults:{label:`Vox · public verdict`,duration:1e4}};function $e(e,t,n,r){let i=e=>({src:`assets/ceremonies/shared/`+e+`.webp`,...n[e+`.webp`]}),a=(e,n)=>({...t[e].poses[n],character:t[e].id,pose:n}),o={};if(e.startsWith(`cupid`)){if([`cupidLoh`,`cupidPower`].includes(e)&&(o.pairWinner=a(`b`,`front`),o.pairRoyal=a(`b`,`royal-standing`),e===`cupidPower`&&(o.pairSeated=a(`b`,`royal-seated`)),e===`cupidPower`&&(o.pairShield=i(`shield`))),e===`cupidSafety`&&(o.pairWinner=a(`b`,`front`),o.pairKnight=a(`b`,`safety-knight`)),e===`cupidSave`&&(o.pairWinner=a(`b`,`front`)),e===`cupidExit`&&(o.pairExit=a(`b`,`exit-back`)),e===`cupidNominations`)for(let[e,n]of Object.entries(t))n.playerId&&(o[`pairFront_`+e]=a(e,`front`));e!==`cupidExit`&&(o.pairHeart=r.shockHeart)}if([`voxResults`,`voxFinal4`,`voxImmunity`].includes(e)){o.voxStudio=i(`vox-studio`),o.voxMist=r.shockMist;for(let[e,n]of Object.entries(t))n.playerId&&(o[`voxActor_`+e]=a(e,`front`));e===`voxFinal4`&&(o.voxToken=i(`decision-token`)),e===`voxImmunity`&&(o.voxShield=i(`shield`))}return o}var X=(e,t,n)=>{let r=e[t].cloneNode();return r.className=n,r.alt=``,r},Z=(e,t,n)=>{let r=e.querySelector(t);r&&(r.textContent=n)};function et(e,t,n,r){let i=e.querySelector(t);i.replaceWith(X(n,r,i.className))}function tt(e,t,n,r,i,a,o){t.dataset.modeScene=e;let s=a.names??[],c=s.join(` & `);if(e===`voxNominations`&&(Z(t,`.nom-warning`,`SECRET HOUSEMATE BALLOTS · COUNTED`),Z(t,`.c-caption span`,`VOX POPULI · NOMINATIONS`),Z(t,`.c-caption strong`,`The Hub has nominated.`),Z(t,`.c-caption em`,`THE PUBLIC WILL VOTE TO ELIMINATE.`)),e.startsWith(`cupid`)){if(t.classList.add(`paired-film`),[`cupidLoh`,`cupidPower`].includes(e)){let i=t.querySelector(`.loh-figure`),a=t.querySelector(`.loh-seated`);i.classList.add(`pair-first`),a&&a.classList.add(`pair-first`);let s=i.cloneNode(!0);if(s.classList.replace(`pair-first`,`pair-second`),et(s,`.loh-before .loh-person`,n,`pairWinner`),et(s,`.loh-royal .loh-person`,n,`pairRoyal`),o(s.querySelector(`.loh-before .loh-crown`),r.pairWinner),o(s.querySelector(`.loh-royal .loh-crown`),r.pairRoyal),t.append(s),a){let e=a.cloneNode(!0);e.classList.replace(`pair-first`,`pair-second`),et(e,`.loh-seated-image`,n,`pairSeated`),o(e.querySelector(`.loh-seated-crown`),r.pairSeated);let i=r.pairSeated.throne;e.querySelector(`.loh-seat-throne`).style.transform=`translate(${i.x*100}%,${i.y*100}%) scale(${i.scale})`,t.append(e)}Z(t,`.loh-kicker`,e===`cupidPower`?`ONE PAIR. ALL THE POWER.`:`CUPID’S ARROW · SHARED LOH`),Z(t,`.loh-name`,c),Z(t,`.loh-title`,`TWO CROWNS. ONE REIGN.`),e===`cupidPower`&&t.append(X(n,`pairShield`,`pair-power-shield`))}if(e===`cupidSafety`){for(let[e,r]of[[`.safety-ordinary`,`pairWinner`],[`.safety-knight`,`pairKnight`]]){t.querySelector(e).classList.add(`pair-first`);let i=X(n,r,t.querySelector(e).className.replace(`pair-first`,`pair-second`));t.append(i)}Z(t,`.c-caption span`,`CUPID’S ARROW · SHARED SAFETY`),Z(t,`.c-caption strong`,c),Z(t,`.c-caption em`,`ONE PAIR. ONE POWER OF SAFETY.`)}if(e===`cupidSave`){let e=t.querySelector(`.save-person`);e.classList.add(`pair-first`),t.append(X(n,`pairWinner`,e.className.replace(`pair-first`,`pair-second`))),Z(t,`.save-danger-caption strong`,`One pair on the block.`),Z(t,`.save-safe-caption strong`,c),Z(t,`.save-safe-caption em`,`BOTH SAVED. BOTH OFF THE BLOCK.`)}if(e===`cupidNominations`){let e=Object.keys(n).filter(e=>e.startsWith(`pairFront_`)),r=Array.from({length:e.length/2},(t,n)=>e.slice(n*2,n*2+2));if(r.length===3&&!t.querySelector(`.nom-third`)){let e=t.querySelector(`.nom-second`).cloneNode(!0);e.classList.replace(`nom-second`,`nom-third`),t.append(e),t.classList.add(`nom-three`)}for(let[e,i]of r.entries()){let r=t.querySelector([`.nom-first`,`.nom-second`,`.nom-third`][e]);et(r,`.nom-person`,n,i[0]),r.querySelector(`.nom-person`).classList.add(`pair-first`),r.append(X(n,i[1],`nom-person pair-second`)),Z(r,`.nom-label`,s.slice(e*2,e*2+2).join(` & `))}Z(t,`.nom-warning`,`CUPID’S ARROW · NOMINATED PAIRS`),Z(t,`.c-caption strong`,`Linked by love. Facing danger.`),Z(t,`.c-caption em`,`THE PAIRS FACE ELIMINATION TOGETHER.`)}if(e===`cupidExit`){for(let e of t.querySelectorAll(`.cine-departure`))e.querySelector(`.cine-rear`).classList.add(`pair-first`),e.append(X(n,`pairExit`,`cine-rear pair-second`));Z(t,`.exit-caption span`,c),Z(t,`.exit-caption h3`,`Bound together. Leaving together.`);return}t.append(X(n,`pairHeart`,`pair-link-heart`))}}function nt(e,t,n,r){let i=e===`voxResults`,a=e===`voxImmunity`,o=document.createElement(`div`);o.className=`c-scene vox-broadcast`,o.dataset.modeScene=e,o.setAttribute(`aria-hidden`,`true`),o.innerHTML=`<div class="vox-camera"><div class="vox-set"></div><div class="vox-haze"></div><div class="vox-light"></div><div class="vox-room-dim"></div><div class="vox-danger-tint"></div><div class="vox-contestants"></div></div><div class="vox-cut"></div><div class="vox-reveal-sweep"></div>`+(i?``:a?`<div class="vox-heading"><span>VOX POPULI · IMMUNITY CHALLENGE</span><h2>Two places. Two fates.</h2><p>FIRST PLACE IS SAFE · LAST PLACE IS NOMINATED</p></div>`:`<div class="vox-heading"><span>VOX POPULI · FINAL FOUR</span><h2>Competition won.</h2><p>NO IMMUNITY IS AWARDED.</p></div><div class="vox-verdict"><span>THE FINAL FOUR CONTINUE</span><h3></h3><p>The audience still decides who leaves.</p></div>`),o.querySelector(`.vox-set`).append(X(t,`voxStudio`,`vox-backdrop`)),o.querySelector(`.vox-haze`).append(X(t,`voxMist`,`vox-smoke`));let s=i?r.tallies:a?[{id:n.a.playerId,name:n.a.name,role:`IMMUNITY WINNER`},{id:n.b.playerId,name:n.b.name,role:`LAST PLACE · NOMINATED`}]:[{id:n.a.playerId,name:n.a.name}],c=o.querySelector(`.vox-contestants`);c.style.setProperty(`--contestants`,s.length);for(let[e,n]of s.entries()){let o=document.createElement(`div`);o.className=`vox-contestant`,o.dataset.playerId=n.id;let s=X(t,`voxActor_`+String.fromCharCode(97+e),`vox-person`),l=document.createElement(`div`);l.className=`vox-identity`;let u=document.createElement(`strong`);u.textContent=n.name;let d=document.createElement(`span`);if(d.className=i?`vox-count vox-percent`:`vox-count`,d.textContent=i?`0.0%`:`COMPETITION WINNER`,i&&(d.dataset.finalValue=String(Number(n.value))),a){o.classList.add(e===0?`vox-immunity-winner`:`vox-last-place-nominee`);let r=document.createElement(`div`);r.className=`vox-immunity-spot`;let i=document.createElement(`div`);i.className=`vox-immunity-floor`,o.append(r,i),d.className=`vox-count vox-role-label`,d.textContent=n.role,e===0&&o.append(X(t,`voxShield`,`vox-immunity-emblem`))}if(l.append(u),i){let e=document.createElement(`div`);e.className=`vox-percent-shell`,e.innerHTML=`<i class="vox-percent-tone"></i><i class="vox-score-sheen"></i><i class="vox-number-bloom"></i>`,e.append(d),l.append(e);let t=document.createElement(`div`);t.className=`vox-floor-pool`;let n=document.createElement(`div`);n.className=`vox-focus-light`,o.append(t,n)}else l.append(d);o.append(s,l),i&&r.kind!==`tie`&&o.classList.add(r.ids.includes(n.id)?`vox-departing`:`vox-safe`),c.append(o)}if(i&&[`public-tie`,`tie`].includes(r.kind)){let e=document.createElement(`div`);e.className=`vox-tie-note`,e.textContent=r.kind===`public-tie`?`TIED VOTE · APPROVAL TIEBREAK · `+r.approval.map(e=>`${e.name}: ${Number(e.value).toFixed(1)}`).join(` · `):`THE VOTE IS TIED · TIEBREAK FOLLOWS`,o.append(e)}return!i&&!a&&(Z(o,`.vox-verdict h3`,n.a.name),o.querySelector(`.vox-camera`).append(X(t,`voxToken`,`vox-token`))),o}function rt(e,t,n,r,i){let a=e===`voxResults`,o=e===`voxImmunity`,s=[...t.querySelectorAll(`.vox-contestant`)],c=s.filter(e=>e.classList.contains(`vox-departing`)),l=t.querySelector(`.vox-contestants`),u=s.filter(e=>!e.classList.contains(`vox-safe`)).length,d=`cubic-bezier(.22,.72,.22,1)`,f=`cubic-bezier(.16,1,.3,1)`;n(t,[[0,0],[180,1],[r-250,1],[r,0]]),n(`.vox-camera`,a?[[0,1,`scale(1.1) translateY(1%)`,f],[1500,1,`scale(1) translateY(0)`],[5e3,1,`scale(1.015) translateY(0)`,d],[6100,1,`scale(1.055) translateY(-.5%)`,f],[6700,1,`scale(1.025) translateY(0)`,d],[r,1,`scale(1.075) translateY(-.8%)`]]:o?[[0,1,`scale(1.12) translateY(1%)`],[1400,1,`scale(1.06) translateX(0)`],[2300,1,`scale(1.14) translateX(4%)`,f],[3900,1,`scale(1.14) translateX(4%)`],[4520,1,`scale(1.14) translateX(-4%)`,f],[5850,1,`scale(1.14) translateX(-4%)`],[6900,1,`scale(1.035) translateX(0)`,d],[r,1,`scale(1.035) translateX(0)`]]:[[0,1,`scale(1.12) translateY(1%)`],[1400,1,`scale(1.03) translateY(0)`],[r,1,`scale(1.065) translateY(-1%)`]]),n(`.vox-haze`,[[0,.22,`translateX(-8%) scale(1.1)`],[r,.28,`translateX(7%) scale(1.15)`]]);for(let[e,t]of s.entries()){let i=t.classList.contains(`vox-safe`),p=c.indexOf(t),m=`translateX(${p>=0?l.clientWidth*((p+.5)/Math.max(1,u))-(t.offsetLeft+t.offsetWidth/2):0}px) scale(1.035)`;n(t,[[0,0,`translateY(22px)`,f],[o?1450+e*2900:350+e*150,0,`translateY(22px)`,f],[o?2150+e*2900:1100+e*150,1,`translateY(0)`],...a&&i?[[6400,1,`translateX(0)`,d],[7150,0,`translateX(${e<s.length/2?-32:32}px) scale(.97)`],[r,0]]:a&&p>=0?[[6800,1,`translateX(0) scale(1)`,d],[8e3,1,m],[r,1,m]]:[[r,1]]]);let h=t.querySelector(`.vox-count`);a?(n(t.querySelector(`.vox-percent-shell`),[[0,0,`translateY(16px) scaleX(.82)`],[1400,0,`translateY(16px) scaleX(.82)`,f],[2050,1,`translateY(0) scaleX(1)`],[r,1]]),n(t.querySelector(`.vox-score-sheen`),[[0,0,`translateX(-170%) skewX(-18deg)`],[4250,0,`translateX(-170%) skewX(-18deg)`],[4470,.8,`translateX(-20%) skewX(-18deg)`,f],[4950,0,`translateX(210%) skewX(-18deg)`],[r,0]]),n(t.querySelector(`.vox-number-bloom`),[[0,0],[4380,0],[4550,.28],[5100,0],[r,0]]),n(t.querySelector(`.vox-floor-pool`),[[0,0],[1200,.35],[5200,.35],[5900,.12],[r,.12]]),p>=0&&(n(t.querySelector(`.vox-focus-light`),[[0,0],[6200,0],[6750,.8],[r,.65]]),n(t.querySelector(`.vox-percent-tone`),[[0,0],[6400,0],[7350,.72],[r,.72]]))):o?(n(h,[[0,0,`translateY(12px)`],[2250+e*2850,0,`translateY(12px)`,f],[2750+e*2850,1,`translateY(0)`],[r,1]]),n(t.querySelector(`.vox-immunity-spot`),[[0,0,`scale(.75)`],[1200+e*2900,0,`scale(.75)`],[1900+e*2900,.88,`scale(1)`],[r,e===0?.48:.72,`scale(1.04)`]]),n(t.querySelector(`.vox-immunity-floor`),[[0,0,`scaleX(.55)`],[1450+e*2900,0,`scaleX(.55)`],[2150+e*2900,1,`scaleX(1)`],[r,.7,`scaleX(1)`]])):n(h,[[0,0],[1100,0],[1600,1],[r,1]])}if(a){let e=s.map(e=>e.querySelector(`.vox-count`)),a=t=>{let n=t/50,r=n*n*(3-2*n);for(let t of e)t.textContent=`${(Number(t.dataset.finalValue)*r).toFixed(1)}%`;t<50&&i(()=>a(t+1),40)};i(()=>a(0),2400),c.length&&(n(`.vox-room-dim`,[[0,0],[5100,0],[5900,.74],[6450,.74],[7600,.38],[r,.38]]),n(`.vox-danger-tint`,[[0,0],[6500,0],[7800,.65],[r,.65]]),n(`.vox-reveal-sweep`,[[0,0,`translateX(-115%)`],[6150,0,`translateX(-115%)`],[6450,.7,`translateX(-35%)`,f],[7100,0,`translateX(100%)`],[r,0]])),t.querySelector(`.vox-tie-note`)&&n(`.vox-tie-note`,[[0,0],[5900,0],[6500,1],[r,1]])}else n(`.vox-heading`,o?[[0,0,`translateY(-12px) scale(.985)`],[450,1,`translateY(0) scale(1)`],[1450,1,`translateY(0) scale(1)`],[2100,0,`translateY(-14px) scale(.985)`],[r,0]]:[[0,0,`translateY(-12px) scale(.985)`],[450,1,`translateY(0) scale(1)`],[r,1]]),o?n(`.vox-immunity-emblem`,[[0,0,`translateY(12px) scale(.72)`],[2200,0,`translateY(12px) scale(.72)`,f],[2750,1,`translateY(0) scale(1)`],[r,1,`translateY(-2px) scale(1.03)`]]):n(`.vox-verdict`,[[0,0,`translateY(18px)`],[1900,0,`translateY(18px)`],[2450,1,`translateY(0)`],[r,1]]);o&&(n(`.vox-room-dim`,[[0,0],[3400,0],[4250,.52],[5400,.38],[r,.3]]),n(`.vox-danger-tint`,[[0,0],[4500,0],[5550,.58],[r,.46]]),n(`.vox-reveal-sweep`,[[0,0,`translateX(-110%)`],[1570,0,`translateX(-110%)`],[1820,.65,`translateX(-30%)`,f],[2200,0,`translateX(100%)`],[4300,0,`translateX(-110%)`],[4730,.8,`translateX(-20%)`,f],[5300,0,`translateX(100%)`],[r,0,`translateX(100%)`]])),n(`.vox-cut`,[[0,0],[a?6150:o?3990:1700,0],[a?6420:o?4250:1900,a?.22:.45],[a?6900:o?4580:2200,0],[r,0]])}function it(e,t,n,i){t.querySelector(`.pair-link-heart`)&&n(`.pair-link-heart`,[[0,0,`scale(.85)`],[1100,0,`scale(.85)`],[1900,.7,`scale(1)`],[i,.55,`scale(1.04)`]]),e===`cupidPower`&&n(`.pair-power-shield`,[[0,0],[2400,0],[2900,1],[i,1]]),r(e)===`nominations`&&t.querySelector(`.nom-third`)&&!t.classList.contains(`nom-calibrated`)&&(n(`.nom-third`,[[0,0,`translateY(18px)`],[2700,0,`translateY(18px)`],[3280,1,`translateY(0)`],[i,1]]),n(`.nom-third .nom-aura`,[[0,0],[2950,0],[3370,.8],[i,.5]]))}var at=`/* Reusable actors stay independent from the sets. Only transform and opacity animate. */

.paired-film .pair-link-heart {
  position: absolute;
  width: 9%;
  height: 6%;
  object-fit: contain;
  left: 45.5%;
  top: 20%;
  z-index: 4;
  opacity: 0;
}
.paired-film.fitted-loh .loh-figure,
.paired-film.fitted-loh .loh-seated {
  width: 49%;
  bottom: 22%;
  z-index: 2;
  margin: 0;
}
.paired-film.fitted-loh .pair-first {
  left: 2%;
}
.paired-film.fitted-loh .pair-second {
  left: 49%;
}
.paired-film .loh-name {
  font-size: clamp(20px, 5.3vw, 38px);
  line-height: 1.08;
}
.paired-film .loh-titles {
  bottom: 8%;
}
.paired-film .pair-power-shield {
  position: absolute;
  width: 17%;
  height: 20%;
  object-fit: contain;
  left: 41.5%;
  top: 48%;
  z-index: 4;
}
.paired-film.c-safety .c-hero,
.paired-film.c-save .c-hero {
  width: 49%;
  height: 54%;
  bottom: 25%;
  object-fit: contain;
}
.paired-film.c-safety .pair-first,
.paired-film.c-save .pair-first {
  left: 3%;
}
.paired-film.c-safety .pair-second,
.paired-film.c-save .pair-second {
  left: 48%;
}
.paired-film .fitted-knight-shield {
  left: 44%;
  top: 43%;
  width: 12%;
  height: 15%;
}
.paired-film .safety-flying-shield {
  left: 43%;
  width: 14%;
}
.paired-film .save-shield {
  left: 39%;
  width: 22%;
}
.paired-film .save-platform {
  left: 6%;
  width: 88%;
}
.paired-film .c-caption strong {
  font-size: clamp(21px, 5.7vw, 42px);
  line-height: 1.08;
}
.paired-film .nom-pod {
  width: 48%;
}
.paired-film .nom-person {
  width: 72%;
  height: 86%;
  bottom: 25%;
}
.paired-film .nom-person.pair-first {
  left: -9%;
}
.paired-film .nom-person.pair-second {
  left: 37%;
}
.paired-film .nom-platform {
  width: 110%;
  left: -5%;
}
.paired-film .nom-label {
  font-size: clamp(8px, 2.1vw, 14px);
  letter-spacing: 0.03em;
  text-align: center;
  white-space: normal;
}
.paired-film.decision-film .cine-departure {
  width: 68%;
  left: 16%;
  aspect-ratio: 1.39;
}
.paired-film.decision-film .cine-rear {
  position: absolute;
  width: 48%;
  height: 100%;
  bottom: 0;
  object-fit: contain;
}
.paired-film.decision-film .cine-rear.pair-first {
  left: 11%;
}
.paired-film.decision-film .cine-rear.pair-second {
  left: 41%;
}
.paired-film.decision-film .departure-near {
  z-index: 7;
}
.paired-film .exit-caption h3 {
  font-size: clamp(20px, 5vw, 36px);
}
.vox-broadcast {
  color: #f5efdf;
  font-family: Georgia, serif;
  overflow: hidden;
  background: #09060f;
}
.vox-camera,
.vox-set,
.vox-light,
.vox-cut {
  position: absolute;
  inset: 0;
}
.vox-camera {
  transform-origin: 50% 55%;
}
.vox-backdrop {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.vox-haze {
  position: absolute;
  left: -15%;
  width: 130%;
  height: 35%;
  bottom: 15%;
  opacity: 0.25;
  pointer-events: none;
}
.vox-smoke {
  width: 100%;
  height: 100%;
  object-fit: fill;
}
.vox-light {
  background: linear-gradient(#05020c88, transparent 34%, #05020c66 70%, #05020c);
}
.vox-danger-tint {
  position: absolute;
  inset: 0;
  z-index: 1;
  opacity: 0;
  pointer-events: none;
  background: radial-gradient(ellipse at 50% 48%, #a51d2b24, #3a0712a8 78%);
}
.vox-heading {
  position: absolute;
  top: 7%;
  left: 7%;
  right: 7%;
  text-align: center;
}
.vox-heading span,
.vox-verdict span {
  font:
    9px/1.5 system-ui,
    sans-serif;
  letter-spacing: 0.2em;
  color: #dcc585;
}
.vox-heading h2 {
  font-size: clamp(25px, 6vw, 44px);
  font-weight: 400;
  margin: 10px 0;
}
.vox-heading p,
.vox-verdict p {
  font:
    10px/1.7 system-ui,
    sans-serif;
  color: #d1c4dc;
  letter-spacing: 0.06em;
}
.vox-contestants {
  position: absolute;
  left: 4%;
  right: 4%;
  bottom: 27%;
  z-index: 2;
  height: 51%;
  display: grid;
  grid-template-columns: repeat(var(--contestants), minmax(0, 1fr));
  align-items: end;
}
.vox-contestant {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  text-align: center;
  min-width: 0;
}
.vox-person {
  position: absolute;
  bottom: 17%;
  height: 85%;
  width: 155%;
  max-width: none;
  object-fit: contain;
  object-position: 50% 100%;
}
.vox-contestant strong {
  font-size: clamp(15px, 3.7vw, 27px);
  font-weight: 400;
  line-height: 1.1;
  z-index: 1;
  overflow-wrap: anywhere;
}
.vox-count {
  font:
    600 clamp(19px, 5vw, 35px)/1.8 system-ui,
    sans-serif;
  color: #e4cc91;
  z-index: 1;
}
.vox-verdict {
  position: absolute;
  left: 8%;
  right: 8%;
  bottom: 7%;
  text-align: center;
}
.vox-identity {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: 100%;
  position: relative;
}
.vox-broadcast[data-mode-scene='voxResults'] .vox-contestants {
  bottom: 12%;
  height: 75%;
}
.vox-broadcast[data-mode-scene='voxResults'] .vox-person {
  bottom: 16%;
  height: 84%;
}
.vox-broadcast[data-mode-scene='voxResults'] .vox-identity {
  position: absolute;
  bottom: 0;
}
.vox-broadcast[data-mode-scene='voxResults'] .vox-identity strong {
  max-width: 94%;
  font-size: clamp(18px, 4.5vw, 29px);
  text-shadow: 0 2px 10px #000c;
}
.vox-percent-shell {
  position: relative;
  width: min(86%, 160px);
  min-width: 72px;
  padding: 1px;
  overflow: hidden;
  isolation: isolate;
  clip-path: polygon(9px 0, 100% 0, 100% calc(100% - 9px), calc(100% - 9px) 100%, 0 100%, 0 9px);
  background: linear-gradient(125deg, #efd69fa8, #89709640 30%, #5c3d7040 64%, #ddbc8190);
}
.vox-percent-shell::before {
  content: '';
  position: absolute;
  inset: 1px;
  z-index: 0;
  clip-path: inherit;
  background: linear-gradient(115deg, #100b1a, #35243c 48%, #170d20);
}
.vox-percent {
  display: block;
  position: relative;
  z-index: 2;
  box-sizing: border-box;
  width: 100%;
  padding: 12px 7px 13px;
  color: #f4e0b2;
  font:
    500 clamp(23px, 5.8vw, 37px)/1.05 system-ui,
    sans-serif;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.035em;
  text-align: center;
  text-shadow: 0 1px 7px #cfac6638;
}
.vox-percent-tone,
.vox-number-bloom {
  position: absolute;
  inset: 1px;
  z-index: 1;
  opacity: 0;
  pointer-events: none;
}
.vox-percent-tone {
  background: linear-gradient(120deg, #592a3baa, #6f1826bd, #341a32b0);
}
.vox-number-bloom {
  background: radial-gradient(ellipse at 50% 60%, #eed6a2bb, #ba8c7144 55%, transparent 80%);
}
.vox-score-sheen {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 10%;
  width: 55%;
  z-index: 1;
  opacity: 0;
  background: linear-gradient(
    90deg,
    transparent,
    #f5dfb70d 25%,
    #f6e5bb60 50%,
    #bc92cc15 70%,
    transparent
  );
}
.vox-floor-pool {
  position: absolute;
  left: 0;
  bottom: 15%;
  width: 100%;
  height: 4%;
  opacity: 0;
  background: radial-gradient(ellipse, #e1bd773d, #946ca225 42%, transparent 72%);
}
.vox-focus-light {
  position: absolute;
  left: -12%;
  bottom: 16%;
  width: 124%;
  height: 83%;
  opacity: 0;
  background: radial-gradient(ellipse at 50% 65%, #e5bd6824, #b78bc115 40%, transparent 70%);
}
.vox-room-dim {
  position: absolute;
  inset: 0;
  z-index: 1;
  opacity: 0;
  background: linear-gradient(#030107a6, #07040aa6 65%, #050209);
}
.vox-reveal-sweep {
  position: absolute;
  inset: -10% -30%;
  z-index: 4;
  pointer-events: none;
  opacity: 0;
  background: linear-gradient(
    110deg,
    transparent 30%,
    #8f6ab20a 40%,
    #d8b68538 49%,
    #dec59958 50%,
    #ae80ba12 56%,
    transparent 68%
  );
}
.vox-broadcast[data-mode-scene='voxResults'] .vox-danger-tint {
  background: linear-gradient(#61142626, #7212225c);
}
.vox-tie-note {
  position: absolute;
  left: 8%;
  right: 8%;
  bottom: 4%;
  color: #ddc795;
  font:
    600 9px/1.5 system-ui,
    sans-serif;
  letter-spacing: 0.12em;
  text-align: center;
}
.vox-verdict h3 {
  font-size: clamp(28px, 7vw, 49px);
  font-weight: 400;
  margin: 9px 0;
  line-height: 1.08;
}
.vox-cut {
  background: radial-gradient(ellipse at 50% 55%, #a380ba88, #d2b27822 35%, transparent 70%);
  pointer-events: none;
}
.vox-token {
  position: absolute;
  width: 13%;
  height: 14%;
  object-fit: contain;
  bottom: 22%;
  left: 43.5%;
}
.vox-broadcast[data-mode-scene='voxFinal4'] .vox-person {
  width: 100%;
}
.vox-broadcast[data-mode-scene='voxFinal4'] .vox-count {
  display: none;
}
.vox-broadcast[data-mode-scene='voxFinal4'] .vox-contestant strong {
  display: none;
}
.vox-broadcast[data-mode-scene='voxImmunity'] .vox-heading {
  top: 8%;
}
.vox-broadcast[data-mode-scene='voxImmunity'] .vox-heading h2 {
  margin: 8px 0 5px;
  font-size: clamp(27px, 7vw, 46px);
}
.vox-broadcast[data-mode-scene='voxImmunity'] .vox-heading p {
  color: #e5cf9a;
  font-size: clamp(8px, 2vw, 10px);
  font-weight: 700;
  letter-spacing: 0.14em;
}
.vox-broadcast[data-mode-scene='voxImmunity'] .vox-contestants {
  bottom: 13%;
  height: 68%;
}
.vox-immunity-spot {
  position: absolute;
  inset: -18% -30% 11%;
  opacity: 0;
  background: linear-gradient(180deg, #efd69a63, #bda36527 48%, transparent 88%);
  clip-path: polygon(47% 0, 53% 0, 92% 100%, 8% 100%);
  filter: blur(8px);
  pointer-events: none;
}
.vox-last-place-nominee .vox-immunity-spot {
  background: linear-gradient(180deg, #d78c9370, #81395037 50%, transparent 88%);
}
.vox-immunity-floor {
  position: absolute;
  right: 5%;
  bottom: 10%;
  left: 5%;
  height: 10%;
  border-bottom: 1px solid #dfc890a8;
  border-radius: 50%;
  background: radial-gradient(ellipse at 50% 100%, #c6a76a52, transparent 65%);
  box-shadow: 0 6px 22px #c99c6d20;
  opacity: 0;
}
.vox-last-place-nominee .vox-immunity-floor {
  border-bottom-color: #d77882b0;
  background: radial-gradient(ellipse at 50% 100%, #9b3b4e77, transparent 65%);
  box-shadow: 0 6px 22px #b6415b38;
}
.vox-broadcast[data-mode-scene='voxImmunity'] .vox-person {
  z-index: 2;
  bottom: 12%;
  height: 88%;
}
.vox-broadcast[data-mode-scene='voxImmunity'] .vox-identity {
  position: absolute;
  bottom: 0;
  z-index: 3;
  gap: 6px;
}
.vox-broadcast[data-mode-scene='voxImmunity'] .vox-identity strong {
  max-width: 92%;
  font-size: clamp(17px, 4.5vw, 28px);
  text-shadow: 0 2px 12px #000e;
}
.vox-role-label {
  box-sizing: border-box;
  max-width: 96%;
  padding: 6px 9px;
  border: 1px solid rgba(229, 205, 157, 0.55);
  border-radius: 2px;
  color: #f2dfb7;
  background: linear-gradient(110deg, rgba(21, 16, 28, 0.94), rgba(74, 54, 53, 0.8));
  box-shadow:
    0 5px 18px #06030a99,
    inset 0 1px #f1d9a42c;
  font:
    700 clamp(7px, 1.8vw, 9px)/1.2 system-ui,
    sans-serif;
  letter-spacing: 0.12em;
  white-space: nowrap;
}
.vox-last-place-nominee .vox-role-label {
  border-color: rgba(210, 103, 107, 0.58);
  color: #f3c6c3;
  background: linear-gradient(110deg, rgba(57, 18, 29, 0.94), rgba(58, 24, 39, 0.84));
  box-shadow:
    0 5px 18px #06030a99,
    inset 0 1px #f4b4b429;
}
.vox-immunity-emblem {
  position: absolute;
  top: 19%;
  right: 5%;
  z-index: 3;
  width: clamp(35px, 9vw, 52px);
  height: clamp(35px, 9vw, 52px);
  object-fit: contain;
  filter: drop-shadow(0 3px 14px rgba(230, 194, 117, 0.55));
}
`,ot={replacement:{label:`Replacement nomination`,duration:4500},loh:{label:`LOH crowning`,duration:3200},...K,...Qe,nominations:{...K.nominations,duration:7600},allPower:{...K.allPower,duration:5600},cupidPower:{...Qe.cupidPower,duration:5600}},st=Object.keys(ot),ct={shield:`safety-shield-reveal`,platform:`danger-platform`,curtain:`curtain`,crown:`crown`,throne:`throne`,cinema_hall:`hub-chamber`,cinema_portal:`door-leaf`,cinema_crown:`crown`,cinema_throne:`throne`,cinema_atmosphere:`atmosphere`,cinema_royalRoom:`royal-room`,cinema_city:`hub-city`,cinema_shield:`shield`,cinema_sanctuary:`sanctuary`,cinema_danger:`danger-chamber`,cinema_shockRoom:`shock-chamber`,cinema_console:`power-console`,cinema_token:`decision-token`},lt,Q=e=>(e*100).toFixed(4)+`%`;function ut(e,t,n=`doubleEviction`,i={}){if(e===`allPower`||e===`cupidPower`)return A(t,Y,e===`cupidPower`);if(e===`nominations`&&i.coLohAssignments?.length>1)return x(m(t),{replacementOutcome:se(t,i)},Y);if(e===`replacement`)return x(t,i,Y);let a=e,o=$e(a,t,Y,h);if(e=r(e),!e)return o;a===`cupidNominations`&&(t={a:t.a,b:t.c,c:t.e??t.a});let s=(e,n)=>({...t[e].poses[n],character:t[e].id,pose:n}),l={male:s(`a`,`front`),female:s(e===`save`?`a`:`b`,`front`),knight:s(`a`,`safety-knight`),cinema_standA:s(`a`,`front`),cinema_standB:s(`b`,`front`),cinema_standC:s(`c`,`front`),cinema_decisionA:s(`a`,`decision-back`),cinema_decisionB:s(`b`,`decision-back`),cinema_exitC:s(`c`,`exit-back`),cinema_seatedA:s(`a`,`royal-seated`),winner:s(`a`,`front`),royal:s(`a`,`royal-standing`),seated:s(`a`,`royal-seated`)},u=e===`loh`?[`winner`,`royal`,`crown`,`curtain`,`cinema_royalRoom`,...a===`cupidPower`?[`seated`,`throne`]:[]]:ot[e].art.filter(e=>![`cinema_avatarC`,`cinema_eliminatedStamp`].includes(e));e===`nominations`&&a===`nominations`&&t.d&&!(i.coLohAssignments?.length>1)&&(u.push(`nomination_seated`,`throne`,`crown`,`cinema_royalRoom`),l.nomination_seated=s(`d`,`royal-seated`)),e===`shock`&&u.push(`shockAtmosphere`,`shockMist`,...fe(n)),e===`nominations`&&new Set([t.a,t.b,t.c].map(e=>e.playerId??e.id)).size===3&&u.push(`cinema_standC`);let f=u.filter(t=>!(W[e]&&t===(e===`final4`?`cinema_decisionA`:`cinema_decisionB`)));return{...Object.fromEntries(f.map(e=>{if(h[e])return[e,h[e]];if(e===`shockAtmosphere`)return[e,Ze];if(l[e])return[e,l[e]];let t=ct[e]+`.webp`,n=Y[t];if(!n)throw Error(`No reusable resource for `+e);return[e,{src:`assets/ceremonies/shared/`+t,...n}]})),...o,...i.authorityIntro?d(m(t),i.authorityIntro,Y):{},...i.closingBrand===!0&&[`exit`,`final3`].includes(a)?{cinema_closingEye:c}:{}}}function $(e,t){let{x:n,baseY:r,width:i,angle:a}=t.crown;e.style.cssText=`position:absolute;left:${Q(n-i/2)};top:${Q(r-i*t.width/t.height*44/144*.88)};width:${Q(i)};height:auto;opacity:1;transform:rotate(${a}deg);transform-origin:50% 88%;z-index:6`,e.dataset.fittedCrown=t.pose}function dt(e,t,n,r,i){e.dataset.rehearsal=t;let a=(e,t)=>{let n=r[e?.dataset.resourceKey];n&&t&&$(t,n)};if(t===`allPower`){a(e.querySelector(`.power-standing .cine-body`),e.querySelector(`.power-standing .cine-crown`)),a(e.querySelector(`.cine-seated`),e.querySelector(`.cine-royal-crown`));let t=r.cinema_seatedA,n=e.querySelector(`.cine-throne`);n.style.transform=`translate(${Q(t.throne.x)},${Q(t.throne.y)}) scale(${t.throne.scale})`}if(W[t]&&t!==`exit`&&a(e.querySelector(`.decision-holder .decision-body`),e.querySelector(`.decision-insignia`)),t===`safety`){let t=n.shield.cloneNode();t.className=`fitted-knight-shield`,e.append(t)}let o=document.createTreeWalker(e,NodeFilter.SHOW_TEXT);for(;o.nextNode();)o.currentNode.textContent=o.currentNode.textContent.replace(/Player ([ABC])/gi,(e,t)=>{let n=i[t.toLowerCase()].name;return e===e.toUpperCase()?n.toUpperCase():n})}function ft(e){let t=document.createElement(`div`);t.className=`loh-scene fitted-loh`,t.innerHTML=`<div class="loh-backdrop"></div><div class="loh-halo"></div><div class="loh-floor"></div><div class="loh-room-pieces"></div><div class="loh-figure"><div class="loh-before loh-pose"></div><div class="loh-royal loh-pose"></div></div><div class="loh-flash"></div><div class="loh-titles"><div class="loh-kicker">ALL HAIL YOUR NEW</div><div class="loh-name">Leader of the Hub</div><div class="loh-title">THE CROWN IS YOURS.</div></div>`;let n=(t,n)=>{let r=e[t].cloneNode();return r.className=n,r};t.querySelector(`.loh-backdrop`).append(n(`cinema_royalRoom`,`loh-backdrop-image`));for(let[e,r]of[[`winner`,`.loh-before`],[`royal`,`.loh-royal`]])t.querySelector(r).append(n(e,`loh-person`),n(`crown`,`loh-crown`));if(e.seated){let e=document.createElement(`div`);e.className=`loh-seated`,e.append(n(`throne`,`loh-seat-throne`),n(`seated`,`loh-seated-image`),n(`crown`,`loh-seated-crown`)),t.append(e);let r=document.createElement(`div`);r.className=`loh-seat-flash`,t.append(r)}let r=t.querySelector(`.loh-room-pieces`);for(let e of[`left`,`right`]){let t=document.createElement(`div`);t.className=`loh-curtain loh-curtain-`+e,t.append(n(`curtain`,`loh-prop-image`)),r.append(t)}return t}function pt(e,t,n,r){let i=document.createElement(`div`);i.className=`nom-decision`,i.innerHTML=`<div class="nom-decision-room"></div><div class="nom-decision-shadow"></div><div class="nom-decision-figure"></div><div class="nom-decision-caption"><span>THE LEADER OF THE HUB</span><strong></strong><em>DECISION IN PROGRESS</em><i class="nom-decision-progress"></i></div>`;let a=(e,n)=>{let r=t[e].cloneNode();return r.className=n,r};i.querySelector(`.nom-decision-room`).append(a(`cinema_royalRoom`,`nom-decision-backdrop`));let o=i.querySelector(`.nom-decision-figure`);o.append(a(`throne`,`nom-decision-throne`),a(`nomination_seated`,`nom-decision-person`),a(`crown`,`nom-decision-crown`));let s=n.nomination_seated.throne;o.querySelector(`.nom-decision-throne`).style.transform=`translate(${Q(s.x)},${Q(s.y)}) scale(${s.scale})`,$(o.querySelector(`.nom-decision-crown`),n.nomination_seated),i.querySelector(`.nom-decision-caption strong`).textContent=r.d.name,e.append(i),e.classList.add(`nom-royal`)}function mt(e,t,n){if(n?.length!==2)return!1;let r=e=>Object.values(t).find(t=>t?.playerId===e),i=document.createElement(`div`);i.className=`nom-coloh-intro`;let a=document.createElement(`div`);a.className=`nom-coloh-header`,a.textContent=`TWO LEADERS · TWO CHOICES`,i.append(a);for(let[a,o]of n.slice(0,2).entries()){let n=r(o.coLohId),s=r(o.nomineeId),c=document.createElement(`div`);c.className=`nom-coloh-beat`,c.dataset.beat=String(a);let l=document.createElement(`span`);l.textContent=`${n?.name??`Co-Leader`} NOMINATES`;let u=document.createElement(`strong`);u.textContent=s?.name??`Nominee`;let d=document.createElement(`em`);d.textContent=`SELECTED FOR THE BLOCK`,c.append(l,u,d),i.append(c);let f=[`a`,`b`].findIndex(e=>t[e]?.playerId===o.nomineeId);e.querySelector(f===0?`.nom-first`:`.nom-second`).dataset.choiceOrder=String(a)}return e.append(i),e.classList.add(`nom-coloh-active`),e.querySelector(`.c-caption strong`).textContent=`The block is set.`,!0}function ht(e,t){e.classList.add(`nom-calibrated`);for(let[n,r]of[...e.querySelectorAll(`.nom-pod`)].entries()){let i=t[[`a`,`b`,`c`][n]].poses.front,a=e.classList.contains(`nom-three`)?31:44;r.style.setProperty(`--platform-surface-offset`,`${64/400*a}cqw`),r.querySelector(`.nom-person`).style.setProperty(`--feet-y`,`${i.feetY*100}%`),e.classList.contains(`nom-coloh-active`)&&(r.querySelector(`.nom-label`).textContent=t[[`a`,`b`,`c`][n]].name);let o=document.createElement(`i`);o.className=`nom-contact`,r.append(o)}}function gt(e,t,n){let r=e.classList.contains(`nom-solo`),i=!!e.querySelector(`.nom-third`),a=!!e.querySelector(`.nom-decision`),o=!!e.querySelector(`.nom-coloh-intro`),s=r?1:i?3:2,c=r?.75:o?.45:a?2.7:.4,l=r?1.1:o?1.35:a?3.05:1.05,u=n-1620;t(e,[[0,0],[180,1],[n,1]]),t(`.ceremony-backdrop`,[[0,.42,`translateY(1%) scale(1.07)`],[n,.62,`translateY(-0.7%) scale(1.015)`]]),t(`.nom-chasm`,[[0,0],[Math.round(c*1e3),0],[Math.round((c+.4)*1e3),.84],[n,.9]]),t(`.nom-warning`,[[0,0],[Math.round(c*1e3),0],[Math.round((c+.28)*1e3),1],[n,1]]);for(let[i,a]of[`.nom-first`,`.nom-second`,`.nom-third`].entries()){let s=e.querySelector(a);if(!s||r&&i>0)continue;let c=o?i===2?3.6:1.35+Number(s.dataset.choiceOrder??i)*1.35:l+i*(r?0:.86),u=Math.round(c*1e3),d=Math.round((c+.38)*1e3);t(s,[[0,1],[n,1]]);for(let e of s.querySelectorAll(`.nom-person`))t(e,[[0,0],[u,0],[d,1],[n,1]]);s.querySelector(`.nom-contact`)&&t(`${a} .nom-contact`,[[0,0],[u,0],[d,.7],[n,.7]]),s.querySelector(`.nom-label`)&&t(`${a} .nom-label`,[[0,0],[d+150,0],[d+350,1],[n,1]]),t(`${a} .nom-aura`,[[0,0],[u,0],[d+180,.78],[n,.45]])}if(t(`.c-caption`,[[0,0,`translateY(10px)`],[u,0,`translateY(10px)`],[u+200,1,`translateY(0)`],[n,1,`translateY(0)`]]),a){let e=Math.round((c+.38)*1e3);t(`.nom-decision`,[[0,1],[Math.round((c-.22)*1e3),1],[e,0],[n,0]]),t(`.nom-decision-figure`,[[0,.9,`scale(1.045)`],[Math.min(650,Math.round((c-.32)*1e3)),1,`scale(1.018)`],[Math.round((c-.22)*1e3),1,`scale(1)`],[n,1,`scale(1)`]]),t(`.nom-decision-caption`,[[0,0],[450,1],[Math.round((c-.25)*1e3),1],[e,0],[n,0]]),t(`.nom-decision-progress`,[[0,1,`scaleX(0)`],[Math.round((c-.15)*1e3),1,`scaleX(.96)`],[e,1,`scaleX(1)`],[n,1,`scaleX(1)`]])}if(o){t(`.nom-coloh-intro`,[[0,1],[3750,1],[4100,0],[n,0]]);for(let[r,i]of e.querySelectorAll(`.nom-coloh-beat`).entries()){let e=r===0?500:2100;t(i,[[0,0,`translateY(12px) scale(.99)`],[e,0,`translateY(12px) scale(.99)`],[e+250,1,`translateY(0) scale(1)`],[e+1200,1,`translateY(0) scale(1)`],[e+1450,0,`translateY(-5px) scale(.995)`],[n,0]])}}if(n-u-420<1200)throw Error(`Nomination caption hold is too short`);s===1&&e.querySelector(`.nom-second`)&&(e.querySelector(`.nom-second`).style.display=`none`),e.querySelector(`.nom-decision`)&&(e.dataset.decisionHoldMs=String(n-Math.round(c*1e3)))}function _t(e,t){let n=7600;t(e,[[0,0],[180,1],[n-340,1],[n,0]]),t(`.nom-decision`,[[0,1],[2450,1],[3e3,0],[n,0]]),t(`.nom-decision-figure`,[[0,.74,`scale(1.09)`],[700,1,`scale(1.02)`],[2450,1,`scale(1)`],[n,1]]),t(`.nom-decision-caption`,[[0,0],[800,1],[2300,1],[2760,0],[n,0]]),t(`.nom-decision-progress`,[[0,1,`scaleX(0)`],[450,1,`scaleX(0)`],[2550,1,`scaleX(1)`],[n,1,`scaleX(1)`]]),t(`.ceremony-backdrop`,[[0,.45,`translateY(1%) scale(1.08)`],[n,.62,`translateY(-1%) scale(1.01)`]]),t(`.nom-chasm`,[[0,0],[2700,0],[3300,.92],[n,1]]),t(`.nom-warning`,[[0,0],[3050,0],[3450,1],[n,1]]);for(let[r,i]of[`.nom-first`,`.nom-second`,`.nom-third`].entries()){if(!e.querySelector(i))continue;let a=3300+r*1150;t(i,[[0,0,`translateY(16px) scale(1.035)`],[a,0,`translateY(16px) scale(1.035)`],[a+480,1,`translateY(0) scale(1)`],[n,1,`translateY(0) scale(1)`]]),t(`${i} .nom-aura`,[[0,0],[a+100,0],[a+450,.8],[n,.48]])}t(`.c-caption`,[[0,0,`translateY(12px)`],[e.querySelector(`.nom-third`)?6080:5450,0,`translateY(12px)`],[e.querySelector(`.nom-third`)?6500:5900,1,`translateY(0)`],[n,1]])}function vt(e,t){let n=!!e.querySelector(`.loh-seated`),r=n?4400:3200;t(e,[[0,0],[180,1],[r-380,1],[r,0]]),t(`.loh-backdrop`,[[0,.35,`scale(1.09)`],[r,.58,`scale(1.015)`]]),t(`.loh-figure`,[[0,0,`translateY(22px) scale(.94)`],[550,1,`translateY(0) scale(1)`],[2319,1,`scale(1.008)`,`steps(1,end)`],...n?[[2320,0]]:[],[r,+!n,`scale(1.008)`]]),t(`.loh-crown`,[[0,0,`translateY(-36px)`],[650,0,`translateY(-36px)`],[1060,1,`translateY(-2px)`],[1160,1,`translateY(0)`],[r,1,`translateY(0)`]]),t(`.loh-before`,[[0,1],[1300,1],[1660,0],[r,0]]),t(`.loh-royal`,[[0,0],[1300,0],[1660,1],[r,1]]),t(`.loh-flash`,[[0,0],[1260,0],[1420,.65],[1770,0],[r,0]]),t(`.loh-halo`,[[0,0,`scale(.8)`],[580,.7,`scale(1)`],[1700,1,`scale(1.12)`],[r,.8,`scale(1.15)`]]),t(`.loh-floor`,[[0,0],[600,1],[r,1]]);for(let[e,n]of[[`left`,-1],[`right`,1]])t(`.loh-curtain-`+e,[[0,0,`translateX(${n*125}px)`],[1120,0,`translateX(${n*125}px)`],[1760,1,`translateX(0)`],[r,1]]);n&&(t(`.loh-seat-flash`,[[0,0],[2170,0],[2260,1],[2370,1],[2610,0],[4400,0]]),t(`.loh-seated`,[[0,0,`scale(1.035)`,`steps(1,end)`],[2320,1,`scale(1.035)`],[2730,1,`scale(1)`],[3980,1,`scale(1.012)`],[4400,1,`scale(1.012)`]])),t(`.loh-titles`,[[0,0,`translateY(10px)`],[1660,0,`translateY(10px)`],[2040,1,`translateY(0)`],[r,1]])}function yt(e,t){return new Promise((n,r)=>{let i=new Image,a=()=>{i.removeAttribute(`src`),r(new DOMException(`Cancelled`,`AbortError`))};t.addEventListener(`abort`,a,{once:!0}),i.decoding=`async`,i.alt=``,i.draggable=!1,i.src=new URL(`/bbmobilenew/qa/`+e.src.replace(/^\//,``),document.baseURI).href,e.character&&(i.dataset.character=e.character,i.dataset.pose=e.pose),i.decode().then(()=>{t.removeEventListener(`abort`,a),n(i)},e=>{t.removeEventListener(`abort`,a),r(e)})})}function bt(){let e=O(),t=[],n=new Set,i=[],a=null,o=null,s=new AbortController,c=!1,l=null,u,d=!1,f=!1,h,g=0,v=!1,y=new Set,b=e=>{e.due=performance.now()+e.remaining,e.handle=setTimeout(()=>{n.delete(e),c||e.callback()},e.remaining)},x=(e,t)=>{let r={callback:e,remaining:t,due:0,handle:null};return n.add(r),v||b(r),r},S=()=>{if(c)return;e.pause();let r=v;v=!0;for(let e of r?[]:n)e.remaining=Math.max(0,e.due-performance.now()),clearTimeout(e.handle),e.handle=null;for(let e of t)e.playState===`running`&&(y.add(e),e.pause())},C=()=>{if(!(c||!v)){e.resume(),v=!1;for(let e of n)b(e);for(let e of y)t.includes(e)&&e.play();y.clear()}},w=()=>{e.stop();for(let e of t)e.cancel(),e.effect=null;t=[];for(let e of a?.shadowRoot?.querySelectorAll(`img`)??[])e.removeAttribute(`src`);if(a?.shadowRoot?.replaceChildren(),i.forEach(e=>e.remove()),i=[],a?.remove(),a=null,h=null,o)for(let e of Object.values(o.images))e.removeAttribute(`src`);o=null},T=()=>{c=!0,s.abort();for(let e of n)clearTimeout(e.handle);n.clear(),y.clear(),w()};return{stop:T,pause:S,resume:C,setVisible(e){a&&(a.style.visibility=e?`visible`:`hidden`),i.forEach(t=>t.style.visibility=e?`visible`:`hidden`)},async prepare(e,t,n=`doubleEviction`,r={}){if(u=e,e===`tiebreak`){let e=p({a:t.a});e.safetyHolderIds=r.safetyHolderIds??[],e.decision.kind=`replacement`,r={...r,authorityIntro:e}}let i=ut(e,t,n,r),a=performance.now();lt??=Promise.resolve([ce,le,j,M,ue,N,P,de,at,k].join(`
`));let l=await Promise.all(Object.entries(i).map(async([e,t])=>{let n=await yt(t,s.signal);return n.dataset.resourceKey=e,[e,n]})),d=await lt;return c?null:(o={images:Object.fromEntries(l),resources:i,css:d,cast:t,details:r,preparationMs:performance.now()-a,transferBytes:[...new Map(Object.values(i).map(e=>[e.src,e])).values()].reduce((e,t)=>e+t.bytes,0),decodedBytes:[...new Map(Object.values(i).map(e=>[e.src,e])).values()].reduce((e,t)=>e+t.width*t.height*4,0)},o)},mount(n,i,s,f=`doubleEviction`,p={}){if(c||!o)return;let v=r(u),y=!!W[v],{images:b,resources:S,css:C,cast:w,details:E}=o,ee={nativeHandoff:!0,closingBrand:E.closingBrand===!0&&[`exit`,`final3`].includes(u)},D=y?Fe(v,ee):null,O=u===`nominations`?se(w,E):null,k=u===`allPower`||u===`cupidPower`,A=E.authorityIntro?2200:0;a=document.createElement(`div`),a.className=`game-sample-film`,n.append(a);let ce=a.attachShadow({mode:`open`}),le=document.createElement(`style`);le.textContent=C;let j=document.createElement(`div`);if(j.className=`stage is-playing`,h=k?ae(b,w,u===`cupidPower`):O?te(b,m(w),O):v===`replacement`?te(b,w,E.replacementOutcome):v?v===`loh`?ft(b):y?Le(v,b,0,ee):Ye(v,b,qe[f]||qe.generic,0):nt(u,b,w,E),!k&&!O){if(v===`nominations`&&u!==`cupidNominations`&&E.nomineeCount===1&&h.classList.add(`nom-solo`),v===`nominations`&&b.cinema_standC&&u!==`cupidNominations`&&!h.classList.contains(`nom-solo`)){h.classList.add(`nom-three`);let e=h.querySelector(`.nom-second`).cloneNode(!0);e.classList.replace(`nom-second`,`nom-third`);let t=b.cinema_standC.cloneNode();t.className=`nom-person`,e.querySelector(`.nom-person`).replaceWith(t),e.querySelector(`.nom-label span`).textContent=`03`,h.append(e),h.querySelector(`.c-caption strong`).textContent=`Three names. One block.`}if(u===`nominations`&&b.nomination_seated&&(!E.coLohAssignments||E.coLohAssignments.length<2)&&pt(h,b,S,w),v===`shock`&&_e(h,f,b),v&&dt(h,v,b,S,w),v===`loh`){for(let[e,t]of[[`.loh-before .loh-crown`,`winner`],[`.loh-royal .loh-crown`,`royal`]])$(h.querySelector(e),S[t]);if(S.seated){$(h.querySelector(`.loh-seated-crown`),S.seated);let e=S.seated.throne;h.querySelector(`.loh-seat-throne`).style.transform=`translate(${Q(e.x)},${Q(e.y)}) scale(${e.scale})`}h.querySelector(`.loh-name`).textContent=w.a.name}if(u!==v&&tt(u,h,b,S,w,E,$),h.classList.contains(`nom-solo`)&&(h.querySelector(`.nom-second`).remove(),h.querySelector(`.nom-label`).remove()),u===`nominations`&&mt(h,w,E.coLohAssignments),v===`nominations`&&(h.classList.contains(`nom-solo`)||h.classList.contains(`nom-coloh-active`))&&ht(h,w),v===`nominations`&&h.classList.contains(`nom-solo`)){let e=h.querySelector(`.c-caption strong`),t=h.querySelector(`.c-caption em`);u===`voxNominations`?(h.querySelector(`.nom-warning`).textContent=`SECRET HUBMATE BALLOTS · COUNTED`,e.textContent=`${w.a.name} is nominated.`,t.textContent=`THE PUBLIC WILL VOTE TO ELIMINATE.`):(e.textContent=`${w.a.name} is nominated.`,t.textContent=`ONE NAME. ONE PLACE ON THE BLOCK.`)}}if(E.authorityIntro){h.classList.add(`has-royal-decision`);let e=document.createElement(`div`);e.className=`tiebreak-authority-intro`,_(e,b,m(w),E.authorityIntro),e.querySelector(`.replacement-decision-label em`).textContent=`THE DECIDING VOTE`,h.append(e)}v===`nominations`&&ie(h),j.append(h),ce.append(le,j);let M=O?.durationMs??(k?5600:null)??E.replacementOutcome?.durationMs??(D?D.duration+A:null)??(h.classList.contains(`nom-coloh-active`)?6e3:v===`nominations`&&h.classList.contains(`nom-solo`)?3800:ot[u].duration);if(l=document.timeline.currentTime,v===`nominations`&&p.matchHandoff){let e=p.origin;a.style.transformOrigin=e?`${e.left+e.width/2}px ${e.top+e.height/2}px`:`50% 50%`,t.push(a.animate([{opacity:0,transform:`scale(1.018)`},{opacity:1,transform:`scale(1)`}],{duration:280,fill:`both`,easing:`cubic-bezier(.18,.65,.3,1)`}))}let ue=[],N=(e,n)=>{let r=typeof e==`string`?[...h.querySelectorAll(e)]:[e];if(!r.length)throw Error(`Missing film layer `+e);if(v===`nominations`&&!O&&n[0][1]===0&&r.some(e=>e.matches(`.nom-person, .nom-first, .nom-second, .nom-third`))){let e=n.findIndex(e=>e[1]>0);e>0&&ue.push({at:n[e-1][0],cue:`reveal`})}for(let e of r){let r=e.dataset.fittedCrown?e.style.transform:``,i=e.animate(n.map(([t,n,i,a])=>({offset:t/M,opacity:v===`nominations`&&p.matchHandoff&&e===h&&t===M?1:n,...i?{transform:i+(r?` `+r:``)}:{},...a?{easing:a}:{}})),{duration:M,fill:`both`,easing:`linear`});i.startTime=l,t.push(i)}};k?oe(h,N,M):O?ne(h,N,O,M):v===`replacement`?ne(h,N,E.replacementOutcome,M):v?v===`loh`?vt(h,N):y?(Re(v,h,(e,t)=>{A&&e===h||N(e,A?t.map(([e,...t])=>[e+A,...t]):t)},ee),A&&(N(h,[[0,1],[M,1]]),N(`.tiebreak-authority-intro`,[[0,1],[A-150,1],[A+350,0],[M,0]]),N(`.tiebreak-authority-intro .replacement-decision-shot`,[[0,1],[M,1]]),N(`.tiebreak-authority-intro .replacement-decision-figure`,[[0,1,`scale(1.05)`],[A,1,`scale(1)`],[M,1,`scale(1)`]]))):h.classList.contains(`nom-calibrated`)?gt(h,N,M):h.classList.contains(`nom-royal`)?_t(h,N):v===`nominations`&&u===v?Xe(v,h,(e,t)=>N(e,t.map(([e,...t])=>[Math.round(e/4800*M),...t]))):Xe(v,h,N,qe[f]||qe.generic):rt(u,h,N,M,x),v===`nominations`&&b.cinema_standC&&u===v&&!h.classList.contains(`nom-royal`)&&!h.classList.contains(`nom-calibrated`)&&(N(`.nom-third`,[[0,0,`translateY(18px)`],[2700,0,`translateY(18px)`],[3280,1,`translateY(0)`],[M,1]]),N(`.nom-third .nom-aura`,[[0,0],[2950,0],[3370,.8],[M,.5]])),v===`shock`&&ve(h,f,N,M),!k&&!O&&u!==v&&it(u,h,N,M),v===`safety`&&N(`.fitted-knight-shield`,[[0,0],[1680,0],[1810,1],[4200,1]]),g=M;let P=(D?D.handoffAt+A:null)??(v===`replacement`||O||h.classList.contains(`nom-calibrated`)?M-220:M),de=[...ue,...re(u,M,O??E.replacementOutcome,D,A)];for(let t of de.filter((e,t)=>de.findIndex(t=>t.at===e.at&&t.cue===e.cue)===t))t.at<P&&x(()=>e.play(t.cue),t.at);x(()=>{c||(e.stop(),p.retainLastFrame?(t.forEach(e=>{e.pause(),e.currentTime=P}),s()):y?(t.forEach(e=>{e.pause(),e.currentTime=P}),d=!0,i()):v===`nominations`&&p.matchHandoff?(i(),t.push(a.animate([{opacity:1,transform:`scale(1)`},{opacity:0,transform:`scale(.985)`}],{duration:240,fill:`both`,easing:`ease-in-out`})),x(()=>{T(),s()},250)):(t.push(a.animate([{opacity:1},{opacity:0}],{duration:220,fill:`both`,easing:`ease-in-out`})),x(()=>{T(),s()},230)))},P)},nativeReady(e=!1){c||!d||f||(f=!0,x(()=>{if(!a||c)return;let n=a.animate([{opacity:1},{opacity:0}],{duration:e?140:260,fill:`both`});t.push(n),x(w,e?150:270)},e?0:480))},seek(r){e.stop();for(let e of n)clearTimeout(e.handle);n.clear(),t.forEach(e=>{e.pause(),e.currentTime=r})},get root(){return h},get durationMs(){return g},get metrics(){return o?{preparationMs:o.preparationMs,transferBytes:o.transferBytes,decodedBytes:o.decodedBytes}:null},get counts(){return{animations:t.length,timers:n.size,mounted:!!a,retainedImages:o?Object.keys(o.images).length:0}}}}export{st as OPTIONS,ot as SCENES,bt as createClip,ut as sceneResources};