import { useEffect, useMemo, useState } from 'react'
import type { ExternalReview, GameDetails, GameReport } from '../interfaces'
import { fetchGameDataByAppId } from './deckVerifiedApi'

type BatterySummary = {
  isLoading: boolean
  hasReports: boolean
  reportCount: number
  batteryLifeMinutes: number | null
  averagePowerDraw: string | null
}

const emptySummary: BatterySummary = {
  isLoading: false,
  hasReports: false,
  reportCount: 0,
  batteryLifeMinutes: null,
  averagePowerDraw: null,
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

const resolveSummary = (details: GameDetails | null): Omit<BatterySummary, 'isLoading'> => {
  if (!details) return emptySummary

  const reports = details.reports ?? []
  const externalReviews = details.external_reviews ?? []
  const allEntries: Array<GameReport | ExternalReview> = [...reports, ...externalReviews]
  if (allEntries.length === 0) {
    return emptySummary
  }

  const minuteValues: number[] = []
  const wattValues: number[] = []
  const rawDrawValues: string[] = []

  allEntries.forEach((entry) => {
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

  const reportCount = allEntries.filter((entry) => {
    const minutes = entry?.data?.calculated_battery_life_minutes
    const draw = entry?.data?.average_battery_power_draw
    const hasMinutes = typeof minutes === 'number' && Number.isFinite(minutes) && minutes > 0
    const hasDraw = typeof draw === 'string' && draw.trim().length > 0
    return hasMinutes || hasDraw
  }).length

  return {
    hasReports: true,
    reportCount,
    batteryLifeMinutes,
    averagePowerDraw,
  }
}

type BatterySummaryCacheEntry = {
  cachedAt: number
  value: Omit<BatterySummary, 'isLoading'>
}

const batterySummaryCache = new Map<number, BatterySummaryCacheEntry>()
const cacheTtlMs = 15 * 60 * 1000

export const useBatteryBadgeData = (appId?: number): BatterySummary => {
  const [summary, setSummary] = useState<BatterySummary>(emptySummary)
  const stableAppId = useMemo(
    () => (typeof appId === 'number' && Number.isFinite(appId) && appId > 0 ? appId : null),
    [appId]
  )

  useEffect(() => {
    let cancelled = false

    if (!stableAppId) {
      setSummary(emptySummary)
      return () => {
        cancelled = true
      }
    }

    const now = Date.now()
    const cached = batterySummaryCache.get(stableAppId)
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
        const details = await fetchGameDataByAppId(stableAppId)
        if (cancelled) return

        const resolved = resolveSummary(details)
        batterySummaryCache.set(stableAppId, { cachedAt: Date.now(), value: resolved })
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
  }, [stableAppId])

  return summary
}