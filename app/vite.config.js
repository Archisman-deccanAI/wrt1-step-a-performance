import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// v0 dashboard. Dev mode runs on seed data so it works without a live Firebase project.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 }
})
