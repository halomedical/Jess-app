import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { getPracticeLetterheadHtmlForTemplate } from '../services/practiceLetterheadHtml';
import {
  buildPracticeDocxTemplatePath,
  listPracticeDocxTemplateFiles,
} from '../services/practiceDocxTemplates';
import { RICH_DOCTOR_LETTERHEAD } from '../../shared/richDoctorLetterhead';

const router = Router();
router.use(requireAuth);

/** GET /api/practice/templates — list resolved .docx files in Templates/ */
router.get('/templates', (_req: Request, res: Response) => {
  try {
    res.json({ templates: listPracticeDocxTemplateFiles() });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list templates.';
    res.status(500).json({ error: message });
  }
});

/** GET /api/practice/letterhead?template_id=report — HTML letterhead from matching .docx */
router.get('/letterhead', async (req: Request, res: Response) => {
  try {
    const templateId = (req.query.template_id as string) || '';
    if (!templateId.trim()) {
      res.status(400).json({ error: 'template_id query is required.' });
      return;
    }

    const templatePath = buildPracticeDocxTemplatePath(templateId);
    const html =
      (await getPracticeLetterheadHtmlForTemplate(templateId)) ?? RICH_DOCTOR_LETTERHEAD;

    res.json({
      template_id: templateId,
      template_path: templatePath,
      html,
      source: templatePath ? 'docx' : 'fallback',
    });
  } catch (err) {
    console.error('practice letterhead error:', err);
    const message = err instanceof Error ? err.message : 'Letterhead extraction failed.';
    res.status(500).json({ error: message });
  }
});

export default router;
