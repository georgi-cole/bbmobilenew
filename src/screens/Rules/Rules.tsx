import { useNavigate } from 'react-router-dom';
import './Rules.css';

/**
 * Rules - player guide screen.
 */
export default function Rules() {
  const navigate = useNavigate();

  return (
    <div className="placeholder-screen rules-screen">
      <div className="rules-screen__hero">
        <div className="rules-screen__logo">BE</div>
        <h1 className="rules-screen__title">How to Play</h1>
        <p className="rules-screen__subtitle">The Big Eye - Player Guide</p>
        <p className="rules-screen__note">
          A player guide for the weekly loop, the challenge ranking, and the decisions that matter
          most. Surprise weeks are explained when they happen.
        </p>
      </div>

      <div className="rules-screen__body">
        <div className="rules-section">
          <div className="rules-section__header">
            <span className="rules-section__icon" aria-hidden="true">01</span>
            <h2 className="rules-section__title">Your Goal</h2>
          </div>
          <p>
            Stay in the game, build real relationships, and reach the final vote with the right
            mix of wins, timing, and social control.
          </p>
          <ul className="rules-list">
            <li>Keep your name off the nominee list when you can.</li>
            <li>Win the moments that matter most.</li>
            <li>Make the endgame with enough support to finish the job.</li>
          </ul>
        </div>

        <div className="rules-section">
          <div className="rules-section__header">
            <span className="rules-section__icon" aria-hidden="true">02</span>
            <h2 className="rules-section__title">Weekly Loop</h2>
          </div>
          <p>
            Most weeks follow the same rhythm: compete, nominate, save, then vote. The TV feed
            and on-screen prompts tell you when the next step starts.
          </p>
          <div className="rules-cycle">
            <div className="rules-cycle__step">
              <span className="rules-cycle__badge rules-cycle__badge--loh">LOH</span>
              <span className="rules-cycle__label">Lead the week</span>
            </div>
            <span className="rules-cycle__arrow">-&gt;</span>
            <div className="rules-cycle__step">
              <span className="rules-cycle__badge rules-cycle__badge--nom">NOMS</span>
              <span className="rules-cycle__label">Nominees named</span>
            </div>
            <span className="rules-cycle__arrow">-&gt;</span>
            <div className="rules-cycle__step">
              <span className="rules-cycle__badge rules-cycle__badge--public">PUBLIC</span>
              <span className="rules-cycle__label">Public mode only</span>
            </div>
            <span className="rules-cycle__arrow">-&gt;</span>
            <div className="rules-cycle__step">
              <span className="rules-cycle__badge rules-cycle__badge--pos">POS</span>
              <span className="rules-cycle__label">Safety is decided</span>
            </div>
            <span className="rules-cycle__arrow">-&gt;</span>
            <div className="rules-cycle__step">
              <span className="rules-cycle__badge rules-cycle__badge--elim">VOTE</span>
              <span className="rules-cycle__label">Live vote</span>
            </div>
          </div>
          <p className="rules-screen__note">
            Public mode adds an extra approval step before safety.
          </p>
        </div>

        <div className="rules-section">
          <div className="rules-section__header">
            <span className="rules-section__icon" aria-hidden="true">03</span>
            <h2 className="rules-section__title">Challenges and Ranking</h2>
          </div>
          <p>
            Each challenge opens with its own rules card. Read it before you start, because the
            result can be a score, a time, or a placement ladder.
          </p>
          <ul className="rules-list">
            <li>Some challenges reward the highest score.</li>
            <li>Some reward the fastest time or the best survival run.</li>
            <li>Some show a ranked leaderboard where placement is the result.</li>
            <li>When the game says ranking, the order on the board is what counts.</li>
          </ul>
        </div>

        <div className="rules-section">
          <div className="rules-section__header">
            <span className="rules-section__icon" aria-hidden="true">04</span>
            <h2 className="rules-section__title">Control and Safety</h2>
          </div>
          <p>
            The Leader of the House controls the nominees. The Power of Safety winner can save one
            nominee, including themselves if they are nominated, but that choice is never required.
          </p>
          <ul className="rules-list">
            <li>
              <strong>Leader of the House:</strong> The LOH wins the round and names the nominees
              for the week.
            </li>
            <li>
              <strong>Power of Safety:</strong> The winner can save one nominee. If they are
              nominated, saving themselves is allowed but not mandatory.
            </li>
            <li>
              <strong>Replacement nominee:</strong> When a save happens, the LOH names a backup
              nominee if the week needs one.
            </li>
            <li>
              <strong>Public seasons:</strong> A public save can happen before safety and can
              change who goes into the next step.
            </li>
          </ul>
        </div>

        <div className="rules-section rules-section--highlight">
          <div className="rules-section__header">
            <span className="rules-section__icon" aria-hidden="true">05</span>
            <h2 className="rules-section__title">Social Game and Public Mode</h2>
          </div>
          <p>
            The social module is your day-to-day move set. Use it during social windows to spend
            energy, influence, and info, shape relationships, and set up future moves.
          </p>
          <ul className="rules-list">
            <li>Public mode adds a public approval meter for each player.</li>
            <li>Approval moves with wins, nominations, saves, and public tasks.</li>
            <li>Strong approval can help in a public save, influence public tie-breaks, and matter at the end of the season.</li>
            <li>If public mode is off, the season plays on the standard private rules.</li>
          </ul>
        </div>

        <div className="rules-section">
          <div className="rules-section__header">
            <span className="rules-section__icon" aria-hidden="true">06</span>
            <h2 className="rules-section__title">Private Room</h2>
          </div>
          <p>
            The confessional is the private decision room. When the game needs a direct answer,
            this is where it sends you.
          </p>
          <ul className="rules-list">
            <li>Nomination picks.</li>
            <li>Safety decisions.</li>
            <li>Replacement choices.</li>
            <li>Tie-breaks.</li>
            <li>Mission offers and one-off prompts.</li>
          </ul>
        </div>

        <div className="rules-section">
          <div className="rules-section__header">
            <span className="rules-section__icon" aria-hidden="true">07</span>
            <h2 className="rules-section__title">Elimination and Finale</h2>
          </div>
          <p>
            Nominees face the live vote, and the loser leaves the game. Most ties go to the
            Leader of the House unless the current week says otherwise.
          </p>
          <ul className="rules-list">
            <li>Some weeks are compressed or reshaped with special elimination formats, return rounds, or double exits.</li>
            <li>You do not need to memorize every surprise ahead of time. The game explains the change when it appears.</li>
            <li>Final 4: the safety winner makes the last elimination choice.</li>
            <li>Final 3: three parts decide the Final Leader of the House and the last eviction.</li>
            <li>Final 2: the final panel votes for the winner.</li>
            <li>If public favorite is enabled, it appears after the champion is revealed.</li>
          </ul>
        </div>
      </div>

      <button
        className="rules-screen__back"
        type="button"
        onClick={() => navigate(-1)}
      >
        Back
      </button>
    </div>
  );
}
