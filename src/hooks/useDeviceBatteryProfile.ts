import { useEffect, useState } from 'react'
import { fetchSystemInfo, inferDeviceLabel } from './systemInfo'

const deviceBatteryCapacitiesWh: Record<string, number> = {
  'Steam Deck OLED': 50,
  'Steam Deck LCD (64GB)': 40,
  'Steam Deck LCD (256GB/512GB)': 40,
  'ROG Ally Z1': 40,
  'ROG Ally Z1 Extreme': 40,
  'ROG Ally X': 80,
  'Legion Go': 49.2,
}

const resolveDeviceBatteryCapacityWh = (deviceLabel: string | null): number | null => {
  if (!deviceLabel) return null
  const direct = deviceBatteryCapacitiesWh[deviceLabel]
  if (typeof direct === 'number' && Number.isFinite(direct)) return direct
  return null
}

export const calculateEstimatedMinutesFromTdp = (batteryWh: number | null, tdpWatts: number): number | null => {
  if (batteryWh === null || !Number.isFinite(batteryWh) || batteryWh <= 0) return null
  if (!Number.isFinite(tdpWatts) || tdpWatts <= 0) return null
  const minutes = Math.round((batteryWh / tdpWatts) * 60)
  return minutes > 0 ? minutes : null
}

export const useDeviceBatteryProfile = () => {
  const [deviceLabel, setDeviceLabel] = useState<string | null>(null)
  const [deviceBatteryCapacityWh, setDeviceBatteryCapacityWh] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false

    const loadDeviceBatteryInfo = async () => {
      try {
        const info = await fetchSystemInfo()
        if (cancelled) return
        const inferredLabel = inferDeviceLabel(info)
        setDeviceLabel(inferredLabel)
        setDeviceBatteryCapacityWh(resolveDeviceBatteryCapacityWh(inferredLabel))
      } catch {
        if (cancelled) return
        setDeviceLabel(null)
        setDeviceBatteryCapacityWh(null)
      }
    }

    loadDeviceBatteryInfo()

    return () => {
      cancelled = true
    }
  }, [])

  return { deviceLabel, deviceBatteryCapacityWh }
}
