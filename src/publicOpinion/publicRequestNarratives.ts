import type { DirectionType } from './types'

type AudienceRequestContext = {
  type: DirectionType
  playerName: string
  relatedName?: string
  targetName?: string
  seed: string
}

function pick(seed: string, variants: readonly string[]): string {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = (Math.imul(hash, 31) + seed.charCodeAt(index)) | 0
  }
  return variants[Math.abs(hash) % variants.length]
}

/**
 * Audience-facing copy for requests assigned to AI houseguests. These lines
 * describe a developing episode rather than exposing the simulation's action
 * route, which remains available only to the request resolver.
 */
export function createAudienceRequestStory({
  type,
  playerName,
  relatedName = 'someone',
  targetName = 'a housemate',
  seed,
}: AudienceRequestContext): string {
  const pair = `${playerName} and ${relatedName}`
  const variants: readonly string[] = (() => {
    switch (type) {
      case 'get_closer':
        return [
          `The public wants ${pair} closer. The chemistry is obvious, but the tension is the story.`,
          `Viewers keep clocking ${pair}. They want the distance between them to finally give way.`,
          `The feeds see something unfinished between ${pair}. The public wants them to find the connection.`,
        ]
      case 'repair_relationship':
      case 'apologize':
        return [
          `The public wants ${pair} to make peace. They saw the fracture and want to know whether the bond still matters.`,
          `${pair} have left too much unsaid. Viewers are waiting for the conversation that changes the temperature.`,
          `The audience remembers when ${pair} were good. A real repair would make a much better episode than another cold shoulder.`,
        ]
      case 'align_with':
        return [
          `The public keeps pairing ${pair} in the comments. A real alliance would give that chemistry somewhere to go.`,
          `Viewers see complementary games in ${pair}. They want to know what happens when those instincts finally line up.`,
          `${pair} keep ending up in the same story. The audience is ready for them to become a real force.`,
        ]
      case 'reinforce_alliance':
      case 'show_loyalty':
        return [
          `The public wants ${pair} to prove their loyalty is more than convenience.`,
          `Viewers have invested in ${pair}. They want a moment that shows the partnership can survive pressure.`,
          `The feeds are testing ${pair}'s alliance. The audience wants to see who stands firm when it costs something.`,
        ]
      case 'break_alliance':
        return [
          `The public has watched ${pair} move as one. Now they are waiting for the fracture.`,
          `Viewers can feel the strain inside ${pair}'s alliance. They want to see which side breaks first.`,
          `The audience thinks ${pair} have been too comfortable for too long. A split would change the whole house.`,
        ]
      case 'confront_player':
      case 'start_drama':
        return [
          `The public sees unfinished tension between ${pair}. They are waiting for somebody to finally say it out loud.`,
          `${pair} have been circling the same conflict. Viewers want the confrontation that makes the room choose sides.`,
          `The feeds keep catching looks between ${pair}. The audience knows a reckoning is coming.`,
        ]
      case 'target_player':
      case 'expose_player':
        return [
          `The public wants ${playerName} to put ${relatedName}'s game under real pressure.`,
          `Viewers think ${relatedName} has had an easy run. They want ${playerName} to make the house look twice.`,
          `The audience sees ${relatedName} as a loose thread in ${playerName}'s story. They want it pulled.`,
        ]
      case 'protect_player':
        return [
          `The public wants ${playerName} to stand up for ${relatedName}. The house is watching who protects whom.`,
          `Viewers are invested in ${relatedName}'s safety, and they want ${playerName} to show where their heart really is.`,
          `The audience wants ${playerName} to make a protective move for ${relatedName} before the window closes.`,
        ]
      case 'influence_hoh':
        return [
          `The public wants ${playerName} to put ${targetName} in ${relatedName}'s sights. One conversation could redraw the week.`,
          `Viewers want ${playerName} to turn a quiet idea about ${targetName} into a real power move with ${relatedName}.`,
          `${playerName} has a chance to change ${relatedName}'s week, and the audience wants ${targetName} at the center of it.`,
        ]
      case 'win_competition':
      case 'win_veto':
        return [
          `The public wants ${playerName} to take control. The season is waiting for a defining win.`,
          `Viewers are ready for ${playerName} to turn potential into power.`,
          `The audience wants a ${playerName} victory lap. One big win could change the whole edit.`,
        ]
      case 'make_bold_move':
      case 'flip_vote':
      case 'create_chaos':
        return [
          `The public wants ${playerName} to stop playing the background and give the house a real turning point.`,
          `Viewers think ${playerName} is one move away from becoming the episode. They want the move.`,
          `The audience can feel a shift coming around ${playerName}. They want the house to feel it too.`,
        ]
    }
  })()
  return pick(`${seed}:${type}:${playerName}:${relatedName}:${targetName}`, variants)
}
