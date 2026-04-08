import React, { useState, useMemo } from 'react';
import { Save, FileDown, Mail, Loader2, Eye, Pencil } from 'lucide-react';
import type { HaloNote } from '../../../shared/types';
import { AppStatus } from '../../../shared/types';
import { buildNotePlainText } from '../../../shared/notePlainText';
import { formatDocumentDateDisplay } from '../utils/formatting';
import type { BackgroundTaskPhase } from './BackgroundTaskChip';

function tabDateLabelForNote(note: HaloNote): string {
  const iso = note.createdAt || note.lastSavedAt;
  if (iso) return formatDocumentDateDisplay(new Date(iso));
  const m = note.noteId.match(/(\d{10,})$/);
  if (m) {
    const ts = Number(m[1]);
    if (!Number.isNaN(ts)) return formatDocumentDateDisplay(new Date(ts));
  }
  return formatDocumentDateDisplay(new Date());
}

/** Parse note content into labeled fields (e.g. "Subjective:", "Plan:" blocks) for preview */
function parseNoteFields(content: string): Array<{ label: string; body: string }> {
  if (!content.trim()) return [];
  const blocks = content.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return blocks.map((block) => {
    const firstLineEnd = block.indexOf('\n');
    const firstLine = firstLineEnd === -1 ? block : block.slice(0, firstLineEnd);
    const rest = firstLineEnd === -1 ? '' : block.slice(firstLineEnd + 1).trim();
    const looksLikeHeader =
      firstLine.length <= 60 &&
      (firstLine.endsWith(':') || /^[A-Z][a-z]+(\s+[A-Za-z]+)*:?\s*$/.test(firstLine));
    if (looksLikeHeader && (rest || firstLine.endsWith(':'))) {
      const label = firstLine.endsWith(':') ? firstLine.slice(0, -1).trim() : firstLine.trim();
      return { label, body: rest || '' };
    }
    return { label: '', body: block };
  });
}

