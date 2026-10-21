import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import '@fontsource/biz-udpgothic/400.css'
import '@fontsource/biz-udpgothic/700.css'
import '@fontsource/saira-semi-condensed/400.css'
import '@fontsource/saira-semi-condensed/500.css'
import '@fontsource/saira-semi-condensed/600.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
