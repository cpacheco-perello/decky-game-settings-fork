// Site URLs
import type {
  NotificationSettings,
  NotificationRecord,
  PluginConfig,
  BatteryBadgeSize,
} from './interfaces'

export const reportsApiBaseUrl = 'https://deckverified.games/deck-verified/api/v1'
export const reportsWebsiteBaseUrl = 'https://deckverified.games'

export const defaultNotificationSettings: NotificationSettings = {
  onGameStartWithReports: true,
  onGameStartWithoutReports: false,
  onGameStopWithReports: false,
  onGameStopWithoutReports: true,
  notifyOncePerGame: false,
}

export const batteryBadgeOffsetLeftRange = { min: 0, max: 1200 }
export const batteryBadgeOffsetTopRange = { min: 0, max: 400 }
export const batteryBadgeAverageTdpRange = { min: 0, max: 45 }

const legacyDefaultBatteryBadgeOffsetLeft = 18
const legacyDefaultBatteryBadgeOffsetTop = 16

export const defaultBatteryBadgeOffsetLeft = 0
export const defaultBatteryBadgeOffsetTop = 0
export const defaultBatteryBadgeSize: BatteryBadgeSize = 'regular'
export const defaultUseBatteryTrackerTdp = false

const validBadgeSizes = ['compact', 'regular', 'large'] as const
const gameTdpOverridesKey = `${__PLUGIN_NAME__}:gameTdpOverrides`

type GameTdpOverrides = Record<string, number>

const clampNumber = (value: unknown, min: number, max: number, fallback: number): number => {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.round(parsed)))
}

const notificationSettingsKey = `${__PLUGIN_NAME__}:notificationRecord`

export const loadNotificationRecord = (): NotificationRecord => {
  const raw = window.localStorage.getItem(notificationSettingsKey)
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? (parsed as NotificationRecord) : {}
  } catch (error) {
    console.error('[decky-game-settings:constants] Failed to parse notification record config:', error)
    return {}
  }
}

export const saveNotificationRecord = (record: NotificationRecord): void => {
  try {
    window.localStorage.setItem(notificationSettingsKey, JSON.stringify(record))
  } catch (error) {
    console.error('[decky-game-settings:constants] Failed to save notification record config:', error)
  }
}

export const makeNotificationRecordKey = (appId: number | undefined, gameName: string): string => {
  const safeName = gameName ?? 'Unknown'
  const prefix = typeof appId === 'number' && Number.isFinite(appId) ? String(appId) : 'none'
  return `${prefix}_${safeName}`
}

export const notificationMeta = {
  onGameStartWithReports: {
    title: 'Deck Settings: Reports Found',
    body: 'Check out game reports before playing.',
  },
  onGameStartWithoutReports: {
    title: 'Deck Settings: No Reports Found',
    body: 'Be the first to submit a game report!',
  },
  onGameStopWithReports: {
    title: 'Deck Settings: Reports Available',
    body: 'Open the plugin to check them out.',
  },
  onGameStopWithoutReports: {
    title: 'Deck Settings: No Reports Yet',
    body: 'Help others—submit a game report.',
  },
}

// List of apps to always filter out
export const ignoreListAppRegex = [/^Proton\s\d+\.\d+$/, /^Steam Linux Runtime \d+\.\d+\s\(.*\)$/]
export const ignoreListCompatibilityTools = [
  2180100, // Proton Hotfix
  1493710, // Proton Experimental
  1070560, // Steam Linux Runtime
  1070560, // "Steam Linux Runtime 1.0 (scout)"
  1391110, // "Steam Linux Runtime 2.0 (soldier)"
  1628350, // "Steam Linux Runtime 3.0 (sniper)"
  228980, // "Steamworks Common Redistributables"
]

export const restartSteamClient = (): void => {
  SteamClient.User.StartRestart(false)
}

export const generateUniqueId = (): string => {
  // Use the built-in randomUUID if available
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  } else if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    // Create a template string by forcing the first value to a string.
    const template = String(1e7) + -1e3 + -4e3 + -8e3 + -1e11
    return template.replace(/[018]/g, (c) =>
      (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16)
    )
  }
  // Fallback if crypto is not available
  return Math.random().toString(36).substring(2) + Date.now().toString(36)
}

const pluginSettingsKey = __PLUGIN_NAME__

export const makeGameTdpOverrideKey = (appId: number | undefined, gameName: string | null | undefined): string | null => {
  if (typeof appId === 'number' && Number.isFinite(appId) && appId > 0) {
    return `id:${appId}`
  }
  if (typeof gameName !== 'string') {
    return null
  }
  const normalizedName = gameName.trim().toLowerCase()
  if (normalizedName.length === 0) {
    return null
  }
  return `name:${normalizedName}`
}

const normalizeGameTdpOverrides = (raw: unknown): GameTdpOverrides => {
  if (!raw || typeof raw !== 'object') {
    return {}
  }

  const normalized: GameTdpOverrides = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof key !== 'string' || key.trim().length === 0) {
      continue
    }
    const watts = clampNumber(value, batteryBadgeAverageTdpRange.min, batteryBadgeAverageTdpRange.max, 0)
    if (watts > 0) {
      normalized[key] = watts
    }
  }

  return normalized
}

export const loadGameTdpOverrides = (): GameTdpOverrides => {
  const raw = window.localStorage.getItem(gameTdpOverridesKey)
  if (!raw) {
    return {}
  }
  try {
    const parsed = JSON.parse(raw)
    return normalizeGameTdpOverrides(parsed)
  } catch (error) {
    console.error('[decky-game-settings:constants] Failed to parse game TDP overrides:', error)
    return {}
  }
}

