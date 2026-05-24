import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { config } from '../config';
import { getTemplates, generateNote } from '../services/haloApi';
import { getOrCreatePatientNotesFolder, uploadToDrive } from '../services/drive';
import { renderClinicalTextToPdfBuffer } from '../services/notePdf';
import { convertDocxBufferToPdfBuffer } from '../services/docxPreviewPdf';
import { buildLocalPracticeDocx, isLocalPracticeDocxTemplate } from '../services/haloApi';
import { hasPracticeDocxTemplateFile } from '../services/practiceDocxTemplates';
import type { PatientForDocuments } from '../../shared/patientDemographics';

const router = Router();
router.use(requireAuth);

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// POST /api/halo/templates
router.post('/templates', async (req: Request, res: Response) => {
  try {
    const userId = (req.body?.user_id as string) || config.haloUserId;
    const templates = await getTemplates(userId);
    res.json(templates);
  } catch (err) {
    console.error('Halo get_templates error:', err);
    const message = err instanceof Error ? err.message : 'Failed to fetch templates.';
    res.status(err instanceof Error && message.includes('502') ? 502 : 400).json({ error: message });
  }
});

// POST /api/halo/generate-note
// Body: { user_id?, template_id, text, return_type: 'note' | 'docx', patientId?, fileName? }
// If return_type === 'docx' and patientId is set, uploads DOCX to patient's Patient Notes folder and returns { success, fileId, name }.
router.post('/generate-note', async (req: Request, res: Response) => {
  try {
    const { user_id, template_id, text, return_type, patientId, fileName, patientChart, mergeFields } =
      req.body as {
      user_id?: string;
      template_id: string;
      text: string;
      return_type: 'note' | 'docx';
      patientId?: string;
      fileName?: string;
      mergeFields?: Record<string, string>;
      patientChart?: {
        name?: string;
        dob?: string;
        sex?: 'M' | 'F';
        folderNumber?: string;
        contactNumber?: string;
        referringDoctor?: string;
        visitType?: 'new' | 'follow_up';
        visitDate?: string;
      };
    };

    if (!template_id || typeof text !== 'string') {
      res.status(400).json({ error: 'template_id and text are required.' });
      return;
    }

    const userId = user_id || config.haloUserId;
    const result = await generateNote({
      user_id: userId,
      template_id,
      text,
      return_type,
      patientChart: (patientChart as PatientForDocuments | undefined) ?? null,
      mergeFields:
        mergeFields && typeof mergeFields === 'object' && !Array.isArray(mergeFields)
          ? mergeFields
          : undefined,
    });

    if (return_type === 'note') {
      res.json({ notes: result });
      return;
    }

    // return_type === 'docx': result is Buffer
    const buffer = result as Buffer;
    if (!patientId || !req.session.accessToken) {
      res.status(400).json({ error: 'patientId is required to save DOCX to Drive.' });
      return;
    }

    const token = req.session.accessToken;
    const patientNotesFolderId = await getOrCreatePatientNotesFolder(token, patientId);
    const baseName = fileName && fileName.trim() ? fileName.replace(/\.docx$/i, '') : `Clinical_Note_${new Date().toISOString().split('T')[0]}`;
    const finalFileName = baseName.endsWith('.docx') ? baseName : `${baseName}.docx`;

    const fileId = await uploadToDrive(
      token,
      finalFileName,
      DOCX_MIME,
      patientNotesFolderId,
      buffer
    );

    res.json({ success: true, fileId, name: finalFileName });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Note generation failed.';
    console.error('Halo generate-note error:', message);
    if (err instanceof Error && err.stack) console.error(err.stack);
    const status = message.includes('502') ? 502 : message.includes('Invalid') ? 400 : 500;
    res.status(status).json({ error: message });
  }
});

// POST /api/halo/note-preview-pdf
// Body: { text: string } — same full string as DOCX path (chart + note from buildNoteTextWithPatientChart).
// Returns application/pdf bytes for inline preview.
router.post('/note-preview-pdf', async (req: Request, res: Response) => {
  try {
    const { text } = req.body as { text?: string };
    if (typeof text !== 'string' || !text.trim()) {
      res.status(400).json({ error: 'text is required.' });
      return;
    }
    const buffer = await renderClinicalTextToPdfBuffer(text);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
  } catch (err) {
    console.error('note-preview-pdf error:', err);
    const message = err instanceof Error ? err.message : 'PDF preview failed.';
    res.status(500).json({ error: message });
  }
});

// POST /api/halo/note-preview-docx-pdf
// Body: { template_id, text, patientId, patientChart? } — builds the same DOCX as Save, exports PDF for preview.
router.post('/note-preview-docx-pdf', async (req: Request, res: Response) => {
  try {
    const { template_id, text, patientId, patientChart } = req.body as {
      template_id?: string;
      text?: string;
      patientId?: string;
      patientChart?: PatientForDocuments;
    };

    if (!template_id || typeof text !== 'string') {
      res.status(400).json({ error: 'template_id and text are required.' });
      return;
    }
    if (!hasPracticeDocxTemplateFile(template_id) && !isLocalPracticeDocxTemplate(template_id)) {
      res.status(400).json({ error: 'No practice Word template found for this template_id.' });
      return;
    }
    if (!patientId || !req.session.accessToken) {
      res.status(400).json({ error: 'patientId is required for Word layout preview.' });
      return;
    }

    const token = req.session.accessToken;
    const docxBuffer = await buildLocalPracticeDocx({
      user_id: config.haloUserId,
      template_id,
      text,
      return_type: 'docx',
      patientChart: (patientChart as PatientForDocuments | undefined) ?? null,
    });

    const pdfBuffer = await convertDocxBufferToPdfBuffer(token, docxBuffer, 'note_preview');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'no-store');
    res.send(pdfBuffer);
  } catch (err) {
    console.error('note-preview-docx-pdf error:', err);
    const message = err instanceof Error ? err.message : 'DOCX PDF preview failed.';
    res.status(500).json({ error: message });
  }
});

export default router;
