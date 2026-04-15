import { useEffect, useMemo, useState } from 'react'
import type { ExternalReview, GameDetails, GameReport } from '../interfaces'
import { fetchGameDataByAppId, fetchGameDataByGameName } from './deckVerifiedApi'

type UseBatteryBadgeDataArgs = {
  appId?: number
  gameName?: string
  filterDevices?: string[]
}

type BatterySummary = {
  isLoading: boolean
  hasReports: boolean
  hasReportsOutsideDeviceFilter: boolean
  reportCount: number
  batteryLifeMinutes: number | null
  averagePowerDraw: string | null
}

const emptySummary: BatterySummary = {
  isLoading: false,
  hasReports: false,
  hasReportsOutsideDeviceFilter: false,
  reportCount: 0,
  batteryLifeMinutes: null,
  averagePowerDraw: null,
}

const normaliseText = (value: unknown): string => {
  if (typeof value !== 'string') return ''
  return value.trim().toLowerCase()
}

const parseWatts = (raw: string): number | null => {
  const match = raw.replace(',', '.').match(/-?\d+(?:\.\d+)?/)
  if (!match) return null
  const parsed = Number(match[0])
  return Number.isFinite(parsed) ? parsed : null
}

const formatWatts = (watts: number): string => {
  if (watts >= 10) return `${watts.toFixed(0)} W`
  return `${watts.toFixed(1)} W`
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2)
  }
  return Math.round(sorted[mid])
}

const hasEntries = (details: GameDetails | null): boolean => {
  if (!details) return false
  return (details.reports?.length ?? 0) + (details.external_reviews?.length ?? 0) > 0
}

const extractDeviceLabel = (value: string): string => {
  const [, ...rest] = value.split(':')
  if (rest.length === 0) return value.trim()
  return rest.join(':').trimStart()
}

const collectDeviceCandidates = (entry: GameReport | ExternalReview): string[] => {
  const candidates: string[] = []
  if (typeof entry?.data?.device === 'string' && entry.data.device.trim().length > 0) {
    candidates.push(entry.data.device)
  }

  if ('labels' in entry && Array.isArray(entry.labels)) {
    entry.labels.forEach((label) => {
      if (typeof label?.name !== 'string') return
      if (!label.name.startsWith('DEVICE:')) return
      const labelName = extractDeviceLabel(label.name)
      if (labelName) {
        candidates.push(labelName)
      }
    })
  }

  return candidates
}

const matchesSelectedDevices = (entry: GameReport | ExternalReview, selectedDeviceSet: Set<string>): boolean => {
  if (selectedDeviceSet.size === 0) return true
  const candidates = collectDeviceCandidates(entry)
  if (candidates.length === 0) return false
  return candidates.some((candidate) => selectedDeviceSet.has(normaliseText(candidate)))
}

const resolveSummary = (
  details: GameDetails | null,
  selectedDevices: string[]
): Omit<BatterySummary, 'isLoading'> => {
  if (!details) return emptySummary

  const reports = details.reports ?? []
  const externalReviews = details.external_reviews ?? []
  const allEntries: Array<GameReport | ExternalReview> = [...reports, ...externalReviews]
  if (allEntries.length === 0) {
    return emptySummary
  }

  const selectedDeviceSet = new Set(
    selectedDevices
      .map((value) => normaliseText(value))
      .filter((value) => value.length > 0)
  )

  const filteredEntries = allEntries.filter((entry) => matchesSelectedDevices(entry, selectedDeviceSet))
  const hasReportsOutsideDeviceFilter = selectedDeviceSet.size > 0 && filteredEntries.length === 0

  if (filteredEntries.length === 0) {
    return {
      hasReports: false,
      hasReportsOutsideDeviceFilter,
      reportCount: 0,
      batteryLifeMinutes: null,
      averagePowerDraw: null,
    }
  }

  const minuteValues: number[] = []
  const wattValues: number[] = []
  const rawDrawValues: string[] = []

  filteredEntries.forEach((entry) => {
    const minutes = entry?.data?.calculated_battery_life_minutes
    const draw = entry?.data?.average_battery_power_draw

    if (typeof minutes === 'number' && Number.isFinite(minutes) && minutes > 0) {
      minuteValues.push(minutes)
    }

    if (typeof draw === 'string' && draw.trim().length > 0) {
      rawDrawValues.push(draw.trim())
      const parsedWatts = parseWatts(draw)
      if (parsedWatts !== null) {
        wattValues.push(parsedWatts)
      }
    }
  })

  const batteryLifeMinutes = minuteValues.length > 0 ? median(minuteValues) : null

  let averagePowerDraw: string | null = null
  if (wattValues.length > 0) {
    const avgWatts = wattValues.reduce((total, value) => total + value, 0) / wattValues.length
    averagePowerDraw = formatWatts(avgWatts)
  } else if (rawDrawValues.length > 0) {
    averagePowerDraw = rawDrawValues[0]
  }

  const reportCount = filteredEntries.filter((entry) => {
    const minutes = entry?.data?.calculated_battery_life_minutes
    const draw = entry?.data?.average_battery_power_draw
    const hasMinutes = typeof minutes === 'number' && Number.isFinite(minutes) && minutes > 0
    const hasDraw = typeof draw === 'string' && draw.trim().length > 0
    return hasMinutes || hasDraw
  }).length

  return {
    hasReports: true,
    hasReportsOutsideDeviceFilter,
    reportCount,
    batteryLifeMinutes,
    averagePowerDraw,
  }
}

