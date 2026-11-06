// Reads every setting the server needs from environment variables (.env file locally,
// Vercel project settings in production). All other files import `env` from here.
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const nodeEnv = process.env.NODE_ENV || 'development';

// Values pasted into a dashboard can pick up invisible characters (a line break, a space,
// a zero-width character) or a trailing "/". In an HTTP header those break every response,
// so URLs keep only visible characters (ASCII 0x21-0x7E) and lose any trailing slash.
export function cleanUrl(value) {
  return String(value).replace(/[^\x21-\x7E]/g, '').replace(/\/+$/, '');
}

// CLIENT_ORIGIN may list several allowed websites separated by commas,
// e.g. "https://utshob-pu8r.vercel.app,http://localhost:5173".
const clientOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map(cleanUrl)
  .filter(Boolean);

export const env = {
  nodeEnv,
  isTest: nodeEnv === 'test',
  port: Number(process.env.PORT) || 5000,
  mongoUri: cleanUrl(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/utshob'),
  jwtSecret: (process.env.JWT_SECRET || (nodeEnv === 'test' ? 'test-secret' : '')).trim(),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  clientOrigins, // every website allowed to call the API (CORS)
  clientOrigin: clientOrigins[0], // the main website, used for redirects (e.g. after payment)
  serverPublicUrl: cleanUrl(process.env.SERVER_PUBLIC_URL || 'http://localhost:5000'),
  demoMode: process.env.DEMO_MODE === 'true',
  cronSecret: process.env.CRON_SECRET || '',
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    botUsername: process.env.TELEGRAM_BOT_USERNAME || '',
  },
  sslcommerz: {
    storeId: process.env.SSLCZ_STORE_ID || '',
    storePassword: process.env.SSLCZ_STORE_PASSWORD || '',
  },
  nominatimUserAgent: process.env.NOMINATIM_USER_AGENT || 'UTSHOB-CSE471-student-project/1.0',
};

// Fail fast: without a secret, anyone could forge login tokens.
if (!env.jwtSecret) {
  throw new Error('JWT_SECRET is missing. Copy server/.env.example to server/.env and fill it in.');
}
