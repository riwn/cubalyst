import { createContext } from 'react'
import type { CubeStore } from './store'

export const CubeStoreContext = createContext<CubeStore | null>(null)
