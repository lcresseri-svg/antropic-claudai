import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Separate local entry/config; never part of the production entry or build.
const fixture = fileURLToPath(new URL('./fixtures.tsx', import.meta.url));
const services = fileURLToPath(new URL('./services.ts', import.meta.url));
export default defineConfig({
  plugins: [react()],
  optimizeDeps: { entries: ['ui-preview/index.html'] },
  resolve: { alias: [
    { find: /^(?:\.\.\/)+shared\/providers\/settings$/, replacement: fixture },
    { find: /^(?:\.\.\/)+shared\/hooks\/(?:useBudget|usePush)$/, replacement: fixture },
    { find: /^(?:\.\.\/)+shared\/analytics\/metrics$/, replacement: services },
    { find: /^(?:\.\.\/)+lib\/firebase$/, replacement: services },
    { find: /^(?:\.\.\/)+(?:shared\/)?uiVersionConfig$/, replacement: fixture },
    { find: /\.\/useAICoach$/, replacement: fixture },
    { find: 'firebase/firestore', replacement: services },
    { find: 'firebase/functions', replacement: services },
  ] },
  server: { host: '127.0.0.1', port: 4177, strictPort: true },
});
