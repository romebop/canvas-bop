import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import ConversationCanvas from './ConversationCanvas';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConversationCanvas />
  </StrictMode>,
)
