import { useNavigate } from 'react-router-dom';
import './Rules.css';

/**
 * Rules — game rules screen.
 * Content sourced from georgi-cole/bbmobile js/rules.js.
 */
export default function Rules() {
  const navigate = useNavigate();

  return (
    <div className="placeholder-screen rules-screen">
      <h1 className="placeholder-screen__title">📋 Game Rules</h1>

      <div className="rules-screen__body">
        <p><strong>Welcome to Big Brother!</strong></p>
        <p>
          Step inside the house and get ready for the ultimate social strategy
          game. Before you dive in, here&apos;s how it all works:
        </p>

        <h3 className="rules-screen__heading">1. Weekly Cycle</h3>
        <p>Every &ldquo;week&rdquo; follows the classic Big Brother rhythm: HOH → Nominations → Veto → Eviction.</p>
        <p>The system handles the competitions, nominations, and votes — but social dynamics shape the outcomes.</p>

        <h3 className="rules-screen__heading">2. Competitions</h3>
        <p>HOH &amp; Veto challenges are decided by competition scores (some houseguests are stronger in certain areas, others weaker).</p>
        <p>Scores are influenced by luck, traits, and sometimes twists.</p>
        <p>Winning matters, but so does staying on good terms with others — power can make you a target.</p>

        <h3 className="rules-screen__heading">3. Social Interactions</h3>
        <p>Houseguests form friendships, rivalries, and alliances that shift week to week.</p>
        <p>Votes are not random — they reflect these relationships.</p>
        <p>Don&apos;t underestimate social influence: even a weak competitor can survive if they&apos;re well-connected.</p>

        <h3 className="rules-screen__heading">4. Eviction &amp; Jury</h3>
        <p>Each week, one nominee is evicted by a house vote.</p>
        <p>Once the Jury phase begins, evicted houseguests don&apos;t leave for good — they&apos;ll vote for the winner at the finale.</p>
        <p>Even if you&apos;re out, your influence on the game continues.</p>

        <h3 className="rules-screen__heading">4b. Final Week &amp; Three-Part Final Competition</h3>
        <p>When only three houseguests remain, the endgame unfolds with a special three-part competition.</p>
        <p><strong>Part 1:</strong> All three compete. The houseguest with the highest score advances directly to Part 3.</p>
        <p><strong>Part 2:</strong> The two losers from Part 1 face off head-to-head. The winner advances to Part 3.</p>
        <p><strong>Part 3:</strong> The winners of Parts 1 and 2 compete in the final showdown. The winner becomes the Final HOH.</p>
        <p>
          The Final HOH then holds a live eviction ceremony, choosing which of the
          other two houseguests to evict. The evicted houseguest joins the jury,
          while the Final 2 await the jury&apos;s vote.
        </p>
        <p>This format ensures that competition performance matters right up until the very end.</p>

        <h3 className="rules-screen__heading">5. Twists &amp; Surprises</h3>
        <p>This isn&apos;t just a straight line to the end — expect twists that may shake the house.</p>
        <p>Evicted? Don&apos;t give up. Some twists may bring players back or change the course of the game.</p>

        <h3 className="rules-screen__heading">6. Progress &amp; Scoreboard</h3>
        <p>Finishing a game adds to your scoreboard.</p>
        <p>Higher scores unlock new levels, enhancements, and extra twists in future games.</p>
        <p>Every game you play helps you grow stronger and adds replay value.</p>

        <h3 className="rules-screen__heading">7. Customization &amp; Settings</h3>
        <p>Before starting, you may customize the cast (names, looks, personalities).</p>
        <p>Settings allow you to adjust options such as competition randomness, difficulty, and enabled twists.</p>
        <p>Once the game starts, the house runs on its own — sit back and see how the story unfolds.</p>
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
