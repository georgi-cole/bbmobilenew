import { useMemo } from 'react'
import { selectPublicOpinion } from '../../publicOpinion'
import {
  completeVoxFinalistShowcase,
  completeVoxSeasonRecap,
  resolveVoxSeasonWinner,
  startVoxFinalVote,
} from '../../store/gameSlice'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import PublicFavoriteOverlay from '../PublicFavoriteOverlay/PublicFavoriteOverlay'
import SeasonRecapCinematic from '../SeasonRecapCinematic/SeasonRecapCinematic'
import type { Player } from '../../types'
import VoxFinalistShowcase, { type VoxFinalistCase } from './VoxFinalistShowcase'
import { selectCurrentProfile } from '../../store/profilesSlice'

export default function VoxPopuliFinaleOverlay() {
  const dispatch = useAppDispatch()
  const game = useAppSelector((state) => state.game)
  const publicOpinion = useAppSelector(selectPublicOpinion)
  const social = useAppSelector((state) => state.social)
  const activeProfile = useAppSelector(selectCurrentProfile)
  const vox = game.voxPopuli
  const finalists = useMemo(
    () =>
      (vox?.finalistIds ?? [])
        .map((id) => game.players.find((player) => player.id === id))
        .filter((player): player is Player => Boolean(player)),
    [game.players, vox?.finalistIds]
  )

  if (!vox?.finaleStage) return null

  if (vox.finaleStage === 'showcase') {
    const finalistCases: VoxFinalistCase[] = finalists.map((player) => {
      const nominationDays = vox.nominationDaysByPlayerId?.[player.id]?.length ?? player.stats?.timesNominated ?? 0
      const competitionWins = (player.stats?.lohWins ?? 0) + (player.stats?.posWins ?? 0)
      const safetySaves = vox.safetySaveCounts?.[player.id] ?? 0
      const realityAlliance = Object.values(social.reality.alliances).find(
        (alliance) => alliance.memberIds.includes(player.id) && alliance.status === 'ACTIVE'
      )
      const dramaAlliance = social.dramaNetwork.alliances.find(
        (alliance) => alliance.participantIds.includes(player.id) && alliance.status === 'active'
      )
      const powerMoves = [
        nominationDays === 0
          ? 'Reached the final without ever facing the audience vote'
          : `Survived ${nominationDays} audience-vote ${nominationDays === 1 ? 'night' : 'nights'}`,
        competitionWins > 0
          ? `Won ${competitionWins} ${competitionWins === 1 ? 'competition' : 'competitions'} when safety mattered most`
          : null,
        safetySaves > 0
          ? `Escaped the block with the Power of Safety ${safetySaves === 1 ? 'once' : `${safetySaves} times`}`
          : null,
        realityAlliance
          ? `Helped carry ${realityAlliance.name ?? `a ${realityAlliance.memberIds.length}-person alliance`} deep into the game`
          : dramaAlliance
            ? 'Built a trusted partnership that survived the pressure'
            : null,
      ].filter((move): move is string => Boolean(move)).slice(0, 3)
      const profileBio = player.isUser ? activeProfile?.bio : undefined
      const profileIdentity = [
        profileBio?.profession ? `a ${profileBio.profession}` : null,
        profileBio?.location ? `from ${profileBio.location}` : null,
      ].filter((detail): detail is string => Boolean(detail)).join(' ')
      const numericAge = profileBio?.age?.trim().match(/^\d{1,3}$/)?.[0]
      const introduction = player.isUser
        ? profileBio?.story?.trim() ||
          (profileIdentity || numericAge
            ? `${player.name} entered the house${profileIdentity ? ` as ${profileIdentity}` : ''}${numericAge ? ` at ${numericAge}` : ''}—then turned that real-life experience into a game the audience could follow.`
            : `${player.name} entered without a borrowed storyline. Every risk, bond, and survival became the story the audience knows now.`)
        : undefined
      return { player, introduction, powerMoves }
    })

    return (
      <VoxFinalistShowcase
        finalists={finalistCases}
        onComplete={() => dispatch(completeVoxFinalistShowcase())}
      />
    )
  }

  if (vox.finaleStage === 'ready') return null

  if (vox.finaleStage === 'recap') {
    return (
      <SeasonRecapCinematic
        season={game.season}
        week={game.week}
        players={game.players}
        history={game.history}
        publicOpinion={publicOpinion}
        onComplete={() =>
          dispatch(vox.winnerId ? completeVoxSeasonRecap() : startVoxFinalVote())
        }
      />
    )
  }

  return (
    <PublicFavoriteOverlay
      candidates={finalists}
      seed={game.seed}
      mode="season_winner"
      onComplete={(winnerId) => dispatch(resolveVoxSeasonWinner(winnerId))}
    />
  )
}
