import { useNavigate } from 'react-router'
import { VOX_POPULI_RULES } from '../../rules/voxPopuliGuide'
import './Rules.css'

export default function VoxPopuliRules() {
  const navigate = useNavigate()
  return (
    <div className="placeholder-screen rules-screen">
      <header className="rules-screen__hero">
        <div className="rules-screen__logo">VP</div>
        <h1 className="rules-screen__title">Vox Populi</h1>
        <p className="rules-screen__subtitle">The house nominates · the audience decides</p>
        <p className="rules-screen__lede">
          Build trust in private, win safety in public, and never forget who has the final say.
        </p>
        <button type="button" className="rules-screen__back" onClick={() => navigate(-1)}>
          Back to the house
        </button>
      </header>
      <main className="rules-screen__body">
        {VOX_POPULI_RULES.map((section) => (
          <section className="rules-section" key={section.title}>
            <div className="rules-section__header">
              <span className="rules-section__icon" aria-hidden="true">VP</span>
              <h2 className="rules-section__title">{section.title}</h2>
            </div>
            <p className="rules-section__intro">{section.intro}</p>
            <div className="rules-step-grid">
              {section.cards.map((card) => (
                <article className="rules-tile rules-step-card" key={card.title}>
                  <span className="rules-tile__kicker">{card.kicker}</span>
                  <h3 className="rules-tile__title">{card.title}</h3>
                  <p className="rules-tile__copy">{card.copy}</p>
                </article>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  )
}
