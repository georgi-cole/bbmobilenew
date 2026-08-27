/**
 * TribunalMemberStage — cinematic full-body reveal for each tribunal juror.
 *
 * Replaces the plain JurorBubble list during the 'clues' (phase 1) act of
 * FinalFaceoff.  Each juror enters center-stage one at a time using their
 * formal-attire full-body cutout from `public/assets/formal_attires/`.
 *
 * Layout:
 *   - Dark, vignette backdrop with studio-light glow behind the cutout.
 *   - Juror name plate animates in above the cutout.
 *   - Cryptic phrase animates in inside a comic speech balloon coming from the
 *     cutout, simulating them "addressing the audience" before casting their
 *     hidden vote.
 *   - A row of small portrait chips at the bottom keeps a visual record of
 *     previously revealed jurors.
 *   - Human vote prompt slides in when it is the viewer's turn.
 */
import { useEffect, useState } from 'react';
import type { Player } from '../../types';
import type { JurorReveal } from '../../store/finaleSlice';
import { PUBLIC_JUROR_ID } from '../../store/finaleSlice';
import {
  resolveFormalCutout,
  resolveFullSizeCutoutFallback,
  resolveSilhouetteFallback,
} from '../../utils/avatar';
import PlayerAvatar from '../PlayerAvatar/PlayerAvatar';
import {
  PHRASE_TYPING_CHAR_INTERVAL_MS,
  PHRASE_TYPING_START_DELAY_MS,
} from './tribunalMemberStageTiming';
import './TribunalMemberStage.css';

interface JurorEntry {
  juror: Player;
  reveal: JurorReveal;
}

interface Props {
  /** All jurors that have been revealed so far (in reveal order). */
  revealedJurors: JurorEntry[];
  /** Finalists the human can vote for (null when it is not a human's turn). */
  awaitingHumanPlayer: Player | null;
  finalists: Player[];
  onCastVote: (finalistId: string) => void;
}

/** Constructs a URL for a Public Vote virtual juror. */
function PublicCutoutPlaceholder() {
  return (
    <div className="tms-public-placeholder" aria-hidden="true">
      <span className="tms-public-globe">🌐</span>
    </div>
  );
}

function SilhouetteAvatar({ player }: { player: Player }) {
  return (
    <img
      className="tms-vote-prompt__avatar"
      src={resolveSilhouetteFallback(player)}
      alt={player.name}
      draggable={false}
    />
  );
}

function PhraseTyper({ phrase }: { phrase: string }) {
  const [visibleChars, setVisibleChars] = useState(0);

  useEffect(() => {
    if (!phrase) return undefined;

    let charIndex = 0;
    let typingTimeout: ReturnType<typeof setTimeout> | null = null;
    const startDelay = setTimeout(() => {
      const typeNext = () => {
        charIndex += 1;
        setVisibleChars(charIndex);
        if (charIndex < phrase.length) {
          typingTimeout = setTimeout(typeNext, PHRASE_TYPING_CHAR_INTERVAL_MS);
        }
      };

      typeNext();
    }, PHRASE_TYPING_START_DELAY_MS);

    return () => {
      clearTimeout(startDelay);
      if (typingTimeout) clearTimeout(typingTimeout);
    };
  }, [phrase]);

  return (
    <p className="tms-phrase">
      {phrase.slice(0, visibleChars)}
    </p>
  );
}

