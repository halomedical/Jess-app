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
      <div key={i} className="flex items-center p-4 bg-white border border-[#E5E7EB] rounded-[10px] animate-pulse shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
        <div className="w-11 h-11 bg-[#F1F5F9] rounded-lg mr-4" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-[#F1F5F9] rounded w-2/3" />
          <div className="h-3 bg-[#F7F9FB] rounded w-1/3" />
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
              className="p-1.5 text-[#6B7280] hover:text-[#4FB6B2] hover:bg-[#E6F4F3] rounded-[10px] transition-colors mr-1"
              title="Go back"
            >
              <ChevronLeft size={18} />
            </button>
          )}
          {breadcrumbs.map((crumb, index) => (
            <React.Fragment key={crumb.id}>
              {index > 0 && <ChevronRight size={14} className="text-[#9CA3AF] shrink-0" />}
              <button
                onClick={() => onNavigateToBreadcrumb(index)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                  index === breadcrumbs.length - 1
                    ? 'text-[#4FB6B2] bg-[#E6F4F3]'
                    : 'text-[#6B7280] hover:text-[#4FB6B2] hover:bg-[#F1F5F9]'
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
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-[#4FB6B2] bg-[#E6F4F3] hover:bg-[#E6F4F3]/80 border border-[#E5E7EB] rounded-[10px] transition-colors shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
        >
          <FolderPlus size={15} /> New Folder
        </button>
      </div>

      {/* File / folder listing */}
      <div className="grid grid-cols-1 gap-2">
        {status === AppStatus.LOADING ? (
          <FileSkeleton />
        ) : folders.length === 0 && regularFiles.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-[#E5E7EB] rounded-[10px] bg-[#F7F9FB]/50">
            {status === AppStatus.UPLOADING ? (
              <div className="flex flex-col items-center gap-3">
                <CloudUpload className="w-12 h-12 text-[#4FB6B2]/50 animate-bounce" />
                <p className="text-[#4FB6B2] font-medium">Adding file to drive...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <FolderOpen className="w-10 h-10 text-[#9CA3AF]" />
                <p className="text-[#6B7280] font-medium">This folder is empty</p>
                <p className="text-[#9CA3AF] text-sm">Upload from the workspace toolbar or bottom bar</p>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Folders first */}
            {folders.length > 0 && (
              <>
                <div className="flex items-center gap-2 px-1 pt-1">
                  <FolderOpen size={13} className="text-[#9CA3AF]" />
                  <span className="text-xs font-bold uppercase tracking-wider text-[#6B7280]">Folders ({folders.length})</span>
                </div>
                {folders.map(folder => {
                  const protectedFolder = isFolderProtected?.(folder) ?? false;
                  return (
                  <div
                    key={folder.id}
                    className="group flex cursor-pointer flex-col gap-2 rounded-[10px] border border-[#E5E7EB] bg-white p-2.5 transition-all duration-200 hover:border-[#4FB6B2]/30 hover:shadow-[0_1px_2px_rgba(0,0,0,0.05)] sm:flex-row sm:items-center sm:gap-3 sm:p-3"
                    onClick={() => onNavigateToFolder(folder)}
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-2.5">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#E6F4F3] text-[#4FB6B2]">
                        <FolderOpen className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="line-clamp-2 break-words font-semibold text-[#1F2937] transition-colors group-hover:text-[#4FB6B2]">{folder.name}</h4>
                        <p className="mt-0.5 text-[11px] text-[#6B7280]">Folder · {folder.createdTime}</p>
                      </div>
                    </div>
                    <div className="flex w-full shrink-0 items-center justify-end gap-0 border-t border-[#F1F5F9] pt-2 sm:w-auto sm:gap-0 sm:border-t-0 sm:pt-0">
                      {!protectedFolder && (
                        <>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onStartEditFile(folder); }}
                            className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-[#9CA3AF] transition-colors hover:bg-[#F1F5F9] hover:text-[#4FB6B2] sm:opacity-0 sm:group-hover:opacity-100"
                            title="Rename folder"
                          >
                            <Pencil size={16} aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onDeleteFile(folder); }}
                            className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-[#9CA3AF] transition-colors hover:bg-rose-50 hover:text-rose-500 sm:opacity-0 sm:group-hover:opacity-100"
                            title="Delete folder"
                          >
                            <Trash2 size={16} aria-hidden />
                          </button>
                        </>
                      )}
                      <ChevronRight size={18} className="shrink-0 text-[#9CA3AF] transition-colors group-hover:text-[#4FB6B2]" aria-hidden />
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
                  <FileText size={13} className="text-[#9CA3AF]" />
                  <span className="text-xs font-bold uppercase tracking-wider text-[#6B7280]">Files ({regularFiles.length})</span>
                </div>
                {regularFiles.map(file => {
                  const isImage = file.mimeType.includes('image');
                  const isSpreadsheet = file.mimeType.includes('spreadsheet') || file.mimeType.includes('excel') || file.mimeType.includes('csv');
                  const isPdf = file.mimeType === 'application/pdf';
                  const iconClass = 'bg-[#E6F4F3] text-[#4FB6B2]';
                  const IconComponent = isImage ? FileImage
                    : isSpreadsheet ? FileSpreadsheet
                    : isPdf ? FileText
                    : File;
                  return (
                    <div
                      key={file.id}
                      className="group flex flex-col gap-2 rounded-[10px] border border-[#E5E7EB] bg-white p-2.5 transition-all duration-200 hover:border-[#4FB6B2]/30 hover:shadow-[0_1px_2px_rgba(0,0,0,0.05)] sm:flex-row sm:items-center sm:gap-3 sm:p-3"
                    >
                      <div
                        className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[#4FB6B2] focus-visible:ring-offset-2"
                        role="button"
                        tabIndex={0}
                        aria-label={`Open preview, ${file.name}`}
                        onClick={() => onViewFile(file)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onViewFile(file);
                          }
                        }}
                      >
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconClass}`}>
                          <IconComponent className="h-5 w-5" aria-hidden />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="line-clamp-2 break-words font-semibold text-[#1F2937] transition-colors group-hover:text-[#4FB6B2]">{file.name}</h4>
                          <p className="mt-0.5 text-[11px] text-[#6B7280]">{file.createdTime}</p>
                          <p className="text-[10px] text-[#9CA3AF]">{getFriendlyFileType(file.mimeType)}</p>
                        </div>
                      </div>
                      <div className="flex w-full shrink-0 flex-nowrap items-center justify-end gap-0 border-t border-[#F1F5F9] pt-2 sm:w-auto sm:border-t-0 sm:pt-0">
                        {onEmailFile && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onEmailFile(file);
                            }}
                            className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-[#6B7280] transition-colors hover:bg-[#F1F5F9] hover:text-[#1F2937]"
                            title="Email this file from Drive"
                          >
                            <Mail size={17} strokeWidth={2} aria-hidden />
                            <span className="sr-only">Email file</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewFile(file);
                          }}
                          className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-[#9CA3AF] transition-colors hover:bg-[#E6F4F3] hover:text-[#4FB6B2] sm:opacity-0 sm:group-hover:opacity-100"
                          title="Preview"
                        >
                          <Eye size={16} aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onStartEditFile(file);
                          }}
                          className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-[#9CA3AF] transition-colors hover:bg-[#F1F5F9] hover:text-[#4FB6B2] sm:opacity-0 sm:group-hover:opacity-100"
                          title="Rename file"
                        >
                          <Pencil size={16} aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteFile(file);
                          }}
                          className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-[#9CA3AF] transition-colors hover:bg-rose-50 hover:text-rose-500 sm:opacity-0 sm:group-hover:opacity-100"
                          title="Delete"
                        >
                          <Trash2 size={16} aria-hidden />
                        </button>
                        <a
                          href={file.url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-[#9CA3AF] transition-colors hover:bg-[#F1F5F9] hover:text-[#4FB6B2] sm:opacity-0 sm:group-hover:opacity-100"
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
