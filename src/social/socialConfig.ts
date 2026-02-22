/** Config for the Social Engine budget computation, adapted from BBMobile defaults. */
export const socialConfig = {
  /** Target spend fraction range [min, max] applied to DEFAULT_ENERGY. */
  targetSpendPctRange: [0.5, 0.9] as [number, number],
  /** Minimum number of social actions per AI player per phase. */
  minActionsPerPlayer: 1,
  /** Maximum number of social actions per AI player per phase. */
  maxActionsPerPlayer: 4,
};
