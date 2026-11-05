// Local development entry point: connect to MongoDB, then start listening.
import app from './app.js';
import { env } from './config/env.js';
import { connectDB } from './config/db.js';

try {
  await connectDB();
  app.listen(env.port, () => {
    console.log(`UTSHOB API running at http://localhost:${env.port}/api`);
  });
} catch (err) {
  console.error('Could not connect to MongoDB at', env.mongoUri);
  console.error('Start the local database with "npm run db" (or set MONGODB_URI).');
  console.error(err.message);
  process.exit(1);
}
