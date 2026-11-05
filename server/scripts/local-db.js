// "npm run db": starts a real MongoDB server on this computer without installing MongoDB.
// mongodb-memory-server (already used by our tests) downloads the mongod program once,
// and we point it at the folder server/.localdb so the data survives restarts.
// Stop it with Ctrl+C. Not needed if MONGODB_URI points to MongoDB Atlas.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MongoMemoryServer } from 'mongodb-memory-server';

const dbPath = fileURLToPath(new URL('../.localdb', import.meta.url));
fs.mkdirSync(dbPath, { recursive: true });

const mongo = await MongoMemoryServer.create({
  instance: { port: 27017, dbPath, storageEngine: 'wiredTiger' },
});

console.log(`Local MongoDB running at ${mongo.getUri()}  (data folder: ${dbPath})`);
console.log('Leave this window open. Press Ctrl+C to stop.');

process.on('SIGINT', async () => {
  await mongo.stop({ doCleanup: false }); // doCleanup: false keeps the data folder
  process.exit(0);
});
