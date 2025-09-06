import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import ConversationGraph from './ConversationGraph';
// import Test from './Test';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConversationGraph />
    {/* <div style={{ display: 'flex' }}>
      <Test />
      <Test />
    </div> */}
  </StrictMode>,
)
