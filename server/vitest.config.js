import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 180_000, // the first run downloads the MongoDB binary used by mongodb-memory-server
    fileParallelism: false, // run test files one after another (each starts its own in-memory DB)
  },
});
