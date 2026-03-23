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
        <p><strong>Welcome to The Big Eye!</strong></p>
        <p>
          Step inside the house and get ready for the ultimate social strategy
          game. Before you dive in, here&apos;s how it all works:
        </p>

        <h3 className="rules-screen__heading">1. Daily Cycle</h3>
        <p>Every &ldquo;day&rdquo; follows the classic The Big Eye rhythm: LOH → Nominations → Safety → Elimination.</p>
        <p>The system handles the competitions, nominations, and votes — but social dynamics shape the outcomes.</p>

        <h3 className="rules-screen__heading">2. Competitions</h3>
        <p>LOH &amp; Safety challenges are decided by competition scores (some housemates are stronger in certain areas, others weaker).</p>
        <p>Scores are influenced by luck, traits, and sometimes shocks.</p>
        <p>Winning matters, but so does staying on good terms with others — power can make you a target.</p>

        <h3 className="rules-screen__heading">3. Social Interactions</h3>
        <p>Housemates form friendships, rivalries, and alliances that shift day to day.</p>
        <p>Votes are not random — they reflect these relationships.</p>
        <p>Don&apos;t underestimate social influence: even a weak competitor can survive if they&apos;re well-connected.</p>

        <h3 className="rules-screen__heading">4. Elimination &amp; Tribunal</h3>
        <p>Each day, one nominee is eliminated by a house vote.</p>
        <p>Once the Tribunal phase begins, eliminated housemates don&apos;t leave for good — they&apos;ll vote for the winner at the finale.</p>
        <p>Even if you&apos;re out, your influence on the game continues.</p>

        <h3 className="rules-screen__heading">4b. Final Day &amp; Three-Part Final Competition</h3>
        <p>When only three housemates remain, the endgame unfolds with a special three-part competition.</p>
        <p><strong>Part 1:</strong> All three compete. The housemate with the highest score advances directly to Part 3.</p>
        <p><strong>Part 2:</strong> The two losers from Part 1 face off head-to-head. The winner advances to Part 3.</p>
        <p><strong>Part 3:</strong> The winners of Parts 1 and 2 compete in the final showdown. The winner becomes the Final LOH.</p>
        <p>
          The Final LOH then holds a live elimination ceremony, choosing which of the
          other two housemates to eliminate. The eliminated housemate joins the Tribunal,
          while the Final 2 await the Tribunal&apos;s vote.
        </p>
        <p>This format ensures that competition performance matters right up until the very end.</p>

        <h3 className="rules-screen__heading">5. Shocks &amp; Surprises</h3>
        <p>This isn&apos;t just a straight line to the end — expect shocks that may shake the house.</p>
        <p>Eliminated? Don&apos;t give up. Some shocks may bring players back or change the course of the game.</p>

        <h3 className="rules-screen__heading">6. Progress &amp; Scoreboard</h3>
        <p>Finishing a game adds to your scoreboard.</p>
        <p>Higher scores unlock new levels, enhancements, and extra shocks in future games.</p>
        <p>Every game you play helps you grow stronger and adds replay value.</p>

        <h3 className="rules-screen__heading">7. Customization &amp; Settings</h3>
        <p>Before starting, you may customize the cast (names, looks, personalities).</p>
        <p>Settings allow you to adjust options such as competition randomness, difficulty, and enabled shocks.</p>
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
