import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// import ConversationCanvas from './ConversationCanvas';
import Test from './Test';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* <ConversationCanvas /> */}
    <Test />
  </StrictMode>,
)
