import { useNavigate } from 'react-router'
import './Rules.css'

type Tile = {
  kicker: string
  title: string
  copy: string
}

const HERO_TILES: Tile[] = [
  {
    kicker: '1',
    title: 'Win control',
    copy: 'Take the daily lead, shape the block, and keep the vote moving in your favor.',
  },
  {
    kicker: '2',
    title: 'Use public mode',
    copy: 'When public mode is on, the public approval meter can reshape the block before safety locks in.',
  },
  {
    kicker: '3',
    title: 'Play the social layer',
    copy: 'Energy, Influence, and Info power the social layer and change relationships over time.',
  },
  {
    kicker: '4',
    title: 'Finish the season',
    copy: 'Make it to the endgame, then earn enough Tribunal votes to win.',
  },
]

const DAY_STEPS: Tile[] = [
  {
    kicker: 'LOH',
    title: 'Compete for the lead',
    copy: 'Everyone still in the game can compete for control. The winner becomes the Leader of the House and starts the day in charge.',
  },
  {
    kicker: 'NOMS',
    title: 'Set the block',
    copy: 'The LOH names the nominees. Most days start with two people on the block, and public mode can add a third before safety.',
  },
  {
    kicker: 'POS',
    title: 'Decide safety',
    copy: 'The Power of Safety winner can save one nominee. If they are on the block, self-save is allowed but never forced.',
  },
  {
    kicker: 'VOTE',
    title: 'Live vote',
    copy: 'The remaining players vote to remove someone from the game. Some special days replace this with a different eviction step, and the broadcast says when that happens.',
  },
]

const RESULT_MODES: Tile[] = [
  {
    kicker: 'SCORE',
    title: 'Score',
    copy: 'Highest number wins.',
  },
  {
    kicker: 'TIME',
    title: 'Time',
    copy: 'Fastest time wins.',
  },
  {
    kicker: 'RANK',
    title: 'Placement',
    copy: 'The leaderboard order is the result, not just the raw number.',
  },
  {
    kicker: 'WIN',
    title: 'Direct result',
    copy: 'Some games decide the winner directly and show that outcome on the results screen.',
  },
]

const SOCIAL_RESOURCES: Tile[] = [
  {
    kicker: 'ENERGY',
    title: 'Energy',
    copy: 'Your action budget for the social windows and one-off pushes.',
  },
  {
    kicker: 'INFLUENCE',
    title: 'Influence',
    copy: 'Used by stronger social moves and sharper pushes when you want to swing a room.',
  },
  {
    kicker: 'INFO',
    title: 'Info',
    copy: 'Used by more specific or better timed social moves and reads.',
  },
  {
    kicker: 'APPROVAL',
    title: 'Approval',
    copy: 'The public approval meter that matters when public mode is active and can decide who gets saved.',
  },
]

const APPROVAL_BANDS: Tile[] = [
  {
    kicker: 'LOW',
    title: 'Low approval',
    copy: 'You are vulnerable and easy to target.',
  },
  {
    kicker: 'MID',
    title: 'Mixed approval',
    copy: 'You are visible, but not fully protected.',
  },
  {
    kicker: 'HIGH',
    title: 'Liked',
    copy: 'You have momentum and better public standing.',
  },
  {
    kicker: 'TOP',
    title: 'Beloved',
    copy: 'You are in a strong public position.',
  },
]

const CONFESSIONAL_DECISIONS: Tile[] = [
  {
    kicker: '01',
    title: 'Nomination picks',
    copy: 'The game asks you to name the block when it is your turn to lead, and the choice is immediate.',
  },
  {
    kicker: '02',
    title: 'Safety decisions',
    copy: 'The game asks whether to use the Power of Safety and who it should protect.',
  },
  {
    kicker: '03',
    title: 'Replacement picks',
    copy: 'If a save changes the block, a replacement nominee has to be named right away.',
  },
  {
    kicker: '04',
    title: 'Tie-breaks',
    copy: 'When the house is deadlocked, the deciding choice lands here.',
  },
  {
    kicker: '05',
    title: 'Secrets and missions',
    copy: 'Secret opportunities and mission offers can be hidden here, so read every prompt carefully.',
  },
]

const SPECIAL_DAY_NOTES: Tile[] = [
  {
    kicker: 'SHIFT',
    title: 'Compressed day',
    copy: 'The schedule can move faster than normal and some steps may land closer together.',
  },
  {
    kicker: 'RETURN',
    title: 'Return round',
    copy: 'A recently eliminated player can get a path back into the season.',
  },
  {
    kicker: 'SWAP',
    title: 'Rule swap',
    copy: 'The day can change shape, but the broadcast explains the new rule when it happens.',
  },
  {
    kicker: 'EVIC',
    title: 'Special eviction',
    copy: 'Some days skip the usual vote and end with a one-off eviction decision instead.',
  },
]

