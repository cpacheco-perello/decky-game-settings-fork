import React, { useEffect, useMemo, useRef, useState } from 'react'
import { DialogButton, Navigation, showModal } from '@decky/ui'
import { MdBattery5Bar } from 'react-icons/md'
import {
  batteryBadgeAverageTdpRange,
  formatMinutes,
  getGameTdpOverrideWatts,
  getPluginConfig,
  makeGameTdpOverrideKey,
  reportsWebsiteBaseUrl,
  setGameTdpOverrideWatts,
} from '../../constants'
import { useBatteryBadgeData } from '../../hooks/useBatteryBadgeData'
import { TextFieldModal } from './TextFieldModal'
import { useGameIdentity } from '../../hooks/useGameIdentity'
import { useGamePageVisibility } from '../../hooks/useGamePageVisibility'
import { useBatteryTrackerTdp } from '../../hooks/useBatteryTrackerTdp'
import { calculateEstimatedMinutesFromTdp, useDeviceBatteryProfile } from '../../hooks/useDeviceBatteryProfile'
import {
  cardBaseStyle,
  containerBaseStyle,
  footerButtonsStyle,
  footerStyle,
  getBatteryTone,
  metricLabelStyle,
  metricValueStyle,
  secondaryTextStyle,
  sizePresets,
  titleRowStyle,
} from './gameBatteryBadge/theme'

type GameBatteryBadgeProps = {
  'data-decky-game-settings-battery-badge'?: boolean
}

