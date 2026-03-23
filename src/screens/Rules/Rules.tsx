import { useNavigate } from 'react-router-dom';
import './Rules.css';

/**
 * Rules — game rules screen.
 */
export default function Rules() {
  const navigate = useNavigate();

  return (
    <div className="placeholder-screen rules-screen">
      <div className="rules-screen__hero">
        <div className="rules-screen__logo">EW</div>
        <h1 className="rules-screen__title">How to Play</h1>
        <p className="rules-screen__subtitle">EverWatch — Always Watching</p>
      </div>

      <div className="rules-screen__body">

        {/* ── Section 1: Daily Cycle ── */}
        <div className="rules-section">
          <div className="rules-section__header">
            <span className="rules-section__icon">🔄</span>
            <h2 className="rules-section__title">The Daily Cycle</h2>
          </div>
          <p>
            Each day follows the same rhythm — compete, nominate, compete again, then vote:
          </p>
          <div className="rules-cycle">
            <div className="rules-cycle__step">
              <span className="rules-cycle__badge rules-cycle__badge--loh">LOH</span>
              <span className="rules-cycle__label">Leader of the House Competition</span>
            </div>
            <span className="rules-cycle__arrow">→</span>
            <div className="rules-cycle__step">
              <span className="rules-cycle__badge rules-cycle__badge--nom">NOMS</span>
              <span className="rules-cycle__label">Nominations</span>
            </div>
            <span className="rules-cycle__arrow">→</span>
            <div className="rules-cycle__step">
              <span className="rules-cycle__badge rules-cycle__badge--pos">POS</span>
              <span className="rules-cycle__label">Power of Safety</span>
            </div>
            <span className="rules-cycle__arrow">→</span>
            <div className="rules-cycle__step">
              <span className="rules-cycle__badge rules-cycle__badge--elim">VOTE</span>
              <span className="rules-cycle__label">House Vote &amp; Elimination</span>
            </div>
          </div>
          <p className="rules-screen__note">
            The system handles competitions and votes — social dynamics shape the outcomes.
          </p>
        </div>

        {/* ── Section 2: Competitions ── */}
        <div className="rules-section">
          <div className="rules-section__header">
            <span className="rules-section__icon">🏆</span>
            <h2 className="rules-section__title">Competitions</h2>
          </div>
          <ul className="rules-list">
            <li>
              <strong>Leader of the House (LOH):</strong> Win to gain control — nominate two housemates for elimination. Power protects you, but it can also make you a target.
            </li>
            <li>
              <strong>Power of Safety (POS):</strong> Six players compete. The winner can save a nominee, forcing the LOH to name a backup nominee — or keep nominations unchanged.
            </li>
            <li>
              Scores are influenced by luck, housemate traits, and sometimes Shocks.
            </li>
          </ul>
        </div>

        {/* ── Section 3: Public Meter ── */}
        <div className="rules-section rules-section--highlight">
          <div className="rules-section__header">
            <span className="rules-section__icon">📊</span>
            <h2 className="rules-section__title">The Public Meter</h2>
            <span className="rules-section__tag">EverWatch Feature</span>
          </div>
          <p>
            The Public is always watching. Every housemate has a <strong>Public Approval rating</strong> (0–100) that rises and falls based on their actions in the house.
          </p>
          <div className="rules-approval-bands">
            <div className="rules-approval-band rules-approval-band--hated">0–19 · Hated</div>
            <div className="rules-approval-band rules-approval-band--disliked">20–39 · Disliked</div>
            <div className="rules-approval-band rules-approval-band--mixed">40–59 · Mixed</div>
            <div className="rules-approval-band rules-approval-band--liked">60–79 · Liked</div>
            <div className="rules-approval-band rules-approval-band--beloved">80–100 · Beloved</div>
          </div>
          <ul className="rules-list">
            <li><strong>Winning competitions</strong> boosts your approval.</li>
            <li><strong>Being nominated</strong> lowers it.</li>
            <li><strong>Social interactions</strong> — positive or negative — move the dial.</li>
            <li>
              <strong>Public Save (when enabled):</strong> Before the Power of Safety competition, the Public automatically saves the most-approved nominee, reducing the block to two housemates. The saved housemate is immune for that day.
            </li>
            <li>
              <strong>Finale:</strong> If the Tribunal vote is tied, the housemate with the higher Public approval wins the game.
            </li>
          </ul>
        </div>

        {/* ── Section 4: Social Interactions ── */}
        <div className="rules-section">
          <div className="rules-section__header">
            <span className="rules-section__icon">🤝</span>
            <h2 className="rules-section__title">Social Interactions</h2>
          </div>
          <ul className="rules-list">
            <li>Housemates form friendships, rivalries, and alliances that shift day to day.</li>
            <li>Votes reflect these relationships — they are not random.</li>
            <li>Even a weak competitor can survive through strong social bonds.</li>
            <li>Your social energy is limited each day — spend it wisely.</li>
          </ul>
        </div>

        {/* ── Section 5: Elimination & Tribunal ── */}
        <div className="rules-section">
          <div className="rules-section__header">
            <span className="rules-section__icon">🚪</span>
            <h2 className="rules-section__title">Elimination &amp; The Tribunal</h2>
          </div>
          <ul className="rules-list">
            <li>Each day, the house votes to eliminate one of the nominees.</li>
            <li>
              Once the <strong>Tribunal phase</strong> begins, eliminated housemates join the Tribunal panel instead of going home for good.
            </li>
            <li>Tribunal judges vote for the winner at the finale — your actions before elimination matter.</li>
          </ul>
        </div>

        {/* ── Section 6: Final Day ── */}
        <div className="rules-section">
          <div className="rules-section__header">
            <span className="rules-section__icon">👑</span>
            <h2 className="rules-section__title">Final Day — Three-Part Competition</h2>
          </div>
          <p>When only three housemates remain, the endgame begins:</p>
          <div className="rules-final-parts">
            <div className="rules-final-part">
              <span className="rules-final-part__num">P1</span>
              <p>All three compete. Top scorer advances to Part 3.</p>
            </div>
            <div className="rules-final-part">
              <span className="rules-final-part__num">P2</span>
              <p>The remaining two face off. Winner advances to Part 3.</p>
            </div>
            <div className="rules-final-part">
              <span className="rules-final-part__num">P3</span>
              <p>P1 &amp; P2 winners compete. The winner becomes the <strong>Final LOH</strong> and chooses who to eliminate.</p>
            </div>
          </div>
          <p className="rules-screen__note">The eliminated housemate joins the Tribunal. The Final 2 await the Tribunal&apos;s vote.</p>
        </div>

        {/* ── Section 7: Shocks ── */}
        <div className="rules-section">
          <div className="rules-section__header">
            <span className="rules-section__icon">⚡</span>
            <h2 className="rules-section__title">Shocks &amp; Surprises</h2>
          </div>
          <p>Expect Shocks that can change the course of the game — double eliminations, special powers, and more. Eliminated? Some Shocks can bring players back.</p>
        </div>

        {/* ── Section 8: Progress ── */}
        <div className="rules-section">
          <div className="rules-section__header">
            <span className="rules-section__icon">📈</span>
            <h2 className="rules-section__title">Progress &amp; Settings</h2>
          </div>
          <ul className="rules-list">
            <li>Finishing a game adds to your scoreboard. Higher scores unlock new levels and extra Shocks.</li>
            <li>Customize the cast and adjust settings — competition randomness, difficulty, and enabled Shocks — before starting.</li>
            <li>Once the game starts, sit back and watch the story unfold.</li>
          </ul>
        </div>

      </div>

      <button
        className="rules-screen__back"
        type="button"
        onClick={() => navigate(-1)}
      >
        ← Back
      </button>
    </div>
  );
}