const TRIBUNAL_NOTES: Tile[] = [
  {
    kicker: 'MEMBERS',
    title: 'Who joins',
    copy: 'Once the Tribunal stage begins, eligible eliminated players become Tribunal members instead of leaving the season behind.',
  },
  {
    kicker: 'GAME',
    title: 'Every move matters',
    copy: 'Tribunal members remember your strategy, relationships, promises, and betrayals when judging the finalists.',
  },
  {
    kicker: 'VOTE',
    title: 'The final decision',
    copy: 'When only two finalists remain, each Tribunal member casts a vote for the player they want to win.',
  },
  {
    kicker: 'POWER',
    title: 'Your voice remains',
    copy: 'If you become a Tribunal member, your game is over but your final vote can still decide the champion.',
  },
]

const FINALE_STEPS: Tile[] = [
  {
    kicker: 'F4',
    title: 'Final 4',
    copy: 'The safety winner makes the last eviction choice before the final three are set.',
  },
  {
    kicker: 'P1',
    title: 'Part 1',
    copy: 'All three finalists compete, and the winner moves straight to the last part.',
  },
  {
    kicker: 'P2',
    title: 'Part 2',
    copy: 'The other two finalists battle for the second spot in the final round.',
  },
  {
    kicker: 'P3',
    title: 'Part 3',
    copy: 'The last winner becomes the final leader and chooses the Final 2.',
  },
  {
    kicker: 'F2',
    title: 'Final 2',
    copy: 'The Tribunal casts the final votes and chooses the winner.',
  },
  {
    kicker: 'BONUS',
    title: 'Public favorite',
    copy: 'If enabled, the season can end with one more public result after the winner is revealed.',
  },
]

function renderTile(tile: Tile, className = '') {
  return (
    <article
      key={`${tile.kicker}-${tile.title}`}
      className={['rules-tile', className].filter(Boolean).join(' ')}
    >
      <span className="rules-tile__kicker">{tile.kicker}</span>
      <h3 className="rules-tile__title">{tile.title}</h3>
      <p className="rules-tile__copy">{tile.copy}</p>
    </article>
  )
}

/**
 * Rules - player guide screen.
 */