const GameBatteryBadge: React.FC<GameBatteryBadgeProps> = () => {
  const badgeRef = useRef<HTMLDivElement | null>(null)
  const { validAppId, routeGameName, shouldPreferNameLookup } = useGameIdentity()

  const pluginConfig = getPluginConfig()
  const badgeOffsetLeft = pluginConfig.batteryBadgeOffsetLeft
  const badgeOffsetTop = pluginConfig.batteryBadgeOffsetTop
  const badgeSize = pluginConfig.batteryBadgeSize
  const sizePreset = sizePresets[badgeSize]
  const perGameTdpKey = useMemo(() => makeGameTdpOverrideKey(validAppId, routeGameName), [validAppId, routeGameName])

  const shouldHideBadge = useGamePageVisibility({ appId: validAppId, badgeRef })
  const { deviceLabel, deviceBatteryCapacityWh } = useDeviceBatteryProfile()
  const [perGameTdpWatts, setPerGameTdpWatts] = useState<number | null>(null)
  const { importedTdpWatts, isBatteryTrackerDetected } = useBatteryTrackerTdp({
    enabled: pluginConfig.useBatteryTrackerTdp,
    gameName: routeGameName,
  })

  useEffect(() => {
    setPerGameTdpWatts(getGameTdpOverrideWatts(perGameTdpKey))
  }, [perGameTdpKey])

  const summary = useBatteryBadgeData({
    appId: shouldHideBadge ? undefined : validAppId,
    gameName: shouldHideBadge ? undefined : routeGameName ?? undefined,
    filterDevices: pluginConfig.filterDevices,
    preferNameLookup: shouldPreferNameLookup,
  })

  if (!validAppId && !routeGameName) return null
  if (shouldHideBadge) return null

  const isTrackerPriorityMode = pluginConfig.useBatteryTrackerTdp && isBatteryTrackerDetected
  const activeTdpWatts = isTrackerPriorityMode
    ? (importedTdpWatts ?? 0)
    : (perGameTdpWatts ?? 0)
  const tdpSourceLabel = isTrackerPriorityMode ? 'Battery Tracker' : 'per-game'
  const expectedMinutesFromCustomTdp = calculateEstimatedMinutesFromTdp(deviceBatteryCapacityWh, activeTdpWatts)
  const colorMinutes = summary.batteryLifeMinutes ?? expectedMinutesFromCustomTdp
  const tone = getBatteryTone(colorMinutes)

  const openPerGameTdpModal = () => {
    if (isTrackerPriorityMode) {
      return
    }

    showModal(
      <TextFieldModal
        label='Set per-game average TDP (W)'
        placeholder={`Range ${batteryBadgeAverageTdpRange.min}-${batteryBadgeAverageTdpRange.max}. Empty or 0 clears override.`}
        initialValue={perGameTdpWatts !== null ? String(perGameTdpWatts) : ''}
        onClosed={(value) => {
          const trimmed = value.trim()
          if (trimmed.length === 0) {
            setGameTdpOverrideWatts(perGameTdpKey, null)
            setPerGameTdpWatts(null)
            return
          }

          const parsed = Number(trimmed.replace(',', '.'))
          if (!Number.isFinite(parsed)) {
            return
          }

          const rounded = Math.round(parsed)
          const clamped = Math.max(
            batteryBadgeAverageTdpRange.min,
            Math.min(batteryBadgeAverageTdpRange.max, rounded)
          )

          if (clamped <= 0) {
            setGameTdpOverrideWatts(perGameTdpKey, null)
            setPerGameTdpWatts(null)
            return
          }

          setGameTdpOverrideWatts(perGameTdpKey, clamped)
          setPerGameTdpWatts(clamped)
        }}
      />
    )
  }

  const openGameReport = () => {
    if (summary.resolvedReportAppId) {
      Navigation.NavigateToExternalWeb(`${reportsWebsiteBaseUrl}/app/${summary.resolvedReportAppId}`)
      return
    }

    if (summary.resolvedReportGameName) {
      Navigation.NavigateToExternalWeb(`${reportsWebsiteBaseUrl}/game/${encodeURIComponent(summary.resolvedReportGameName)}`)
      return
    }

    if (validAppId && !shouldPreferNameLookup) {
      Navigation.NavigateToExternalWeb(`${reportsWebsiteBaseUrl}/app/${validAppId}`)
      return
    }

    if (routeGameName && !shouldPreferNameLookup) {
      Navigation.NavigateToExternalWeb(`${reportsWebsiteBaseUrl}/game/${encodeURIComponent(routeGameName)}`)
    }
  }

  const canOpenReport =
    Boolean(summary.resolvedReportAppId) ||
    Boolean(summary.resolvedReportGameName) ||
    Boolean(validAppId && !shouldPreferNameLookup) ||
    Boolean(routeGameName && !shouldPreferNameLookup)

  let batteryValue = 'No data yet'
  if (summary.isLoading) {
    batteryValue = 'Loading...'
  } else if (summary.batteryLifeMinutes !== null) {
    batteryValue = formatMinutes(summary.batteryLifeMinutes)
  }

  const drawValue = summary.averagePowerDraw ?? 'Unknown'

  let reportCountText = 'No reports found'
  if (summary.isLoading) {
    reportCountText = 'Loading report data...'
  } else if (summary.reportCount > 0) {
    reportCountText = `Based on ${summary.reportCount} report${summary.reportCount === 1 ? '' : 's'}`
  } else if (summary.hasReportsOutsideDeviceFilter) {
    reportCountText = 'No reports found'
  } else if (summary.hasReports) {
    reportCountText = 'Reports found, but no battery data yet'
  }

  const containerStyle: React.CSSProperties = {
    ...containerBaseStyle,
    left: `${badgeOffsetLeft}px`,
    top: `${badgeOffsetTop}px`,
    maxWidth: sizePreset.maxWidth,
  }

  const cardStyle: React.CSSProperties = {
    ...cardBaseStyle,
    minWidth: sizePreset.minWidth,
    padding: sizePreset.cardPadding,
    gap: sizePreset.cardGap,
    border: `1px solid ${tone.border}`,
    background: `linear-gradient(135deg, rgba(12, 18, 30, 0.95) 0%, ${tone.bgAccent} 100%)`,
  }

  const buttonStyle: React.CSSProperties = {
    minWidth: sizePreset.buttonMinWidth,
    height: sizePreset.buttonHeight,
    fontSize: sizePreset.buttonFontSize,
    lineHeight: '12px',
    padding: '4px 8px',
  }

  return (
    <div ref={badgeRef} style={containerStyle}>
      <div style={cardStyle}>
        <div style={{ ...titleRowStyle, fontSize: sizePreset.titleFontSize, color: tone.titleColor }}>
          <MdBattery5Bar size={14} color={tone.iconColor} />
          Deck Settings Battery
        </div>

        <div>
          <div style={metricLabelStyle}>Estimated Battery Life</div>
          <div style={{ ...metricValueStyle, fontSize: sizePreset.metricValueFontSize, color: tone.metricColor }}>
            {batteryValue}
          </div>
        </div>

        <div>
          <div style={metricLabelStyle}>Average Power Draw</div>
          <div style={{ ...metricValueStyle, fontSize: sizePreset.drawValueFontSize, lineHeight: '15px' }}>
            {drawValue}
          </div>
        </div>

        {activeTdpWatts > 0 && (
          <div>
            <div style={metricLabelStyle}>Expected @ {activeTdpWatts}W ({tdpSourceLabel})</div>
            <div style={{ ...metricValueStyle, fontSize: sizePreset.drawValueFontSize, lineHeight: '15px' }}>
              {expectedMinutesFromCustomTdp !== null
                ? `${formatMinutes(expectedMinutesFromCustomTdp)}${deviceLabel ? ` (${deviceLabel})` : ''}`
                : 'Device battery profile unavailable'}
            </div>
          </div>
        )}

        {isTrackerPriorityMode && importedTdpWatts === null && (
          <div style={secondaryTextStyle}>Battery Tracker enabled, but no matching TDP data was found for this game.</div>
        )}

        {isTrackerPriorityMode && (
          <div style={secondaryTextStyle}>Manual per-game TDP is locked while Battery Tracker mode is active.</div>
        )}

        <div style={footerStyle}>
          <div style={secondaryTextStyle}>{reportCountText}</div>
          <div style={footerButtonsStyle}>
            <DialogButton
              style={{ ...buttonStyle, minWidth: '70px', opacity: isTrackerPriorityMode ? 0.7 : 1 }}
              onClick={openPerGameTdpModal}
              disabled={isTrackerPriorityMode}
            >
              {isTrackerPriorityMode
                ? importedTdpWatts !== null ? `BT ${importedTdpWatts}W` : 'BT --'
                : perGameTdpWatts !== null ? `${perGameTdpWatts}W` : 'Set TDP'}
            </DialogButton>
            <DialogButton style={buttonStyle} onClick={openGameReport} disabled={!canOpenReport || summary.isLoading}>
              Reports
            </DialogButton>
          </div>
        </div>
      </div>
    </div>
  )
}

export default GameBatteryBadge
