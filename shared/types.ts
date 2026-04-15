// Shared types used by both client and server

export interface Patient {
  id: string;
  name: string;
  dob: string;
  sex: 'M' | 'F';
  lastVisit: string;
  alerts: string[];
  /** User filing / folder reference (stored in Drive appProperties). */
  folderNumber?: string;
  /** Contact phone (stored in Drive appProperties). */
  contactNumber?: string;
  /** Referring doctor name (stored in Drive appProperties). */
  referringDoctor?: string;
  /** Whether this encounter is a new registration or follow-up. */
  visitType?: 'new' | 'follow_up';
  /**
   * Encounter / visit date (YYYY-MM-DD), distinct from DOB — stored in Drive appProperties.
   */
  visitDate?: string;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  url: string;
  thumbnail?: string;
  createdTime: string;
  /** Optional Halo template association for uploaded documents (stored in Drive appProperties). */
  haloTemplateId?: string;
}

export const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

export interface BreadcrumbItem {
  id: string;
  name: string;
}

export interface LabAlert {
  parameter: string;
  value: string;
  severity: "high" | "medium" | "low";
  context: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export enum AppStatus {
  IDLE = 'idle',
  LOADING = 'loading',
  UPLOADING = 'uploading',
  ANALYZING = 'analyzing',
  SAVING = 'saving',
  FILING = 'filing'
}

export interface UserSettings {
  // Profile (mandatory)
  firstName: string;
  lastName: string;
  profession: string;
  department: string;
  // Profile (optional)
  city: string;
  postalCode: string;
  university: string;
  // Template (legacy)
  noteTemplate: 'soap' | 'custom';
  customTemplateContent: string;
  customTemplateName: string;
  // Halo template (for generate_note)
  templateId?: string;
}

export interface NoteField {
  label: string;
  body: string;
}

export interface HaloNote {
  noteId: string;
  title: string;
  content: string;
  template_id: string;
  /** ISO timestamp when the note was first created (stable tab date). */
  createdAt?: string;
  lastSavedAt?: string;
  dirty?: boolean;
  /** Structured fields from generate_note (for preview before DOCX) */
  fields?: NoteField[];
}

export interface HaloTemplate {
  id: string;
  name?: string;
  [key: string]: unknown;
}