export default function Rules() {
  const navigate = useNavigate()

  return (
    <div className="placeholder-screen rules-screen">
      <header className="rules-screen__hero">
        <div className="rules-screen__logo">BE</div>
        <div className="rules-screen__title-row">
          <h1 className="rules-screen__title">How to Play</h1>
          <button
            className="rules-screen__back"
            type="button"
            aria-label="Go back"
            onClick={() => navigate(-1)}
          >
            ↩
          </button>
        </div>
        <p className="rules-screen__subtitle">The Big Eye - Player Guide</p>
        <p className="rules-screen__lede">
          Learn the loop, read the meters, and know what each screen is asking before the season
          starts moving fast.
        </p>
        <div className="rules-screen__summary-grid">
          {HERO_TILES.map((tile) => renderTile(tile, 'rules-tile--hero'))}
        </div>
      </header>

      <main className="rules-screen__body">
        <section className="rules-section">
          <div className="rules-section__header">
            <span className="rules-section__icon" aria-hidden="true">
              01
            </span>
            <h2 className="rules-section__title">The Daily Loop</h2>
          </div>
          <p className="rules-section__intro">
            The game is built around a repeatable rhythm. Once you know the order, every day makes
            more sense: win the lead, set the block, use safety, then survive the vote.
          </p>
          <div className="rules-step-grid">
            {DAY_STEPS.map((tile) => renderTile(tile, 'rules-step-card'))}
          </div>
          <p className="rules-section__note">
            Public mode can add a third nominee before safety, and special days can change the
            order. The broadcast explains the live rule when it appears.
          </p>
        </section>

        <section className="rules-section">
          <div className="rules-section__header">
            <span className="rules-section__icon" aria-hidden="true">
              02
            </span>
            <h2 className="rules-section__title">Challenges and Ranking</h2>
          </div>
          <div className="rules-split">
            <div className="rules-split__main">
              <p className="rules-section__intro">
                Every minigame opens with its own rules card before the countdown starts. That card
                tells you exactly what matters, whether the round is about score, speed, placement,
                or a direct result.
              </p>
              <p className="rules-section__intro">
                If a game shows a leaderboard, the order on that board matters. If it says
                placement, rank is the result. If it says score or time, the metric on the card
                tells you what wins.
              </p>
            </div>
            <div className="rules-split__aside">
              <div className="rules-mode-grid">
                {RESULT_MODES.map((tile) => renderTile(tile, 'rules-mode-card'))}
              </div>
            </div>
          </div>
        </section>

        <section className="rules-section">
          <div className="rules-section__header">
            <span className="rules-section__icon" aria-hidden="true">
              03
            </span>
            <h2 className="rules-section__title">Control and Safety</h2>
          </div>
          <p className="rules-section__intro">
            The daily leader controls the nominations. The Power of Safety winner controls whether
            the block stays the same or gets reshaped, and if the holder is nominated, self-save is
            allowed but never forced.
          </p>
          <div className="rules-step-grid">
            {[
              {
                kicker: 'LOH',
                title: 'Leader of the House',
                copy: 'Wins the daily competition and names the nominees for the day.',
              },
              {
                kicker: 'POS',
                title: 'Power of Safety',
                copy: 'Can save one nominee. If the holder is nominated, self-save is allowed but never required.',
              },
              {
                kicker: 'BACKUP',
                title: 'Replacement nominee',
                copy: 'If a save changes the block, the LOH names a backup nominee right away.',
              },
              {
                kicker: 'PUBLIC',
                title: 'Public seasons',
                copy: 'When public mode is on, the day can add a public save before safety and adjust the block again.',
              },
            ].map((tile) => renderTile(tile, 'rules-step-card'))}
          </div>
        </section>

        <section className="rules-section rules-section--highlight">
          <div className="rules-section__header">
            <span className="rules-section__icon" aria-hidden="true">
              04
            </span>
            <h2 className="rules-section__title">Social Game and Public Mode</h2>
          </div>
          <p className="rules-section__intro">
            The social module is the quiet engine under the season. Use it during social windows to
            spend resources, shape relationships, and set up the next vote before anyone sees it
            coming.
          </p>
          <div className="rules-resource-grid">
            {SOCIAL_RESOURCES.map((tile) => renderTile(tile, 'rules-resource-card'))}
          </div>
          <div className="rules-band-row">
            {APPROVAL_BANDS.map((tile) => renderTile(tile, 'rules-band'))}
          </div>
          <p className="rules-section__note">
            Public approval is not just flavor. It is a real meter that can help when the public
            saves a nominee, decides a close call, or weighs the season at the end.
          </p>
        </section>

        <section className="rules-section">
          <div className="rules-section__header">
            <span className="rules-section__icon" aria-hidden="true">
              05
            </span>
            <h2 className="rules-section__title">Confessional</h2>
          </div>
          <p className="rules-section__intro">
            This is the private decision room. When the game needs a direct answer, it sends you
            here and waits for a choice.
          </p>
          <p className="rules-section__intro">
            This is where nomination picks, safety decisions, replacement picks, tie-breaks, and
            mission offers appear in a clean, no-distraction format.
          </p>
          <p className="rules-section__note">
            Keep your eyes wide open. Secrets and special opportunities are sometimes hidden inside
            the Confessional, so check it often and read every message carefully.
          </p>
          <div className="rules-confessional-grid">
            {CONFESSIONAL_DECISIONS.map((tile) => renderTile(tile, 'rules-confessional-card'))}
          </div>
        </section>

        <section className="rules-section">
          <div className="rules-section__header">
            <span className="rules-section__icon" aria-hidden="true">
              06
            </span>
            <h2 className="rules-section__title">Special Days</h2>
          </div>
          <p className="rules-section__intro">
            Not every day follows the standard script. Some days speed up, some days bring someone
            back, and some days swap out part of the normal order.
          </p>
          <div className="rules-split">
            <div className="rules-split__main">
              <p className="rules-section__intro">
                The important part is simple: you do not need to memorize every variation ahead of
                time. When a special day happens, the broadcast explains the new rule on the spot.
              </p>
            </div>
            <div className="rules-split__aside">
              <div className="rules-special-grid">
                {SPECIAL_DAY_NOTES.map((tile) => renderTile(tile, 'rules-special-card'))}
              </div>
            </div>
          </div>
        </section>

        <section className="rules-section">
          <div className="rules-section__header">
            <span className="rules-section__icon" aria-hidden="true">
              07
            </span>
            <h2 className="rules-section__title">The Tribunal</h2>
          </div>
          <p className="rules-section__intro">
            The Tribunal is formed from eligible eliminated players late in the season. Leaving the
            main game does not always mean leaving the story: Tribunal members watch the endgame and
            ultimately choose the winner.
          </p>
          <div className="rules-step-grid">
            {TRIBUNAL_NOTES.map((tile) => renderTile(tile, 'rules-step-card'))}
          </div>
          <p className="rules-section__note">
            How you treat people throughout the season can matter as much as your competition
            record. The finalists need the Tribunal's respect as well as a strong resume.
          </p>
        </section>

        <section className="rules-section">
          <div className="rules-section__header">
            <span className="rules-section__icon" aria-hidden="true">
              08
            </span>
            <h2 className="rules-section__title">Finale</h2>
          </div>
          <p className="rules-section__intro">
            The endgame is a sequence, not a single vote. Each step narrows the field and changes
            who still has control over the season.
          </p>
          <p className="rules-section__intro">
            The final stretch moves from a special eviction at Final 4 into the three-part final
            lead race, then into the Tribunal vote.
          </p>
          <div className="rules-finale-grid">
            {FINALE_STEPS.map((tile) => renderTile(tile, 'rules-finale-card'))}
          </div>
        </section>
      </main>
    </div>
  )
}
