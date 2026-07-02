    // ── Derived ───────────────────────────────────────────────────────────────
  // The human's active personal round is their cursor position.  With the
  // shared matchFigureOrder all players see the same figure per global round,
  // but the human can advance ahead of the global round immediately after
  // answering correctly.
  const humanIsAhead = humanId !== null && humanCursor > ff.currentRound;
  // Resolve the human's current figure from the shared matchFigureOrder.
  const humanFigureIdx =
    humanId !== null && ff.matchFigureOrder.length > humanCursor
      ? ff.matchFigureOrder[humanCursor]
      : humanId !== null
        ? getPlayerFigureIndex(ff, humanId, humanCursor)
        : ff.currentFigureIndex;
  // Always show the human's own figure — on round_reveal this is the figure
  // they were actually being tested on. When there is no local human player,
  // fall back to the global currentFigureIndex.
  const figure = FAMOUS_FIGURES[humanFigureIdx] ?? null;
  // For hints: when ahead of the global round use the local counter so we
  // don't mutate the global hintsRevealed for the ongoing AI round.
  const effectiveHintsRevealed = humanIsAhead ? humanAheadHints : ff.hintsRevealed;
  // humanCorrect: true only if the human has already answered their CURRENT
  // personal round. When the human is ahead, they are on a fresh round (cursor
  // has already moved) so correct = false until they answer the new figure.
  let humanCorrect = false;
  if (humanId) {
    if (humanIsAhead) {
      // Cursor has advanced — human is on a new round not yet answered.
      humanCorrect = false;
    } else {
      humanCorrect = ff.playerCorrect[humanId] ?? false;
    }
  }
  const hintsAllRevealed = effectiveHintsRevealed >= 5;
  const canRequestHint =
    ff.status === 'round_active' &&
    humanCursor < ff.totalRounds &&
    !humanCorrect &&
    !hintsAllRevealed &&
    (humanIsAhead || (ff.timerPhase !== 'overtime' && ff.timerPhase !== 'done'));

  // True when the local human player has solved all their personal rounds but
  // the global match has not yet transitioned to 'complete' (the timer for the
  // last round is still running for other players).
  // (humanIsAhead is already derived above; mid-round advance shows next figure
  // immediately, no mid-match waiting screen needed.)
  const humanAllDone =
    humanId !== null &&
    humanCursor >= ff.totalRounds &&
    ff.status !== 'complete';

  // True when the global match has exhausted all rounds and is no longer active.
  const matchRoundsExhausted =
    ff.currentRound >= ff.totalRounds - 1 && ff.status !== 'round_active';

  // Number of participants who haven't yet finished all their personal rounds.
  const remainingPlayersCount = matchRoundsExhausted
    ? 0
    : participantIds.filter(
        (id) => (ff.playerRoundCursor[id] ?? 0) < ff.totalRounds,
      ).length;

  const timerPct = (() => {
    const dur = PHASE_DURATIONS[ff.timerPhase] ?? 15000;
    if (dur === 0) return 0;
    return Math.max(0, Math.min(100, (timerSecs / (dur / 1000)) * 100));
  })();

  const timerClass =
    timerPct > 50
      ? 'ff-timer-fill'
      : timerPct > 25
        ? 'ff-timer-fill ff-timer-fill--warning'
        : 'ff-timer-fill ff-timer-fill--danger';

  // ── Render: loading ───────────────────────────────────────────────────────
  if (ff.status === 'idle') {
    return (
      <div className="ff-container ff-container--loading" aria-live="polite">
        <p>Loading Famous Figures…</p>
      </div>
    );
  }

  // ── Render: personal waiting screen (all personal rounds done) ────────────
  // Shown only when the human has finished ALL their personal rounds and the
  // global match hasn't yet completed.  Mid-round advancement is handled by
  // showing the next figure immediately in the round_active render below.
  if (humanAllDone) {
    const humanTotal = humanId ? (ff.playerScores[humanId] ?? 0) : 0;
    const personalScores = humanId ? (ff.playerPersonalRoundScores[humanId] ?? []) : [];
    const allRoundScores = Array.from(
      { length: ff.totalRounds },
      (_, i) => personalScores[i] ?? 0,
    );
    return (
      <div className="ff-container ff-container--waiting">
        <div className="ff-header">
          <span className="ff-comp-badge">{prizeType}</span>
          <span className="ff-title">Famous Figures</span>
          <span className="ff-round-badge">Your Rounds Done!</span>
        </div>

        <div className="ff-personal-results">
          <div className="ff-personal-results-title">Your Results</div>
          <div className="ff-personal-results-score">{humanTotal} pts</div>
          <div className="ff-personal-results-rounds">
            [{allRoundScores.join(', ')}]
          </div>
        </div>

        <div className="ff-waiting-banner" aria-live="polite">
          ⏳ Waiting for other players to finish…
          {remainingPlayersCount > 0 && (
            <span className="ff-waiting-banner-sub">
              {remainingPlayersCount} player{remainingPlayersCount !== 1 ? 's' : ''} still playing
            </span>
          )}
        </div>

        <button
          className="ff-fastforward-btn ff-fastforward-btn--finish"
          onClick={handleFinishMatch}
          type="button"
          aria-label="Finish match and see results"
        >
          🏁 Finish Match
        </button>

        {renderScoreboard(ff, participantIds, humanId, displayName, playerAvatar)}
      </div>
    );
  }

  // ── Render: complete ──────────────────────────────────────────────────────
  if (ff.status === 'complete') {
    const winnerId = ff.winnerId ?? '';
    const winnerName = displayName(winnerId);
    const isHumanWinner = winnerId === humanId;

    if (skipWinnerAnimation) {
      // Show the final scoreboard immediately — no trophy animation.
      return (
        <div className="ff-container ff-container--complete ff-container--final-scores" aria-live="assertive">
          <div className="ff-header">
            <span className="ff-comp-badge">{prizeType}</span>
            <span className="ff-title">Famous Figures</span>
            <span className="ff-round-badge">Final Results</span>
          </div>
          <MinigameCompleteWrapper
            onContinue={() => onComplete?.()}
            continueLabel="Continue ›"
            continueButtonClassName="ff-continue-btn"
            placementsNode={renderScoreboard(ff, participantIds, humanId, displayName, playerAvatar)}
          >
            <div className="ff-winner-banner" role="status">
              🏆&nbsp;{winnerName}
              {isHumanWinner && <span className="ff-you-badge"> (You!)</span>}
              &nbsp;wins!&nbsp;
              <span className="ff-winner-banner-sub">{prizeType} Winner — {ff.playerScores[winnerId] ?? 0} pts</span>
            </div>
          </MinigameCompleteWrapper>
        </div>
      );
    }

    // Original animated winner card (skipWinnerAnimation === false)
    return (
      <div className="ff-container ff-container--complete" aria-live="assertive">
        <MinigameCompleteWrapper
          onContinue={() => onComplete?.()}
          continueLabel="Continue ›"
          continueButtonClassName="ff-continue-btn"
        >
          <div className="ff-winner-card">
            <div className="ff-winner-trophy" aria-hidden="true">🏆</div>
            <h2 className="ff-winner-title">Famous Figures Champion!</h2>
            <div className="ff-winner-avatar">
              <img
                src={playerAvatar(winnerId)}
                alt={winnerName}
                onError={(e) => { e.currentTarget.src = getDicebear(winnerName); }}
              />
            </div>
            <p className="ff-winner-name">
              {winnerName}
              {isHumanWinner && <span className="ff-you-badge"> (You!)</span>}
            </p>
            <p className="ff-winner-subtitle">
              {prizeType} Winner — Total Score: {ff.playerScores[winnerId] ?? 0}
            </p>
          </div>
        </MinigameCompleteWrapper>
      </div>
    );
  }

  // ── Render: reveal ────────────────────────────────────────────────────────
  if (ff.status === 'round_reveal') {
    const winnersThisRound = ff.correctPlayers;
    return (
      <div className="ff-container" data-status="round_reveal">
        <div className="ff-header">
          <span className="ff-comp-badge">{prizeType}</span>
          <span className="ff-title">Famous Figures</span>
          <span className="ff-round-badge">Round {ff.currentRound + 1} of {ff.totalRounds}</span>
        </div>

        <p className="ff-narration" aria-live="polite">
          {pickLine(NARRATION.reveal, ff.currentRound)}
        </p>

        <div className="ff-reveal-card" aria-live="assertive">
          <div className="ff-reveal-label">The Answer Was</div>
          <div className="ff-reveal-name">{figure?.canonicalName ?? '—'}</div>
          {winnersThisRound.length > 0 ? (
            <div className="ff-reveal-winners">
              ✅ Correct: {winnersThisRound.map((id) => displayName(id)).join(', ')}
            </div>
          ) : (
            <div className="ff-reveal-no-winner">No one guessed correctly this round!</div>
          )}
        </div>

        {renderScoreboard(ff, participantIds, humanId, displayName, playerAvatar)}

        <p style={{ fontSize: '0.75rem', color: '#557799', margin: 0 }}>
          Next round loading…
        </p>
      </div>
    );
  }

  // ── Render: round_active ──────────────────────────────────────────────────
  const inputFieldClass = [
    'ff-input-field',
    inputState === 'wrong' ? 'ff-input-field--shake' : '',
  ].filter(Boolean).join(' ');

  const feedbackMsg =
    inputState === 'wrong' ? '❌ Not quite, try again!' :
    inputState === 'duplicate' ? 'Already guessed that.' : '';

  const feedbackClass =
    inputState === 'wrong' ? 'ff-input-feedback ff-input-feedback--wrong' :
    inputState === 'duplicate' ? 'ff-input-feedback ff-input-feedback--duplicate' :
    'ff-input-feedback';

  // Show the human's personal round number (cursor + 1) when they are ahead,
  // otherwise show the global round number.
  const displayRound = humanIsAhead ? humanCursor + 1 : ff.currentRound + 1;

  return (
    <div className="ff-container" data-status="round_active">
      {/* Header */}
      <div className="ff-header">
        <span className="ff-comp-badge">{prizeType}</span>
        <span className="ff-title">Famous Figures</span>
        <span className="ff-round-badge">Round {displayRound} of {ff.totalRounds}</span>
      </div>

      {/* Narration */}
      <p className="ff-narration" aria-live="polite">
        {pickLine(NARRATION.roundStart, humanCursor)}
      </p>

      {/* Timer — stay visible during active rounds, including ahead-play. */}
      {ff.status === 'round_active' && !humanAllDone && (
        <div
          className="ff-timer"
          aria-label={`Timer: ${timerSecs} seconds remaining`}
          role="timer"
        >
          <div className="ff-timer-bar">
            <div
              className={timerClass}
              style={{ width: `${timerPct}%` }}
              aria-hidden="true"
            />
          </div>
          <span className="ff-timer-label">{timerSecs}s</span>
        </div>
      )}

      {/* Clue card */}
      {figure && (
        <div className="ff-clue-card" role="region" aria-label="Current clue">
          <div className="ff-clue-label">Clue</div>
          <p className="ff-base-clue">{figure.baseClueFact}</p>
          {effectiveHintsRevealed > 0 && (
            <ul className="ff-hint-list" aria-label="Revealed hints">
              {Array.from({ length: effectiveHintsRevealed }, (_, i) => (
                <li key={i} className="ff-hint-item">
                  <span className="ff-hint-num">#{i + 1}</span>
                  <span>{getHintText(figure, i)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Request hint button */}
      <button
        className="ff-hint-btn"
        onClick={handleRequestHint}
        disabled={!canRequestHint}
        aria-label={`Request hint (${5 - effectiveHintsRevealed} remaining)`}
      >
        💡 Request Hint ({effectiveHintsRevealed}/5 used)
      </button>

      {/* Success confirmation overlay — shown for CONFIRM_MS after a correct guess */}
      {successOverlay && (
        <div className="ff-success-overlay" role="status" aria-live="assertive" data-testid="ff-success-overlay">
          <div className="ff-success-overlay-inner">
            <div className="ff-success-checkmark" aria-hidden="true">✅</div>
            <div className="ff-success-title">Correct!</div>
            <div className="ff-success-figure">{successOverlay.figureName}</div>
            <div className="ff-success-points">+{successOverlay.points} points</div>
          </div>
        </div>
      )}

      {/* Guess input */}
      <div className="ff-input-area">
        <div className="ff-input-row">
          <input
            ref={inputRef}
            className={inputFieldClass}
            type="text"
            value={guessInput}
            onChange={(e) => setGuessInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your guess…"
            aria-label="Guess the famous figure"
            disabled={ff.status !== 'round_active' || successOverlay !== null || humanCorrect || humanId === null || humanCursor >= ff.totalRounds}
          />
          <button
            className="ff-submit-btn"
            onClick={handleSubmitGuess}
            disabled={ff.status !== 'round_active' || successOverlay !== null || humanCorrect || humanId === null || guessInput.trim().length === 0 || humanCursor >= ff.totalRounds}
            aria-label="Submit guess"
          >
            Submit
          </button>
        </div>
        <div className={feedbackClass} aria-live="assertive">
          {feedbackMsg}
        </div>
      </div>

      {/* Scoreboard */}
      {renderScoreboard(ff, participantIds, humanId, displayName, playerAvatar)}
    </div>
  );
}

// ─── Scoreboard helper ────────────────────────────────────────────────────────

function renderScoreboard(
  ff: FamousFiguresState,
  participantIds: string[],
  humanId: string | null,
  displayName: (id: string) => string,
  playerAvatar: (id: string) => string,
) {
  const sorted = [...participantIds].sort(
    (a, b) => (ff.playerScores[b] ?? 0) - (ff.playerScores[a] ?? 0),
  );

  return (
    <div className="ff-scoreboard" aria-label="Scoreboard">
      <div className="ff-scoreboard-title">Scoreboard</div>
      <div className="ff-scoreboard-list">
        {sorted.map((id) => {
          const isHuman = id === humanId;
          const name = displayName(id);
          const total = ff.playerScores[id] ?? 0;
          const roundScores = ff.playerRoundScores[id] ?? [];
          const correct = ff.playerCorrect[id];
          return (
            <div key={id} className="ff-scoreboard-row">
              <span className="ff-scoreboard-avatar-wrap">
                <img
                  className="ff-scoreboard-avatar"
                  src={playerAvatar(id)}
                  alt=""
                  aria-hidden="true"
                  onError={(e) => {
                    const img = e.currentTarget;
                    // one-shot fallback to Dicebear to avoid infinite onError loop
                    img.onerror = null;
                    img.src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(name)}`;