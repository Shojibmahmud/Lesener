import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// Must be evaluated before the Supabase client, which erases the recovery
// fragment from the URL as soon as it has read it. Importing it here pins that
// order rather than leaving it to App's own import list.
import './lib/recovery'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
