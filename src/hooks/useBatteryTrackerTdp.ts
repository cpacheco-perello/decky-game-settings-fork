import { useEffect, useMemo, useState } from 'react'
import { call } from '@decky/api'
import { batteryBadgeAverageTdpRange } from '../constants'

type BatteryTrackerPowerEntry = {
  name?: string
  average_power?: number | string
}

type BatteryTrackerRecentData = {
  is_detected?: boolean
  power_data?: BatteryTrackerPowerEntry[]
}

type UseBatteryTrackerTdpArgs = {
  enabled: boolean
  gameName: string | null
}

type UseBatteryTrackerTdpResult = {
  importedTdpWatts: number | null
  isBatteryTrackerDetected: boolean
}

declare global {
  interface Window {
    __DECKY_SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED_deckyLoaderAPIInit?: {
      connect: (version: number, pluginName: string) => any
    }
  }
}

const BATTERY_TRACKER_PLUGIN_NAMES = ['Battery Tracker', 'steam-deck-battery-tracker']

const normalise = (value: unknown): string => {
  if (typeof value !== 'string') return ''
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

const parseAveragePower = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const match = value.replace(',', '.').match(/-?\d+(?:\.\d+)?/)
    if (!match) return null
    const parsed = Number(match[0])
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

const clampTdp = (watts: number): number => {
  return Math.max(
    batteryBadgeAverageTdpRange.min,
    Math.min(batteryBadgeAverageTdpRange.max, Math.round(watts))
  )
}

const unwrapResult = (raw: any): BatteryTrackerRecentData | null => {
  if (!raw) return null

  if (typeof raw === 'object' && 'success' in raw && 'result' in raw) {
    const wrapped = (raw as any).result
    return wrapped && typeof wrapped === 'object' ? (wrapped as BatteryTrackerRecentData) : null
  }

  return typeof raw === 'object' ? (raw as BatteryTrackerRecentData) : null
}

const getPowerData = (raw: any): BatteryTrackerPowerEntry[] => {
  const data = unwrapResult(raw)
  return Array.isArray(data?.power_data) ? data.power_data : []
}

const toTokenSet = (value: string): Set<string> => {
  return new Set(value.split(' ').map((token) => token.trim()).filter((token) => token.length >= 3))
}

const getMatchScore = (requestedName: string, candidateName: string): number => {
  const requested = normalise(requestedName)
  const candidate = normalise(candidateName)

  if (!requested || !candidate) return 0
  if (requested === candidate) return 1
  if (requested.length >= 4 && candidate.includes(requested)) return 0.92
  if (candidate.length >= 4 && requested.includes(candidate)) return 0.88

  const requestedTokens = toTokenSet(requested)
  const candidateTokens = toTokenSet(candidate)
  if (requestedTokens.size === 0 || candidateTokens.size === 0) return 0

  let overlap = 0
  requestedTokens.forEach((token) => {
    if (candidateTokens.has(token)) overlap += 1
  })

  const requestedCoverage = overlap / requestedTokens.size
  const candidateCoverage = overlap / candidateTokens.size
  return Math.max(requestedCoverage * 0.85 + candidateCoverage * 0.15, requestedCoverage)
}

const pickBestCandidate = (requestedName: string, entries: BatteryTrackerPowerEntry[]): BatteryTrackerPowerEntry | null => {
  let best: BatteryTrackerPowerEntry | null = null
  let bestScore = 0
  let secondBestScore = 0

  for (const entry of entries) {
    if (!entry || typeof entry.name !== 'string') continue
    const score = getMatchScore(requestedName, entry.name)
    if (score > bestScore) {
      secondBestScore = bestScore
      bestScore = score
      best = entry
    } else if (score > secondBestScore) {
      secondBestScore = score
    }
  }

  if (bestScore >= 0.6) {
    return best
  }

  // Soft match fallback: accept a weaker score only if it is clearly above the second candidate.
  if (bestScore >= 0.35 && (bestScore - secondBestScore) >= 0.15) {
    return best
  }

  return null
}

const fetchRecentPowerData = async (api: any): Promise<BatteryTrackerPowerEntry[]> => {
  // Some loader/plugin combos accept kwargs, others positional, and some only default call.
  const attempts: Array<() => Promise<any>> = [
    () => api.call('get_recent_data', { lookback: 7 }),
    () => api.call('get_recent_data', 7),
    () => api.call('get_recent_data'),
  ]

  for (const attempt of attempts) {
    try {
      const raw = await attempt()
      const powerData = getPowerData(raw)
      if (powerData.length > 0) {
        return powerData
      }
    } catch {
      // Continue with next call shape.
    }
  }

  return []
}

const findPluginApi = (): any | null => {
  const internal = window.__DECKY_SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED_deckyLoaderAPIInit
  if (!internal?.connect) return null

  for (const pluginName of BATTERY_TRACKER_PLUGIN_NAMES) {
    try {
      const api = internal.connect(2, pluginName)
      if (api?.call) return api
    } catch {
      try {
        const api = internal.connect(1, pluginName)
        if (api?.call) return api
      } catch {}
    }
  }

  return null
}

const fetchRecentPowerDataFromBackend = async (): Promise<BatteryTrackerRecentData> => {
  try {
    const data = await call<[number], BatteryTrackerRecentData>('get_battery_tracker_recent_power_data', 7)
    return data && typeof data === 'object'
      ? data
      : { is_detected: false, power_data: [] }
  } catch {
    return { is_detected: false, power_data: [] }
  }
}

export const useBatteryTrackerTdp = ({ enabled, gameName }: UseBatteryTrackerTdpArgs): UseBatteryTrackerTdpResult => {
  const [importedTdpWatts, setImportedTdpWatts] = useState<number | null>(null)
  const [isBatteryTrackerDetected, setIsBatteryTrackerDetected] = useState<boolean>(false)

  const stableGameName = useMemo(() => {
    if (typeof gameName !== 'string') return null
    const value = gameName.trim()
    return value.length > 0 ? value : null
  }, [gameName])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      if (!enabled || !stableGameName) {
        if (!cancelled) {
          setImportedTdpWatts(null)
          setIsBatteryTrackerDetected(false)
        }
        return
      }

      const api = findPluginApi()

      if (!cancelled) {
        setIsBatteryTrackerDetected(false)
      }

      try {
        // Primary path: read Battery Tracker database through this plugin backend.
        const backendData = await fetchRecentPowerDataFromBackend()
        const backendPowerData = Array.isArray(backendData.power_data) ? backendData.power_data : []

        if (!cancelled) {
          setIsBatteryTrackerDetected(Boolean(backendData.is_detected))
        }

        let powerData = backendPowerData

        // Legacy fallback: attempt direct frontend bridge only if backend found no data.
        if (powerData.length === 0 && api) {
          powerData = await fetchRecentPowerData(api)
          if (!cancelled && powerData.length > 0) {
            setIsBatteryTrackerDetected(true)
          }
        }

        const candidate = pickBestCandidate(stableGameName, powerData)

        const parsed = parseAveragePower(candidate?.average_power)
        const nextValue = parsed !== null && parsed > 0 ? clampTdp(parsed) : null

        if (!cancelled) {
          setImportedTdpWatts(nextValue)
        }
      } catch {
        if (!cancelled) {
          setImportedTdpWatts(null)
        }
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [enabled, stableGameName])

  return {
    importedTdpWatts,
    isBatteryTrackerDetected,
  }
}
