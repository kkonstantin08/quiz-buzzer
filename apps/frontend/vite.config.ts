import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Lockout Buzzer',
        short_name: 'Buzzer',
        description: 'MVP Lockout Buzzer System',
        theme_color: '#0F172A',
        background_color: '#0F172A',
        display: 'standalone',
        icons: [] // placeholders for MVP
      }
    })
  ],
})
