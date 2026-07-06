import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { TwinShockRevealAnimation } from '../../types';
import './TwinShockRevealOverlay.css';

type TwinShockRevealOverlayProps = {
  reveal: TwinShockRevealAnimation;
  getTileRect: (playerId: string) => DOMRect | null;
  onDone: () => void;
};

type RevealStage = 'before' | 'after' | 'done';

export default function TwinShockRevealOverlay({
  reveal,
  getTileRect,
  onDone,
}: TwinShockRevealOverlayProps) {
  const targetId = reveal.type === 'combined' ? reveal.playerId : reveal.incomingPlayerId;
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [stage, setStage] = useState<RevealStage>('before');

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

  useEffect(() => {
    if (!rect) return undefined;
    const swapId = window.setTimeout(() => setStage('after'), 950);
    const doneId = window.setTimeout(() => {
      setStage('done');
      onDone();
    }, 2700);
    return () => {
      window.clearTimeout(swapId);
      window.clearTimeout(doneId);
    };
  }, [onDone, rect]);

  const display = useMemo(() => {
    const after = stage !== 'before';
    if (reveal.type === 'combined') {
      return {
        name: after ? reveal.toName : reveal.fromName,
        avatar: after ? reveal.toAvatar : reveal.fromAvatar,
        caption: after ? 'Lia & Ali are revealed' : 'Lia steps into the spotlight',
      };
    }
    return {
      name: after ? reveal.incomingName : reveal.replacedPlayerName,
      avatar: after ? reveal.incomingAvatar : reveal.replacedPlayerAvatar,
      caption: after
        ? `${reveal.incomingName} takes the empty place`
        : `${reveal.replacedPlayerName}'s place goes dark`,
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
      <div className="twin-shock-reveal__beam" />
      <div className="twin-shock-reveal__tile">
        <div className="twin-shock-reveal__avatar-wrap">
          {display.avatar ? (
            <img
              className="twin-shock-reveal__avatar"
              src={display.avatar}
              alt=""
              draggable={false}
            />
          ) : (
            <span className="twin-shock-reveal__avatar-fallback">
              {display.name.slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>
        <div className="twin-shock-reveal__name">{display.name}</div>
      </div>
      <div className="twin-shock-reveal__caption">{display.caption}</div>
    </div>
  );
}
