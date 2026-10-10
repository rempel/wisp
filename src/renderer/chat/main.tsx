import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Chat from './Chat'
import './chat.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Chat />
  </StrictMode>
)
