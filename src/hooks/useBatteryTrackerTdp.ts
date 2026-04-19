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

const fetchRecentPowerDataFromBackend = async (): Promise<BatteryTrackerRecentData> => {
  try {
    const data = await call<[], BatteryTrackerRecentData>('get_battery_tracker_recent_power_data')
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

        const powerData = backendPowerData

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
