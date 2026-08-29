// MODULE: introHub.js
// Intro Hub UI — side utility button overlay
//
// Chips: Music, Sounds (top-left), Houseguests, Achievements, Feedback (bottom-left),
//        Store, Settings, Share (bottom-right)
//
// Notification dots are driven by window.game.hubNotifications (object keyed by chip id).
// Runtime API: window.game.hub.setNotification(id, bool) / window.game.hub.refreshNotifications()
//
// The Houseguests chip calls window.game.houseguests.openPanel() if present;
// otherwise opens a placeholder panel.

;(function (global) {
  'use strict'

  const g = global.game || (global.game = {})
  const HUB_DIALOG_BACKDROP_ID = 'hub-dialog-backdrop'
  const HUB_DIALOG_PANEL_ID = 'hub-dialog-panel'
  const FEEDBACK_EMAIL = 'kolequant@gmail.com'
  const SHARE_TITLE = 'BBMobile New'
  const SHARE_TEXT = 'Share BBMobile New with your friends and compare your house legacy.'
  let dialogKeyHandler = null

  // Chip definitions: { id, label, icon, position }
  // Positions: top-left, top-right, bottom-left, bottom-right
  //   Suffixes -2 and -3 stack chips vertically within the same corner
  //   (e.g. top-right renders above top-right-2, which renders above top-right-3).
  //   Array order does not affect visual stacking — only the position class does.
  const CHIPS = [
    // Top-left corner (stacked top → bottom)
    { id: 'music', label: 'Music', icon: 'music', position: 'top-left' },
    { id: 'sounds', label: 'Sounds', icon: 'sound', position: 'top-left-2' },
    // Bottom-left corner (stacked bottom → top)
    { id: 'houseguests', label: 'Players', icon: 'housemates', position: 'bottom-left' },
    { id: 'achievements', label: 'Achievements', icon: 'achievements', position: 'bottom-left-2' },
    { id: 'feedback', label: 'Feedback', icon: 'feedback', position: 'bottom-left-3' },
    // Bottom-right corner (stacked bottom → top: store, settings, share)
    { id: 'store', label: 'Store', icon: 'shop', position: 'bottom-right' },
    { id: 'settings', label: 'Settings', icon: 'settings', position: 'bottom-right-2' },
    { id: 'share', label: 'Share', icon: 'share', position: 'bottom-right-3' },
  ]

  let chipElements = {} // { id: Element }

  function applyStyles(element, styles) {
    Object.assign(element.style, styles)
    return element
  }

  function createTextNode(tag, text, styles) {
    const element = document.createElement(tag)
    element.textContent = text
    if (styles) applyStyles(element, styles)
    return element
  }

  function closeHubDialog() {
    const panel = document.getElementById(HUB_DIALOG_PANEL_ID)
    const backdrop = document.getElementById(HUB_DIALOG_BACKDROP_ID)
    if (dialogKeyHandler) {
      document.removeEventListener('keydown', dialogKeyHandler)
      dialogKeyHandler = null
    }
    if (panel) panel.remove()
    if (backdrop) backdrop.remove()
  }

  function openHubDialog(options) {
    closeHubDialog()

    const backdrop = applyStyles(document.createElement('div'), {
      position: 'fixed',
      inset: '0',
      background: 'rgba(5, 8, 18, 0.72)',
      backdropFilter: 'blur(6px)',
      zIndex: '10199',
      cursor: 'pointer',
    })
    backdrop.id = HUB_DIALOG_BACKDROP_ID
    backdrop.addEventListener('click', closeHubDialog)

    const panel = applyStyles(document.createElement('section'), {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: 'min(92vw, 420px)',
      maxHeight: 'min(82vh, 640px)',
      overflowY: 'auto',
      padding: '24px',
      borderRadius: '24px',
      border: '1px solid rgba(205, 190, 236, 0.14)',
      background:
        'radial-gradient(ellipse at 45% 0%, rgba(112,72,156,0.12), transparent 42%), linear-gradient(180deg, rgba(28,26,33,0.985) 0%, rgba(12,11,16,0.99) 100%)',
      boxShadow: '0 18px 48px rgba(0, 0, 0, 0.48)',
      color: '#f7f8ff',
      zIndex: '10200',
      fontFamily: 'inherit',
    })
    panel.id = HUB_DIALOG_PANEL_ID
    panel.setAttribute('role', 'dialog')
    panel.setAttribute('aria-modal', 'true')

    const titleId = `${HUB_DIALOG_PANEL_ID}-title`
    panel.setAttribute('aria-labelledby', titleId)

    const header = applyStyles(document.createElement('div'), {
      display: 'flex',
      alignItems: 'flex-start',
      gap: '14px',
      marginBottom: '18px',
    })

    const icon = createTextNode('div', options.icon, {
      display: 'grid',
      placeItems: 'center',
      width: '48px',
      height: '48px',
      borderRadius: '16px',
      background: 'linear-gradient(180deg, rgba(139,92,246,0.22) 0%, rgba(74,55,104,0.12) 100%)',
      boxShadow: 'inset 0 0 0 1px rgba(205,190,236,0.15)',
      fontSize: '24px',
      flexShrink: '0',
    })

    const headerText = applyStyles(document.createElement('div'), {
      flex: '1',
      minWidth: '0',
    })

    const title = createTextNode('h3', options.title, {
      margin: '0',
      fontSize: '22px',
      fontWeight: '700',
      lineHeight: '1.2',
    })
    title.id = titleId

    headerText.appendChild(title)
    if (options.description) {
      headerText.appendChild(
        createTextNode('p', options.description, {
          margin: '8px 0 0',
          color: 'rgba(236, 241, 255, 0.72)',
          fontSize: '14px',
          lineHeight: '1.5',
        })
      )
    }

    const closeButton = createTextNode('button', options.useBackButton ? '↩' : '✕', {
      width: '34px',
      height: '34px',
      borderRadius: '999px',
      border: '1px solid rgba(255,255,255,0.16)',
      background: 'rgba(255,255,255,0.06)',
      color: '#fff',
      cursor: 'pointer',
      fontSize: '14px',
      fontWeight: '700',
      flexShrink: '0',
    })
    closeButton.type = 'button'
    closeButton.setAttribute(
      'aria-label',
      options.useBackButton ? 'Back to Intro Hub' : 'Close dialog'
    )
    closeButton.addEventListener('click', closeHubDialog)

    header.appendChild(icon)
    header.appendChild(headerText)
    header.appendChild(closeButton)
    panel.appendChild(header)

    const body = applyStyles(document.createElement('div'), {
      display: 'grid',
      gap: '14px',
    })

    if (typeof options.renderBody === 'function') {
      options.renderBody(body)
    }
    panel.appendChild(body)

    document.body.appendChild(backdrop)
    document.body.appendChild(panel)

    dialogKeyHandler = function (event) {
      if (event.key === 'Escape') {
        closeHubDialog()
      }
    }
    document.addEventListener('keydown', dialogKeyHandler)
    closeButton.focus()

    return panel
  }

  function openPlaceholder(title, icon, message) {
    openHubDialog({
      title: title,
      icon: icon,
      description: message || 'Coming soon.',
      renderBody: function (body) {
        const closeButton = createTextNode('button', 'Close', {
          padding: '11px 18px',
          borderRadius: '999px',
          border: '1px solid rgba(255,255,255,0.16)',
          background: 'rgba(124, 146, 255, 0.18)',
          color: '#fff',
          fontSize: '14px',
          fontWeight: '600',
          cursor: 'pointer',
          justifySelf: 'start',
        })
        closeButton.type = 'button'
        closeButton.addEventListener('click', closeHubDialog)
        body.appendChild(closeButton)
      },
    })
  }

  function getShareUrl() {
    if (!global.location) return ''
    return global.location.href || ''
  }

  function showToast(message) {
    const existing = document.getElementById('hub-dialog-toast')
    if (existing) existing.remove()
    const toast = createTextNode('div', message, {
      position: 'fixed',
      left: '50%',
      bottom: '18px',
      transform: 'translateX(-50%)',
      padding: '10px 14px',
      borderRadius: '999px',
      background: 'rgba(10, 14, 24, 0.92)',
      border: '1px solid rgba(176, 198, 255, 0.18)',
      color: '#fff',
      fontSize: '13px',
      zIndex: '10210',
      boxShadow: '0 12px 28px rgba(0, 0, 0, 0.35)',
      fontFamily: 'inherit',
    })
    toast.id = 'hub-dialog-toast'
    document.body.appendChild(toast)
    global.setTimeout(function () {
      if (toast.parentNode) toast.remove()
    }, 2200)
  }

  function renderActionButton(label, styles, handler) {
    const button = createTextNode('button', label, styles)
    button.type = 'button'
    button.addEventListener('click', handler)
    return button
  }

  function openShareFallback(shareData) {
    openHubDialog({
      title: 'Share the game',
      icon: '↗️',
      description:
        'Use your phone share sheet when available, or copy the link below to invite friends.',
      renderBody: function (body) {
        const linkCard = applyStyles(document.createElement('div'), {
          padding: '14px',
          borderRadius: '18px',
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.08)',
        })

        linkCard.appendChild(
          createTextNode('p', 'Game link', {
            margin: '0 0 8px',
            fontSize: '12px',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'rgba(236, 241, 255, 0.6)',
          })
        )

        const input = document.createElement('input')
        input.type = 'text'
        input.value = shareData.url
        input.readOnly = true
        applyStyles(input, {
          width: '100%',
          padding: '10px 12px',
          borderRadius: '14px',
          border: '1px solid rgba(176, 198, 255, 0.14)',
          background: 'rgba(10, 14, 24, 0.7)',
          color: '#f7f8ff',
          fontSize: '13px',
          boxSizing: 'border-box',
        })
        linkCard.appendChild(input)
        body.appendChild(linkCard)

        const actionRow = applyStyles(document.createElement('div'), {
          display: 'flex',
          flexWrap: 'wrap',
          gap: '10px',
        })

        actionRow.appendChild(
          renderActionButton(
            'Copy link',
            {
              padding: '11px 16px',
              borderRadius: '999px',
              border: '1px solid rgba(176, 198, 255, 0.14)',
              background: 'rgba(124, 146, 255, 0.18)',
              color: '#fff',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
            },
            function () {
              if (
                global.navigator &&
                global.navigator.clipboard &&
                typeof global.navigator.clipboard.writeText === 'function'
              ) {
                global.navigator.clipboard
                  .writeText(shareData.url)
                  .then(function () {
                    showToast('Link copied to clipboard')
                  })
                  .catch(function () {
                    input.focus()
                    input.select()
                  })
                return
              }
              input.focus()
              input.select()
            }
          )
        )

        actionRow.appendChild(
          renderActionButton(
            'Close',
            {
              padding: '11px 16px',
              borderRadius: '999px',
              border: '1px solid rgba(255,255,255,0.14)',
              background: 'rgba(255,255,255,0.06)',
              color: '#fff',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
            },
            closeHubDialog
          )
        )

        body.appendChild(actionRow)
      },
    })
  }

  function openShareDialog() {
    const shareData = {
      title: SHARE_TITLE,
      text: SHARE_TEXT,
      url: getShareUrl(),
    }

    if (global.navigator && typeof global.navigator.share === 'function') {
      try {
        Promise.resolve(global.navigator.share(shareData)).catch(function (error) {
          if (error && error.name === 'AbortError') return
          openShareFallback(shareData)
        })
      } catch (error) {
        if (error && error.name === 'AbortError') return
        openShareFallback(shareData)
      }
      return
    }

    openShareFallback(shareData)
  }

  function buildFeedbackMailtoUrl() {
    const subject = encodeURIComponent('BBMobile New feedback')
    const day = typeof g.week === 'number' ? `Day ${g.week}` : null
    const season = typeof g.season === 'number' ? `Season ${g.season}` : null
    const context = [season, day].filter(Boolean).join(' · ')
    const intro = context
      ? `Hi,\n\nI want to share some feedback about ${context}.\n\n`
      : 'Hi,\n\nI want to share some feedback about BBMobile New.\n\n'
    return `mailto:${FEEDBACK_EMAIL}?subject=${subject}&body=${encodeURIComponent(intro)}`
  }

  function openFeedbackFallback(mailtoUrl) {
    openHubDialog({
      title: 'Send feedback',
      icon: '💬',
      description: 'Open your email app and send your thoughts straight to the developer inbox.',
      renderBody: function (body) {
        const helper = createTextNode('p', `Email: ${FEEDBACK_EMAIL}`, {
          margin: '0',
          color: 'rgba(236, 241, 255, 0.8)',
          fontSize: '14px',
        })
        body.appendChild(helper)

        const actions = applyStyles(document.createElement('div'), {
          display: 'flex',
          flexWrap: 'wrap',
          gap: '10px',
        })

        const emailLink = createTextNode('a', 'Open email app', {
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '11px 16px',
          borderRadius: '999px',
          background: 'rgba(124, 146, 255, 0.18)',
          border: '1px solid rgba(176, 198, 255, 0.14)',
          color: '#fff',
          fontSize: '14px',
          fontWeight: '600',
          textDecoration: 'none',
        })
        emailLink.href = mailtoUrl
        actions.appendChild(emailLink)

        actions.appendChild(
          renderActionButton(
            'Close',
            {
              padding: '11px 16px',
              borderRadius: '999px',
              border: '1px solid rgba(255,255,255,0.14)',
              background: 'rgba(255,255,255,0.06)',
              color: '#fff',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
            },
            closeHubDialog
          )
        )

        body.appendChild(actions)
      },
    })
  }

  function openFeedbackComposer() {
    const mailtoUrl = buildFeedbackMailtoUrl()

    try {
      if (typeof global.open === 'function') {
        const popup = global.open(mailtoUrl, '_self')
        if (popup !== null) return
      }
    } catch (error) {
      console.warn('[introHub] Could not open feedback email directly', error)
    }

    openFeedbackFallback(mailtoUrl)
  }

  function toNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0
  }

  function findUserSummary(archive, userId) {
    if (!archive || !Array.isArray(archive.playerSummaries)) return null
    return (
      archive.playerSummaries.find(function (summary) {
        return summary && (summary.playerId === userId || summary.playerId === 'user')
      }) || null
    )
  }

  function collectAchievementStats() {
    if (g.achievementSummary && typeof g.achievementSummary === 'object') {
      return g.achievementSummary
    }

    const players = Array.isArray(g.players) ? g.players : []
    const userPlayer =
      players.find(function (player) {
        return player && player.isUser
      }) ||
      players.find(function (player) {
        return player && player.id === 'user'
      }) ||
      null
    const userId = userPlayer && userPlayer.id ? userPlayer.id : 'user'
    const archives = Array.isArray(g.seasonArchives) ? g.seasonArchives : []
    const rewardIds = new Set()
    let seasonsPlayed = 0
    let seasonsWon = 0
    let publicFavoriteWins = 0
    let lohWins = 0
    let posWins = 0
    let battleBackWins = 0
    let finalHohWins = 0
    let timesNominated = 0
    let survivedNominations = 0
    let juryAppearances = 0
    let doubleEvictionSurvivals = 0
    let tripleEvictionSurvivals = 0
    let averageDaysTotal = 0
    let averageDaysSamples = 0

    archives.forEach(function (archive) {
      if (archive && Array.isArray(archive.rewardsEarned)) {
        archive.rewardsEarned.forEach(function (rewardId) {
          rewardIds.add(rewardId)
        })
      }

      const summary = findUserSummary(archive, userId)
      if (!summary) return

      seasonsPlayed += 1
      if (summary.finalPlacement === 1) seasonsWon += 1
      if (summary.wonPublicFavorite) publicFavoriteWins += 1
      lohWins += toNumber(summary.lohWins)
      posWins += toNumber(summary.posWins)
      battleBackWins += toNumber(summary.battleBackWins)
      finalHohWins += summary.wonFinalHoh ? 1 : 0
      timesNominated += toNumber(summary.timesNominated)
      survivedNominations += Math.max(
        toNumber(summary.timesNominated) - (summary.isEvicted ? 1 : 0),
        0
      )
      if (summary.madeJury) juryAppearances += 1
      if (summary.survivedDoubleEviction) doubleEvictionSurvivals += 1
      if (summary.survivedTripleEviction) tripleEvictionSurvivals += 1
      const archivedDaysAlive =
        typeof summary.daysAlive === 'number' ? summary.daysAlive : summary.weeksAlive
      if (typeof archivedDaysAlive === 'number' && archivedDaysAlive > 0) {
        averageDaysTotal += archivedDaysAlive
        averageDaysSamples += 1
      }
    })

    const liveStats = userPlayer && userPlayer.stats ? userPlayer.stats : null
    const currentDay = toNumber(g.day != null ? g.day : g.week)
    const currentSeasonActive =
      !!userPlayer && (currentDay > 1 || (g.phase && g.phase !== 'week_start'))
    if (currentSeasonActive) {
      seasonsPlayed += 1
      lohWins += toNumber(liveStats && liveStats.lohWins)
      posWins += toNumber(liveStats && liveStats.posWins)
      battleBackWins += toNumber(liveStats && liveStats.battleBackWins)
      finalHohWins += liveStats && liveStats.wonFinalHoh ? 1 : 0
      timesNominated += toNumber(liveStats && liveStats.timesNominated)
      survivedNominations += Math.max(
        toNumber(liveStats && liveStats.timesNominated) -
          (userPlayer.status === 'evicted' || userPlayer.status === 'jury' ? 1 : 0),
        0
      )
      if (currentDay > 0) {
        averageDaysTotal += currentDay
        averageDaysSamples += 1
      }
    }

    const totalCompWins = lohWins + posWins + battleBackWins
    const averageDaysSurvived =
      averageDaysSamples > 0
        ? `${Math.round((averageDaysTotal / averageDaysSamples) * 10) / 10} days`
        : '—'
    const highlightBadges = []

    if (seasonsWon > 0) highlightBadges.push(`🏆 Season champ ×${seasonsWon}`)
    if (publicFavoriteWins > 0) highlightBadges.push(`🌟 Public favorite ×${publicFavoriteWins}`)
    if (totalCompWins >= 5) highlightBadges.push(`💪 Comp beast ×${totalCompWins}`)
    if (survivedNominations >= 3) highlightBadges.push(`🛡️ Block survivor ×${survivedNominations}`)
    if (rewardIds.size > 0) highlightBadges.push(`🥚 Reward hunter ×${rewardIds.size}`)
    if (doubleEvictionSurvivals > 0 || tripleEvictionSurvivals > 0) {
      highlightBadges.push(
        `⚡ Eviction escape artist ×${doubleEvictionSurvivals + tripleEvictionSurvivals}`
      )
    }

    const rewardsFound = rewardIds.size
    const seasonsPlayedLabel = `${seasonsPlayed} season${seasonsPlayed === 1 ? '' : 's'} entered`
    const competitiveBreakdown = [`${lohWins} LOH`, `${posWins} POS`]
    if (battleBackWins > 0) competitiveBreakdown.push(`${battleBackWins} BB`)

    return {
      playerName: userPlayer && userPlayer.name ? userPlayer.name : 'You',
      totals: {
        seasonsPlayed: seasonsPlayed,
        seasonsWon: seasonsWon,
        publicFavoriteWins: publicFavoriteWins,
        averageDaysSurvived: averageDaysSurvived,
        totalCompWins: totalCompWins,
        timesNominated: timesNominated,
        survivedNominations: survivedNominations,
        lohWins: lohWins,
        posWins: posWins,
        battleBackWins: battleBackWins,
        finalHohWins: finalHohWins,
        juryAppearances: juryAppearances,
        doubleEvictionSurvivals: doubleEvictionSurvivals,
        tripleEvictionSurvivals: tripleEvictionSurvivals,
        rewardsFound: rewardsFound,
      },
      quickStats: [
        { label: 'Seasons', value: String(seasonsPlayed), icon: '📚' },
        { label: 'Wins', value: String(seasonsWon), icon: '🏆' },
        { label: 'Rewards', value: String(rewardsFound), icon: '🥚' },
      ],
      featuredStats: [
        {
          label: 'Season wins',
          value: String(seasonsWon),
          helper: seasonsPlayed > 0 ? seasonsPlayedLabel : 'Start your first season',
          icon: '🏆',
          tone: 'gold',
          wide: true,
        },
        {
          label: 'Comp wins',
          value: String(totalCompWins),
          helper: competitiveBreakdown.join(' · '),
          icon: '⚔️',
          tone: 'violet',
        },
        {
          label: 'Avg survive',
          value: averageDaysSurvived,
          helper:
            survivedNominations > 0
              ? `${survivedNominations} block escape${survivedNominations === 1 ? '' : 's'}`
              : 'Build your survival streak',
          icon: '🛡️',
          tone: 'emerald',
        },
      ],
      sections: [
        {
          title: 'Competitive / Wins',
          icon: '⚔️',
          tone: 'violet',
          stats: [
            { label: 'LOH wins', value: String(lohWins), icon: '👑', tone: 'violet' },
            { label: 'POS wins', value: String(posWins), icon: '🔑', tone: 'violet' },
            { label: 'Returns won', value: String(battleBackWins), icon: '🔄', tone: 'violet' },
            { label: 'Final LOHs', value: String(finalHohWins), icon: '🎯', tone: 'violet' },
          ],
        },
        {
          title: 'Recognition / Social',
          icon: '🌟',
          tone: 'rose',
          stats: [
            { label: 'Fan favorite', value: String(publicFavoriteWins), icon: '🌟', tone: 'rose' },
            { label: 'Tribunal runs', value: String(juryAppearances), icon: '⚖️', tone: 'rose' },
            { label: 'Rewards found', value: String(rewardsFound), icon: '🥚', tone: 'rose' },
          ],
        },
        {
          title: 'Survival / Endurance',
          icon: '🛡️',
          tone: 'emerald',
          stats: [
            { label: 'Seasons played', value: String(seasonsPlayed), icon: '📅', tone: 'emerald' },
            { label: 'Nominations', value: String(timesNominated), icon: '🎯', tone: 'emerald' },
            {
              label: 'Block escapes',
              value: String(survivedNominations),
              icon: '🚪',
              tone: 'emerald',
            },
            {
              label: 'Double survives',
              value: String(doubleEvictionSurvivals),
              icon: '⚡',
              tone: 'emerald',
            },
            {
              label: 'Triple survives',
              value: String(tripleEvictionSurvivals),
              icon: '🔥',
              tone: 'emerald',
            },
          ],
        },
      ],
      highlightBadges: highlightBadges,
      hasHistory: seasonsPlayed > 0 || totalCompWins > 0 || rewardsFound > 0,
    }
  }

  function getAchievementToneStyles(tone) {
    switch (tone) {
      case 'gold':
        return {
          accent: 'var(--color-gold-primary, #fbbf24)',
          accentSoft: 'rgba(251, 191, 36, 0.18)',
          border: 'rgba(251, 191, 36, 0.28)',
          glow: 'rgba(245, 158, 11, 0.25)',
        }
      case 'rose':
        return {
          accent: '#f472b6',
          accentSoft: 'rgba(244, 114, 182, 0.16)',
          border: 'rgba(244, 114, 182, 0.24)',
          glow: 'rgba(244, 114, 182, 0.2)',
        }
      case 'emerald':
        return {
          accent: '#34d399',
          accentSoft: 'rgba(52, 211, 153, 0.16)',
          border: 'rgba(52, 211, 153, 0.24)',
          glow: 'rgba(52, 211, 153, 0.18)',
        }
      case 'violet':
      default:
        return {
          accent: 'var(--color-accent, #6366f1)',
          accentSoft: 'rgba(124, 146, 255, 0.18)',
          border: 'rgba(176, 198, 255, 0.18)',
          glow: 'rgba(124, 146, 255, 0.22)',
        }
    }
  }

  function buildAchievementCard(stat, variant) {
    const tone = getAchievementToneStyles(stat.tone)
    const isFeatured = variant === 'featured'
    const card = applyStyles(document.createElement('div'), {
      position: 'relative',
      overflow: 'hidden',
      padding: isFeatured ? '18px' : '14px',
      borderRadius: isFeatured ? '22px' : '18px',
      minHeight: isFeatured ? '118px' : '108px',
      background: `linear-gradient(160deg, ${tone.accentSoft} 0%, rgba(255,255,255,0.045) 42%, rgba(14,12,18,0.94) 100%)`,
      border: `1px solid ${tone.border}`,
      boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), 0 12px 28px ${tone.glow}`,
      display: 'grid',
      gap: isFeatured ? '14px' : '10px',
    })

    if (isFeatured && stat.wide) {
      card.style.gridColumn = '1 / -1'
    }

    const topRow = applyStyles(document.createElement('div'), {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: '10px',
    })

    const labelWrap = applyStyles(document.createElement('div'), {
      display: 'grid',
      gap: '6px',
    })
    labelWrap.appendChild(
      createTextNode('div', stat.label, {
        color: 'rgba(245, 247, 255, 0.7)',
        fontSize: isFeatured ? '12px' : '10px',
        fontWeight: '700',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
      })
    )
    labelWrap.appendChild(
      createTextNode('div', stat.value, {
        color: '#fff',
        fontSize: isFeatured ? '32px' : '24px',
        fontWeight: '800',
        lineHeight: '1',
      })
    )

    const iconBadge = createTextNode('div', stat.icon, {
      display: 'grid',
      placeItems: 'center',
      width: isFeatured ? '44px' : '34px',
      height: isFeatured ? '44px' : '34px',
      borderRadius: isFeatured ? '14px' : '12px',
      background: tone.accentSoft,
      border: `1px solid ${tone.border}`,
      boxShadow: `0 10px 24px ${tone.glow}`,
      fontSize: isFeatured ? '22px' : '18px',
      flexShrink: '0',
    })

    topRow.appendChild(labelWrap)
    topRow.appendChild(iconBadge)
    card.appendChild(topRow)

    if (stat.helper) {
      card.appendChild(
        createTextNode('p', stat.helper, {
          margin: '0',
          color: 'rgba(236, 241, 255, 0.78)',
          fontSize: isFeatured ? '13px' : '12px',
          lineHeight: '1.45',
        })
      )
    }

    return card
  }

  function buildAchievementSection(section) {
    const tone = getAchievementToneStyles(section.tone)
    const wrapper = applyStyles(document.createElement('section'), {
      display: 'grid',
      gap: '12px',
      padding: '16px',
      borderRadius: '22px',
      background: 'linear-gradient(180deg, rgba(31,28,36,0.82), rgba(15,13,19,0.92))',
      border: '1px solid rgba(205,190,236,0.09)',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
    })

    const heading = applyStyles(document.createElement('div'), {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '12px',
    })
    const titleWrap = applyStyles(document.createElement('div'), {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      minWidth: '0',
    })
    titleWrap.appendChild(
      createTextNode('span', section.icon, {
        display: 'grid',
        placeItems: 'center',
        width: '32px',
        height: '32px',
        borderRadius: '10px',
        background: tone.accentSoft,
        border: `1px solid ${tone.border}`,
        fontSize: '16px',
        flexShrink: '0',
      })
    )
    titleWrap.appendChild(
      createTextNode('h4', section.title, {
        margin: '0',
        color: '#fff',
        fontSize: '15px',
        fontWeight: '700',
        lineHeight: '1.2',
      })
    )
    heading.appendChild(titleWrap)
    wrapper.appendChild(heading)

    const grid = applyStyles(document.createElement('div'), {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(min(145px, 100%), 1fr))',
      gap: '10px',
    })
    section.stats.forEach(function (stat) {
      grid.appendChild(buildAchievementCard(stat, 'supporting'))
    })
    wrapper.appendChild(grid)

    return wrapper
  }

  function openAchievementsPanel() {
    const summary = collectAchievementStats()

    openHubDialog({
      title: 'Achievements',
      icon: '🏆',
      description: `${summary.playerName}'s trophy case.`,
      useBackButton: true,
      renderBody: function (body) {
        const hero = applyStyles(document.createElement('section'), {
          position: 'relative',
          overflow: 'hidden',
          display: 'grid',
          gap: '16px',
          padding: '20px',
          borderRadius: '24px',
          background:
            'radial-gradient(circle at 8% 0%, rgba(251,191,36,0.17), transparent 36%), radial-gradient(circle at 100% 0%, rgba(139,92,246,0.11), transparent 38%), linear-gradient(160deg, rgba(35,29,35,0.97), rgba(13,11,17,0.98))',
          border: '1px solid rgba(226,205,157,0.15)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 18px 40px rgba(0,0,0,0.28)',
        })

        const heroTop = applyStyles(document.createElement('div'), {
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
        })
        heroTop.appendChild(
          createTextNode('div', '🏆', {
            display: 'grid',
            placeItems: 'center',
            width: '68px',
            height: '68px',
            borderRadius: '22px',
            background:
              'linear-gradient(180deg, rgba(251,191,36,0.3) 0%, rgba(245,158,11,0.14) 100%)',
            border: '1px solid rgba(251,191,36,0.28)',
            boxShadow: '0 16px 34px rgba(245,158,11,0.24)',
            fontSize: '32px',
            flexShrink: '0',
          })
        )

        const heroCopy = applyStyles(document.createElement('div'), {
          display: 'grid',
          gap: '6px',
          minWidth: '0',
        })
        heroCopy.appendChild(
          createTextNode('h4', 'Trophy case', {
            margin: '0',
            color: '#fff',
            fontSize: '22px',
            fontWeight: '800',
            lineHeight: '1.1',
          })
        )
        heroCopy.appendChild(
          createTextNode('p', 'Big wins first, the full legacy right below.', {
            margin: '0',
            color: 'rgba(236, 241, 255, 0.78)',
            fontSize: '13px',
            lineHeight: '1.45',
          })
        )
        heroTop.appendChild(heroCopy)
        hero.appendChild(heroTop)

        const quickStats = applyStyles(document.createElement('div'), {
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
        })
        summary.quickStats.forEach(function (stat) {
          quickStats.appendChild(
            createTextNode('span', `${stat.icon} ${stat.label} ${stat.value}`, {
              padding: '8px 12px',
              borderRadius: '999px',
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#fff',
              fontSize: '12px',
              fontWeight: '700',
              lineHeight: '1',
            })
          )
        })
        hero.appendChild(quickStats)
        body.appendChild(hero)

        if (!summary.hasHistory) {
          body.appendChild(
            createTextNode(
              'p',
              'Complete a season to unlock your career timeline, stat cards, and achievement streaks.',
              {
                margin: '0',
                color: 'rgba(236, 241, 255, 0.78)',
                fontSize: '14px',
                lineHeight: '1.6',
              }
            )
          )
        }

        const featuredGrid = applyStyles(document.createElement('div'), {
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: '12px',
        })
        summary.featuredStats.forEach(function (stat) {
          featuredGrid.appendChild(buildAchievementCard(stat, 'featured'))
        })
        body.appendChild(featuredGrid)

        summary.sections.forEach(function (section) {
          body.appendChild(buildAchievementSection(section))
        })

        const badgeSection = applyStyles(document.createElement('section'), {
          display: 'grid',
          gap: '10px',
          padding: '16px',
          borderRadius: '22px',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
        })
        badgeSection.appendChild(
          createTextNode('p', 'Highlights', {
            margin: '0',
            fontSize: '12px',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'rgba(236, 241, 255, 0.6)',
            fontWeight: '700',
          })
        )

        if (summary.highlightBadges.length > 0) {
          const badgeWrap = applyStyles(document.createElement('div'), {
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
          })
          summary.highlightBadges.forEach(function (label, index) {
            const tone = index % 3 === 0 ? 'gold' : index % 3 === 1 ? 'violet' : 'rose'
            const palette = getAchievementToneStyles(tone)
            badgeWrap.appendChild(
              createTextNode('span', label, {
                padding: '8px 12px',
                borderRadius: '999px',
                background: palette.accentSoft,
                border: `1px solid ${palette.border}`,
                color: '#fff',
                fontSize: '13px',
                fontWeight: '700',
              })
            )
          })
          badgeSection.appendChild(badgeWrap)
        } else {
          badgeSection.appendChild(
            createTextNode('p', 'Your next badge unlocks once you finish a full season.', {
              margin: '0',
              color: 'rgba(236, 241, 255, 0.78)',
              fontSize: '14px',
              lineHeight: '1.5',
            })
          )
        }

        body.appendChild(badgeSection)
      },
    })
  }

  /**
   * Build a single chip element.
   * @param {object} def - Chip definition
   * @returns {HTMLElement}
   */
  function buildChip(def) {
    const btn = document.createElement('button')
    btn.className = `hub-chip hub-chip--${def.position}`
    btn.setAttribute('data-hub-id', def.id)
    btn.setAttribute('aria-label', def.label)
    btn.setAttribute('type', 'button')

    const icon = document.createElement('span')
    icon.className = `hub-chip__icon hub-chip__icon--${def.icon}`
    icon.setAttribute('aria-hidden', 'true')

    const badge = document.createElement('span')
    badge.className = 'hub-chip__badge'
    badge.setAttribute('aria-label', 'New notification')

    btn.appendChild(icon)
    btn.appendChild(badge)

    btn.addEventListener('click', function () {
      handleChipClick(def.id)
    })

    return btn
  }

  /**
   * Handle chip click events.
   * @param {string} id - Chip identifier
   */
  function handleChipClick(id) {
    console.debug('[introHub] chip tapped:', id)
    switch (id) {
      case 'houseguests':
        openHouseguests()
        break
      case 'sounds':
        toggleSounds()
        break
      case 'music':
        toggleMusic()
        break
      case 'settings':
        openSettings()
        break
      case 'news':
        openPlaceholder('News', '📰', 'Catch up on house headlines and fresh updates soon.')
        break
      case 'achievements':
        openAchievementsPanel()
        break
      case 'store':
        global.location.hash = '#/store'
        break
      case 'share':
        openShareDialog()
        break
      case 'feedback':
        openFeedbackComposer()
        break
      case 'social':
        openPlaceholder(
          'Social',
          '🔗',
          'Social links will land here once the community hub is live.'
        )
        break
      default:
        console.warn('[introHub] Unknown chip id:', id)
    }
  }

  /**
   * Open the Houseguests panel.
   * Uses window.game.houseguests.openPanel() if available,
   * otherwise uses window.HouseguestsModal.open() if loaded,
   * otherwise shows a placeholder.
   */
  function openHouseguests() {
    if (g.houseguests && typeof g.houseguests.openPanel === 'function') {
      g.houseguests.openPanel()
    } else if (global.HouseguestsModal && typeof global.HouseguestsModal.open === 'function') {
      global.HouseguestsModal.open('list')
    } else {
      openPlaceholder('Players', '👥', 'Player details will appear here.')
    }
  }

  /**
   * Open the Settings panel.
   * Uses the hash router as the primary action (always reliable).
   * Also calls window.game.settings.open() if present for any additional setup.
   */
  function openSettings() {
    global.location.hash = '#/settings'
    if (g.settings && typeof g.settings.open === 'function') {
      g.settings.open()
    }
  }

  /**
   * Toggle SFX on/off via window.toggleIntroHubSfx helper.
   * Updates chip inactive visual to reflect state.
   */
  function toggleSounds() {
    if (typeof global.toggleIntroHubSfx === 'function') {
      global.toggleIntroHubSfx()
    }
    toggleChipVisual('sounds', !!global._introhubSfxOn)
  }

  /**
   * Toggle music on/off via window.toggleIntroHubMusic helper.
   * Updates chip inactive visual to reflect state.
   */
  function toggleMusic() {
    if (typeof global.toggleIntroHubMusic === 'function') {
      global.toggleIntroHubMusic()
    }
    toggleChipVisual('music', !!global._introhubMusicOn)
  }

  /**
   * Toggle the inactive visual state of a chip.
   * @param {string} id     - Chip id (e.g. 'sounds')
   * @param {boolean} active - true = active (no overlay), false = inactive (dimmed + slash)
   */
  function toggleChipVisual(id, active) {
    var el = chipElements[id]
    if (!el) return
    if (active) {
      el.classList.remove('hub-chip--inactive')
    } else {
      el.classList.add('hub-chip--inactive')
    }
  }

  /**
   * Set or clear a notification dot on a chip.
   * @param {string} id    - Chip id (e.g. 'news')
   * @param {boolean} show - true to show dot, false to hide
   */
  function setNotification(id, show) {
    // Always persist to hubNotifications map regardless of whether chip is rendered yet
    if (!g.hubNotifications) g.hubNotifications = {}
    g.hubNotifications[id] = !!show

    const el = chipElements[id]
    if (!el) return
    if (show) {
      el.classList.add('hub-chip--has-notification')
    } else {
      el.classList.remove('hub-chip--has-notification')
    }
  }

  /**
   * Re-read window.game.hubNotifications and apply dots to all chips.
   */
  function refreshNotifications() {
    const map = g.hubNotifications || {}
    Object.keys(chipElements).forEach(function (id) {
      const el = chipElements[id]
      if (map[id]) {
        el.classList.add('hub-chip--has-notification')
      } else {
        el.classList.remove('hub-chip--has-notification')
      }
    })
  }

  /**
   * Initialize the intro hub inside the given container element.
   * @param {HTMLElement} container - The #intro-hub element
   */
  function init(container) {
    // Clear existing chips to make init idempotent
    container.innerHTML = ''
    chipElements = {}

    CHIPS.forEach(function (def) {
      const chip = buildChip(def)
      chipElements[def.id] = chip
      container.appendChild(chip)
    })

    // Apply any pre-configured notifications
    refreshNotifications()

    // Apply persisted audio visual state so chips reflect current on/off status
    toggleChipVisual('music', !!global._introhubMusicOn)
    toggleChipVisual('sounds', !!global._introhubSfxOn)

    console.info('[introHub] Initialized with', CHIPS.length, 'chips')
  }

  /**
   * Auto-initialize when #intro-hub is present in the DOM.
   */
  function autoInit() {
    const container = document.getElementById('intro-hub')
    if (container) {
      init(container)
    }
  }

  // Expose runtime API
  g.hub = {
    setNotification: setNotification,
    refreshNotifications: refreshNotifications,
    init: init,
    toggleChipVisual: toggleChipVisual,
    closeDialog: closeHubDialog,
  }

  // Expose houseguests panel hook (can be overridden before this module loads)
  if (!g.houseguests) {
    g.houseguests = {}
  }

  // Auto-initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit)
  } else {
    autoInit()
  }

  console.info('[introHub] Module loaded')
})(window)
