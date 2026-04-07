import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { transcribeAudio } from '../services/gemini';
import { isDeepgramAvailable, transcribeWithDeepgram } from '../services/deepgram';
import { fastTranscriptionPrompt } from '../utils/prompts';

const router = Router();
router.use(requireAuth);

// POST / — mounted at /api/ai/transcribe (dedicated rate limit in server/index.ts)
router.post('/', async (req: Request, res: Response) => {
  try {
    const { audioBase64, mimeType } = req.body as {
      audioBase64?: string;
      mimeType?: string;
    };

    if (!audioBase64 || typeof audioBase64 !== 'string') {
      res.status(400).json({ error: 'audioBase64 is required.' });
      return;
    }

    const cleanBase64 = audioBase64.split(',')[1] || audioBase64;
    const audioBuffer = Buffer.from(cleanBase64, 'base64');
    const audioMime = mimeType || 'audio/webm';

    if (!isDeepgramAvailable()) {
      console.log('Deepgram key not set, falling back to Gemini for transcription');
      const transcript = await transcribeAudio(fastTranscriptionPrompt(), cleanBase64, audioMime);
      res.json({ transcript: transcript || '', rawTranscript: transcript || '' });
      return;
    }

    const transcript = await transcribeWithDeepgram(audioBuffer, audioMime);

    if (!transcript) {
      res.status(400).json({ error: 'No speech detected in audio.' });
      return;
    }

    res.json({ transcript, rawTranscript: transcript });
  } catch (err) {
    console.error('Transcribe error:', err);
    res.status(500).json({ error: 'Could not transcribe audio.' });
  }
});

export default router;
