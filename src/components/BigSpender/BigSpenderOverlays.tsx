import {
  BIG_SPENDER_CONFIG,
  type BigSpenderPlayerState,
  type BigSpenderRoundResult,
} from './bigSpenderLogic'

export type BigSpenderBombDramaStage = 'impact' | 'cracked' | 'prompt' | null

type RankedPlayer = BigSpenderPlayerState & { rank: number }

type BigSpenderOverlaysProps = {
  bombDramaStage: BigSpenderBombDramaStage
  humanAdRescuePending: boolean
  zeroDramaVisible: boolean
  winnerCelebrationVisible: boolean
  winner: RankedPlayer | null
  latestRoundResult: BigSpenderRoundResult | null
  roundSummaryPlayers: RankedPlayer[]
  humanEliminatedInSummary: boolean
  showRoundSummary: boolean
  showResults: boolean
  ranking: RankedPlayer[]
  resultCommitted: boolean
  onResolveAdRescue: (completed: boolean) => void
  onContinueRound: () => void
  onSkipToResults: () => void
  onFinish: () => void
}

const BOMB_ICON = '\u{1F4A3}'
const RESULT_MEDALS = ['1', '2', '3'] as const

function getPlayerLabel(player: BigSpenderPlayerState) {
  if (player.status === 'zeroFinished') return 'Zero'
  if (player.status === 'bombed') return 'Bombed'
  if (player.status === 'locked') return 'Locked'
  if (player.finalizedAt != null) return 'Final'
  return 'Active'
}

export default function BigSpenderOverlays({
  bombDramaStage,
  humanAdRescuePending,
  zeroDramaVisible,
  winnerCelebrationVisible,
  winner,
  latestRoundResult,
  roundSummaryPlayers,
  humanEliminatedInSummary,
  showRoundSummary,
  showResults,
  ranking,
  resultCommitted,
  onResolveAdRescue,
  onContinueRound,
  onSkipToResults,
  onFinish,
}: BigSpenderOverlaysProps) {
  return (
    <>
      {humanAdRescuePending && bombDramaStage && bombDramaStage !== 'prompt' && (
        <div
          className={`big-spender__screen-drama big-spender__screen-drama--${bombDramaStage}`}
          aria-hidden="true"
        >
          <span className="big-spender__screen-drama-icon">{BOMB_ICON}</span>
        </div>
      )}

      {zeroDramaVisible && (
        <div
          className="big-spender__screen-drama big-spender__screen-drama--zero"
          aria-hidden="true"
        >
          <span className="big-spender__screen-drama-kicker">Perfect broke</span>
          <strong>0</strong>
          <span className="big-spender__screen-drama-caption">
            You hit the cleanest possible landing.
          </span>
        </div>
      )}

      {winnerCelebrationVisible && winner && (
        <div
          className="big-spender__screen-drama big-spender__screen-drama--winner"
          aria-live="assertive"
        >
          <span className="big-spender__screen-drama-kicker">Winner locked</span>
          <strong>{winner.displayName}</strong>
          <span className="big-spender__screen-drama-caption">Final results are coming in.</span>
        </div>
      )}

      {humanAdRescuePending && bombDramaStage === 'prompt' && (
        <div className="big-spender__overlay">
          <div className="big-spender__modal big-spender__modal--danger">
            <span className="big-spender__eyebrow">Bomb save</span>
            <h2>Watch an ad for one last wallet?</h2>
            <p>
              If the ad completes, the bomb is cancelled and you choose one closed wallet as your
              mandatory Second Chance Wallet.
            </p>
            <div className="big-spender__modal-actions">
              <button type="button" onClick={() => onResolveAdRescue(true)}>
                Watch ad
              </button>
              <button type="button" onClick={() => onResolveAdRescue(false)}>
                Skip
              </button>
            </div>
          </div>
        </div>
      )}

      {showRoundSummary && latestRoundResult && (
        <div className="big-spender__overlay">
          <div className="big-spender__modal big-spender__modal--round">
            <span className="big-spender__eyebrow">
              Round {latestRoundResult.roundNumber} results
            </span>
            <h2>
              {humanEliminatedInSummary
                ? 'You were eliminated'
                : latestRoundResult.survivorPlayerIds.length <=
                    BIG_SPENDER_CONFIG.roundFourFinalistCount
                  ? 'Finale is set'
                  : 'You survived'}
            </h2>
            <p>
              {humanEliminatedInSummary
                ? 'The closest balances survive. The house keeps playing from here.'
                : latestRoundResult.survivorPlayerIds.length <=
                    BIG_SPENDER_CONFIG.roundFourFinalistCount
                  ? 'Two finalists remain for the shared-board finale.'
                  : `${latestRoundResult.survivorPlayerIds.length} players move on. Closest to zero leads the table.`}
            </p>
            <ol className="big-spender__ranking big-spender__ranking--round">
              {roundSummaryPlayers.map((player) => {
                const eliminated = latestRoundResult.eliminatedPlayerIds.includes(player.playerId)
                return (
                  <li
                    key={player.playerId}
                    className={eliminated ? 'big-spender__ranking-item--eliminated' : ''}
                  >
                    <span>{player.rank}</span>
                    <strong>{player.displayName}</strong>
                    <em>
                      {player.balance.toLocaleString('en-US')} Eyeoleans ·{' '}
                      {eliminated
                        ? 'Eliminated'
                        : `${player.walletsOpened} wallets · ${getPlayerLabel(player)}`}
                    </em>
                  </li>
                )
              })}
            </ol>
            <div className="big-spender__modal-actions">
              {humanEliminatedInSummary ? (
                <>
                  <button type="button" onClick={onContinueRound}>
                    Watch as spectator
                  </button>
                  <button type="button" onClick={onSkipToResults}>
                    Skip to results
                  </button>
                </>
              ) : (
                <button type="button" onClick={onContinueRound}>
                  {latestRoundResult.survivorPlayerIds.length <=
                  BIG_SPENDER_CONFIG.roundFourFinalistCount
                    ? 'Start finale'
                    : 'Next round'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showResults && (
        <div className="big-spender__overlay">
          <div className="big-spender__modal big-spender__modal--results">
            <div className="big-spender__results-hero">
              <span className="big-spender__results-trophy" aria-hidden="true">
                Winner
              </span>
              <span className="big-spender__eyebrow">Final results</span>
              <h2>{winner?.displayName ?? 'Someone'} wins</h2>
              <p>Big Spender is complete. The final standings are locked.</p>
            </div>
            <ol
              className="big-spender__ranking big-spender__ranking--final"
              aria-label="Final rankings"
            >
              {ranking.map((player) => (
                <li
                  key={player.playerId}
                  className={[
                    player.rank === 1 ? 'big-spender__ranking-item--winner' : '',
                    player.isHuman ? 'big-spender__ranking-item--you' : '',
                  ].join(' ')}
                >
                  <span>{RESULT_MEDALS[player.rank - 1] ?? player.rank}</span>
                  <strong>{player.displayName}</strong>
                  <em>
                    {player.balance.toLocaleString('en-US')} Eyeoleans · {getPlayerLabel(player)} ·{' '}
                    {player.walletsOpened} wallets
                  </em>
                </li>
              ))}
            </ol>
            <button
              type="button"
              className="big-spender__results-cta"
              onClick={onFinish}
              disabled={resultCommitted}
            >
              Continue
            </button>
          </div>
        </div>
      )}
    </>
  )
}
