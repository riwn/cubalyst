import { createContext } from 'react'
import type { Settings } from '../api'

export type SettingsContextValue = {
  settings: Settings
  update: (s: Settings) => Promise<void>
}

export const DEFAULT_SETTINGS: Settings = { cross_color: 'white', hold_bottom: 'white', hold_front: 'green', inspection: true, use_gyro: false }

export const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  update: async () => {},
})
