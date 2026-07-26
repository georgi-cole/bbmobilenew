import type { CSSProperties } from 'react'
import type { BigSpenderWallet } from './bigSpenderLogic'

export type BigSpenderWallTransitionStage = 'clearing' | 'entering' | null
export type BigSpenderWallMotif = 'vault' | 'diamond'

export type BigSpenderLatestReveal = {
  roundNumber: number
  outcome: BigSpenderWallet['outcome']
  secondChance: boolean
  previousBalance: number
  nextBalance: number
}

type BigSpenderBoardProps = {
  visibleWallets: BigSpenderWallet[]
  wallIndex: number
  motif: BigSpenderWallMotif
  transitionStage: BigSpenderWallTransitionStage
  openedCount: number
  closedCount: number
  secondChancePending: boolean
  canOpen: boolean
  latestReveal: BigSpenderLatestReveal | null
  onOpenWallet: (walletId: string) => void
  getOpenedByLabel: (wallet: BigSpenderWallet) => string | null
}

const BOMB_ICON = '\u{1F4A3}'

function getWalletResultLabel(wallet: BigSpenderWallet) {
  if (wallet.state !== 'revealed') return null
  if (wallet.outcome.type === 'bomb') return BOMB_ICON
  const amount = wallet.outcome.amount ?? 0
  return amount > 0 ? `+${amount}` : `${amount}`
}

function getWalletAriaLabel(wallet: BigSpenderWallet, secondChancePending: boolean) {
  const number = wallet.boardSlotIndex + 1
  if (secondChancePending) return `Pick wallet ${number} as your Second Chance Wallet`
  return `Open wallet ${number}`
}

function getLatestRevealText(reveal: BigSpenderLatestReveal) {
  if (reveal.outcome.type === 'bomb') return 'Bomb found. The round is on the line.'
  const amount = reveal.outcome.amount ?? 0
  return amount < 0 ? `${Math.abs(amount)} Eyeoleans removed.` : `${amount} Eyeoleans added back.`
}

export default function BigSpenderBoard({
  visibleWallets,
  wallIndex,
  motif,
  transitionStage,
  openedCount,
  closedCount,
  secondChancePending,
  canOpen,
  latestReveal,
  onOpenWallet,
  getOpenedByLabel,
}: BigSpenderBoardProps) {
  return (
    <main className="big-spender__table">
      <section className="big-spender__board-shell">
        <div className="big-spender__board-heading">
          <div>
            <span className="big-spender__metric-label">
              {wallIndex === 1 ? 'Fresh wallet wall' : 'Wallet wall'}
            </span>
            <strong>
              {secondChancePending
                ? 'Choose your mandatory save'
                : transitionStage
                  ? 'Replenishing the wall'
                  : 'Tap any closed wallet'}
            </strong>
          </div>
          <span>
            {openedCount} opened · {closedCount} closed
          </span>
        </div>

        {latestReveal && (
          <div
            className={[
              'big-spender__latest-reveal',
              `big-spender__latest-reveal--${latestReveal.outcome.type}`,
            ].join(' ')}
            aria-live="polite"
          >
            <span>{latestReveal.secondChance ? 'Second Chance result' : 'Wallet result'}</span>
            <strong>
              {latestReveal.outcome.type === 'bomb'
                ? BOMB_ICON
                : `${(latestReveal.outcome.amount ?? 0) > 0 ? '+' : ''}${latestReveal.outcome.amount ?? 0}`}
            </strong>
            <small>
              {getLatestRevealText(latestReveal)}
              {latestReveal.outcome.type !== 'bomb' && (
                <em>
                  {latestReveal.previousBalance.toLocaleString('en-US')} →{' '}
                  {latestReveal.nextBalance.toLocaleString('en-US')}
                </em>
              )}
            </small>
          </div>
        )}

        <div className="big-spender__board-stage">
          {transitionStage && (
            <div
              className={`big-spender__wall-replenish big-spender__wall-replenish--${transitionStage}`}
              aria-live="polite"
            >
              <strong>Wallet wall replenished</strong>
              <span>Fresh wallets are sliding into place.</span>
            </div>
          )}

          <section
            className={[
              'big-spender__board',
              `big-spender__board--motif-${motif}`,
              transitionStage ? `big-spender__board--${transitionStage}` : '',
            ].join(' ')}
            aria-label={`Wallet wall ${wallIndex + 1}`}
          >
            {visibleWallets.map((wallet, wallSlotIndex) => {
              const resultLabel = getWalletResultLabel(wallet)
              const openedByLabel = getOpenedByLabel(wallet)
              const style = {
                '--wallet-column': wallSlotIndex % 4,
                '--wallet-row': Math.floor(wallSlotIndex / 4),
              } as CSSProperties

              return (
                <button
                  key={wallet.walletId}
                  type="button"
                  className={[
                    'big-spender__wallet',
                    `big-spender__wallet--color-${wallet.generationColor}`,
                    wallet.state === 'revealed' ? 'big-spender__wallet--revealed' : '',
                    wallet.state === 'revealed'
                      ? `big-spender__wallet--${wallet.outcome.type}`
                      : '',
                    resultLabel && resultLabel.length >= 4
                      ? 'big-spender__wallet--result-long'
                      : '',
                    wallet.outcome.type === 'bomb' && wallet.state === 'revealed'
                      ? 'big-spender__wallet--bomb'
                      : '',
                    secondChancePending && wallet.state === 'hidden'
                      ? 'big-spender__wallet--second-chance'
                      : '',
                  ].join(' ')}
                  style={style}
                  disabled={!canOpen || transitionStage !== null || wallet.state !== 'hidden'}
                  onClick={() => onOpenWallet(wallet.walletId)}
                  aria-label={getWalletAriaLabel(wallet, secondChancePending)}
                >
                  <span className="big-spender__wallet-flap" aria-hidden="true" />
                  <span className="big-spender__wallet-id">
                    {String(wallet.boardSlotIndex + 1).padStart(2, '0')}
                  </span>
                  {resultLabel && (
                    <strong className="big-spender__wallet-result">{resultLabel}</strong>
                  )}
                  {openedByLabel && (
                    <span className="big-spender__wallet-opener">{openedByLabel}</span>
                  )}
                </button>
              )
            })}
          </section>
        </div>
      </section>
    </main>
  )
}
