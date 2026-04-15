import React, { useMemo } from 'react'
import { DialogButton, Navigation } from '@decky/ui'
import { MdBattery5Bar } from 'react-icons/md'
import { formatMinutes, getPluginConfig, reportsWebsiteBaseUrl } from '../../constants'
import type { BatteryBadgePosition, BatteryBadgeSize } from '../../interfaces'
import { useParams } from '../../hooks/useParams'
import { useBatteryBadgeData } from '../../hooks/useBatteryBadgeData'

type GameBatteryBadgeProps = {
  'data-decky-game-settings-battery-badge'?: boolean
}

type BadgeSizePreset = {
  maxWidth: string
  minWidth: string
  cardPadding: string
  cardGap: string
  titleFontSize: string
  metricValueFontSize: string
  drawValueFontSize: string
  buttonMinWidth: string
  buttonHeight: string
  buttonFontSize: string
}

const containerBaseStyle: React.CSSProperties = {
  position: 'absolute',
  zIndex: 30,
  width: 'fit-content',
}

const badgePositionStyles: Record<BatteryBadgePosition, React.CSSProperties> = {
  'top-right': { top: '16px', right: '18px' },
  'top-left': { top: '16px', left: '18px' },
  'bottom-right': { bottom: '18px', right: '18px' },
  'bottom-left': { bottom: '18px', left: '18px' },
}

const sizePresets: Record<BatteryBadgeSize, BadgeSizePreset> = {
  compact: {
    maxWidth: '260px',
    minWidth: '186px',
    cardPadding: '7px 8px 8px 8px',
    cardGap: '5px',
    titleFontSize: '11px',
    metricValueFontSize: '14px',
    drawValueFontSize: '12px',
    buttonMinWidth: '72px',
    buttonHeight: '24px',
    buttonFontSize: '10px',
  },
  regular: {
    maxWidth: '320px',
    minWidth: '218px',
    cardPadding: '8px 10px 10px 10px',
    cardGap: '6px',
    titleFontSize: '12px',
    metricValueFontSize: '16px',
    drawValueFontSize: '13px',
    buttonMinWidth: '86px',
    buttonHeight: '26px',
    buttonFontSize: '11px',
  },
  large: {
    maxWidth: '360px',
    minWidth: '250px',
    cardPadding: '10px 12px 12px 12px',
    cardGap: '7px',
    titleFontSize: '13px',
    metricValueFontSize: '18px',
    drawValueFontSize: '14px',
    buttonMinWidth: '96px',
    buttonHeight: '28px',
    buttonFontSize: '12px',
  },
}

const cardBaseStyle: React.CSSProperties = {
  borderRadius: '8px',
  border: '1px solid rgba(124, 191, 255, 0.4)',
  background: 'linear-gradient(135deg, rgba(12, 18, 30, 0.95) 0%, rgba(16, 28, 44, 0.95) 100%)',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
  display: 'flex',
  flexDirection: 'column',
}

const titleRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  lineHeight: '14px',
  color: '#c8dcff',
  letterSpacing: '0.03em',
}

const metricLabelStyle: React.CSSProperties = {
  fontSize: '10px',
  color: '#9eb1c9',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

const metricValueStyle: React.CSSProperties = {
  fontWeight: 700,
  color: '#f2f7ff',
  lineHeight: '18px',
}

const footerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '8px',
}

const secondaryTextStyle: React.CSSProperties = {
  fontSize: '10px',
  lineHeight: '12px',
  color: '#9eb1c9',
}

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

const GameBatteryBadge: React.FC<GameBatteryBadgeProps> = () => {
  const { appid: rawAppId } = useParams<{ appid?: string }>()
  const parsedAppId = Number(rawAppId)
  const validAppId = Number.isInteger(parsedAppId) && parsedAppId > 0 ? parsedAppId : undefined

  const routeGameName = useMemo(() => {
    const byStore = getGameNameFromStores(validAppId)
    if (byStore) return byStore
    return decodeRouteValue(rawAppId)
  }, [validAppId, rawAppId])

  const pluginConfig = getPluginConfig()
  const badgePosition = pluginConfig.batteryBadgePosition
  const badgeSize = pluginConfig.batteryBadgeSize
  const sizePreset = sizePresets[badgeSize]

  const summary = useBatteryBadgeData({
    appId: validAppId,
    gameName: routeGameName ?? undefined,
    filterDevices: pluginConfig.filterDevices,
  })

  if (!validAppId && !routeGameName) return null

  const openGameReport = () => {
    if (validAppId) {
      Navigation.NavigateToExternalWeb(`${reportsWebsiteBaseUrl}/app/${validAppId}`)
      return
    }
    if (routeGameName) {
      Navigation.NavigateToExternalWeb(`${reportsWebsiteBaseUrl}/game/${encodeURIComponent(routeGameName)}`)
    }
  }

  let batteryValue = 'No data yet'
  if (summary.isLoading) {
    batteryValue = 'Loading...'
  } else if (summary.batteryLifeMinutes !== null) {
    batteryValue = formatMinutes(summary.batteryLifeMinutes)
  }

  const drawValue = summary.averagePowerDraw ?? 'Unknown'

  let reportCountText = 'No reports found for this game'
  if (summary.isLoading) {
    reportCountText = 'Loading report data...'
  } else if (summary.reportCount > 0) {
    reportCountText = `Based on ${summary.reportCount} report${summary.reportCount === 1 ? '' : 's'}`
  } else if (summary.hasReportsOutsideDeviceFilter) {
    reportCountText = 'No reports for selected devices'
  } else if (summary.hasReports) {
    reportCountText = 'Reports found, but no battery data yet'
  }

  const containerStyle: React.CSSProperties = {
    ...containerBaseStyle,
    ...badgePositionStyles[badgePosition],
    maxWidth: sizePreset.maxWidth,
  }

  const cardStyle: React.CSSProperties = {
    ...cardBaseStyle,
    minWidth: sizePreset.minWidth,
    padding: sizePreset.cardPadding,
    gap: sizePreset.cardGap,
  }

  const buttonStyle: React.CSSProperties = {
    minWidth: sizePreset.buttonMinWidth,
    height: sizePreset.buttonHeight,
    fontSize: sizePreset.buttonFontSize,
    lineHeight: '12px',
    padding: '4px 8px',
  }

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={{ ...titleRowStyle, fontSize: sizePreset.titleFontSize }}>
          <MdBattery5Bar size={14} />
          Deck Settings Battery
        </div>

        <div>
          <div style={metricLabelStyle}>Estimated Battery Life</div>
          <div style={{ ...metricValueStyle, fontSize: sizePreset.metricValueFontSize }}>{batteryValue}</div>
        </div>

        <div>
          <div style={metricLabelStyle}>Average Power Draw</div>
          <div style={{ ...metricValueStyle, fontSize: sizePreset.drawValueFontSize, lineHeight: '15px' }}>
            {drawValue}
          </div>
        </div>

        <div style={footerStyle}>
          <div style={secondaryTextStyle}>{reportCountText}</div>
          <DialogButton style={buttonStyle} onClick={openGameReport}>
            View reports
          </DialogButton>
        </div>
      </div>
    </div>
  )
}

export default GameBatteryBadge
