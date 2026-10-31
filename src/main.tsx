import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { registerSW } from 'virtual:pwa-register'


// Register the service worker for PWA support.
// vite-plugin-pwa's registerType: 'autoUpdate' handles SW updates automatically.
// Do NOT unregister existing SWs here — that creates an infinite reload loop.
registerSW({
  immediate: true,
  onNeedRefresh() {
    console.log('[SW] New content available. The app will update automatically.');
  },
  onOfflineReady() {
    console.log('[SW] App ready to work offline.');
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
