import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getSettings, putSettings, type Settings } from '../api'
import { DEFAULT_SETTINGS, SettingsContext } from './context'

/** サーバーに保存された設定を読み込んで配る。 */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  useEffect(() => {
    getSettings()
      .then(setSettings)
      .catch(() => {})
  }, [])
  const update = useCallback(async (s: Settings) => {
    setSettings(await putSettings(s))
  }, [])
  const value = useMemo(() => ({ settings, update }), [settings, update])
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}
