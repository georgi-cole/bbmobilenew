import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import PlayerCard from '../PlayerCard'
import HOUSEGUESTS from '../../../data/houseguests'
import { I18nContext } from '../../../i18n/I18nContext'
import { translate } from '../../../i18n/messages'

describe("PlayerCard Cupid's Arrow context", () => {
  it('shows the named Cupid partner in the compact roster card', () => {
    render(
      <I18nContext.Provider
        value={{
          preference: 'en-US',
          language: 'en-US',
          systemLanguage: 'en-US',
          t: (key, params) => translate('en-US', key, params),
          formatNumber: (value) => String(value),
          formatDate: (value) => String(value),
        }}
      >
        <PlayerCard
          player={{ ...HOUSEGUESTS[0], avatar: '', status: 'active' }}
          selected={false}
          disabled={false}
          onSelect={() => undefined}
          cupidPartner={{ name: 'Nova', color: '#ff5d8f', isYourPartner: true }}
        />
      </I18nContext.Provider>
    )

    expect(screen.getByText('💘 Your pair: Nova')).toBeTruthy()
  })
})
