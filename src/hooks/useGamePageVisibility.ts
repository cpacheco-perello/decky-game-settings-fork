import { useEffect, useRef, useState } from 'react'
import { appActionButtonClasses, appDetailsClasses, appDetailsHeaderClasses, Router } from '@decky/ui'

const appBusyDisplayStatuses = new Set<number>([1, 4, 8, 36])

const getAppDisplayStatus = (appId: number | undefined): number | null => {
  if (!appId) return null
  try {
    const overview = (window as any).appStore?.GetAppOverviewByGameID?.(appId)
    const status = Number(overview?.display_status)
    return Number.isFinite(status) ? status : null
  } catch {
    return null
  }
}

const isCurrentAppBusy = (appId: number | undefined): boolean => {
  const running = Boolean((Router as any).MainRunningApp?.appid)
  if (running) {
    return true
  }

  const displayStatus = getAppDisplayStatus(appId)
  if (displayStatus === null) {
    return false
  }

  return appBusyDisplayStatuses.has(displayStatus)
}

const isPlayButtonClick = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) {
    return false
  }

  const playButtonClass = appActionButtonClasses?.PlayButton
  const playContainerClass = appActionButtonClasses?.PlayButtonContainer
  if (!playButtonClass && !playContainerClass) {
    return false
  }

  let node: Element | null = target
  while (node) {
    const className = typeof (node as HTMLElement).className === 'string' ? (node as HTMLElement).className : ''
    if (
      (playButtonClass && className.includes(playButtonClass)) ||
      (playContainerClass && className.includes(playContainerClass))
    ) {
      return true
    }
    node = node.parentElement
  }

  return false
}

const findTopCapsuleParent = (ref: HTMLDivElement | null): Element | null => {
  const children = ref?.parentElement?.children
  if (!children) {
    return null
  }

  let headerContainer: Element | undefined
  for (const child of Array.from(children)) {
    const className = typeof (child as HTMLElement).className === 'string' ? (child as HTMLElement).className : ''
    if (className.includes(appDetailsClasses.Header)) {
      headerContainer = child
      break
    }
  }

  if (!headerContainer) {
    return null
  }

  for (const child of Array.from(headerContainer.children)) {
    const className = typeof (child as HTMLElement).className === 'string' ? (child as HTMLElement).className : ''
    if (className.includes(appDetailsHeaderClasses.TopCapsule)) {
      return child
    }
  }

  return null
}

type UseGamePageVisibilityArgs = {
  appId: number | undefined
  badgeRef: React.RefObject<HTMLDivElement | null>
}

export const useGamePageVisibility = ({ appId, badgeRef }: UseGamePageVisibilityArgs): boolean => {
  const [isSuspended, setIsSuspended] = useState<boolean>(() => isCurrentAppBusy(appId))
  const [isLaunchPending, setIsLaunchPending] = useState<boolean>(false)
  const [isTopCapsuleVisible, setIsTopCapsuleVisible] = useState<boolean>(true)
  const launchResetTimerRef = useRef<number | null>(null)

  const clearLaunchResetTimer = () => {
    if (launchResetTimerRef.current !== null) {
      window.clearTimeout(launchResetTimerRef.current)
      launchResetTimerRef.current = null
    }
  }

  const armLaunchPendingTimeout = () => {
    clearLaunchResetTimer()
    launchResetTimerRef.current = window.setTimeout(() => {
      launchResetTimerRef.current = null
      const runningAppId = (Router as any).MainRunningApp?.appid
      if (!runningAppId) {
        setIsLaunchPending(false)
      }
    }, 25000)
  }

  useEffect(() => {
    const updateSuspended = () => {
      const busy = isCurrentAppBusy(appId)
      setIsSuspended(busy)
      if (busy) {
        setIsLaunchPending(false)
        clearLaunchResetTimer()
      }
    }

    updateSuspended()

    const intervalId = window.setInterval(updateSuspended, 1000)

    let handle: { unregister?: () => void } | null = null
    try {
      handle = SteamClient?.GameSessions?.RegisterForAppLifetimeNotifications?.(() => {
        updateSuspended()
      })
    } catch {}

    return () => {
      window.clearInterval(intervalId)
      try {
        handle?.unregister?.()
      } catch {}
      clearLaunchResetTimer()
    }
  }, [appId])

  useEffect(() => {
    const onDocumentClickCapture = (event: Event) => {
      if (!isPlayButtonClick(event.target)) {
        return
      }
      setIsLaunchPending(true)
      armLaunchPendingTimeout()
    }

    document.addEventListener('click', onDocumentClickCapture, true)
    return () => {
      document.removeEventListener('click', onDocumentClickCapture, true)
    }
  }, [])

  useEffect(() => {
    const topCapsule = findTopCapsuleParent(badgeRef.current)
    if (!topCapsule) {
      return
    }

    const updateTopCapsuleVisibility = (target: Element) => {
      const className = typeof target.className === 'string' ? target.className : ''
      const fullscreenMode =
        className.includes(appDetailsHeaderClasses.FullscreenEnterStart) ||
        className.includes(appDetailsHeaderClasses.FullscreenEnterActive) ||
        className.includes(appDetailsHeaderClasses.FullscreenEnterDone) ||
        className.includes(appDetailsHeaderClasses.FullscreenExitStart) ||
        className.includes(appDetailsHeaderClasses.FullscreenExitActive)
      const fullscreenAborted = className.includes(appDetailsHeaderClasses.FullscreenExitDone)
      setIsTopCapsuleVisible(!fullscreenMode || fullscreenAborted)
    }

    updateTopCapsuleVisibility(topCapsule)

    const mutationObserver = new MutationObserver((entries) => {
      for (const entry of entries) {
        if (entry.type !== 'attributes' || entry.attributeName !== 'class') {
          continue
        }
        updateTopCapsuleVisibility(entry.target as Element)
      }
    })

    mutationObserver.observe(topCapsule, { attributes: true, attributeFilter: ['class'] })
    return () => {
      mutationObserver.disconnect()
    }
  }, [badgeRef])

  return isSuspended || isLaunchPending || !isTopCapsuleVisible
}
