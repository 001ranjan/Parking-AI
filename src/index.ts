import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import chatRouter from './routes/chat';
import { ensureHeaders } from './sheets';

const app = express();
const PORT = parseInt(process.env.PORT ?? '3005', 10);

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow requests with no origin (curl, server-to-server)
      if (!origin) return cb(null, true);
      if (allowedOrigins.length === 0 || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return cb(null, true);
      if (origin === `http://localhost:${PORT}` || origin === `http://127.0.0.1:${PORT}`) return cb(null, true);
      
      cb(new Error(`CORS: origin "${origin}" not allowed`));
    },
    methods: ['POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
  })
);

app.use(express.json({ limit: '64kb' }));

// Serve chat UI on /
app.use(express.static(path.join(__dirname, '..', 'public')));

// Serve the embeddable widget files
app.use('/widget', express.static(path.join(__dirname, '..', 'widget')));

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    provider: process.env.LLM_PROVIDER ?? 'not set',
    model: process.env.LLM_MODEL ?? 'not set',
  });
});

// Chat endpoint
app.use('/api/chat', chatRouter);

app.listen(PORT, async () => {
  console.log(`\nKormoan Agent server running on port ${PORT}`);
  console.log(`Provider: ${process.env.LLM_PROVIDER ?? 'not set'} / Model: ${process.env.LLM_MODEL ?? 'not set'}`);
  console.log(`Chat UI:  http://localhost:${PORT}`);
  console.log(`Widget:   http://localhost:${PORT}/widget/chat.js\n`);

  // Pre-warm Google Sheets headers
  await ensureHeaders().catch(() => {});
});
