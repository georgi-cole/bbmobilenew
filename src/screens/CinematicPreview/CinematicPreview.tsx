import { Player } from '@remotion/player';
import { CinematicComposition } from '../../cinematic/components/CinematicComposition';
import { CINEMATIC_CONFIG } from '../../cinematic/config/cinematicConfig';
import './CinematicPreview.css';

const formatTime = (frames: number): string =>
  `${(frames / CINEMATIC_CONFIG.fps).toFixed(0)} seconds`;

export default function CinematicPreview() {
  return (
    <div className="cinematic-preview">
      <header className="cinematic-preview__header">
        <a href="#/" className="cinematic-preview__back">Back to game</a>
        <div>
          <span>BIG EYE / CITY FILM</span>
          <h1>Cinematic preview</h1>
        </div>
        <span className="cinematic-preview__status">Deterministic</span>
      </header>
      <main className="cinematic-preview__content">
        <section className="cinematic-preview__stage" aria-label="Video preview">
          <Player
            component={CinematicComposition}
            durationInFrames={CINEMATIC_CONFIG.durationInFrames}
            compositionWidth={CINEMATIC_CONFIG.width}
            compositionHeight={CINEMATIC_CONFIG.height}
            fps={CINEMATIC_CONFIG.fps}
            controls
            loop
            autoPlay
            acknowledgeRemotionLicense
            style={{ width: '100%', height: '100%' }}
          />
        </section>
        <aside className="cinematic-preview__details">
          <p className="cinematic-preview__kicker">MASTER COMPOSITION</p>
          <h2>{CINEMATIC_CONFIG.compositionId}</h2>
          <dl>
            <div><dt>Canvas</dt><dd>{CINEMATIC_CONFIG.width} × {CINEMATIC_CONFIG.height}</dd></div>
            <div><dt>Duration</dt><dd>{formatTime(CINEMATIC_CONFIG.durationInFrames)}</dd></div>
            <div><dt>Frame rate</dt><dd>{CINEMATIC_CONFIG.fps} FPS</dd></div>
            <div><dt>Total frames</dt><dd>{CINEMATIC_CONFIG.durationInFrames}</dd></div>
            <div><dt>Environment</dt><dd>One persistent city</dd></div>
          </dl>
          <div className="cinematic-preview__chapters">
            <span><i className="is-dawn" /> Blue hour → morning</span>
            <span><i className="is-storm" /> Cloudburst</span>
            <span><i className="is-night" /> Sunset → night</span>
          </div>
          <p className="cinematic-preview__note">
            Scrub freely: every visible value is derived from the current frame and a fixed seed.
          </p>
        </aside>
      </main>
    </div>
  );
}
