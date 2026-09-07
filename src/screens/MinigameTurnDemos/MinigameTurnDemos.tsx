import MinigameTurnDemo from '../../components/MinigameTurnDemo/MinigameTurnDemo'
import './MinigameTurnDemos.css'

const DEMOS = [
  ['chainOfGreed', 'Chain of Greed'], ['blackjackTournament', 'Blackjack Tournament'],
  ['colorMatch', 'Color Match'], ['memoryMatch', 'Memory Colors'], ['hangman', 'Verdict Board'],
  ['castleRescue', 'Find Your Twin'], ['glass_bridge_brutal', 'The Crystal Path'],
  ['crystal_path_shattered', 'Crystal Path: Infinity'], ['trapAuction', 'Trap Auction'],
  ['gridOfLuck', 'Grid of Luck'], ['minesweeps', 'Minesweeps'],
] as const

export default function MinigameTurnDemos() {
  return <main className="turn-demo-gallery"><header><p>MINIGAME LAB</p><h1>One-turn demos</h1><span>Each card is the interactive briefing shown before its game starts.</span></header><div className="turn-demo-gallery__grid">{DEMOS.map(([key, title]) => <article key={key}><h2>{title}</h2><MinigameTurnDemo gameKey={key} title={title} /></article>)}</div></main>
}
