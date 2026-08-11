import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from './state/ThemeContext'
import { WizardProvider } from './state/WizardContext'
import App from './App'
import './styles/theme.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <WizardProvider>
        <App />
      </WizardProvider>
    </ThemeProvider>
  </StrictMode>,
)
