import { useMemo } from 'react'
import { useParams } from './useParams'

const steamAppTypes = new Set<number>([1, 2, 4, 8, 2048, 65536])

const getGameNameFromStores = (appId: number | undefined): string | null => {
  if (!appId) return null

  try {
    const appStoreRef = (window as any).appStore
    const overview = appStoreRef?.GetAppOverviewByGameID?.(appId)
    if (typeof overview?.display_name === 'string' && overview.display_name.trim().length > 0) {
      return overview.display_name.trim()
    }
  } catch {}

  try {
    const allApps = (window as any).collectionStore?.allGamesCollection?.allApps
    if (allApps && typeof allApps.forEach === 'function') {
      let foundName: string | null = null
      allApps.forEach((app: any) => {
        if (foundName) return
        if (Number(app?.appid) !== appId) return
        if (typeof app?.display_name === 'string' && app.display_name.trim().length > 0) {
          foundName = app.display_name.trim()
        }
      })
      if (foundName) {
        return foundName
      }
    }
  } catch {}

  return null
}

const decodeRouteValue = (rawAppId: string | undefined): string | null => {
  if (!rawAppId) return null
  try {
    const decoded = decodeURIComponent(rawAppId).trim()
    if (decoded.length === 0) return null
    if (/^\d+$/.test(decoded)) return null
    return decoded
  } catch {
    return null
  }
}

const isLikelySteamGame = (appId: number | undefined): boolean => {
  if (!appId) return false
  try {
    const overview = (window as any).appStore?.GetAppOverviewByGameID?.(appId)
    const appType = Number(overview?.app_type)
    if (Number.isFinite(appType)) {
      return steamAppTypes.has(appType)
    }
  } catch {}
  return false
}

export type GameIdentity = {
  rawAppId: string | undefined
  validAppId: number | undefined
  routeGameName: string | null
  shouldPreferNameLookup: boolean
}

export const useGameIdentity = (): GameIdentity => {
  const { appid: rawAppId } = useParams<{ appid?: string }>()

  const validAppId = useMemo(() => {
    const parsedAppId = Number(rawAppId)
    return Number.isInteger(parsedAppId) && parsedAppId > 0 ? parsedAppId : undefined
  }, [rawAppId])

  const routeGameName = useMemo(() => {
    const byStore = getGameNameFromStores(validAppId)
    if (byStore) return byStore
    return decodeRouteValue(rawAppId)
  }, [validAppId, rawAppId])

  const shouldPreferNameLookup = useMemo(() => {
    return Boolean(routeGameName) && !isLikelySteamGame(validAppId)
  }, [routeGameName, validAppId])

  return {
    rawAppId,
    validAppId,
    routeGameName,
    shouldPreferNameLookup,
  }
}
