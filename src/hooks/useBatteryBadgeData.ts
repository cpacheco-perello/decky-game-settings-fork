import { useEffect, useMemo, useState } from 'react'
import type { ExternalReview, GameDetails, GameInfo, GameReport } from '../interfaces'
import { fetchGameDataByAppId, fetchGameDataByGameName, getGamesBySearchTerm } from './deckVerifiedApi'

type UseBatteryBadgeDataArgs = {
  appId?: number
  gameName?: string
  filterDevices?: string[]
  preferNameLookup?: boolean
}

type BatterySummary = {
  isLoading: boolean
  hasReports: boolean
  hasReportsOutsideDeviceFilter: boolean
  reportCount: number
  batteryLifeMinutes: number | null
  averagePowerDraw: string | null
  resolvedReportAppId: number | null
  resolvedReportGameName: string | null
}

const emptySummary: BatterySummary = {
  isLoading: false,
  hasReports: false,
  hasReportsOutsideDeviceFilter: false,
  reportCount: 0,
  batteryLifeMinutes: null,
  averagePowerDraw: null,
  resolvedReportAppId: null,
  resolvedReportGameName: null,
}

const normaliseText = (value: unknown): string => {
  if (typeof value !== 'string') return ''
  return value.trim().toLowerCase()
}

const normaliseGameNameForMatch = (value: unknown): string => {
  if (typeof value !== 'string') return ''
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

const tokeniseName = (value: string): string[] =>
  value
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)

const extractNumberTokens = (value: string): string[] => value.match(/\b\d+\b/g) ?? []

const hasSameNumberTokens = (left: string, right: string): boolean => {
  const leftTokens = [...new Set(extractNumberTokens(left))]
  const rightTokens = [...new Set(extractNumberTokens(right))]

  if (leftTokens.length === 0 && rightTokens.length === 0) return true
  if (leftTokens.length !== rightTokens.length) return false

  return leftTokens.every((token) => rightTokens.includes(token))
}

const findExactGameSearchMatch = (requestedName: string, candidates: GameInfo[] | null): GameInfo | null => {
  if (!Array.isArray(candidates) || candidates.length === 0) return null

  const requested = normaliseGameNameForMatch(requestedName)
  if (!requested) return null

  return (
    candidates.find((candidate) => {
      const candidateName = normaliseGameNameForMatch(candidate?.title)
      return candidateName.length > 0 && candidateName === requested
    }) ?? null
  )
}

const collectGameNameCandidates = (details: GameDetails): string[] => {
  const names = new Set<string>()

  if (typeof details.gameName === 'string' && details.gameName.trim().length > 0) {
    names.add(details.gameName)
  }

  ;[...(details.reports ?? []), ...(details.external_reviews ?? [])].forEach((entry) => {
    const reportName = entry?.data?.game_name
    if (typeof reportName === 'string' && reportName.trim().length > 0) {
      names.add(reportName)
    }
  })

  return [...names]
}

const isLikelySameGameByName = (requestedName: string, details: GameDetails | null): boolean => {
  if (!details) return false

  const requested = normaliseGameNameForMatch(requestedName)
  if (!requested) return false

  const requestedTokens = tokeniseName(requested)

  const candidates = collectGameNameCandidates(details)
    .map((value) => normaliseGameNameForMatch(value))
    .filter((value) => value.length > 0)

  return candidates.some((candidate) => {
    if (!hasSameNumberTokens(requested, candidate)) {
      return false
    }

    if (candidate === requested) {
      return true
    }

    if (requestedTokens.length === 0) {
      return false
    }

    const candidateTokens = tokeniseName(candidate)
    const candidateTokenSet = new Set(candidateTokens)
    const matched = requestedTokens.filter((token) => candidateTokenSet.has(token)).length

    if (matched !== requestedTokens.length) {
      return false
    }

    return Math.abs(candidateTokens.length - requestedTokens.length) <= 1
  })
}

