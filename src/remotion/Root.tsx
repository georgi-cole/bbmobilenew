import { Composition } from 'remotion'
import { CinematicComposition } from '../cinematic/components/CinematicComposition'
import { CINEMATIC_CONFIG } from '../cinematic/config/cinematicConfig'

export const RemotionRoot = () => (
  <>
    <Composition
      id={CINEMATIC_CONFIG.compositionId}
      component={CinematicComposition}
      durationInFrames={CINEMATIC_CONFIG.durationInFrames}
      fps={CINEMATIC_CONFIG.fps}
      width={CINEMATIC_CONFIG.width}
      height={CINEMATIC_CONFIG.height}
    />
    <Composition
      id="BigEyeCinematicBackground"
      component={CinematicComposition}
      durationInFrames={CINEMATIC_CONFIG.durationInFrames}
      fps={CINEMATIC_CONFIG.fps}
      width={CINEMATIC_CONFIG.width}
      height={CINEMATIC_CONFIG.height}
      defaultProps={{ audioMode: 'embedded', credits: [] }}
    />
  </>
)