export const saveGameTdpOverrides = (overrides: GameTdpOverrides): void => {
  try {
    window.localStorage.setItem(gameTdpOverridesKey, JSON.stringify(overrides))
  } catch (error) {
    console.error('[decky-game-settings:constants] Failed to save game TDP overrides:', error)
  }
}

export const getGameTdpOverrideWatts = (key: string | null): number | null => {
  if (!key) {
    return null
  }
  const overrides = loadGameTdpOverrides()
  const value = overrides[key]
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

export const setGameTdpOverrideWatts = (key: string | null, watts: number | null): void => {
  if (!key) {
    return
  }

  const overrides = loadGameTdpOverrides()
  const safeWatts = clampNumber(watts, batteryBadgeAverageTdpRange.min, batteryBadgeAverageTdpRange.max, 0)

  if (safeWatts <= 0) {
    delete overrides[key]
  } else {
    overrides[key] = safeWatts
  }

  saveGameTdpOverrides(overrides)
}

export const getPluginConfig = (): PluginConfig => {
  const defaultConfig: PluginConfig = {
    filterDevices: [],
    showAllApps: false,
    batteryBadgeOffsetLeft: defaultBatteryBadgeOffsetLeft,
    batteryBadgeOffsetTop: defaultBatteryBadgeOffsetTop,
    batteryBadgeSize: defaultBatteryBadgeSize,
    useBatteryTrackerTdp: defaultUseBatteryTrackerTdp,
    notificationSettings: { ...defaultNotificationSettings },
  }
  const dataJson = window.localStorage.getItem(pluginSettingsKey)
  let config: PluginConfig = defaultConfig
  if (dataJson) {
    try {
      const parsedConfig = JSON.parse(dataJson)
      config = {
        ...defaultConfig,
        ...parsedConfig,
      }
    } catch (error) {
      console.error('[decky-game-settings:constants] Failed to parse plugin config:', error)
    }
  }

  // Legacy cleanup: global average TDP is no longer supported.
  if ('batteryBadgeAverageTdpWatts' in (config as any)) {
    delete (config as any).batteryBadgeAverageTdpWatts
  }

  config.notificationSettings = {
    ...defaultNotificationSettings,
    ...(config.notificationSettings ?? {}),
  }
  config.batteryBadgeOffsetLeft = clampNumber(
    config.batteryBadgeOffsetLeft,
    batteryBadgeOffsetLeftRange.min,
    batteryBadgeOffsetLeftRange.max,
    defaultBatteryBadgeOffsetLeft
  )
  config.batteryBadgeOffsetTop = clampNumber(
    config.batteryBadgeOffsetTop,
    batteryBadgeOffsetTopRange.min,
    batteryBadgeOffsetTopRange.max,
    defaultBatteryBadgeOffsetTop
  )

  // Legacy migration for old absolute-position defaults.
  if (
    config.batteryBadgeOffsetLeft === legacyDefaultBatteryBadgeOffsetLeft &&
    config.batteryBadgeOffsetTop === legacyDefaultBatteryBadgeOffsetTop
  ) {
    config.batteryBadgeOffsetLeft = defaultBatteryBadgeOffsetLeft
    config.batteryBadgeOffsetTop = defaultBatteryBadgeOffsetTop
  }

  config.batteryBadgeSize = validBadgeSizes.includes(config.batteryBadgeSize)
    ? config.batteryBadgeSize
    : defaultBatteryBadgeSize
  config.useBatteryTrackerTdp = Boolean(config.useBatteryTrackerTdp)

  // If the installation ID is not present, generate one and save it.
  if (!('installationId' in config) || !config.installationId) {
    config.installationId = generateUniqueId()
    window.localStorage.setItem(pluginSettingsKey, JSON.stringify(config))
  }
  return config
}

export const setPluginConfig = (updates: Partial<PluginConfig>): void => {
  const currentConfig = getPluginConfig()
  const newConfig = {
    ...currentConfig,
    ...updates,
    notificationSettings: {
      ...defaultNotificationSettings,
      ...(currentConfig.notificationSettings ?? {}),
      ...(updates.notificationSettings ?? {}),
    },
  }

  // Legacy cleanup: global average TDP is no longer supported.
  if ('batteryBadgeAverageTdpWatts' in (newConfig as any)) {
    delete (newConfig as any).batteryBadgeAverageTdpWatts
  }

  try {
    window.localStorage.setItem(pluginSettingsKey, JSON.stringify(newConfig))
    //console.debug('[decky-game-settings:constants] Plugin configuration updated:', newConfig)
  } catch (error) {
    console.error('[decky-game-settings:constants] Failed to save plugin config:', error)
  }
}

export const hasYoutubeLink = (text: string): boolean => {
  const regex = /(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/
  return regex.test(text)
}

export const formatMinutes = (minutes: number): string => {
  if (minutes < 60) {
    return `${minutes} ${minutes === 1 ? 'min' : 'mins'}`
  }
  const hours = Math.floor(minutes / 60)
  const remainingMins = minutes % 60
  const hourStr = hours === 1 ? 'hour' : 'hours'
  const minuteStr = remainingMins === 1 ? 'min' : 'mins'
  if (remainingMins === 0) {
    return `${hours} ${hourStr}`
  }
  return `${hours} ${hourStr}, ${remainingMins} ${minuteStr}`
}
