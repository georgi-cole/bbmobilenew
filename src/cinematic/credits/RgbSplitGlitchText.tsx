import type { CSSProperties, ReactNode } from 'react';
import { getRgbSplitGlitchState } from './rgbSplitGlitchState';

type RgbSplitGlitchTextProps = {
  children: ReactNode;
  className: string;
  frame: number;
  enterFrame: number;
  exitFrame: number;
  seed: number;
  style?: CSSProperties;
};

export const RgbSplitGlitchText = ({
  children,
  className,
  frame,
  enterFrame,
  exitFrame,
  seed,
  style,
}: RgbSplitGlitchTextProps) => {
  const glitch = getRgbSplitGlitchState({ frame, enterFrame, exitFrame, seed });
  const direction = seed % 2 === 0 ? 1 : -1;
  const opacity = glitch.amount * (0.58 + glitch.burst * 0.32);
  const shadowOpacity = glitch.amount * 0.72;
  const displacement = glitch.displacement * direction;

  const rootStyle = {
    ...style,
    '--credit-glitch-opacity': opacity,
    '--credit-glitch-shadow-opacity': shadowOpacity,
    '--credit-glitch-base-x': `${glitch.amount * glitch.burst * direction * 1.3}px`,
    '--credit-glitch-red-x': `${-displacement}px`,
    '--credit-glitch-green-x': `${displacement * 0.38}px`,
    '--credit-glitch-blue-x': `${displacement}px`,
    '--credit-glitch-slice-y': `${(glitch.burst - 0.5) * glitch.amount * 4}px`,
    '--credit-glitch-green-y': `${(0.5 - glitch.burst) * glitch.amount * 3}px`,
    '--credit-glitch-blue-y': `${(glitch.burst - 0.5) * glitch.amount * 5}px`,
  } as CSSProperties;

  return (
    <span
      className="big-eye-credits__glitch-text"
      data-glitch-phase={glitch.phase}
      style={rootStyle}
    >
      <span className={`${className} big-eye-credits__glitch-shadow`} aria-hidden="true">
        {children}
      </span>
      <span
        className={`${className} big-eye-credits__glitch-channel big-eye-credits__glitch-channel--red`}
        aria-hidden="true"
      >
        {children}
      </span>
      <span
        className={`${className} big-eye-credits__glitch-channel big-eye-credits__glitch-channel--green`}
        aria-hidden="true"
      >
        {children}
      </span>
      <span
        className={`${className} big-eye-credits__glitch-channel big-eye-credits__glitch-channel--blue`}
        aria-hidden="true"
      >
        {children}
      </span>
      <span className={`${className} big-eye-credits__glitch-base`}>{children}</span>
    </span>
  );
};