interface NoteEditorProps {
  notes: HaloNote[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  onNoteChange: (noteIndex: number, updates: { title?: string; content?: string }) => void;
  status: AppStatus;
  onSaveAsDocx: (noteIndex: number) => void;
  onSaveAll: () => void;
  onEmail: (noteIndex: number) => void;
  savingNoteIndex: number | null;
  /** Background DOCX job — keeps editor usable while saving */
  docxExportPhase?: BackgroundTaskPhase;
}

export const NoteEditor: React.FC<NoteEditorProps> = ({
  notes,
  activeIndex,
  onActiveIndexChange,
  onNoteChange,
  status,
  onSaveAsDocx,
  onSaveAll,
  onEmail,
  savingNoteIndex,
  docxExportPhase = 'idle',
}) => {
  const activeNote = notes[activeIndex];
  const busy = status === AppStatus.FILING;
  const docxBusy = docxExportPhase === 'running';
  const notePlain = useMemo(() => (activeNote ? buildNotePlainText(activeNote) : ''), [activeNote]);
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('preview');
  const fields = useMemo(() => {
    if (activeNote?.fields && activeNote.fields.length > 0) return activeNote.fields;
    return parseNoteFields(activeNote?.content ?? '');
  }, [activeNote?.content, activeNote?.fields]);

  const emptyShell = (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200/80 bg-white">
      <div className="flex flex-1 items-center justify-center px-4 text-slate-400">
        <p className="text-center text-xs">No notes yet. Dictate from the workspace, then generate.</p>
      </div>
    </div>
  );

  if (notes.length === 0) {
    return emptyShell;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200/80 bg-white">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-2 py-1.5 sm:px-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <span className="hidden text-[10px] font-bold uppercase tracking-wide text-slate-400 sm:inline">Note</span>
          <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('preview')}
              className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold transition-colors ${
                viewMode === 'preview' ? 'bg-white text-teal-800 shadow-sm' : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              <Eye className="h-3.5 w-3.5" strokeWidth={2.25} />
              Preview
            </button>
            <button
              type="button"
              onClick={() => setViewMode('edit')}
              className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold transition-colors ${
                viewMode === 'edit' ? 'bg-white text-teal-800 shadow-sm' : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              <Pencil className="h-3.5 w-3.5" strokeWidth={2.25} />
              Edit
            </button>
          </div>
        </div>
        <div className="flex max-w-full gap-1 overflow-x-auto [-webkit-overflow-scrolling:touch] pb-0.5">
          {notes.map((note, i) => {
            const dateLabel = tabDateLabelForNote(note);
            return (
              <button
                key={note.noteId}
                type="button"
                onClick={() => onActiveIndexChange(i)}
                className={`shrink-0 rounded-md px-2 py-1 text-left text-[10px] font-medium transition-all ${
                  i === activeIndex ? 'bg-teal-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span className="block max-w-[7rem] truncate leading-tight sm:max-w-[10rem]">{note.title || `Note ${i + 1}`}</span>
                <span className={`mt-0.5 block text-[9px] font-normal ${i === activeIndex ? 'text-teal-100' : 'text-slate-500'}`}>
                  {dateLabel}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {viewMode === 'preview' ? (
        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-100/60 px-2 py-2 sm:px-3">
          <p className="mb-2 text-center text-[10px] font-medium uppercase tracking-wide text-slate-400">Document preview</p>
          <article className="mx-auto max-w-[48rem] rounded-sm border border-slate-200/90 bg-white px-4 py-4 shadow-sm sm:px-8 sm:py-6 font-serif text-[15px] leading-relaxed text-slate-800">
            <h1 className="mb-4 border-b border-slate-200 pb-2 font-sans text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
              {activeNote.title || 'Untitled note'}
            </h1>
            {fields.length === 0 ? (
              <p className="font-sans text-sm italic text-slate-500">No structured content. Switch to Edit to add text.</p>
            ) : (
              <div className="space-y-4">
                {fields.map((field, idx) => (
                  <section key={idx} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                    {field.label ? (
                      <>
                        <h3 className="mb-1 font-sans text-[11px] font-bold uppercase tracking-wider text-slate-500">
                          {field.label}
                        </h3>
                        <div className="whitespace-pre-wrap text-slate-800">{field.body || '—'}</div>
                      </>
                    ) : (
                      <div className="whitespace-pre-wrap text-slate-800">{field.body}</div>
                    )}
                  </section>
                ))}
              </div>
            )}
          </article>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden font-sans">
          <input
            type="text"
            value={activeNote.title}
            onChange={(e) => onNoteChange(activeIndex, { title: e.target.value })}
            placeholder="Note title"
            className="shrink-0 border-b border-slate-100 px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:bg-slate-50/80"
          />
          <textarea
            value={activeNote.content}
            onChange={(e) => onNoteChange(activeIndex, { content: e.target.value })}
            placeholder="Note content..."
            className="min-h-0 flex-1 resize-none border-0 p-3 text-sm leading-relaxed text-slate-700 outline-none focus:bg-slate-50/50"
          />
        </div>
      )}

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/90 px-2 py-2 sm:px-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => onSaveAsDocx(activeIndex)}
            disabled={busy || docxBusy || !notePlain.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-2.5 py-1.5 text-[11px] font-bold text-white shadow-sm hover:bg-teal-700 disabled:opacity-50"
          >
            {savingNoteIndex === activeIndex || (docxBusy && savingNoteIndex === activeIndex) ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileDown className="h-3.5 w-3.5" />
            )}
            DOCX
          </button>
          <button
            type="button"
            onClick={() => onEmail(activeIndex)}
            disabled={busy}
            title={notePlain.trim() ? 'Email this note' : 'Email includes chart if note is empty'}
            aria-label="Email note"
            className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <Mail className="h-4 w-4" aria-hidden />
          </button>
          {notes.length > 1 && (
            <button
              type="button"
              onClick={onSaveAll}
              disabled={busy || docxBusy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-800 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-teal-900 disabled:opacity-50"
            >
              {docxBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              All
            </button>
          )}
        </div>
        {activeNote.lastSavedAt && (
          <span className="text-[10px] text-slate-400">Saved {formatDocumentDateDisplay(new Date(activeNote.lastSavedAt))}</span>
        )}
      </div>
    </div>
  );
};
