import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Save, FileDown, Mail, Loader2, Eye, Pencil } from 'lucide-react';
import type { HaloNote } from '../../../shared/types';
import { AppStatus } from '../../../shared/types';
import { buildNotePlainText } from '../../../shared/notePlainText';
import { noteHasRichLetterhead } from '../../../shared/richDoctorLetterhead';
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
  docxExportPhase?: BackgroundTaskPhase;
  isGeneratingNote?: boolean;
  previewPdfUrl: string | null;
  previewPdfLoading: boolean;
  previewPdfError: string | null;
  onRetryPreviewPdf: () => void;
}

const RICH_NOTE_PREVIEW_CLASS =
  'rich-note-preview note-preview-content select-text min-w-0 max-w-full overflow-x-hidden text-sm leading-normal text-[#1F2937] sm:text-[11px] sm:leading-normal [&_#rich-doctor-letterhead]:font-serif [&_.clinical-note-body]:font-sans [&_table]:w-full [&_table]:max-w-full [&_table]:border-collapse [&_td]:align-top [&_img]:max-w-full [&_p]:my-0 [&_a]:text-[#1F2937] [&_a]:underline';

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
  isGeneratingNote = false,
  previewPdfUrl,
  previewPdfLoading,
  previewPdfError,
  onRetryPreviewPdf,
}) => {
  const activeNote = notes[activeIndex];
  const busy = status === AppStatus.FILING;
  const docxBusy = docxExportPhase === 'running';
  const notePlain = useMemo(() => (activeNote ? buildNotePlainText(activeNote) : ''), [activeNote]);
  const isRichHtmlNote = useMemo(
    () => (activeNote ? noteHasRichLetterhead(activeNote.content ?? '') : false),
    [activeNote]
  );
  /** HTML preview reflows on narrow screens; PDF iframes cause horizontal scroll on iOS. */
  const useHtmlPreview = useMemo(() => {
    if (!activeNote) return false;
    const c = activeNote.content ?? '';
    return isRichHtmlNote || /<(?:table|div|p)\b/i.test(c);
  }, [activeNote, isRichHtmlNote]);
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('preview');
  const editRef = useRef<HTMLDivElement>(null);
  const lastSyncedNoteIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (viewMode !== 'edit' || !isRichHtmlNote || !activeNote || !editRef.current) return;
    editRef.current.innerHTML = activeNote.content ?? '';
    lastSyncedNoteIdRef.current = activeNote.noteId;
  }, [viewMode, isRichHtmlNote, activeNote?.noteId]);

  useEffect(() => {
    if (!activeNote) lastSyncedNoteIdRef.current = null;
  }, [activeNote?.noteId]);

  const emptyShell = (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[10px] border border-[#E5E7EB] bg-white md:rounded-lg md:border-[#E5E7EB]/90">
      <div className="flex flex-1 items-center justify-center px-4 text-[#9CA3AF]">
        <p className="text-center text-xs">No notes yet. Dictate from the workspace; a note is generated when transcription finishes.</p>
      </div>
    </div>
  );

  if (notes.length === 0) {
    return emptyShell;
  }

  return (
    <div className="flex min-h-0 w-full max-w-full flex-1 flex-col overflow-x-hidden rounded-[10px] border border-[#E5E7EB] bg-white md:rounded-lg md:border-[#E5E7EB]/90">
      <div className="flex min-w-0 shrink-0 flex-col gap-1 border-b border-[#E5E7EB] px-1.5 py-1 md:border-[#F1F5F9] md:px-2 md:py-1.5 sm:px-3 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1 md:gap-2">
          <span className="hidden text-[10px] font-bold uppercase tracking-wide text-[#9CA3AF] sm:inline">Note</span>
          <div className="inline-flex rounded-[10px] border border-[#E5E7EB] bg-[#F1F5F9] p-0.5 md:rounded-md">
            <button
              type="button"
              onClick={() => setViewMode('preview')}
              className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold transition-colors md:gap-1 md:px-2 md:py-1 md:text-[11px] ${
                viewMode === 'preview'
                  ? 'bg-white text-[#1F2937] shadow-[0_1px_2px_rgba(15,23,42,0.06)] md:text-[#4FB6B2]'
                  : 'text-[#6B7280] hover:text-[#1F2937]'
              }`}
            >
              <Eye className="h-3 w-3 md:h-3.5 md:w-3.5" strokeWidth={2.25} />
              Preview
            </button>
            <button
              type="button"
              onClick={() => setViewMode('edit')}
              className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold transition-colors md:gap-1 md:px-2 md:py-1 md:text-[11px] ${
                viewMode === 'edit'
                  ? 'bg-white text-[#1F2937] shadow-[0_1px_2px_rgba(15,23,42,0.06)] md:text-[#4FB6B2]'
                  : 'text-[#6B7280] hover:text-[#1F2937]'
              }`}
            >
              <Pencil className="h-3 w-3 md:h-3.5 md:w-3.5" strokeWidth={2.25} />
              Edit
            </button>
          </div>
        </div>
        <div className="flex min-w-0 max-w-full gap-0.5 overflow-x-auto pb-0.5 md:gap-1">
          {notes.map((note, i) => {
            const dateLabel = tabDateLabelForNote(note);
            return (
              <button
                key={note.noteId}
                type="button"
                onClick={() => onActiveIndexChange(i)}
                title={`${note.title || `Note ${i + 1}`} · ${dateLabel}`}
                className={`shrink-0 rounded-md px-1.5 py-0.5 text-left text-[9px] font-medium transition-all md:px-2 md:py-1 md:text-[10px] ${
                  i === activeIndex
                    ? 'bg-[#4FB6B2] text-white shadow-[0_1px_2px_rgba(15,23,42,0.08)]'
                    : 'bg-[#F1F5F9] text-[#6B7280] hover:bg-[#E5E7EB]'
                }`}
              >
                <span className="block max-w-[6.5rem] truncate leading-tight sm:max-w-[10rem]">{note.title || `Note ${i + 1}`}</span>
              </button>
            );
          })}
        </div>
      </div>

      {isGeneratingNote && (
        <div className="shrink-0 border-b border-[#E5E7EB] bg-[#E6F4F3] px-2 py-1.5 text-center text-[10px] font-medium text-[#1F2937] md:px-3 md:text-[11px]">
          <span className="inline-flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 shrink-0 animate-spin text-[#4FB6B2]" aria-hidden />
            Generating note…
          </span>
        </div>
      )}

      {viewMode === 'preview' ? (
        <div className="flex min-h-0 max-w-full flex-1 flex-col overflow-x-hidden bg-[#F7F9FB] px-1 py-0.5 md:px-2 md:py-2 sm:px-3">
          {useHtmlPreview ? (
            <div className="note-preview-panel mx-auto min-h-0 w-full max-w-full flex-1 rounded-[10px] border border-[#E5E7EB] bg-white p-2 shadow-sm sm:max-w-[52rem] sm:p-6 md:p-8">
              <div
                className={RICH_NOTE_PREVIEW_CLASS}
                dangerouslySetInnerHTML={{ __html: activeNote.content ?? '' }}
              />
            </div>
          ) : previewPdfLoading && !previewPdfUrl ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-[#6B7280]">
              <Loader2 className="h-8 w-8 animate-spin text-[#4FB6B2]" aria-hidden />
              <span className="text-xs font-medium">Loading PDF preview…</span>
            </div>
          ) : previewPdfError ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-8 text-center">
              <p className="text-sm text-[#6B7280]">{previewPdfError}</p>
              <button
                type="button"
                onClick={onRetryPreviewPdf}
                className="rounded-[10px] bg-[#4FB6B2] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#3FA6A2]"
              >
                Retry preview
              </button>
            </div>
          ) : previewPdfUrl ? (
            <div className="note-preview-panel relative mx-auto flex min-h-0 w-full max-w-full flex-1 flex-col rounded-[10px] border border-[#E5E7EB] bg-white shadow-sm sm:max-w-[52rem]">
              {previewPdfLoading ? (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-white/80 backdrop-blur-[1px]">
                  <Loader2 className="h-7 w-7 animate-spin text-[#4FB6B2]" aria-hidden />
                  <span className="text-xs font-medium text-[#6B7280]">Updating preview…</span>
                </div>
              ) : null}
              <iframe title="Note PDF preview" src={previewPdfUrl} className="note-preview-pdf-frame" />
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center py-8 text-[#9CA3AF]">
              <p className="text-center text-xs">Preview will appear when the note has content.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden font-sans">
          <input
            type="text"
            value={activeNote.title}
            onChange={(e) => onNoteChange(activeIndex, { title: e.target.value })}
            placeholder="Note title"
            className="shrink-0 border-b border-[#E5E7EB] px-2 py-1.5 text-sm font-semibold text-[#1F2937] outline-none focus:bg-[#F7F9FB] md:px-3 md:py-2"
          />
          {isRichHtmlNote ? (
            <div
              ref={editRef}
              contentEditable
              suppressContentEditableWarning
              role="textbox"
              aria-label="Note content"
              className={`min-h-0 flex-1 overflow-auto border-0 p-2 outline-none focus:bg-[#F7F9FB] sm:p-3 md:p-4 ${RICH_NOTE_PREVIEW_CLASS}`}
              onInput={(e) => {
                lastSyncedNoteIdRef.current = activeNote.noteId;
                onNoteChange(activeIndex, { content: e.currentTarget.innerHTML });
              }}
            />
          ) : (
            <textarea
              value={activeNote.content}
              onChange={(e) => onNoteChange(activeIndex, { content: e.target.value })}
              placeholder="Note content..."
              className="min-h-0 flex-1 resize-none border-0 p-2 text-sm leading-relaxed text-[#1F2937] outline-none focus:bg-[#F7F9FB] md:p-3"
            />
          )}
        </div>
      )}

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-1 border-t border-[#E5E7EB] bg-[#F1F5F9] px-1.5 py-1 md:gap-2 md:px-2 md:py-2 sm:px-3">
        <div className="flex flex-wrap items-center gap-1 md:gap-1.5">
          <button
            type="button"
            onClick={() => onSaveAsDocx(activeIndex)}
            disabled={busy || docxBusy || !notePlain.trim()}
            className="inline-flex items-center gap-1 rounded-[10px] bg-[#4FB6B2] px-2 py-1 text-[10px] font-bold text-white shadow-sm hover:bg-[#3FA6A2] disabled:opacity-50 md:px-2.5 md:py-1.5 md:text-[11px]"
          >
            {savingNoteIndex === activeIndex || (docxBusy && savingNoteIndex === activeIndex) ? (
              <Loader2 className="h-3 w-3 animate-spin md:h-3.5 md:w-3.5" />
            ) : (
              <FileDown className="h-3 w-3 md:h-3.5 md:w-3.5" />
            )}
            DOCX
          </button>
          <button
            type="button"
            onClick={() => onEmail(activeIndex)}
            disabled={busy}
            title={notePlain.trim() ? 'Email this note' : 'Email includes chart if note is empty'}
            aria-label="Email note"
            className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-[10px] border border-[#E5E7EB] bg-white text-[#6B7280] hover:bg-[#F7F9FB] disabled:opacity-50"
          >
            <Mail className="h-3.5 w-3.5 md:h-4 md:w-4" aria-hidden />
          </button>
          {notes.length > 1 && (
            <button
              type="button"
              onClick={onSaveAll}
              disabled={busy || docxBusy}
              className="inline-flex items-center gap-1 rounded-[10px] border border-[#E5E7EB] bg-white px-2 py-1 text-[10px] font-bold text-[#1F2937] hover:bg-[#F1F5F9] disabled:opacity-50 md:px-2.5 md:py-1.5 md:text-[11px]"
            >
              {docxBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              All
            </button>
          )}
        </div>
        {activeNote.lastSavedAt && (
          <span className="text-[9px] text-[#9CA3AF] md:text-[10px]">
            Saved {formatDocumentDateDisplay(new Date(activeNote.lastSavedAt))}
          </span>
        )}
      </div>
    </div>
  );
};
