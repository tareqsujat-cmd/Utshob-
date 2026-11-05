import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // In development the React app calls "/api/...", and Vite forwards it to the Express server.
    // In production VITE_API_URL points at the deployed API instead (see src/api/client.js).
    proxy: { '/api': 'http://localhost:5000' },
  },
});
