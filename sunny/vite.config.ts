/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          'firebase-auth': ['firebase/auth'],
          'firebase-firestore': ['firebase/firestore'],
        },
      },
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    // Emulator suites require the separately installed rules-test SDK. They
    // run in the financial integration job, not standalone client jobs.
    exclude: [...configDefaults.exclude, ...(!process.env.FIRESTORE_EMULATOR_HOST ? ['src/**/*.emulator.test.{ts,tsx}'] : [])],
  },
})
