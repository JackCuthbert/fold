import { createRoot } from 'react-dom/client'
import { App } from './app'
import './styles/global.css'
import { publishScrollbarGutter } from './styles/scrollbar-gutter'

// Measure the platform's scrollbar width before first paint so the sticky
// header can reserve the same gutter its scrolling sibling does
// (docs/specs/ui.md — one left edge).
publishScrollbarGutter()

const root = document.getElementById('root')
if (root) createRoot(root).render(<App />)
