import { useContext, useMemo } from 'react'
import { holdFrame, IDENTITY_FRAME, type Frame } from '../cube/orientation'
import { SettingsContext } from './context'

export function useSettings() {
  return useContext(SettingsContext)
}

/** 設定の持ち方での記号への変換。 */
export function useHoldFrame(): Frame {
  const { settings } = useSettings()
  return useMemo(
    () => holdFrame(settings.hold_bottom, settings.hold_front) ?? IDENTITY_FRAME,
    [settings.hold_bottom, settings.hold_front],
  )
}
