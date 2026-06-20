import { useNavigate } from 'react-router-dom';
import './Rules.css';

/**
 * Rules - game rules screen.
 */
export default function Rules() {
  const navigate = useNavigate();

  return (
    <div className="placeholder-screen rules-screen">
      <div className="rules-screen__hero">
        <div className="rules-screen__logo">BE</div>
        <h1 className="rules-screen__title">How to Play</h1>
        <p className="rules-screen__subtitle">The Big Eye - Always Watching</p>
        <p className="rules-screen__note">
          A quick guide to the round flow, the important choices, and the twists that can change a
          week.
        </p>
      </div>

      <div className="rules-screen__body">
        <div className="rules-section">
          <div className="rules-section__header">
            <span className="rules-section__icon">🎯</span>
            <h2 className="rules-section__title">Your Goal</h2>
          </div>
          <p>
            You play one contestant. Stay in the game, keep your relationships working for you,
            and make it to the final vote.
          </p>
          <ul className="rules-list">
            <li>Stay off the block when you can.</li>
            <li>Win the key rounds that matter.</li>
            <li>Reach the end and earn the final panel's vote.</li>
          </ul>
        </div>

        <div className="rules-section">
          <div className="rules-section__header">
            <span className="rules-section__icon">🔄</span>
            <h2 className="rules-section__title">Round Flow</h2>
          </div>
          <p>Most rounds follow the same order - compete, nominate, protect, then vote.</p>
          <div className="rules-cycle">
            <div className="rules-cycle__step">
              <span className="rules-cycle__badge rules-cycle__badge--loh">LOH</span>
              <span className="rules-cycle__label">Leader of the House</span>
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
              <span className="rules-cycle__label">Live vote</span>
            </div>
          </div>
          <p className="rules-screen__note">
            Watch the TV feed between steps. It tells you when something changes.
          </p>
        </div>

        <div className="rules-section">
          <div className="rules-section__header">
            <span className="rules-section__icon">👑</span>
            <h2 className="rules-section__title">Control and Safety</h2>
          </div>
          <ul className="rules-list">
            <li>
              <strong>Leader of the House:</strong> The LOH wins the round and controls the
              nominations. On a normal round, the LOH names two players.
            </li>
            <li>
              <strong>Power of Safety:</strong> The winner can save a nominee. If the winner is on
              the block, they have to use it on themselves. If they are safe, they can choose
              whether to use it.
            </li>
            <li>
              <strong>Replacement nominee:</strong> When a save happens, the LOH names a backup
              nominee if the round needs one.
            </li>
            <li>
              <strong>Public-influence seasons:</strong> Some seasons add a public save before the
              safety round, which can change the nominee count.
            </li>
          </ul>
        </div>

        <div className="rules-section rules-section--highlight">
          <div className="rules-section__header">
            <span className="rules-section__icon">🤝</span>
            <h2 className="rules-section__title">Read the Room</h2>
          </div>
          <p>
            This is a social game first. Alliances, promises, and rivalries matter just as much as
            competition wins.
          </p>
          <ul className="rules-list">
            <li>Talk to people often and keep your options open.</li>
            <li>The private room is where messages, missions, and special prompts show up.</li>
            <li>Public approval can help in seasons with public influence and can break the final tie.</li>
          </ul>
        </div>

        <div className="rules-section">
          <div className="rules-section__header">
            <span className="rules-section__icon">🚪</span>
            <h2 className="rules-section__title">Voting and Elimination</h2>
          </div>
          <ul className="rules-list">
            <li>Nominees fight to stay in the game at the live vote.</li>
            <li>When the vote is tied, the LOH usually breaks it.</li>
            <li>Players who leave usually join the final panel, which votes for the winner at the end.</li>
          </ul>
        </div>

        <div className="rules-section">
          <div className="rules-section__header">
            <span className="rules-section__icon">⚡</span>
            <h2 className="rules-section__title">Special Events</h2>
          </div>
          <ul className="rules-list">
            <li>Democracia can replace the normal LOH competition with a group vote.</li>
            <li>Double Eviction can remove two players in one week.</li>
            <li>Battle Back can bring a recent elimination back into play.</li>
            <li>Secret missions can reward powers like Double Vote or Vote Deduction.</li>
          </ul>
          <p className="rules-screen__note">
            When a twist appears, the TV feed and on-screen prompts tell you what to do next.
          </p>
        </div>

        <div className="rules-section">
          <div className="rules-section__header">
            <span className="rules-section__icon">👑</span>
            <h2 className="rules-section__title">Finale</h2>
          </div>
          <ul className="rules-list">
            <li>Final 4: the safety winner makes the last eviction choice.</li>
            <li>Final 3: three parts decide the Final LOH and the last eviction.</li>
            <li>Final 2: the final panel votes for the winner.</li>
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
