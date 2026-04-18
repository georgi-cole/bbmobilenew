import { useEffect, useRef } from 'react';
import { Application } from 'pixi.js';
import type {
  BridgeRow,
  GlassBridgePhase,
  GlassBridgePlayerProgress,
  TileSide,
} from '../../features/glassBridge/glassBridgeSlice';
import { CrystalPathShatteredScene } from './CrystalPathShatteredScene';
import type { CrystalPathShatteredAnimation } from './crystalPathShatteredLogic';

/**
 * Rendering boundary note:
 * - React/DOM owns only the external HUD/chrome around the playfield (status text, timer/hints,
 *   buttons, guidance, standings, and modal content in CrystalPathShatteredGame).
 * - Pixi owns the entire playfield mounted here: abyss/background, bridge deck, glass panels,
 *   lighting, particles, cracks, shatter debris, and in-scene tokens/fall animation.
 * - Corrected architecture: this host is sizing-only so the playfield no longer relies on DOM/CSS
 *   borders, backgrounds, or fake panel effects inside the Pixi rendering area.
 */
interface ParticipantView {
  id: string;
  name: string;
  isHuman: boolean;
}

interface Props {
  phase: GlassBridgePhase;
  rows: BridgeRow[];
  rowsCount: number;
  currentPlayerRow: number;
  currentTurnIndex: number;
  turnOrder: string[];
  participants: ParticipantView[];
  progress: Record<string, GlassBridgePlayerProgress>;
  humanId: string | null;
  inputEnabled: boolean;
  activeAnimation: CrystalPathShatteredAnimation | null;
  onTileSelect: (side: TileSide) => void;
}

export default function CrystalPathShatteredPixiStage(props: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const sceneRef = useRef<CrystalPathShatteredScene | null>(null);
  const latestPropsRef = useRef(props);

  useEffect(() => {
    latestPropsRef.current = props;
    sceneRef.current?.update(props);
  }, [props]);

  useEffect(() => {
    const host = hostRef.current;
    let cancelled = false;

    async function mount() {
      if (!host) return;
      const app = new Application();
      await app.init({
        resizeTo: host,
        backgroundAlpha: 0,
        antialias: true,
        autoDensity: true,
        resolution: typeof window === 'undefined' ? 1 : Math.min(window.devicePixelRatio || 1, 2),
      });
      if (cancelled) {
        app.destroy(true, { children: true, texture: true });
        return;
      }
      host.appendChild(app.canvas);
      appRef.current = app;
      sceneRef.current = new CrystalPathShatteredScene(app, latestPropsRef.current);
      sceneRef.current.resize();
    }

    mount();

    return () => {
      cancelled = true;
      sceneRef.current?.destroy();
      sceneRef.current = null;
      appRef.current?.destroy(true, { children: true, texture: true });
      appRef.current = null;
      if (host) {
        host.innerHTML = '';
      }
    };
  }, []);

  return <div ref={hostRef} className="crystal-shattered-stage" aria-label="Crystal Path: Shattered board" />;
}
