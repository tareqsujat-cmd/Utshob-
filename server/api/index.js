// Vercel entry point. Vercel calls this exported Express app for every request
// (vercel.json rewrites all paths here). The DB connection is cached in config/db.js.
import app from '../app.js';

export default app;
