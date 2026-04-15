import React from 'react'
import { DialogButton, Navigation } from '@decky/ui'
import { MdBattery5Bar } from 'react-icons/md'
import { formatMinutes, reportsWebsiteBaseUrl } from '../../constants'
import { useParams } from '../../hooks/useParams'
import { useBatteryBadgeData } from '../../hooks/useBatteryBadgeData'

type GameBatteryBadgeProps = {
  'data-decky-game-settings-battery-badge'?: boolean
}

const containerStyle: React.CSSProperties = {
  position: 'absolute',
  top: '16px',
  right: '18px',
  zIndex: 30,
  width: 'fit-content',
  maxWidth: '320px',
}

const cardStyle: React.CSSProperties = {
  minWidth: '218px',
  padding: '8px 10px 10px 10px',
  borderRadius: '8px',
  border: '1px solid rgba(124, 191, 255, 0.4)',
  background: 'linear-gradient(135deg, rgba(12, 18, 30, 0.95) 0%, rgba(16, 28, 44, 0.95) 100%)',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
}

const titleRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  fontSize: '12px',
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
  fontSize: '16px',
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

const buttonStyle: React.CSSProperties = {
  minWidth: '86px',
  height: '26px',
  fontSize: '11px',
  lineHeight: '12px',
  padding: '4px 8px',
}

const GameBatteryBadge: React.FC<GameBatteryBadgeProps> = () => {
  const { appid: rawAppId } = useParams<{ appid?: string }>()
  const appId = Number.parseInt(rawAppId ?? '', 10)
  const validAppId = Number.isFinite(appId) && appId > 0 ? appId : undefined
  const summary = useBatteryBadgeData(validAppId)

  if (!validAppId) return null

  const openGameReport = () => {
    Navigation.NavigateToExternalWeb(`${reportsWebsiteBaseUrl}/app/${validAppId}`)
  }

  let batteryValue = 'No data yet'
  if (summary.isLoading) {
    batteryValue = 'Loading...'
  } else if (summary.batteryLifeMinutes !== null) {
    batteryValue = formatMinutes(summary.batteryLifeMinutes)
  }

  const drawValue = summary.averagePowerDraw ?? 'Unknown'
  const reportCountText = summary.reportCount > 0
    ? `Based on ${summary.reportCount} report${summary.reportCount === 1 ? '' : 's'}`
    : summary.hasReports
    ? 'Reports found, but no battery data yet'
    : 'No reports found for this game'

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={titleRowStyle}>
          <MdBattery5Bar size={14} />
          Deck Settings Battery
        </div>

        <div>
          <div style={metricLabelStyle}>Estimated Battery Life</div>
          <div style={metricValueStyle}>{batteryValue}</div>
        </div>

        <div>
          <div style={metricLabelStyle}>Average Power Draw</div>
          <div style={{ ...metricValueStyle, fontSize: '13px', lineHeight: '15px' }}>{drawValue}</div>
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