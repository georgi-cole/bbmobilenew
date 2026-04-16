import type { DialSlotLayout, Rect, VaultCrackerLayout } from './types';
import { clamp } from '../utils/math';

function makeRect(x: number, y: number, width: number, height: number): Rect {
  return { x, y, width, height };
}

export function createVaultCrackerLayout(width: number, height: number, dpr: number): VaultCrackerLayout {
  const padding = clamp(Math.min(width, height) * 0.05, 16, 28);
  const contentWidth = Math.max(220, width - padding * 2);
  const headerHeight = clamp(height * 0.14, 68, 102);
  const historyHeight = clamp(height * 0.18, 84, 118);
  const submitHeight = clamp(height * 0.095, 52, 68);
  const dialHeight = clamp(height * 0.15, 78, 104);
  const dialGap = clamp(contentWidth * 0.03, 10, 16);
  const dialWidth = clamp((contentWidth - dialGap * 3) / 4, 46, 70);
  const digitRackHeight = dialHeight + 28;
  const availableVaultHeight = Math.max(
    120,
    height - padding * 2 - headerHeight - historyHeight - submitHeight - digitRackHeight - 44,
  );
  const vaultRadius = clamp(Math.min(contentWidth * 0.29, availableVaultHeight * 0.45), 76, 132);
  const vaultCenterX = width / 2;
  const vaultCenterY = padding + headerHeight + vaultRadius + 14;
  const pressureRadius = vaultRadius + clamp(vaultRadius * 0.16, 16, 24);
  const vaultInnerRadius = vaultRadius * 0.62;

  const digitRackWidth = dialWidth * 4 + dialGap * 3 + 24;
  const digitRackX = (width - digitRackWidth) / 2;
  const digitRackY = Math.max(
    vaultCenterY + vaultRadius + 18,
    height - padding - historyHeight - submitHeight - digitRackHeight - 18,
  );
  const digitRackRect = makeRect(digitRackX, digitRackY, digitRackWidth, digitRackHeight);

  const dialSlots: DialSlotLayout[] = Array.from({ length: 4 }, (_, index) => {
    const x = digitRackX + 12 + index * (dialWidth + dialGap);
    const y = digitRackY + 14;
    return {
      x,
      y,
      width: dialWidth,
      height: dialHeight,
      centerX: x + dialWidth / 2,
      centerY: y + dialHeight / 2,
    };
  });

  const submitWidth = Math.min(contentWidth, 320);
  const submitRect = makeRect(
    (width - submitWidth) / 2,
    digitRackY + digitRackHeight + 12,
    submitWidth,
    submitHeight,
  );

  const historyRect = makeRect(
    padding,
    height - padding - historyHeight,
    width - padding * 2,
    historyHeight,
  );

  return {
    width,
    height,
    dpr,
    padding,
    headerRect: makeRect(padding, padding, width - padding * 2, headerHeight),
    vaultCenterX,
    vaultCenterY,
    vaultRadius,
    vaultInnerRadius,
    pressureRadius,
    dialSlots,
    digitRackRect,
    submitRect,
    historyRect,
  };
}
