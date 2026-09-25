(function(e){function t(){return`ontouchstart`in window||navigator.maxTouchPoints>0||navigator.msMaxTouchPoints>0||/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)}function n(){return{width:window.innerWidth||document.documentElement.clientWidth,height:window.innerHeight||document.documentElement.clientHeight}}function r(){let e=n();return e.height>e.width}function i(e,n,r={}){let i=t(),a=!1,o=e=>{a=!0,n(e),setTimeout(()=>{a=!1},300)},s=e=>{a||n(e)};return i&&e.addEventListener(`touchstart`,o,r),e.addEventListener(`click`,s,r),()=>{e.removeEventListener(`touchstart`,o),e.removeEventListener(`click`,s)}}function a(e,t,n=`tap-pressed`){return i(e,r=>{e.classList.add(n),t(r),setTimeout(()=>{e.classList.remove(n)},150)})}function o(e){let t=e=>{e.preventDefault()};return e.addEventListener(`touchstart`,t,{passive:!1}),e.addEventListener(`touchmove`,t,{passive:!1}),e.addEventListener(`touchend`,t,{passive:!1}),()=>{e.removeEventListener(`touchstart`,t),e.removeEventListener(`touchmove`,t),e.removeEventListener(`touchend`,t)}}function s(e){return e.touches&&e.touches.length>0?{x:e.touches[0].clientX,y:e.touches[0].clientY}:e.changedTouches&&e.changedTouches.length>0?{x:e.changedTouches[0].clientX,y:e.changedTouches[0].clientY}:{x:e.clientX,y:e.clientY}}function c(e={}){let{maxWidth:t=600,aspectRatio:n=null,backgroundColor:r=`transparent`}=e,i=document.createElement(`div`);if(i.style.cssText=`
      width: 100%;
      max-width: ${t}px;
      margin: 0 auto;
      padding: 16px;
      box-sizing: border-box;
      background-color: ${r};
    `,n){let e=1/n*100;i.style.position=`relative`,i.style.paddingTop=`${e}%`;let t=document.createElement(`div`);return t.style.cssText=`
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        padding: 16px;
      `,i.appendChild(t),{container:i,inner:t}}return{container:i,inner:i}}function l(e,t,n={}){let{primary:r=!0,fullWidth:i=!1,disabled:o=!1}=n,s=document.createElement(`button`);s.textContent=e,s.disabled=o;let c=r?`
      background: linear-gradient(135deg, #4a90e2 0%, #357abd 100%);
      color: white;
      box-shadow: 0 2px 8px rgba(74, 144, 226, 0.3);
    `:`
      background: #2c3a4d;
      color: #e3ecf5;
      border: 1px solid #3f4f63;
    `,l=i?`width: 100%;`:``;return s.style.cssText=`
      padding: 12px 24px;
      font-size: 1rem;
      border-radius: 8px;
      border: none;
      cursor: pointer;
      transition: all 0.15s ease;
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
      user-select: none;
    `+c+l,s.addEventListener(`mouseenter`,()=>{s.disabled||(s.style.transform=`translateY(-1px)`,s.style.boxShadow=r?`0 4px 12px rgba(74, 144, 226, 0.4)`:`0 2px 8px rgba(0,0,0,0.2)`)}),s.addEventListener(`mouseleave`,()=>{s.style.transform=`translateY(0)`,s.style.boxShadow=r?`0 2px 8px rgba(74, 144, 226, 0.3)`:`none`}),s.__cleanup=a(s,t,`tap-pressed`),s}function u(e,t={}){let{disableSelect:n=!0,disableTapHighlight:r=!0,disableZoom:i=!0}=t,a=[];n&&(a.push(`user-select: none`),a.push(`-webkit-user-select: none`)),r&&a.push(`-webkit-tap-highlight-color: transparent`),i&&a.push(`touch-action: manipulation`);let o=e.style.cssText;e.style.cssText=o+`; `+a.join(`; `)}function d(e,t){let n;return function(...r){clearTimeout(n),n=setTimeout(()=>{clearTimeout(n),e(...r)},t)}}function f(e,t){let n;return function(...r){n||(e.apply(this,r),n=!0,setTimeout(()=>n=!1,t))}}function p(e=50){`vibrate`in navigator&&navigator.vibrate(e)}e.MinigameMobileUtils={isMobileDevice:t,getViewportSize:n,isPortrait:r,addTapListener:i,addTapWithFeedback:a,preventTouchDefaults:o,getEventCoordinates:s,createResponsiveContainer:c,createButton:l,applyMobileFriendlyStyles:u,debounce:d,throttle:f,vibrate:p};let m=document.createElement(`style`);m.textContent=`
    .tap-pressed {
      opacity: 0.7;
      transform: scale(0.98);
    }
  `,document.head.appendChild(m)})(window);