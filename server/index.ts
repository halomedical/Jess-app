import fs from 'fs';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import session from 'express-session';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { config } from './config';
import authRoutes from './routes/auth';
import driveRoutes from './routes/drive';
import aiRoutes from './routes/ai';
import transcribeRoutes from './routes/transcribe';
import haloRoutes from './routes/halo';
import requestTemplateRoutes from './routes/requestTemplate';
import emailNoteRoutes from './routes/emailNote';
import emailWorkspaceFileRoutes from './routes/emailWorkspaceFile';
import practiceRoutes from './routes/practice';
import { startScheduler } from './jobs/scheduler';

const app = express();

if (config.isProduction) {
  app.set('trust proxy', 1);
}

// --- Global Rate Limiter ---
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // 300 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

// --- AI Route Rate Limiter (stricter) ---
const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 80,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'AI rate limit reached. Please wait before trying again.' },
});

/** Note generation can fire several template requests at once; keep separate from /api/ai budget. */
const haloLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 90,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Note generation rate limit reached. Please wait a minute and retry.' },
});

/** Scribes may finish many segments / patients in parallel; keep separate from general AI budget. */
const transcribeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Transcription rate limit reached. Please wait a moment and retry.' },
});

// --- Auth Rate Limiter (prevent brute force) ---
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again later.' },
});

// --- MIDDLEWARE ---
app.use(globalLimiter);

const devCorsOrigins = [
  config.clientUrl,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];
const corsOrigins = config.isProduction ? [config.clientUrl] : [...new Set(devCorsOrigins)];

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS blocked origin: ${origin}`));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '50mb' }));
app.use(session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: config.isProduction,
    httpOnly: true,
    sameSite: config.isProduction ? 'none' : 'lax',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  },
}));

// --- ROUTES ---
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/drive', driveRoutes);
app.use('/api/ai/transcribe', transcribeLimiter, transcribeRoutes);
app.use('/api/ai', aiLimiter, aiRoutes);
app.use('/api/halo', haloLimiter, haloRoutes);
app.use('/api/request-template', requestTemplateRoutes);
app.use('/api/email-note', emailNoteRoutes);
app.use('/api/email-workspace-file', emailWorkspaceFileRoutes);
app.use('/api/practice', practiceRoutes);

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * Development UI on port 3000 (no slow proxy — that hung when Vite was down).
 * 1. If client/dist exists, serve it immediately.
 * 2. Otherwise redirect browser to Vite (CLIENT_URL, usually :5173).
 */
if (!config.isProduction) {
  const distPath = path.join(__dirname, '../../client/dist');
  const indexHtml = path.join(distPath, 'index.html');
  const viteUi = config.clientUrl.replace(/\/$/, '');

  if (fs.existsSync(indexHtml)) {
    app.use(express.static(distPath));
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(indexHtml);
    });
  } else {
    app.get(/^(?!\/api).*/, (req, res) => {
      res.redirect(302, `${viteUi}${req.originalUrl}`);
    });
  }
}

// Serve frontend in production
if (config.isProduction) {
  const staticPath = path.join(__dirname, '../../client/dist');
  app.use(
    express.static(staticPath, {
      etag: true,
      setHeaders: (res, filePath) => {
        const base = path.basename(filePath);
        if (base === 'index.html' || base.endsWith('.html')) {
          res.setHeader(
            'Cache-Control',
            'no-store, no-cache, must-revalidate, proxy-revalidate'
          );
        } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    })
  );
  app.get('/{*path}', (_req: Request, res: Response) => {
    res.setHeader(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, proxy-revalidate'
    );
    res.sendFile('index.html', { root: staticPath });
  });
}

// --- Global Error Handler ---
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'An unexpected error occurred.' });
});

app.listen(config.port, () => {
  console.log(`Halo server running on port ${config.port} (${config.isProduction ? 'production' : 'development'})`);
  if (!config.isProduction) {
    const distIndex = path.join(__dirname, '../../client/dist/index.html');
    if (fs.existsSync(distIndex)) {
      console.log(`  App UI:  http://localhost:${config.port}  (serving client/dist)`);
    } else {
      console.log(`  API:     http://localhost:${config.port}/api/health`);
      console.log(`  App UI:  ${config.clientUrl}  — run "npm run dev" (starts API + Vite)`);
      console.log(`  Tip:     opening :${config.port} redirects to Vite until you run "npm run build:client"`);
    }
  }
  if (config.isProduction) {
    const ver = process.env.SOURCE_VERSION || process.env.HEROKU_SLUG_COMMIT || '';
    if (ver) console.log(`[deploy] Git commit on Heroku: ${ver.slice(0, 40)}`);
    else console.log('[deploy] SOURCE_VERSION not set (not a Heroku git deploy?)');
  }
  startScheduler();
});
