export const INTRO_HUB_AUDIO_SUPPRESSION_EVENT = 'bb:intro-hub-audio-suppression'

export interface IntroHubAudioSuppressionDetail {
  suppressed: boolean
}

export function setIntroHubAudioSuppressed(suppressed: boolean): void {
  window.dispatchEvent(
    new CustomEvent<IntroHubAudioSuppressionDetail>(INTRO_HUB_AUDIO_SUPPRESSION_EVENT, {
      detail: { suppressed },
    })
  )
}
