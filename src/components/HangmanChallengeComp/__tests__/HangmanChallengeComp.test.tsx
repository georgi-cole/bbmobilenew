import { fireEvent, render, screen, within } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import HangmanChallengeComp from '../HangmanChallengeComp'
import { getSolutionLetters, pickRoundWords } from '../hangmanChallengeEngine'

const participants = [
  { id: 'human', name: 'You', isHuman: true, precomputedScore: 0, previousPR: null },
  { id: 'ai-1', name: 'Warden', isHuman: false, precomputedScore: 0, previousPR: null },
]

describe('HangmanChallengeComp', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('waits for the CTA before leaving the intro screen', () => {
    render(<HangmanChallengeComp participants={participants} seed={42} />)

    act(() => {
      vi.advanceTimersByTime(2_000)
    })

    expect(screen.getByRole('button', { name: /enter round/i })).toBeInTheDocument()
    expect(screen.queryByLabelText(/solution board/i)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /enter round/i }))

    expect(screen.getByLabelText(/solution board/i)).toBeInTheDocument()
  })

  it('renders the compact playfield without the removed intel and wrong-letter panels', () => {
    render(<HangmanChallengeComp participants={participants} seed={42} />)

    fireEvent.click(screen.getByRole('button', { name: /enter round/i }))

    expect(screen.queryByText('Intel')).toBeNull()
    expect(screen.queryByText('Wrong letters')).toBeNull()
    expect(screen.queryByText('0/7')).toBeNull()
    expect(screen.queryByText(/clean reads left before it shatters/i)).toBeNull()

    const board = screen.getByLabelText(/solution board/i)
    const letterBoard = screen.getByLabelText(/letter entry/i)
    const playfield = board.closest('.hangman-challenge__playfield')

    expect(playfield).toBeTruthy()
    expect(playfield?.children[0]).toBe(board)
    expect(playfield?.children[1]).toBe(letterBoard)
    expect(screen.queryByLabelText(/mystery box available/i)).toBeNull()
    expect(screen.getByText('Timer').closest('.hangman-challenge__header')).toBeTruthy()
    const mobileKeyboard = screen.getByLabelText(/letter keyboard/i)
    expect(within(mobileKeyboard).getAllByRole('button')).toHaveLength(26)
  })

  it('offers a mystery box in a compact dialog and shows its effect in that same dialog', () => {
    render(<HangmanChallengeComp participants={participants} seed={42} />)

    fireEvent.click(screen.getByRole('button', { name: /enter round/i }))
    act(() => {
      vi.advanceTimersByTime(9_000)
    })

    expect(screen.getByLabelText(/mystery box available/i)).toBeInTheDocument()
    expect(screen.queryByText(/no mystery box is live right now/i)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /open mystery box/i }))

    expect(screen.getByLabelText(/mystery box effect applied/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'OK' })).toBeInTheDocument()
  })

  it('uses native text entry and records attempted letters', () => {
    render(<HangmanChallengeComp participants={participants} seed={42} />)

    fireEvent.click(screen.getByRole('button', { name: /enter round/i }))

    const entryPanel = screen.getByLabelText(/letter entry/i)
    const input = within(entryPanel).getByLabelText(/guess a letter/i)
    const guessButton = within(entryPanel).getByRole('button', { name: /guess/i })
    const attempts = within(entryPanel).getByLabelText(/attempted letters/i)
    const wordLetters = getSolutionLetters(pickRoundWords(42)[0].text)
    const correctLetter = wordLetters[0]
    const wrongLetter = 'Z' === correctLetter ? 'Q' : 'Z'

    fireEvent.change(input, { target: { value: correctLetter.toLowerCase() } })
    fireEvent.click(guessButton)

    expect(within(attempts).getByText(correctLetter)).toBeInTheDocument()
    expect(input).toHaveValue('')

    fireEvent.change(input, { target: { value: wrongLetter.toLowerCase() } })
    fireEvent.click(guessButton)

    expect(within(attempts).getByText(wrongLetter)).toBeInTheDocument()
    expect(within(entryPanel).getByText(/2 tried/i)).toBeInTheDocument()
  })

  it('shows the shatter burst briefly before leaving a failed round', () => {
    render(<HangmanChallengeComp participants={participants} seed={42} />)

    fireEvent.click(screen.getByRole('button', { name: /enter round/i }))

    const entryPanel = screen.getByLabelText(/letter entry/i)
    const input = within(entryPanel).getByLabelText(/guess a letter/i)
    const guessButton = within(entryPanel).getByRole('button', { name: /guess/i })
    const solutionLetters = new Set(getSolutionLetters(pickRoundWords(42)[0].text))
    const wrongLetters = 'ZXQJKVBMNP'
      .split('')
      .filter((letter) => !solutionLetters.has(letter))
      .slice(0, 7)

    for (const letter of wrongLetters) {
      fireEvent.change(input, { target: { value: letter } })
      fireEvent.click(guessButton)
    }

    expect(document.querySelector('.hangman-challenge__shatter-burst')).toBeTruthy()
    expect(screen.queryByLabelText(/round breakdown/i)).toBeNull()

    act(() => {
      vi.advanceTimersByTime(650)
    })

    expect(screen.getByLabelText(/round breakdown/i)).toBeInTheDocument()
  })

  it('renders each player as one compact scoreboard row', () => {
    render(<HangmanChallengeComp participants={participants} seed={42} />)

    fireEvent.click(screen.getByRole('button', { name: /enter round/i }))
    const entryPanel = screen.getByLabelText(/letter entry/i)
    const input = within(entryPanel).getByLabelText(/guess a letter/i)
    const guessButton = within(entryPanel).getByRole('button', { name: /guess/i })

    for (const letter of getSolutionLetters(pickRoundWords(42)[0].text)) {
      fireEvent.change(input, { target: { value: letter } })
      fireEvent.click(guessButton)
    }

    act(() => {
      vi.runOnlyPendingTimers()
    })

    fireEvent.click(screen.getByRole('button', { name: /continue to scoreboard/i }))

    const scoreboard = screen.getByLabelText(/round scoreboard/i)
    const firstRow = scoreboard.querySelector<HTMLElement>('.hangman-challenge__score-row')

    expect(firstRow).not.toBeNull()
    if (!firstRow) {
      throw new Error('Expected a score row to be rendered')
    }

    expect(firstRow.children).toHaveLength(6)
    expect(firstRow.querySelector('.hangman-challenge__score-primary-row')).toBeNull()
    expect(firstRow.querySelector('.hangman-challenge__score-secondary-row')).toBeNull()
    expect(within(firstRow).getByText(/total/i)).toBeInTheDocument()
    expect(within(firstRow).getByText(/\+\d+/)).toBeInTheDocument()
    expect(firstRow.querySelector('.hangman-challenge__score-status')).toBeTruthy()
  })

  it('opens the final verdict directly after round five', () => {
    render(<HangmanChallengeComp participants={participants} seed={42} />)
    const words = pickRoundWords(42)

    for (let round = 0; round < 5; round += 1) {
      fireEvent.click(screen.getByRole('button', { name: /enter round/i }))
      const entryPanel = screen.getByLabelText(/letter entry/i)
      const input = within(entryPanel).getByLabelText(/guess a letter/i)
      const guessButton = within(entryPanel).getByRole('button', { name: /guess/i })

      for (const letter of getSolutionLetters(words[round].text)) {
        fireEvent.change(input, { target: { value: letter } })
        fireEvent.click(guessButton)
      }

      act(() => {
        vi.advanceTimersByTime(1)
      })

      if (round < 4) {
        fireEvent.click(screen.getByRole('button', { name: /continue to scoreboard/i }))
        expect(screen.getByLabelText(/round scoreboard/i)).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: /^continue$/i }))
      }
    }

    expect(screen.getByLabelText(/final results/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/round breakdown/i)).toBeNull()
    expect(screen.queryByLabelText(/round scoreboard/i)).toBeNull()
    expect(screen.getByText(/^final verdict$/i)).toBeInTheDocument()
  })
})
