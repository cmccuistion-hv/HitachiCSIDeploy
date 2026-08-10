import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WizardProvider } from './state/WizardContext'
import App from './App'
import './styles/theme.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WizardProvider>
      <App />
    </WizardProvider>
  </StrictMode>,
)