const resolveReportGameName = (details: GameDetails | null): string | null => {
  if (!details) return null

  if (typeof details.gameName === 'string' && details.gameName.trim().length > 0) {
    return details.gameName.trim()
  }

  for (const entry of [...(details.reports ?? []), ...(details.external_reviews ?? [])]) {
    const reportName = entry?.data?.game_name
    if (typeof reportName === 'string' && reportName.trim().length > 0) {
      return reportName.trim()
    }
  }

  return null
}

const resolveReportAppId = (details: GameDetails | null): number | null => {
  if (!details) return null

  if (typeof details.appId === 'number' && Number.isFinite(details.appId) && details.appId > 0) {
    return details.appId
  }

  for (const entry of [...(details.reports ?? []), ...(details.external_reviews ?? [])]) {
    const reportAppId = Number(entry?.data?.app_id)
    if (Number.isInteger(reportAppId) && reportAppId > 0) {
      return reportAppId
    }
  }

  return null
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
  if (!details) {
    return {
      ...emptySummary,
      resolvedReportAppId: null,
      resolvedReportGameName: null,
    }
  }

  const resolvedReportAppId = resolveReportAppId(details)
  const resolvedReportGameName = resolveReportGameName(details)

  const reports = details.reports ?? []
  const externalReviews = details.external_reviews ?? []
  const allEntries: Array<GameReport | ExternalReview> = [...reports, ...externalReviews]
  if (allEntries.length === 0) {
    return {
      hasReports: false,
      hasReportsOutsideDeviceFilter: false,
      reportCount: 0,
      batteryLifeMinutes: null,
      averagePowerDraw: null,
      resolvedReportAppId,
      resolvedReportGameName,
    }
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
      resolvedReportAppId,
      resolvedReportGameName,
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
    resolvedReportAppId,
    resolvedReportGameName,
  }
}

type BatterySummaryCacheEntry = {
  cachedAt: number
  value: Omit<BatterySummary, 'isLoading'>
}

const batterySummaryCache = new Map<string, BatterySummaryCacheEntry>()
const cacheTtlMs = 15 * 60 * 1000

const createCacheKey = (
  appId: number | null,
  gameName: string | null,
  filterKey: string,
  lookupMode: 'name-first' | 'id-first'
): string => {
  const source = appId ? `id:${appId}` : `name:${gameName ?? 'unknown'}`
  const deviceKey = filterKey.length > 0 ? filterKey : 'all-devices'
  return `${source}|devices:${deviceKey}|mode:${lookupMode}`
}

export const useBatteryBadgeData = ({
  appId,
  gameName,
  filterDevices = [],
  preferNameLookup = false,
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
  const lookupMode = useMemo<'name-first' | 'id-first'>(
    () => (preferNameLookup && stableGameName ? 'name-first' : 'id-first'),
    [preferNameLookup, stableGameName]
  )

  useEffect(() => {
    let cancelled = false

    if (!stableAppId && !stableGameName) {
      setSummary(emptySummary)
      return () => {
        cancelled = true
      }
    }

    const cacheKey = createCacheKey(stableAppId, stableGameName, filterKey, lookupMode)
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

        if (lookupMode === 'name-first' && stableGameName) {
          const searchMatches = await getGamesBySearchTerm(stableGameName)
          const exactMatch = findExactGameSearchMatch(stableGameName, searchMatches)

          if (
            exactMatch?.appId &&
            Number.isFinite(exactMatch.appId) &&
            exactMatch.appId > 0
          ) {
            const detailsByAppId = await fetchGameDataByAppId(exactMatch.appId)
            if (isLikelySameGameByName(stableGameName, detailsByAppId)) {
              details = detailsByAppId
            }
          }

          if (!details) {
            const detailsByName = await fetchGameDataByGameName(stableGameName)
            details = isLikelySameGameByName(stableGameName, detailsByName) ? detailsByName : null
          }
        } else {
          if (stableAppId) {
            details = await fetchGameDataByAppId(stableAppId)
          }
          if ((!hasEntries(details)) && stableGameName) {
            const detailsByName = await fetchGameDataByGameName(stableGameName)
            if (isLikelySameGameByName(stableGameName, detailsByName)) {
              details = detailsByName
            }
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
  }, [stableAppId, stableGameName, filterKey, lookupMode])

  return summary
}
