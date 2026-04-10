import React, { useState, useEffect, useRef } from 'react';
import type { UserSettings } from '../../../shared/types';
import { HALO_TEMPLATE_OPTIONS, DEFAULT_HALO_TEMPLATE_ID } from '../../../shared/haloTemplates';
import {
  X, Pencil, Save, User, Clock, Briefcase, MapPin, GraduationCap,
  FileText, Upload, Check, AlertCircle, Send, Plus, Cloud,
} from 'lucide-react';
import { requestNewTemplate } from '../services/api';

const DEFAULT_SETTINGS: UserSettings = {
  firstName: '',
  lastName: '',
  profession: '',
  department: '',
  city: '',
  postalCode: '',
  university: '',
  noteTemplate: 'soap',
  customTemplateContent: '',
  customTemplateName: '',
  templateId: DEFAULT_HALO_TEMPLATE_ID,
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  settings: UserSettings | null;
  onSave: (settings: UserSettings) => Promise<void>;
  userEmail?: string;
  loginTime: number;
  onToast?: (message: string, type: 'success' | 'error' | 'info') => void;
}

export const SettingsModal: React.FC<Props> = ({
  isOpen, onClose, settings, onSave, userEmail, loginTime, onToast,
}) => {
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<UserSettings>(settings || DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [elapsed, setElapsed] = useState('');
  const [templateTab, setTemplateTab] = useState<'soap' | 'custom'>(settings?.noteTemplate || 'soap');
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Request new template form
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestDescription, setRequestDescription] = useState('');
  const [requestFiles, setRequestFiles] = useState<File[]>([]);
  const [requestSending, setRequestSending] = useState(false);
  const requestFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (settings) {
      setForm(settings);
      setTemplateTab(settings.noteTemplate);
    }
  }, [settings]);

  // Session timer
  useEffect(() => {
    if (!isOpen) return;
    const update = () => {
      const diff = Date.now() - loginTime;
      const hrs = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setElapsed(`${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [isOpen, loginTime]);

  const requiredFieldsMissing = !form.firstName.trim() || !form.lastName.trim() || !form.profession.trim() || !form.department.trim();

  const handleSave = async () => {
    if (editMode && requiredFieldsMissing) return;
    setSaving(true);
    try {
      const updated = { ...form, noteTemplate: templateTab, templateId: form.templateId || DEFAULT_HALO_TEMPLATE_ID };
      await onSave(updated);
      setForm(updated);
      setEditMode(false);
    } catch {
      // Error handled by parent
    }
    setSaving(false);
  };

  const handleTemplateUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError('');

    // Accept .txt, .md, and .docx (read as text)
    const validTypes = ['text/plain', 'text/markdown', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    const validExts = ['.txt', '.md'];
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();

    if (!validTypes.includes(file.type) && !validExts.includes(ext)) {
      setUploadError('Please upload a .txt or .md file. These formats work best for AI template reading.');
      return;
    }

    if (file.size > 50000) {
      setUploadError('Template file too large. Keep it under 50KB.');
      return;
    }

    try {
      const text = await file.text();
      setForm(prev => ({
        ...prev,
        customTemplateContent: text,
        customTemplateName: file.name,
        noteTemplate: 'custom',
      }));
      setTemplateTab('custom');
    } catch {
      setUploadError('Failed to read file.');
    }
    e.target.value = '';
  };


  const handleRequestTemplateSubmit = async () => {
    const desc = requestDescription.trim();
    if (!desc) {
      onToast?.('Please describe the template you need.', 'info');
      return;
    }
    setRequestSending(true);
    try {
      const attachments: Array<{ name: string; content: string }> = [];
      for (const file of requestFiles) {
        const content = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => {
            const result = r.result as string;
            const base64 = result.includes(',') ? result.split(',')[1] : result;
            resolve(base64 || '');
          };
          r.onerror = () => reject(new Error('Failed to read file'));
          r.readAsDataURL(file);
        });
        if (content) attachments.push({ name: file.name, content });
      }
      await requestNewTemplate({ description: desc, attachments: attachments.length ? attachments : undefined });
      onToast?.('Request sent. We will get back to you.', 'success');
      setShowRequestForm(false);
      setRequestDescription('');
      setRequestFiles([]);
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as Error).message) : 'Request failed.';
      onToast?.(msg, 'error');
    } finally {
      setRequestSending(false);
    }
  };

  if (!isOpen) return null;

  const hasProfile = form.firstName || form.lastName || form.profession || form.department;
  const displayName = [form.firstName, form.lastName].filter(Boolean).join(' ') || 'Not set';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1F2937]/25 backdrop-blur-[2px]">
      <div className="bg-white rounded-[12px] border border-[#E5E7EB] shadow-[0_1px_2px_rgba(0,0,0,0.05)] w-full max-w-lg m-4 max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-[#F1F5F9] px-6 py-5 flex items-center justify-between rounded-t-[12px] border-b border-[#E5E7EB]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#E6F4F3] rounded-[10px] flex items-center justify-center border border-[#E5E7EB]">
              <User size={20} className="text-[#4FB6B2]" />
            </div>
            <div>
              <h2 className="text-[#1F2937] font-bold text-lg">Profile & Settings</h2>
              <p className="text-[#6B7280] text-xs">{userEmail || 'Not signed in'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!editMode && (
              <button
                onClick={() => setEditMode(true)}
                className="p-2 rounded-lg text-[#6B7280] hover:text-[#4FB6B2] hover:bg-[#E6F4F3] transition-all"
                title="Edit Profile"
              >
                <Pencil size={16} />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-[#9CA3AF] hover:text-[#1F2937] hover:bg-white transition-all"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Session Info */}
          <div className="flex items-center gap-3 bg-[#F7F9FB] rounded-xl px-4 py-3 border border-[#F1F5F9]">
            <Clock size={16} className="text-[#4FB6B2] shrink-0" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#9CA3AF]">Session Duration</p>
              <p className="text-sm font-mono font-bold text-[#1F2937]">{elapsed}</p>
            </div>
          </div>

          <div className="flex gap-3 rounded-xl border border-[#E5E7EB] bg-[#E6F4F3]/90 px-4 py-3">
            <Cloud size={18} className="text-[#4FB6B2] shrink-0 mt-0.5" aria-hidden />
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#1F2937] mb-1">Patient folders &amp; Google Drive</p>
              <p className="text-xs text-[#1F2937] leading-relaxed">
                All patient folders live under <span className="font-semibold">your signed-in Google account</span> in Drive (root folder{' '}
                <span className="font-mono text-[11px] bg-white/90 px-1 rounded border border-[#E5E7EB]/80">Halo_Patients</span>).
                Someone else who logs in with <span className="font-semibold">their own</span> Google account only sees <span className="font-semibold">their</span> folders—nothing is merged or synced between different logins by design.
                For a shared practice list today, use one shared Google account for HALO, or move/copy folders in Drive manually; automatic team sync would require a different backend.
              </p>
            </div>
          </div>

          {/* Profile Section */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#9CA3AF] mb-3 flex items-center gap-1.5">
              <User size={12} /> Practitioner Profile
            </h3>

            {editMode ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#6B7280] mb-1">First Name <span className="text-rose-400">*</span></label>
                    <input
                      type="text"
                      value={form.firstName}
                      onChange={e => setForm(prev => ({ ...prev, firstName: e.target.value }))}
                      placeholder="e.g. Sarah"
                      className={`w-full px-3 py-2.5 rounded-lg border text-sm focus:border-[#4FB6B2] focus:ring-2 focus:ring-[#E6F4F3] outline-none transition ${!form.firstName.trim() ? 'border-rose-200 bg-rose-50/30' : 'border-[#E5E7EB]'}`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#6B7280] mb-1">Last Name <span className="text-rose-400">*</span></label>
                    <input
                      type="text"
                      value={form.lastName}
                      onChange={e => setForm(prev => ({ ...prev, lastName: e.target.value }))}
                      placeholder="e.g. Connor"
                      className={`w-full px-3 py-2.5 rounded-lg border text-sm focus:border-[#4FB6B2] focus:ring-2 focus:ring-[#E6F4F3] outline-none transition ${!form.lastName.trim() ? 'border-rose-200 bg-rose-50/30' : 'border-[#E5E7EB]'}`}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#6B7280] mb-1 flex items-center gap-1"><Briefcase size={11} /> Profession <span className="text-rose-400">*</span></label>
                  <input
                    type="text"
                    value={form.profession}
                    onChange={e => setForm(prev => ({ ...prev, profession: e.target.value }))}
                    placeholder="e.g. Physiotherapist, General Practitioner"
                    className={`w-full px-3 py-2.5 rounded-lg border text-sm focus:border-[#4FB6B2] focus:ring-2 focus:ring-[#E6F4F3] outline-none transition ${!form.profession.trim() ? 'border-rose-200 bg-rose-50/30' : 'border-[#E5E7EB]'}`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#6B7280] mb-1 flex items-center gap-1"><Briefcase size={11} /> Department <span className="text-rose-400">*</span></label>
                  <input
                    type="text"
                    value={form.department}
                    onChange={e => setForm(prev => ({ ...prev, department: e.target.value }))}
                    placeholder="e.g. Orthopaedics, Cardiology, General Practice"
                    className={`w-full px-3 py-2.5 rounded-lg border text-sm focus:border-[#4FB6B2] focus:ring-2 focus:ring-[#E6F4F3] outline-none transition ${!form.department.trim() ? 'border-rose-200 bg-rose-50/30' : 'border-[#E5E7EB]'}`}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#6B7280] mb-1 flex items-center gap-1"><MapPin size={11} /> City</label>
                    <input
                      type="text"
                      value={form.city}
                      onChange={e => setForm(prev => ({ ...prev, city: e.target.value }))}
                      placeholder="e.g. Cape Town"
                      className="w-full px-3 py-2.5 rounded-lg border border-[#E5E7EB] text-sm focus:border-[#4FB6B2] focus:ring-2 focus:ring-[#E6F4F3] outline-none transition"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#6B7280] mb-1">Postal Code</label>
                    <input
                      type="text"
                      value={form.postalCode}
                      onChange={e => setForm(prev => ({ ...prev, postalCode: e.target.value }))}
                      placeholder="e.g. 8001"
                      className="w-full px-3 py-2.5 rounded-lg border border-[#E5E7EB] text-sm focus:border-[#4FB6B2] focus:ring-2 focus:ring-[#E6F4F3] outline-none transition"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#6B7280] mb-1 flex items-center gap-1"><GraduationCap size={11} /> University</label>
                  <input
                    type="text"
                    value={form.university}
                    onChange={e => setForm(prev => ({ ...prev, university: e.target.value }))}
                    placeholder="e.g. University of Cape Town"
                    className="w-full px-3 py-2.5 rounded-lg border border-[#E5E7EB] text-sm focus:border-[#4FB6B2] focus:ring-2 focus:ring-[#E6F4F3] outline-none transition"
                  />
                </div>
                {requiredFieldsMissing && (
                  <p className="text-xs text-rose-400 flex items-center gap-1 pt-1"><AlertCircle size={12} /> Please fill in all required fields marked with *</p>
                )}
              </div>
            ) : (
              <div className="bg-[#F7F9FB] rounded-xl border border-[#F1F5F9] overflow-hidden">
                {hasProfile ? (
                  <div className="divide-y divide-[#F1F5F9]">
                    <div className="px-4 py-3 flex items-center gap-3">
                      <div className="w-9 h-9 bg-[#4FB6B2] rounded-full flex items-center justify-center text-white font-bold text-sm">
                        {(form.firstName?.[0] || '').toUpperCase()}{(form.lastName?.[0] || '').toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-[#1F2937] text-sm">{displayName}</p>
                        {form.profession && <p className="text-xs text-[#4FB6B2] font-medium">{form.profession}</p>}
                        {form.department && <p className="text-xs text-[#6B7280]">{form.department}</p>}
                      </div>
                    </div>
                    {(form.city || form.postalCode) && (
                      <div className="px-4 py-2.5 flex items-center gap-2 text-xs text-[#6B7280]">
                        <MapPin size={12} className="text-[#9CA3AF]" />
                        {[form.city, form.postalCode].filter(Boolean).join(', ')}
                      </div>
                    )}
                    {form.university && (
                      <div className="px-4 py-2.5 flex items-center gap-2 text-xs text-[#6B7280]">
                        <GraduationCap size={12} className="text-[#9CA3AF]" />
                        {form.university}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="px-4 py-6 text-center">
                    <p className="text-sm text-[#9CA3AF]">No profile information set</p>
                    <button
                      onClick={() => setEditMode(true)}
                      className="mt-2 text-xs font-semibold text-[#4FB6B2] hover:text-[#4FB6B2]"
                    >
                      Set up your profile
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Note templates: current templates + default + request new */}
          <div className="border-t border-[#F1F5F9] pt-6">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#9CA3AF] mb-3 flex items-center gap-1.5">
              <FileText size={12} /> Note templates
            </h3>
            <p className="text-xs text-[#9CA3AF] mb-3">Templates used when generating notes from scribe dictation (Halo Functions API).</p>

            <p className="text-xs text-[#6B7280] mb-2">You have access to:</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {HALO_TEMPLATE_OPTIONS.map(t => (
                <span
                  key={t.id}
                  className="px-3 py-1.5 rounded-lg bg-[#F1F5F9] text-[#1F2937] text-xs font-medium border border-[#E5E7EB]"
                >
                  {t.name}
                </span>
              ))}
            </div>

            <label className="block text-xs font-semibold text-[#6B7280] mb-1.5">Default template</label>
            <select
              value={form.templateId || DEFAULT_HALO_TEMPLATE_ID}
              onChange={(e) => setForm(prev => ({ ...prev, templateId: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-[#E5E7EB] bg-white text-sm text-[#1F2937] focus:border-[#4FB6B2] focus:ring-2 focus:ring-[#E6F4F3] outline-none shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
            >
              {HALO_TEMPLATE_OPTIONS.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>

            {!showRequestForm ? (
              <button
                type="button"
                onClick={() => setShowRequestForm(true)}
                className="mt-4 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-white border border-[#E5E7EB] text-[#1F2937] hover:bg-[#F7F9FB] hover:border-[#4FB6B2]/30 transition shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
              >
                <Plus size={16} /> Request new template
              </button>
            ) : (
              <div className="mt-4 p-4 rounded-xl border border-[#E5E7EB] bg-[#F7F9FB]/50 space-y-3">
                <p className="text-xs font-semibold text-[#6B7280]">Request a new template</p>
                <p className="text-xs text-[#6B7280]">Describe the template you need and optionally attach example documents. The request will be sent to admin@halo.africa.</p>
                <textarea
                  value={requestDescription}
                  onChange={(e) => setRequestDescription(e.target.value)}
                  placeholder="Describe the template contents / structure (e.g. sections, fields)..."
                  rows={4}
                  className="w-full px-3 py-2 rounded-lg border border-[#E5E7EB] bg-white text-sm text-[#1F2937] placeholder-[#9CA3AF] focus:border-[#4FB6B2] focus:ring-2 focus:ring-[#E6F4F3] outline-none resize-none"
                />
                <div>
                  <label className="block text-xs font-medium text-[#6B7280] mb-1">Example documents (optional)</label>
                  <input
                    ref={requestFileInputRef}
                    type="file"
                    multiple
                    accept=".txt,.md,.doc,.docx,application/pdf"
                    onChange={(e) => setRequestFiles(Array.from(e.target.files || []))}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => requestFileInputRef.current?.click()}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#E5E7EB] bg-white text-xs font-medium text-[#6B7280] hover:bg-[#F7F9FB] transition"
                  >
                    <Upload size={14} /> {requestFiles.length ? `${requestFiles.length} file(s) chosen` : 'Choose files'}
                  </button>
                  {requestFiles.length > 0 && (
                    <ul className="mt-1 text-xs text-[#6B7280] list-disc list-inside">
                      {requestFiles.map((f, i) => (
                        <li key={i}>{f.name}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setShowRequestForm(false); setRequestDescription(''); setRequestFiles([]); }}
                    disabled={requestSending}
                    className="px-3 py-2 rounded-lg text-sm font-medium text-[#6B7280] hover:bg-[#F1F5F9] transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleRequestTemplateSubmit}
                    disabled={requestSending || !requestDescription.trim()}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[#4FB6B2] text-white hover:bg-[#3FA6A2] disabled:opacity-50 transition shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                  >
                    {requestSending ? 'Sending…' : <><Send size={14} /> Send request</>}
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Footer with Save */}
        {editMode || templateTab !== (settings?.noteTemplate || 'soap') || form.customTemplateContent !== (settings?.customTemplateContent || '') || form.templateId !== (settings?.templateId || DEFAULT_HALO_TEMPLATE_ID) ? (
          <div className="border-t border-[#F1F5F9] p-4 bg-[#F7F9FB] flex gap-3">
            <button
              onClick={() => {
                setEditMode(false);
                setForm(settings || DEFAULT_SETTINGS);
                setTemplateTab(settings?.noteTemplate || 'soap');
              }}
              className="flex-1 px-4 py-2.5 rounded-xl font-medium text-[#6B7280] hover:bg-[#F1F5F9] transition text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || (editMode && requiredFieldsMissing)}
              className="flex-1 bg-[#4FB6B2] hover:bg-[#3FA6A2] text-white px-4 py-2.5 rounded-xl font-bold shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition text-sm flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Save size={14} /> {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
};
