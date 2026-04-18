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
  const initialPropsRef = useRef(props);

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
      sceneRef.current = new CrystalPathShatteredScene(app, initialPropsRef.current);
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

  useEffect(() => {
    sceneRef.current?.update({ ...props });
  }, [props]);

  return <div ref={hostRef} className="crystal-shattered-stage" aria-label="Crystal Path: Shattered board" />;
}
