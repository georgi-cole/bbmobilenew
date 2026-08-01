import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router'
import Credits from '../Credits'

const EXIT_FADE_MS = 420

const soundtrackMock = vi.hoisted(() => ({
  fadeOut: vi.fn(),
  getTime: vi.fn(() => 0),
  isPlaying: vi.fn(() => true),
  start: vi.fn(() => Promise.resolve()),
  stop: vi.fn(),
  sync: vi.fn(),
}))

const contentMock = vi.hoisted(() => ({
  load: vi.fn(() =>
    Promise.resolve({
      cards: [
        {
          id: 'runtime-producer',
          fromSecond: 0,
          toSecond: 4,
          lines: [{ text: 'Runtime Producer', style: 'name' }],
        },
      ],
      source: 'runtime' as const,
      url: '/config/credits.json',
    })
  ),
}))

vi.mock('../../../cinematic/audio/creditsSoundtrack', () => ({
  fadeOutCreditsSoundtrack: soundtrackMock.fadeOut,
  getCreditsSoundtrackTime: soundtrackMock.getTime,
  isCreditsSoundtrackPlaying: soundtrackMock.isPlaying,
  startCreditsSoundtrackFromGesture: soundtrackMock.start,
  stopCreditsSoundtrack: soundtrackMock.stop,
  syncCreditsSoundtrackToTime: soundtrackMock.sync,
}))

vi.mock('../../../cinematic/credits/creditsContent', () => ({
  loadCreditsContent: contentMock.load,
}))

function renderCredits(props: { autoPlay?: boolean; onComplete?: () => void } = {}) {
  return render(
    <MemoryRouter initialEntries={['/credits']}>
      <Routes>
        <Route path="/credits" element={<Credits {...props} />} />
        <Route path="/" element={<div>Home screen</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('Credits', () => {
  beforeEach(() => {
    soundtrackMock.fadeOut.mockClear()
    soundtrackMock.getTime.mockReset()
    soundtrackMock.getTime.mockReturnValue(0)
    soundtrackMock.isPlaying.mockReset()
    soundtrackMock.isPlaying.mockReturnValue(true)
    soundtrackMock.start.mockClear()
    soundtrackMock.stop.mockClear()
    soundtrackMock.sync.mockClear()
    contentMock.load.mockClear()
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('uses the pre-rendered muted video and starts it immediately', () => {
    renderCredits()

    const video = screen.getByLabelText('Credits background video')
    expect(video).toHaveAttribute('autoplay')
    expect(video).toHaveAttribute('playsinline')
    expect(video).toHaveProperty('muted', true)
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Skip credits' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tap to start credits' })).toBeNull()
  })

  it('keeps runtime-loaded credit cards above the video', async () => {
    renderCredits()

    await waitFor(() => expect(contentMock.load).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByText('Runtime Producer')).toBeInTheDocument())
    expect(screen.getByLabelText('Credits background video').parentElement).toHaveAttribute(
      'data-content-source',
      'runtime'
    )
  })

  it('uses the logo-free city-lights fallback when the video fails', () => {
    renderCredits()

    fireEvent.error(screen.getByLabelText('Credits background video'))

    expect(screen.queryByLabelText('Credits background video')).toBeNull()
    expect(screen.getByLabelText('City lights credits background')).toBeInTheDocument()
    expect(screen.queryByAltText('Kolequant')).toBeNull()
  })

  it('starts external music when video playback begins and no music is active', () => {
    soundtrackMock.isPlaying.mockReturnValue(false)
    renderCredits()

    const video = screen.getByLabelText('Credits background video')
    Object.defineProperty(video, 'currentTime', { configurable: true, value: 2.5 })
    fireEvent.play(video)

    expect(soundtrackMock.start).toHaveBeenCalledWith(2.5)
  })

  it('fades music and returns home when skipped', () => {
    vi.useFakeTimers()
    renderCredits()

    fireEvent.click(screen.getByRole('button', { name: 'Skip credits' }))
    expect(soundtrackMock.fadeOut).toHaveBeenCalledWith(EXIT_FADE_MS)

    act(() => vi.advanceTimersByTime(EXIT_FADE_MS))
    expect(screen.getByText('Home screen')).toBeInTheDocument()
  })

  it('finishes embedded finale credits after the video ends', () => {
    vi.useFakeTimers()
    const onComplete = vi.fn()
    renderCredits({ autoPlay: true, onComplete })

    fireEvent.ended(screen.getByLabelText('Credits background video'))
    expect(soundtrackMock.stop).toHaveBeenCalled()
    expect(screen.getByTestId('credits-end-guard')).toHaveClass('is-visible')

    act(() => vi.advanceTimersByTime(EXIT_FADE_MS))
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('exits on Escape', () => {
    vi.useFakeTimers()
    renderCredits()

    fireEvent.keyDown(window, { key: 'Escape' })
    act(() => vi.advanceTimersByTime(EXIT_FADE_MS))

    expect(screen.getByText('Home screen')).toBeInTheDocument()
  })
})
