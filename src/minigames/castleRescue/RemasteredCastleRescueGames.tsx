import CastleRescueGame, { type CastleRescueGameProps } from './CastleRescueGame'

type RemasteredProps = Omit<CastleRescueGameProps, 'variant' | 'remastered'>

/** Production Part 1 remaster. Gameplay/scoring stay shared; the premium renderer is explicit. */
export function RemasteredCastleRescueGame(props: RemasteredProps) {
  return <CastleRescueGame {...props} variant="classic" remastered />
}

/** Production Lost Again remaster, including its castle-specific premium renderer. */
export function RemasteredBennyLennyCastleRescueGame(props: RemasteredProps) {
  return <CastleRescueGame {...props} variant="benny-lenny" remastered />
}
