import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router'

type ManagerSection = 'music' | 'social'

const SHORTCUT_HOST_ATTR = 'data-qa-manager-shortcuts'

export default function QaManagerShortcuts() {
  const navigate = useNavigate()
  const location = useLocation()
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const ensureShortcutHost = () => {
      const inspector = document.querySelector<HTMLElement>('#dbg-overview')
      if (!inspector) {
        setPortalHost((current) => (current?.isConnected ? current : null))
        return
      }

      let host = inspector.querySelector<HTMLElement>(`[${SHORTCUT_HOST_ATTR}]`)
      if (!host) {
        host = document.createElement('div')
        host.setAttribute(SHORTCUT_HOST_ATTR, 'true')
        host.style.display = 'grid'
        host.style.gap = '0.5rem'

        const inspectorButtons = inspector.querySelectorAll<HTMLButtonElement>('button')
        const remoteManagerButton = [...inspectorButtons].find(
          (button) => button.textContent?.trim() === 'Open Remote Manager'
        )
        if (remoteManagerButton) {
          remoteManagerButton.insertAdjacentElement('afterend', host)
        } else {
          inspector.appendChild(host)
        }
      }

      setPortalHost((current) => (current === host ? current : host))
    }

    ensureShortcutHost()
    const observer = new MutationObserver(ensureShortcutHost)
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
      document.querySelector<HTMLElement>(`[${SHORTCUT_HOST_ATTR}]`)?.remove()
    }
  }, [])

  useEffect(() => {
    if (location.pathname !== '/remote-manager') return undefined

    const requestedSection = new URLSearchParams(location.search).get('section')
    if (requestedSection !== 'music' && requestedSection !== 'social') return undefined

    let attempts = 0
    const selectRequestedSection = () => {
      attempts += 1
      const tabSelector = '.remote-manager__tabs button'
      const tabButtons = document.querySelectorAll<HTMLButtonElement>(tabSelector)
      const button = [...tabButtons].find(
        (candidate) => candidate.textContent?.trim().toLowerCase() === requestedSection
      )

      if (button) {
        if (!button.classList.contains('is-active')) button.click()
        return true
      }
      return attempts >= 40
    }

    if (selectRequestedSection()) return undefined
    const intervalId = window.setInterval(() => {
      if (selectRequestedSection()) window.clearInterval(intervalId)
    }, 50)

    return () => window.clearInterval(intervalId)
  }, [location.pathname, location.search])

  const openManager = (section: ManagerSection) => {
    navigate(`/remote-manager?debug=1&section=${section}`)
  }

  if (!portalHost) return null

  return createPortal(
    <>
      <button
        className="dbg-btn dbg-btn--wide"
        type="button"
        onClick={() => openManager('music')}
      >
        Open Music Manager
      </button>
      <button
        className="dbg-btn dbg-btn--wide"
        type="button"
        onClick={() => openManager('social')}
      >
        Open Social Manager
      </button>
    </>,
    portalHost
  )
}