export default function TribunalMemberStage({
  revealedJurors,
  awaitingHumanPlayer,
  finalists,
  onCastVote,
}: Props) {
  const current = revealedJurors.at(-1) ?? null;
  const previous = revealedJurors.slice(0, -1);

  const currentJurorId = current?.juror.id ?? null;
  const currentPhrase = current?.reveal.phrase ?? '';
  const trimmedCurrentPhrase = currentPhrase.trim();
  const currentAnimationKey = currentJurorId ?? 'pending';
  const phraseAnimationKey = `${currentAnimationKey}-${currentPhrase}`;
  const [failedCutoutId, setFailedCutoutId] = useState<string | null>(null);

  if (!current && !awaitingHumanPlayer) return null;

  const isPublic = current?.juror.id === PUBLIC_JUROR_ID;
  const formalSrc = current && !isPublic ? resolveFormalCutout(current.juror) : null;
  const fallbackSrc = current && !isPublic ? resolveFullSizeCutoutFallback(current.juror) : null;
  const cutoutSrc = current && !isPublic
    ? failedCutoutId === current.juror.id || !formalSrc
      ? fallbackSrc
      : formalSrc
    : null;
  const currentAnnouncement = current
    ? trimmedCurrentPhrase
      ? `${isPublic ? 'The Public' : current.juror.name}. ${trimmedCurrentPhrase}`
      : (isPublic ? 'The Public' : current.juror.name)
    : awaitingHumanPlayer
      ? `${awaitingHumanPlayer.name}, cast your Tribunal vote.`
      : '';

  return (
    <div className="tms-stage">
      {currentAnnouncement && (
        <div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
          {currentAnnouncement}
        </div>
      )}
      {/* ── Atmosphere ──────────────────────────────────────────────── */}
      <div className="tms-bg-vignette" aria-hidden="true" />
      <div className="tms-spotlight" aria-hidden="true" />

      {/* ── Previous juror chips ─────────────────────────────────────── */}
      {previous.length > 0 && (
        <div className="tms-previous" aria-label="Previous tribunal members">
          {previous.map(({ juror }) => (
            <span key={juror.id} className="tms-prev-chip" title={juror.name}>
              <PlayerAvatar player={juror} size="sm" showRelationshipOutline={false} showEvictedStyle={false} />
              <span className="tms-prev-name">{juror.name}</span>
            </span>
          ))}
        </div>
      )}

      {/* ── Name plate ──────────────────────────────────────────────── */}
      {current && (
        <div className="tms-nameplate" key={`name-${currentAnimationKey}`}>
          <span className="tms-nameplate__sequence">
            Testimony {String(revealedJurors.length).padStart(2, '0')}
          </span>
          <span className="tms-nameplate__eyebrow">Tribunal member</span>
          <span className="tms-nameplate__name">
            {isPublic ? 'The Public' : current.juror.name}
            {isPublic && <span className="tms-nameplate__public-badge">🌐</span>}
          </span>
        </div>
      )}

      {/* ── Full-body cutout ─────────────────────────────────────────── */}
      {current && (
        <div className="tms-cutout-wrap" key={`cutout-${currentAnimationKey}`}>
          {isPublic ? (
            <PublicCutoutPlaceholder />
          ) : cutoutSrc ? (
            <img
              className="tms-cutout"
              src={cutoutSrc}
              alt={current.juror.name}
              draggable={false}
              onError={() => {
                if (formalSrc && cutoutSrc !== fallbackSrc) {
                  setFailedCutoutId(current.juror.id);
                }
              }}
            />
          ) : (
            null
          )}
          <div className="tms-cutout-glow" aria-hidden="true" />
        </div>
      )}

      {current && trimmedCurrentPhrase && (
        <div className="tms-speech-bubble" key={`phrase-${phraseAnimationKey}`}>
          <PhraseTyper phrase={currentPhrase} />
        </div>
      )}

      {/* ── Human vote prompt ────────────────────────────────────────── */}
      {awaitingHumanPlayer && (
        <div className="tms-vote-prompt">
          <span className="tms-vote-prompt__text">
            <SilhouetteAvatar player={awaitingHumanPlayer} />
            {awaitingHumanPlayer.name}, cast your Tribunal vote:
          </span>
          <div className="tms-vote-choices">
            {finalists.map((f) => (
              <button
                key={f.id}
                type="button"
                className="tms-vote-choice"
                aria-label={`Cast Tribunal vote for ${f.name}`}
                onClick={() => onCastVote(f.id)}
              >
                <PlayerAvatar player={f} size="sm" showRelationshipOutline={false} />
                <span className="tms-vote-choice__role">Finalist</span>
                <span className="tms-vote-choice__name">{f.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
