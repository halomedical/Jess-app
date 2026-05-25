import React, { useState, useEffect, useRef } from 'react';
import { X, ExternalLink, Loader2, FileText, AlertCircle } from 'lucide-react';
import { getFriendlyFileType } from '../utils/formatting';
import { getClientApiBase } from '../utils/apiBase';

interface FileViewerProps {
  fileId: string;
  fileName: string;
  mimeType: string;
  fileUrl: string;
  onClose: () => void;
}

const API_BASE = getClientApiBase();

function normalizeMime(mimeType: string): string {
  return (mimeType || '').split(';')[0].trim().toLowerCase();
}

function getViewerType(
  mimeType: string,
  fileName: string
): 'pdf' | 'image' | 'text' | 'docx' | 'unsupported' {
  const mt = normalizeMime(mimeType);
  const fnLower = (fileName || '').trim().toLowerCase();

  if (mt.startsWith('image/')) return 'image';
  if (mt === 'application/pdf' || fnLower.endsWith('.pdf')) return 'pdf';

  const isDocxMime =
    mt === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mt.includes('wordprocessingml.document');
  const isDocxName = fnLower.endsWith('.docx');
  if (isDocxMime || isDocxName || (mt === 'application/octet-stream' && isDocxName)) {
    return 'docx';
  }

  if (
    mt === 'text/plain' ||
    mt === 'text/csv' ||
    mt === 'text/html' ||
    mt === 'application/json' ||
    fnLower.endsWith('.txt') ||
    fnLower.endsWith('.csv') ||
    fnLower.endsWith('.json')
  )
    return 'text';

  if (
    mt === 'application/vnd.google-apps.document' ||
    mt === 'application/vnd.google-apps.spreadsheet' ||
    mt === 'application/vnd.google-apps.presentation'
  )
    return 'pdf';

  return 'unsupported';
}

export const FileViewer: React.FC<FileViewerProps> = ({ fileId, fileName, mimeType, fileUrl, onClose }) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  const viewerType = getViewerType(mimeType, fileName);

  useEffect(() => {
    if (viewerType === 'unsupported') {
      setLoading(false);
      return;
    }

    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }

    let cancelled = false;

    const loadFile = async () => {
      setLoading(true);
      setError(null);
      setBlobUrl(null);
      setTextContent(null);

      try {
        const encodedId = encodeURIComponent(fileId);

        if (viewerType === 'docx') {
          const pdfRes = await fetch(`${API_BASE}/api/drive/files/${encodedId}/preview-pdf`, {
            credentials: 'include',
          });
          if (!pdfRes.ok) {
            let msg = `Preview failed (${pdfRes.status})`;
            try {
              const j = (await pdfRes.json()) as { error?: string };
              if (typeof j.error === 'string') msg = j.error;
            } catch {
              /* ignore */
            }
            throw new Error(msg);
          }
          const blob = await pdfRes.blob();
          if (!cancelled) {
            const url = URL.createObjectURL(blob);
            blobUrlRef.current = url;
            setBlobUrl(url);
          }
          return;
        }

        const proxyUrl = `${API_BASE}/api/drive/files/${encodedId}/proxy`;
        const res = await fetch(proxyUrl, { credentials: 'include' });

        if (cancelled) return;

        if (!res.ok) {
          let msg = `Failed to load file (${res.status})`;
          try {
            const j = (await res.json()) as { error?: string };
            if (typeof j.error === 'string') msg = j.error;
          } catch {
            /* ignore */
          }
          throw new Error(msg);
        }

        if (viewerType === 'text') {
          const text = await res.text();
          if (!cancelled) setTextContent(text);
        } else {
          const blob = await res.blob();
          if (!cancelled) {
            const url = URL.createObjectURL(blob);
            blobUrlRef.current = url;
            setBlobUrl(url);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load file');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadFile();

    return () => {
      cancelled = true;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [fileId, viewerType]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4">
          <Loader2 className="w-10 h-10 text-[#4FB6B2] animate-spin" />
          <p className="text-[#6B7280] text-sm font-medium">Loading preview…</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4">
          <AlertCircle className="w-12 h-12 text-rose-400" />
          <p className="text-[#6B7280] font-medium">{error}</p>
          <a
            href={fileUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-[#4FB6B2] hover:text-[#3FA6A2] underline"
          >
            Open in Google Drive instead
          </a>
        </div>
      );
    }

    if (viewerType === 'unsupported') {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4">
          <FileText className="w-12 h-12 text-[#9CA3AF]" />
          <p className="text-[#6B7280] font-medium">Preview not available for this file type</p>
          <p className="text-[#9CA3AF] text-sm">({getFriendlyFileType(mimeType)})</p>
          <a
            href={fileUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 px-4 py-2 bg-[#4FB6B2] text-white rounded-[10px] hover:bg-[#3FA6A2] shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition flex items-center gap-2 text-sm font-semibold"
          >
            <ExternalLink size={16} /> Open in New Tab
          </a>
        </div>
      );
    }

    if (viewerType === 'image' && blobUrl) {
      return (
        <div className="flex h-full min-h-0 items-center justify-center overflow-auto p-4">
          <img src={blobUrl} alt={fileName} className="max-w-full max-h-full object-contain rounded-[10px] shadow-[0_1px_2px_rgba(0,0,0,0.05)]" />
        </div>
      );
    }

    if ((viewerType === 'pdf' || viewerType === 'docx') && blobUrl) {
      return (
        <div className="note-preview-panel flex h-full min-h-0 w-full max-w-full flex-1 flex-col rounded-b-xl">
          <iframe src={blobUrl} title={fileName} className="note-preview-pdf-frame" />
        </div>
      );
    }

    if (viewerType === 'text' && textContent !== null) {
      return (
        <div className="h-full min-h-0 overflow-auto p-6">
          <pre className="select-text whitespace-pre-wrap font-mono text-sm text-[#1F2937] leading-relaxed">
            {textContent}
          </pre>
        </div>
      );
    }

    return null;
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-[#1F2937]/25 backdrop-blur-[2px] p-0 sm:p-4 safe-pad-b"
      onClick={onClose}
    >
      <div
        className="box-border flex h-[min(92dvh,100dvh)] max-h-[100dvh] w-full max-w-full flex-col overflow-hidden rounded-t-[12px] border border-[#E5E7EB] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)] sm:h-[90vh] sm:max-w-6xl sm:rounded-[12px] sm:w-[95vw]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 px-3 sm:px-5 py-3 safe-pad-t border-b border-[#E5E7EB] bg-[#F7F9FB] rounded-t-[12px] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <FileText size={18} className="text-[#4FB6B2] shrink-0" />
            <h3 className="font-semibold text-[#1F2937] truncate">{fileName}</h3>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href={fileUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-[#6B7280] hover:text-[#4FB6B2] hover:bg-[#E6F4F3] rounded-[10px] transition"
              title="Open in new tab"
            >
              <ExternalLink size={15} /> New Tab
            </a>
            <button
              onClick={onClose}
              className="p-1.5 text-[#9CA3AF] hover:text-[#1F2937] hover:bg-[#F1F5F9] rounded-[10px] transition"
              title="Close"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="box-border flex min-h-0 flex-1 w-full max-w-full flex-col overflow-x-hidden bg-[#F7F9FB]">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};
