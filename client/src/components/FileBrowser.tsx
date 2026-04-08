import React from 'react';
import type { DriveFile, BreadcrumbItem } from '../../../shared/types';
import { AppStatus, FOLDER_MIME_TYPE } from '../../../shared/types';
import {
  FileText, ChevronLeft, ChevronRight, Home, FolderOpen, FolderPlus,
  Pencil, Trash2, Eye, ExternalLink, CloudUpload, Mail,
  FileSpreadsheet, FileImage, File,
} from 'lucide-react';
import { getFriendlyFileType } from '../utils/formatting';

interface FileBrowserProps {
  files: DriveFile[];
  status: AppStatus;
  breadcrumbs: BreadcrumbItem[];
  onNavigateToFolder: (folder: DriveFile) => void;
  onNavigateBack: () => void;
  onNavigateToBreadcrumb: (index: number) => void;
  onStartEditFile: (file: DriveFile) => void;
  onDeleteFile: (file: DriveFile) => void;
  onViewFile: (file: DriveFile) => void;
  onCreateFolder: () => void;
  /** Email this file (workspace); omitted = no button. */
  onEmailFile?: (file: DriveFile) => void;
  /** Folders matching this (e.g. system "Patient Notes") cannot be renamed or deleted. */
  isFolderProtected?: (folder: DriveFile) => boolean;
}

const isFolder = (file: DriveFile): boolean => file.mimeType === FOLDER_MIME_TYPE;

const FileSkeleton: React.FC = () => (
  <div className="space-y-3">
    {[1, 2, 3].map((i) => (
      <div key={i} className="flex items-center p-4 bg-white border border-slate-200 rounded-xl animate-pulse">
        <div className="w-11 h-11 bg-slate-200 rounded-lg mr-4" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-slate-200 rounded w-2/3" />
          <div className="h-3 bg-slate-100 rounded w-1/3" />
        </div>
      </div>
    ))}
  </div>
);