type BatterySummaryCacheEntry = {
  cachedAt: number
  value: Omit<BatterySummary, 'isLoading'>
}

const batterySummaryCache = new Map<string, BatterySummaryCacheEntry>()
const cacheTtlMs = 15 * 60 * 1000

const createCacheKey = (appId: number | null, gameName: string | null, filterKey: string): string => {
  const source = appId ? `id:${appId}` : `name:${gameName ?? 'unknown'}`
  const deviceKey = filterKey.length > 0 ? filterKey : 'all-devices'
  return `${source}|devices:${deviceKey}`
}

export const useBatteryBadgeData = ({
  appId,
  gameName,
  filterDevices = [],
}: UseBatteryBadgeDataArgs): BatterySummary => {
  const [summary, setSummary] = useState<BatterySummary>(emptySummary)

  const stableAppId = useMemo(
    () => (typeof appId === 'number' && Number.isFinite(appId) && appId > 0 ? appId : null),
    [appId]
  )

  const stableGameName = useMemo(() => {
    if (typeof gameName !== 'string') return null
    const value = gameName.trim()
    return value.length > 0 ? value : null
  }, [gameName])

  const filterKey = useMemo(
    () =>
      [...(filterDevices ?? [])]
        .map((value) => normaliseText(value))
        .filter((value) => value.length > 0)
        .sort((a, b) => a.localeCompare(b))
        .join('|'),
    [filterDevices]
  )

  const normalisedFilterDevices = useMemo(() => (filterKey.length > 0 ? filterKey.split('|') : []), [filterKey])

  useEffect(() => {
    let cancelled = false

    if (!stableAppId && !stableGameName) {
      setSummary(emptySummary)
      return () => {
        cancelled = true
      }
    }

    const cacheKey = createCacheKey(stableAppId, stableGameName, filterKey)
    const now = Date.now()
    const cached = batterySummaryCache.get(cacheKey)
    if (cached && now - cached.cachedAt < cacheTtlMs) {
      setSummary({
        isLoading: false,
        ...cached.value,
      })
      return () => {
        cancelled = true
      }
    }

    setSummary((prev) => ({
      ...prev,
      isLoading: true,
    }))

    const load = async () => {
      try {
        let details: GameDetails | null = null

        if (stableAppId) {
          details = await fetchGameDataByAppId(stableAppId)
        }

        if ((!hasEntries(details)) && stableGameName) {
          const detailsByName = await fetchGameDataByGameName(stableGameName)
          if (detailsByName) {
            details = detailsByName
          }
        }

        if (cancelled) return

        const resolved = resolveSummary(details, normalisedFilterDevices)
        batterySummaryCache.set(cacheKey, { cachedAt: Date.now(), value: resolved })

        setSummary({
          isLoading: false,
          ...resolved,
        })
      } catch (error) {
        console.error('[decky-game-settings:useBatteryBadgeData] Failed to load badge data', error)
        if (!cancelled) {
          setSummary(emptySummary)
        }
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [stableAppId, stableGameName, filterKey])

  return summary
}
