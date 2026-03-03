/**
 * Credits.tsx
 *
 * Cinematic credits scene (Canvas-based).
 *
 * - Edit the credits content in: src/data/credits.ts
 * - Trigger scene via route: /#/credits  (routes.tsx already registers the Credits screen)
 *
 * Implementation notes:
 * - Canvas rendering with DPR capped at 2.
 * - requestAnimationFrame loop; cleanup on unmount.
 * - Respects prefers-reduced-motion: disables beam sweep and flicker and shows credits normally.
 * - Skip button and ESC key call `onDone()` which navigates back to '/'.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import creditsData from '../../data/credits';
import './Credits.css';

type CreditEntry = { role: string; name: string };

export default function Credits(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null); // credits offscreen canvas
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1);
  const navigate = useNavigate();

  // Reduced motion preference
  const prefersReduced = typeof window !== 'undefined' &&
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // onDone navigates away from credits (Skip)
  function onDone() {
    navigate('/');
  }

  // Toggle faster scroll (tap anywhere)
  function handleToggleSpeed() {
    setSpeedMultiplier((s) => (s === 1 ? 2.5 : 1));
  }

  useEffect(() => {
    const canvas = canvasRef.current!;
    const container = containerRef.current!;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d', { alpha: false })!;
    // Offscreen canvas: render credits text once
    const creditsCanvas = document.createElement('canvas');
    offscreenRef.current = creditsCanvas;
    const creditsCtx = creditsCanvas.getContext('2d', { alpha: true })!;

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = Math.max(320, Math.floor(container.clientWidth));
    let height = Math.max(480, Math.floor(container.clientHeight));
    let cw = Math.floor(width * dpr);
    let ch = Math.floor(height * dpr);

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(320, Math.floor(container.clientWidth));
      height = Math.max(480, Math.floor(container.clientHeight));
      cw = Math.floor(width * dpr);
      ch = Math.floor(height * dpr);

      canvas.width = cw;
      canvas.height = ch;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // prepare credits offscreen canvas sized to width; height will be determined by text block
      creditsCanvas.width = cw;
      creditsCanvas.style.width = `${width}px`;
      creditsCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      preRenderCredits();
    }

    // Precompute skyline building geometry & windows
    const buildings: { x: number; w: number; h: number; windows: { x: number; y: number; w: number; h: number; on: boolean }[] }[] = [];

    function genBuildings() {
      buildings.length = 0;
      // horizontal layout across width
      const cols = Math.max(6, Math.floor(width / 90));
      let x = 0;
      while (x < width) {
        const w = Math.max(40, Math.floor(30 + Math.random() * 120));
        const h = Math.floor((height * 0.15) + Math.random() * (height * 0.4));
        const b = { x, w, h, windows: [] as any[] };
        // windows grid inside building
        const winCols = Math.max(1, Math.floor(w / 14));
        const winRows = Math.max(1, Math.floor(h / 16));
        const padX = 6;
        const padY = 6;
        const winW = Math.max(6, Math.floor((w - padX * 2) / winCols - 4));
        const winH = Math.max(6, Math.floor((h - padY * 2) / winRows - 6));
        for (let rx = 0; rx < winCols; rx++) {
          for (let ry = 0; ry < winRows; ry++) {
            const wx = Math.floor(x + padX + rx * (winW + 4));
            const wy = Math.floor((height - h) + padY + ry * (winH + 6));
            b.windows.push({ x: wx, y: wy, w: winW, h: winH, on: Math.random() > 0.85 });
          }
        }
        buildings.push(b);
        x += w + Math.floor(8 + Math.random() * 20);
      }
    }

    // Pre-render credits onto offscreen canvas
    let creditsBlockHeight = 0;
    function preRenderCredits() {
      const padding = 40;
      const colWidth = width - padding * 2;
      const lines: string[] = [];
      // Build lines from creditsData (simple formatting)
      creditsData.forEach((c: CreditEntry) => {
        lines.push(c.role);
        lines.push(c.name);
        lines.push(''); // empty line between entries
      });

      // Typographic settings
      const titleFont = `${Math.floor(Math.max(18, width * 0.04))}px sans-serif`;
      const roleFont = `${Math.floor(Math.max(14, width * 0.035))}px sans-serif`;
      const nameFont = `${Math.floor(Math.max(16, width * 0.04))}px sans-serif`;
      const lineGap = Math.floor(Math.max(8, width * 0.015));

      // Measure total height by simulating draw
      creditsCtx.clearRect(0, 0, creditsCanvas.width, creditsCanvas.height);

      let y = padding;
      const measuredLines: { text: string; font: string; align?: CanvasTextAlign }[] = [];
      for (let i = 0; i < creditsData.length; i++) {
        const entry = creditsData[i];
        measuredLines.push({ text: entry.role.toUpperCase(), font: roleFont });
        measuredLines.push({ text: entry.name, font: nameFont });
        measuredLines.push({ text: '', font: nameFont });
      }
      // Estimate height
      // measure each
      for (const ln of measuredLines) {
        creditsCtx.font = ln.font;
        const metrics = creditsCtx.measureText(ln.text || ' ');
        const h = Math.ceil(metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent) || Math.ceil(parseInt(ln.font, 10) * 1.2);
        y += h + lineGap;
      }
      creditsBlockHeight = y + padding;

      // Ensure offscreen canvas height large enough
      creditsCanvas.height = Math.max(ch, Math.ceil(creditsBlockHeight * dpr));
      creditsCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      creditsCtx.clearRect(0, 0, creditsCanvas.width, creditsCanvas.height);

      // Draw backdrop for credits (soft)
      creditsCtx.fillStyle = 'rgba(255,255,255,0.02)';
      creditsCtx.fillRect(0, 0, width, creditsCanvas.height / dpr);

      // Draw centered text
      let yy = padding;
      creditsCtx.textAlign = 'center';
      creditsCtx.textBaseline = 'top';
      for (const ln of measuredLines) {
        creditsCtx.font = ln.font;
        // subtle shadow for readability inside beam
        creditsCtx.fillStyle = '#ffffff';
        creditsCtx.shadowColor = 'rgba(0,0,0,0.4)';
        creditsCtx.shadowBlur = 6;
        creditsCtx.fillText(ln.text, width / 2, yy);
        creditsCtx.shadowBlur = 0;
        const metrics = creditsCtx.measureText(ln.text || ' ');
        const lineHeight =
          Math.ceil(metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent) ||
          Math.ceil(parseInt(ln.font, 10) * 1.15);
        yy += lineHeight + lineGap;
      }
    }

    // background draw (sky + skyline)
    let ticks = 0;
    function drawBackground(ctx: CanvasRenderingContext2D) {
      // sky gradient
      const g = ctx.createLinearGradient(0, 0, 0, height);
      g.addColorStop(0, '#01021a');
      g.addColorStop(0.5, '#06102b');
      g.addColorStop(1, '#00121a');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);

      // moon / faint stars
      if (Math.random() > 0.98) {
        // occasional star sparkle (cheap)
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.beginPath();
        const sx = Math.random() * width * 0.6;
        const sy = Math.random() * height * 0.25;
        ctx.arc(sx, sy, 1.5 + Math.random() * 1.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // buildings silhouette
      ctx.fillStyle = '#02040b';
      for (const b of buildings) {
        const bh = b.h;
        ctx.fillRect(b.x, height - bh, b.w, bh);
      }

      // flickering windows
      for (const b of buildings) {
        for (const w of b.windows) {
          // flicker: change occasionally unless reduced motion
          if (!prefersReduced && Math.random() > 0.985) {
            w.on = !w.on;
          }
          if (w.on) {
            // tinted yellow glow
            ctx.fillStyle = 'rgba(255,230,150,0.9)';
            ctx.fillRect(w.x, w.y, w.w, w.h);
            // soft glow
            ctx.fillStyle = 'rgba(255,200,80,0.06)';
            ctx.fillRect(w.x - 2, w.y - 2, w.w + 4, w.h + 4);
          } else {
            // dark window
            ctx.fillStyle = '#0a0a0a';
            ctx.fillRect(w.x, w.y, w.w, w.h);
          }
        }
      }
    }

    // Beam / credits animation state
    let scrollY = -10; // initial offset for credits
    let scrollSpeed = 30; // px/sec
    let beamAngleCenter = -Math.PI / 2.2; // roughly up-left from top-right
    let beamSweep = 0; // sweep offset
    const beamSweepRange = Math.PI * 0.2;
    let beamSweepDirection = 1;
    const origin = { x: width * 0.86, y: height * 0.12 }; // normalized origin in px

    // call once to initialize
    genBuildings();
    preRenderCredits();
    resize();

    let last = performance.now();
    function frame(now: number) {
      const dt = Math.min(40, now - last); // cap dt
      last = now;
      ticks++;

      // update flicker / sweep only if not reduced motion
      if (!prefersReduced) {
        // beam sweep oscillation
        beamSweep += beamSweepDirection * 0.0006 * dt * (1 + Math.sin(now / 4000) * 0.2);
        if (beamSweep > 1) beamSweep = 1;
        if (beamSweep < -1) beamSweep = -1;
      } else {
        beamSweep = 0;
      }

      // compute beam angle
      const sweepAngle = beamSweep * beamSweepRange;
      const beamAngle = beamAngleCenter + sweepAngle;
      const beamHalfWidth = Math.max(width * 0.14, width * 0.09) * (1 + 0.06 * Math.sin(now / 700)); // pulses

      // scroll update
      scrollY -= ((scrollSpeed * speedMultiplier) * (dt / 1000));
      // Loop credits once finished
      if (scrollY < -creditsBlockHeight - 60) {
        scrollY = height + 40;
      }

      // Draw background (sky + skyline)
      drawBackground(ctx);

      // Foreground: beam + masked credits
      if (prefersReduced) {
        // Reduced motion: draw credits directly, no mask
        ctx.save();
        // draw credits canvas at scrollY
        ctx.drawImage(offscreenRef.current as HTMLCanvasElement, 0, scrollY);
        ctx.restore();
      } else {
        // draw beam shape onto ctx
        ctx.save();
        // beam path (triangle/cone)
        ctx.beginPath();
        const ox = origin.x;
        const oy = origin.y;
        // create two rays for left/right edges
        const len = Math.max(width, height) * 1.6;
        const angleLeft = beamAngle - 0.45;
        const angleRight = beamAngle + 0.45;
        const lx = ox + Math.cos(angleLeft) * len;
        const ly = oy + Math.sin(angleLeft) * len;
        const rx = ox + Math.cos(angleRight) * len;
        const ry = oy + Math.sin(angleRight) * len;

        ctx.moveTo(ox, oy);
        ctx.lineTo(lx, ly);
        ctx.lineTo(rx, ry);
        ctx.closePath();

        // gradient for beam
        const g2 = ctx.createLinearGradient(ox, oy, (lx + rx) / 2, (ly + ry) / 2);
        g2.addColorStop(0, 'rgba(240,240,220,0.18)');
        g2.addColorStop(0.6, 'rgba(200,200,180,0.06)');
        g2.addColorStop(1, 'rgba(160,160,150,0.00)');
        ctx.fillStyle = g2;
        ctx.fill();

        // Now use source-in to draw credits only inside beam
        ctx.globalCompositeOperation = 'source-in';
        // draw credits offscreen at scroll position
        ctx.drawImage(offscreenRef.current as HTMLCanvasElement, 0, scrollY);
        // restore composition
        ctx.globalCompositeOperation = 'source-over';

        // Soft haze / beam edges overlay
        ctx.beginPath();
        ctx.moveTo(ox, oy);
        ctx.lineTo(lx, ly);
        ctx.lineTo(rx, ry);
        ctx.closePath();
        ctx.fillStyle = 'rgba(220,220,200,0.04)';
        ctx.fill();

        // Draw BB eye logo (simple circle) at origin
        const eyeR = Math.max(18, Math.floor(width * 0.03));
        ctx.beginPath();
        ctx.arc(origin.x, origin.y, eyeR, 0, Math.PI * 2);
        ctx.fillStyle = '#111';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.stroke();
        // pupil
        ctx.beginPath();
        ctx.arc(origin.x, origin.y, Math.max(6, Math.floor(eyeR * 0.4)), 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();

        ctx.restore();
      }

      // small foreground HUD (Skip button is in DOM; we might draw a subtle vignette)
      if (!prefersReduced) {
        // subtle vignette top/bottom
        ctx.fillStyle = 'rgba(0,0,0,0.06)';
        ctx.fillRect(0, 0, width, 30);
        ctx.fillRect(0, height - 40, width, 40);
      }

      rafRef.current = requestAnimationFrame(frame);
    }

    // Events
    function onResize() {
      resize();
      genBuildings();
      // reposition origin after recompute
      origin.x = width * 0.86;
      origin.y = height * 0.12;
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onDone();
      }
    }

    // Start the loop
    last = performance.now();
    rafRef.current = requestAnimationFrame(frame);

    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKey);

    // Click anywhere toggles speed
    canvas.addEventListener('click', handleToggleSpeed);

    // Cleanup on unmount
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKey);
      canvas.removeEventListener('click', handleToggleSpeed);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speedMultiplier, prefersReduced, navigate]);

  return (
    <div className="credits-container" ref={containerRef}>
      <canvas ref={canvasRef} className="credits-canvas" aria-hidden />
      <button
        className="credits-skip"
        onClick={onDone}
        aria-label="Skip credits (Esc)"
      >
        Skip
      </button>
      <div className="credits-hint" aria-hidden>
        {prefersReduced ? 'Reduced motion: slow credits' : 'Click to toggle fast scroll · Esc to skip'}
      </div>
    </div>
  );
}