export const FileBrowser: React.FC<FileBrowserProps> = ({
  files, status, breadcrumbs,
  onNavigateToFolder, onNavigateBack, onNavigateToBreadcrumb,
  onStartEditFile, onDeleteFile, onViewFile, onCreateFolder, onEmailFile, isFolderProtected,
}) => {
  const isAtRoot = breadcrumbs.length <= 1;
  const folders = files.filter(isFolder);
  const regularFiles = files.filter(f => !isFolder(f));

  return (
    <div>
      {/* Breadcrumb navigation + New Folder button */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {!isAtRoot && (
            <button
              onClick={onNavigateBack}
              className="p-1.5 text-slate-500 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors mr-1"
              title="Go back"
            >
              <ChevronLeft size={18} />
            </button>
          )}
          {breadcrumbs.map((crumb, index) => (
            <React.Fragment key={crumb.id}>
              {index > 0 && <ChevronRight size={14} className="text-slate-300 shrink-0" />}
              <button
                onClick={() => onNavigateToBreadcrumb(index)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                  index === breadcrumbs.length - 1
                    ? 'text-teal-700 bg-teal-50'
                    : 'text-slate-500 hover:text-teal-600 hover:bg-slate-100'
                }`}
              >
                {index === 0 && <Home size={13} className="shrink-0" />}
                {index === 0 && breadcrumbs.length > 1 ? 'Root' : crumb.name}
              </button>
            </React.Fragment>
          ))}
        </div>
        <button
          onClick={onCreateFolder}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors"
        >
          <FolderPlus size={15} /> New Folder
        </button>
      </div>

      {/* File / folder listing */}
      <div className="grid grid-cols-1 gap-3">
        {status === AppStatus.LOADING ? (
          <FileSkeleton />
        ) : folders.length === 0 && regularFiles.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-lg">
            {status === AppStatus.UPLOADING ? (
              <div className="flex flex-col items-center gap-3">
                <CloudUpload className="w-12 h-12 text-teal-200 animate-bounce" />
                <p className="text-teal-600 font-medium">Adding file to drive...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <FolderOpen className="w-10 h-10 text-slate-300" />
                <p className="text-slate-400 font-medium">This folder is empty</p>
                <p className="text-slate-300 text-sm">Upload files using the button above</p>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Folders first */}
            {folders.length > 0 && (
              <>
                <div className="flex items-center gap-2 px-1 pt-1">
                  <FolderOpen size={13} className="text-slate-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Folders ({folders.length})</span>
                </div>
                {folders.map(folder => {
                  const protectedFolder = isFolderProtected?.(folder) ?? false;
                  return (
                  <div
                    key={folder.id}
                    className="group flex cursor-pointer flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 transition-all duration-200 hover:border-teal-200 hover:shadow-md sm:flex-row sm:items-center sm:gap-4 sm:p-4"
                    onClick={() => onNavigateToFolder(folder)}
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <div className="shrink-0 rounded-lg bg-teal-100 p-2.5 text-teal-600">
                        <FolderOpen className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="break-words font-semibold text-slate-800 transition-colors group-hover:text-teal-700">{folder.name}</h4>
                        <p className="mt-1 text-xs text-slate-500">Folder · {folder.createdTime}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center justify-end gap-0.5 border-t border-slate-100 pt-2 sm:border-t-0 sm:pt-0">
                      {!protectedFolder && (
                        <>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onStartEditFile(folder); }}
                            className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-50 hover:text-teal-600 sm:opacity-0 sm:group-hover:opacity-100"
                            title="Rename folder"
                          >
                            <Pencil size={16} aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onDeleteFile(folder); }}
                            className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-500 sm:opacity-0 sm:group-hover:opacity-100"
                            title="Delete folder"
                          >
                            <Trash2 size={16} aria-hidden />
                          </button>
                        </>
                      )}
                      <ChevronRight size={18} className="shrink-0 text-slate-300 transition-colors group-hover:text-teal-500" aria-hidden />
                    </div>
                  </div>
                  );
                })}
              </>
            )}

            {/* Files */}
            {regularFiles.length > 0 && (
              <>
                <div className="flex items-center gap-2 px-1 pt-2">
                  <FileText size={13} className="text-slate-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Files ({regularFiles.length})</span>
                </div>
                {regularFiles.map(file => {
                  const isImage = file.mimeType.includes('image');
                  const isSpreadsheet = file.mimeType.includes('spreadsheet') || file.mimeType.includes('excel') || file.mimeType.includes('csv');
                  const isPdf = file.mimeType === 'application/pdf';
                  const iconClass = isImage ? 'bg-purple-100 text-purple-600'
                    : isSpreadsheet ? 'bg-emerald-100 text-emerald-600'
                    : isPdf ? 'bg-red-100 text-red-600'
                    : 'bg-blue-100 text-blue-600';
                  const IconComponent = isImage ? FileImage
                    : isSpreadsheet ? FileSpreadsheet
                    : isPdf ? FileText
                    : File;
                  return (
                    <div
                      key={file.id}
                      className="group flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 transition-all duration-200 hover:border-teal-200 hover:shadow-md sm:flex-row sm:items-center sm:gap-4 sm:p-4"
                    >
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <div className={`shrink-0 rounded-lg p-2.5 ${iconClass}`}>
                          <IconComponent className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="break-words font-semibold text-slate-800 transition-colors group-hover:text-teal-700">{file.name}</h4>
                          <p className="mt-1 text-xs text-slate-500">{file.createdTime}</p>
                          <p className="text-[11px] text-slate-400">{getFriendlyFileType(file.mimeType)}</p>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center justify-end gap-0.5 border-t border-slate-100 pt-2 sm:border-t-0 sm:pt-0">
                        {onEmailFile && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onEmailFile(file);
                            }}
                            className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
                            title="Email this file from Drive"
                          >
                            <Mail size={18} strokeWidth={2} aria-hidden />
                            <span className="sr-only">Email file</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onViewFile(file)}
                          className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-teal-50 hover:text-teal-700 sm:opacity-0 sm:group-hover:opacity-100"
                          title="Preview"
                        >
                          <Eye size={17} aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => onStartEditFile(file)}
                          className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-50 hover:text-teal-600 sm:opacity-0 sm:group-hover:opacity-100"
                          title="Rename"
                        >
                          <Pencil size={16} aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteFile(file)}
                          className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-500 sm:opacity-0 sm:group-hover:opacity-100"
                          title="Delete"
                        >
                          <Trash2 size={16} aria-hidden />
                        </button>
                        <a
                          href={file.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-50 hover:text-teal-600 sm:opacity-0 sm:group-hover:opacity-100"
                          title="Open in Google Drive"
                        >
                          <ExternalLink size={16} aria-hidden />
                        </a>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};
