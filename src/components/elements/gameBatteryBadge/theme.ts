import React from 'react'
import type { BatteryBadgeSize } from '../../../interfaces'

export type BadgeSizePreset = {
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

export type BatteryTone = {
  border: string
  bgAccent: string
  titleColor: string
  metricColor: string
  iconColor: string
}

export const sizePresets: Record<BatteryBadgeSize, BadgeSizePreset> = {
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

export const containerBaseStyle: React.CSSProperties = {
  position: 'absolute',
  zIndex: 5,
  pointerEvents: 'auto',
  width: 'fit-content',
}

export const cardBaseStyle: React.CSSProperties = {
  borderRadius: '8px',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
  display: 'flex',
  flexDirection: 'column',
}

export const titleRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  lineHeight: '14px',
  color: '#c8dcff',
  letterSpacing: '0.03em',
}

export const metricLabelStyle: React.CSSProperties = {
  fontSize: '10px',
  color: '#9eb1c9',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

export const metricValueStyle: React.CSSProperties = {
  fontWeight: 700,
  color: '#f2f7ff',
  lineHeight: '18px',
}

export const footerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '8px',
}

export const footerButtonsStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
}

export const secondaryTextStyle: React.CSSProperties = {
  fontSize: '10px',
  lineHeight: '12px',
  color: '#9eb1c9',
}

export const getBatteryTone = (minutes: number | null): BatteryTone => {
  // Sin datos — azul neutro
  if (minutes === null || !Number.isFinite(minutes) || minutes <= 0) {
    return {
      border: 'rgba(100, 160, 255, 0.6)',
      bgAccent: 'rgba(14, 26, 50, 0.97)',
      titleColor: '#a8caff',
      metricColor: '#e8f0ff',
      iconColor: '#a8caff',
    }
  }

  // >6h — dorado brillante (excelente)
  if (minutes > 360) {
    return {
      border: 'rgba(255, 210, 60, 0.75)',
      bgAccent: 'rgba(60, 44, 8, 0.97)',
      titleColor: '#ffe880',
      metricColor: '#fff5bb',
      iconColor: '#ffd84a',
    }
  }

  // 4-6h — verde vivo (buena batería)
  if (minutes >= 240) {
    return {
      border: 'rgba(80, 220, 100, 0.7)',
      bgAccent: 'rgba(10, 50, 22, 0.97)',
      titleColor: '#7eeea0',
      metricColor: '#c8fad8',
      iconColor: '#58e07a',
    }
  }

  // 2-4h — cian/verde azulado (aceptable)
  if (minutes >= 120) {
    return {
      border: 'rgba(60, 210, 190, 0.65)',
      bgAccent: 'rgba(8, 44, 44, 0.97)',
      titleColor: '#5de8d8',
      metricColor: '#b8f5ef',
      iconColor: '#3dd8c8',
    }
  }

  // <2h — rojo (baja batería)
  return {
    border: 'rgba(255, 70, 70, 0.75)',
    bgAccent: 'rgba(50, 10, 10, 0.97)',
    titleColor: '#ff8080',
    metricColor: '#ffc8c8',
    iconColor: '#ff5050',
  }
}
