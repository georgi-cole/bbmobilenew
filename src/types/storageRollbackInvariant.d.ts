export {}

declare global {
  interface Storage {
    /**
     * Save rollback maps are populated for every supported slot before writes begin.
     * The wider overload preserves that proven invariant at the rollback call site.
     */
    setItem(key: string, value: string | undefined): void
  }
}
