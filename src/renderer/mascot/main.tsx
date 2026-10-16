import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Mascot from './Mascot'
import './mascot.css'
import './avatars.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Mascot />
  </StrictMode>
)
