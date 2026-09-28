import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/app/App'
import { applyAppearance, readAppearance } from '@/lib/appearance'
import './styles/index.css'

// Apply the saved appearance before the first render (no inline script: strict CSP).
applyAppearance(readAppearance())

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
