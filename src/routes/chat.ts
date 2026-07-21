import { Router, type Request, type Response } from 'express';
import { runAgent } from '../agent';

const router = Router();

interface ChatBody {
  sessionId?: string;
  message?: string;
  pageUrl?: string;
}

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/i,
  /system\s*(update|override|prompt|message|directive)/i,
  /new\s+(directive|instruction|rule|mode|persona)/i,
  /admin\s*(override|access|mode)/i,
  /you\s+are\s+now\s+(a|an)\s+/i,
  /act\s+as\s+(a|an)\s+(different|unrestricted|jailbroken|evil|new)/i,
  /forget\s+(everything|all|your|previous)/i,
  /disregard\s+(your|all|previous)\s+(instructions?|rules?|training)/i,
  /pretend\s+(you\s+are|to\s+be)\s+(a|an|not)/i,
  /do\s+anything\s+now/i,   // DAN
  /jailbreak/i,
];

function isInjectionAttempt(text: string): boolean {
  return INJECTION_PATTERNS.some((p) => p.test(text));
}

router.post('/', async (req: Request<{}, {}, ChatBody>, res: Response) => {
  const { sessionId, message, pageUrl } = req.body;

  if (!sessionId || typeof sessionId !== 'string') {
    res.status(400).json({ error: 'sessionId is required' });
    return;
  }

  if (!message || typeof message !== 'string' || !message.trim()) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  if (message.trim().length > 1000) {
    res.status(400).json({ error: 'message too long (max 1000 chars)' });
    return;
  }

  if (isInjectionAttempt(message)) {
    res.json({
      response: "I'm Sistem Parking Agent and I'm here to help with questions about Sistem Parking. I can't process that request. Is there something about our parking solutions or documentation I can help you with?",
    });
    return;
  }

  try {
    const response = await runAgent({
      sessionId: sessionId.trim(),
      userMessage: message.trim(),
      pageUrl: typeof pageUrl === 'string' ? pageUrl : '',
    });

    res.json({ response });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    console.error('[chat route] Error:', msg);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

export default router;
