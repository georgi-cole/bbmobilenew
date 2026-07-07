import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { TwinShockRevealAnimation } from '../../types';
import './TwinShockRevealOverlay.css';

type TwinShockRevealOverlayProps = {
  reveal: TwinShockRevealAnimation;
  getTileRect: (playerId: string) => DOMRect | null;
  onDone: () => void;
};

type RevealStage = 'intro' | 'transform' | 'settled' | 'done';

export default function TwinShockRevealOverlay({
  reveal,
  getTileRect,
  onDone,
}: TwinShockRevealOverlayProps) {
  const targetId = reveal.type === 'combined' ? reveal.playerId : reveal.incomingPlayerId;
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [stage, setStage] = useState<RevealStage>('intro');

  useLayoutEffect(() => {
    let doneFallbackId: number | null = null;
    const frameId = window.requestAnimationFrame(() => {
      const measured = getTileRect(targetId);
      if (!measured) {
        doneFallbackId = window.setTimeout(onDone, 100);
        return;
      }
      setRect(measured);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      if (doneFallbackId !== null) window.clearTimeout(doneFallbackId);
    };
  }, [getTileRect, onDone, targetId]);

  const timings = useMemo(
    () => (
      reveal.type === 'ali_enters'
        ? { transformAt: 1800, settledAt: 3200, doneAt: 5600 }
        : { transformAt: 1550, settledAt: 2850, doneAt: 4900 }
    ),
    [reveal.type],
  );

  useEffect(() => {
    if (!rect) return undefined;
    const transformId = window.setTimeout(() => setStage('transform'), timings.transformAt);
    const settledId = window.setTimeout(() => setStage('settled'), timings.settledAt);
    const doneId = window.setTimeout(() => {
      setStage('done');
      onDone();
    }, timings.doneAt);
    return () => {
      window.clearTimeout(transformId);
      window.clearTimeout(settledId);
      window.clearTimeout(doneId);
    };
  }, [onDone, rect, timings]);

  const display = useMemo(() => {
    const transformed = stage !== 'intro';
    const settled = stage === 'settled';
    if (reveal.type === 'combined') {
      return {
        beforeName: reveal.fromName,
        beforeAvatar: reveal.fromAvatar,
        afterName: reveal.toName,
        afterAvatar: reveal.toAvatar,
        headline: settled ? 'Twin Shock Exposed' : 'The spotlight tightens',
        caption: settled
          ? 'Lia & Ali will continue the game together as one contestant.'
          : transformed
            ? 'The house sees both twins at once.'
            : 'Lia steps into the spotlight alone.',
      };
    }
    return {
      beforeName: reveal.replacedPlayerName,
      beforeAvatar: reveal.replacedPlayerAvatar,
      afterName: reveal.incomingName,
      afterAvatar: reveal.incomingAvatar,
      headline: settled ? 'New Housemate' : 'A place in the House opens',
      caption: settled
        ? `${reveal.incomingName} is now officially in the game.`
        : transformed
          ? `${reveal.incomingName} steps into the House.`
          : `${reveal.replacedPlayerName}'s tile fades from the board.`,
    };
  }, [reveal, stage]);

  if (!rect || stage === 'done') return null;

  const style = {
    '--twin-shock-left': `${rect.left}px`,
    '--twin-shock-top': `${rect.top}px`,
    '--twin-shock-width': `${rect.width}px`,
    '--twin-shock-height': `${rect.height}px`,
  } as CSSProperties;

  return (
    <div
      className={`twin-shock-reveal twin-shock-reveal--${reveal.type} twin-shock-reveal--${stage}`}
      style={style}
      role="status"
      aria-live="assertive"
      aria-label={display.caption}
    >
      <div className="twin-shock-reveal__shade" />
      <div className="twin-shock-reveal__flare" />
      <div className="twin-shock-reveal__beam" />
      <div className="twin-shock-reveal__tile">
        <div className="twin-shock-reveal__avatar-wrap">
          {display.beforeAvatar ? (
            <img
              className="twin-shock-reveal__avatar twin-shock-reveal__avatar--before"
              src={display.beforeAvatar}
              alt=""
              draggable={false}
            />
          ) : (
            <span className="twin-shock-reveal__avatar-fallback twin-shock-reveal__avatar-fallback--before">
              {display.beforeName.slice(0, 2).toUpperCase()}
            </span>
          )}
          {display.afterAvatar ? (
            <img
              className="twin-shock-reveal__avatar twin-shock-reveal__avatar--after"
              src={display.afterAvatar}
              alt=""
              draggable={false}
            />
          ) : (
            <span className="twin-shock-reveal__avatar-fallback twin-shock-reveal__avatar-fallback--after">
              {display.afterName.slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>
        <div className="twin-shock-reveal__headline">{display.headline}</div>
        <div className="twin-shock-reveal__name">
          {stage === 'intro' ? display.beforeName : display.afterName}
        </div>
      </div>
      <div className="twin-shock-reveal__caption">{display.caption}</div>
    </div>
  );
}
