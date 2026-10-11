import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
// Tests import the production transaction repository. Resolve its Firestore
// dependency to the SAME SDK instance as rules-unit-testing (not frontend v12).
export default defineConfig({resolve:{alias:{
  'firebase/firestore':fileURLToPath(new URL('./node_modules/firebase/firestore/dist/esm/index.esm.js',import.meta.url)),
}}});
