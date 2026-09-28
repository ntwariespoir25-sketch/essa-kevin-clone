import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Pinned rather than left to Vite's auto-increment. Port 5173 is often
    // taken by another project, and a silent bump to 5175 would break the
    // backend's CORS allowlist without any obvious cause. strictPort makes it
    // fail loudly instead.
    port: 5174,
    strictPort: true,
  },
})
