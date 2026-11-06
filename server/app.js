import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import { apiLimiter } from './middleware/rateLimits.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import apiRoutes from './routes/index.js';

// Builds the Express app. It does NOT call listen(): server.js does that locally,
// and Vercel imports this app as a serverless function (api/index.js).
const app = express();

app.set('trust proxy', 1); // behind Vercel's proxy: lets rate limiting see the real client IP
app.use(helmet()); // safe HTTP headers
app.use(cors({ origin: env.clientOrigin })); // only our React app may call the API from a browser
app.use(express.json({ limit: '1mb' })); // parse JSON bodies
app.use(express.urlencoded({ extended: false })); // parse form posts (payment gateway callbacks)

// Friendly message when someone opens the API's address in a browser.
app.get('/', (req, res) => {
  res.json({ service: 'UTSHOB API', status: 'running', health: '/api/health' });
});

app.use('/api', apiLimiter);

// Make sure the database is connected before any route runs (cached after the first time).
app.use('/api', async (req, res, next) => {
  await connectDB();
  next();
});

app.use('/api', apiRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
