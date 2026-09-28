import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { config as zodConfig } from 'zod'
import { App } from '@/app/App'
import { trackActivity } from '@/auth/activity'
import { applyAppearance, readAppearance } from '@/lib/appearance'
import './styles/index.css'

// Apply the saved appearance before the first render (no inline script: strict CSP).
applyAppearance(readAppearance())
trackActivity()
// Zod's JIT probes new Function(), which the CSP (script-src 'self', no eval) forbids.
zodConfig({ jitless: true })

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
