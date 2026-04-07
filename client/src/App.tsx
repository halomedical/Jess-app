import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { PatientWorkspace } from './pages/PatientWorkspace';
import { RecordingSessionsProvider } from './features/scribe/RecordingSessionsContext';
import { MultiSessionScribe } from './features/scribe/MultiSessionScribe';
import { Toast } from './components/Toast';
import { SettingsModal } from './components/SettingsModal';
import { checkAuth, getLoginUrl, logout, fetchAllPatients, createPatient, deletePatient, loadSettings, saveSettings, ApiError } from './services/api';
import type { Patient, UserSettings } from '../../shared/types';
import { DEFAULT_HALO_TEMPLATE_ID } from '../../shared/haloTemplates';
import { LogIn, Loader, X, UserPlus, Calendar, Users, AlertTriangle, Trash2 } from 'lucide-react';
import { SignInBranding } from './components/SignInBranding';

export const App = () => {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(
    () => sessionStorage.getItem('halo_selectedPatientId')
  );
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [patientToDelete, setPatientToDelete] = useState<Patient | null>(null);

  const [newPatientName, setNewPatientName] = useState("");
  const [newPatientDob, setNewPatientDob] = useState("");
  const [newPatientSex, setNewPatientSex] = useState<'M' | 'F'>('M');
  const [newPatientFolderNumber, setNewPatientFolderNumber] = useState("");
  const [newPatientContact, setNewPatientContact] = useState("");

  // Settings / profile state
  const [showSettings, setShowSettings] = useState(false);
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
  const [userEmail, setUserEmail] = useState<string | undefined>();
  const [loginTime] = useState<number>(Date.now());

  // Toast notification state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Recently opened patients (stored in localStorage)
  const [recentPatientIds, setRecentPatientIds] = useState<string[]>(
    () => {
      try {
        return JSON.parse(localStorage.getItem('halo_recentPatientIds') || '[]');
      } catch { return []; }
    }
  );

  // Persist selected patient to sessionStorage so it survives page refresh
  // Also track recently opened patients in localStorage
  const selectPatient = useCallback((id: string | null) => {
    setSelectedPatientId(id);
    if (id) {
      sessionStorage.setItem('halo_selectedPatientId', id);
      // Push to recent list (most recent first, deduped, max 3)
      setRecentPatientIds(prev => {
        const updated = [id, ...prev.filter(pid => pid !== id)].slice(0, 3);
        localStorage.setItem('halo_recentPatientIds', JSON.stringify(updated));
        return updated;
      });
    } else {
      sessionStorage.removeItem('halo_selectedPatientId');
    }
  }, []);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
  }, []);

  const getErrorMessage = (err: unknown): string => {
    if (err instanceof ApiError) return err.message;
    if (err instanceof Error) return err.message;
    return 'An unexpected error occurred.';
  };

  const refreshPatients = useCallback(async (): Promise<Patient[]> => {
    const data = await fetchAllPatients();
    setPatients(data);
    return data;
  }, []);

  // Check if user has an active session
  useEffect(() => {
    const checkSession = async () => {
      try {
        // First verify server is reachable
        const healthCheck = await fetch('/api/health', { credentials: 'include' }).catch(() => null);
        if (!healthCheck || !healthCheck.ok) {
          console.warn('Server health check failed - make sure server is running on port 3000');
        }
        
        const auth = await checkAuth();
        if (auth.signedIn) {
          setIsSignedIn(true);
          setUserEmail(auth.email);
          const loadedPatients = await refreshPatients();
          // Validate stored patient selection — clear if patient no longer exists
          const storedId = sessionStorage.getItem('halo_selectedPatientId');
          if (storedId && !loadedPatients.find(p => p.id === storedId)) {
            selectPatient(null);
          }
          // Load settings in background
          loadSettings().then(res => {
            if (res.settings) setUserSettings(res.settings);
          }).catch(() => {});
        }
      } catch (error) {
        console.error('Session check failed:', error);
      }
      setIsReady(true);
    };
    checkSession();
  }, []);

  const handleSignIn = async () => {
    setLoading(true);
    try {
      console.log('Fetching login URL...');
      const { url } = await getLoginUrl();
      console.log('Got login URL:', url);
      if (url) {
        window.location.href = url;
      } else {
        throw new Error('No login URL received from server');
      }
    } catch (error) {
      console.error('Sign in error:', error);
      showToast(getErrorMessage(error), 'error');
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setIsSignedIn(false);
    selectPatient(null);
  };

  const openCreateModal = () => {
    setLoading(false);
    setShowCreateModal(true);
  };

  const submitCreatePatient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPatientName.trim()) return;
    if (!newPatientDob) {
      showToast('Please select a date of birth.', 'error');
      return;
    }

    setLoading(true);
    try {
      const newP = await createPatient(newPatientName, newPatientDob, newPatientSex, {
        folderNumber: newPatientFolderNumber.trim() || undefined,
        contactNumber: newPatientContact.trim() || undefined,
      });
      if (newP) {
        await refreshPatients();
        selectPatient(newP.id);
        setShowCreateModal(false);
        setNewPatientName("");
        setNewPatientDob("");
        setNewPatientSex("M");
        setNewPatientFolderNumber("");
        setNewPatientContact("");
        showToast('Patient folder created successfully.', 'success');
      }
    } catch (error) {
      showToast(getErrorMessage(error), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async (settings: UserSettings) => {
    await saveSettings(settings);
    setUserSettings(settings);
    showToast('Settings saved.', 'success');
  };

  const handleDeleteRequest = (patient: Patient) => {
    setPatientToDelete(patient);
  };

  const confirmDelete = async () => {
    if (!patientToDelete) return;
    setLoading(true);
    try {
      await deletePatient(patientToDelete.id);
      await refreshPatients();
      if (selectedPatientId === patientToDelete.id) selectPatient(null);
      setPatientToDelete(null);
      showToast('Patient folder moved to trash.', 'success');
    } catch (error) {
      showToast(getErrorMessage(error), 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!isReady) {
    return (
      <div className="flex min-h-[100dvh] h-[100dvh] w-full items-center justify-center bg-gradient-to-b from-slate-50 to-white safe-pad-t safe-pad-b safe-pad-x">
        <div className="flex flex-col items-center gap-4">
          <Loader className="animate-spin text-teal-600" size={32} />
          <p className="text-sm text-slate-400 font-medium">Loading…</p>
        </div>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="flex min-h-[100dvh] h-[100dvh] w-full items-center justify-center bg-gradient-to-b from-slate-50 to-white safe-pad-t safe-pad-b safe-pad-x overflow-y-auto">
        <div className="max-w-sm w-full text-center px-6 py-4">
          <SignInBranding className="mb-6" />
          <h1 className="text-xl font-semibold text-slate-800 mb-2">Welcome</h1>
          <p className="text-slate-500 mb-8 text-sm leading-relaxed">
            Sign in to access your secure patient workspace.
          </p>

          <button onClick={handleSignIn} className="w-full flex items-center justify-center gap-3 bg-teal-700 hover:bg-teal-800 text-white px-6 py-4 rounded-xl transition-all shadow-md hover:shadow-lg font-semibold text-lg active:scale-[0.98]">
            {loading ? <Loader className="animate-spin" /> : <LogIn size={20} />}
            {loading ? "Connecting..." : "Sign In with Google"}
          </button>

          <p className="mt-8 text-xs text-slate-400">Secure Environment &bull; POPIA Compliant</p>
        </div>
      </div>
    );
  }

  const activePatient = patients.find(p => p.id === selectedPatientId);

  return (
    <RecordingSessionsProvider>
    <div className="flex min-h-[100dvh] h-[100dvh] max-h-[100dvh] w-full bg-gradient-to-br from-slate-50 via-white to-teal-50/50 font-sans text-slate-900 overflow-hidden relative">
      <div className={`${selectedPatientId ? 'hidden md:flex' : 'flex'} h-full min-h-0 w-full md:w-auto shrink-0 z-20`}>
        <Sidebar
          patients={patients}
          selectedPatientId={selectedPatientId}
          recentPatientIds={recentPatientIds}
          onSelectPatient={selectPatient}
          onCreatePatient={openCreateModal}
          onDeletePatient={handleDeleteRequest}
          onLogout={handleLogout}
          onOpenSettings={() => setShowSettings(true)}
          userEmail={userEmail}
          userSettings={userSettings}
        />
      </div>

      <div className={`flex-1 flex flex-col min-h-0 h-full relative ${!selectedPatientId ? 'hidden md:flex' : 'flex'}`}>
        {activePatient ? (
          <PatientWorkspace
            patient={activePatient}
            onBack={() => selectPatient(null)}
            onDataChange={refreshPatients}
            onToast={showToast}
            userEmail={userEmail}
            templateId={userSettings?.templateId || DEFAULT_HALO_TEMPLATE_ID}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-300 relative overflow-hidden">
            {/* Background logo — large watermark */}
            <img
              src="/halo-logo.png"
              alt=""
              aria-hidden="true"
              className="absolute opacity-[0.04] pointer-events-none select-none w-[70vw] max-w-[700px] min-w-[300px] md:w-[55vw] lg:w-[45vw]"
              draggable={false}
            />
            {/* Foreground content */}
            <div className="relative z-10 flex flex-col items-center text-center px-6">
              <img
                src="/halo-logo.png"
                alt="HALO Medical"
                className="w-44 h-44 md:w-56 md:h-56 lg:w-64 lg:h-64 object-contain mb-6 opacity-20"
                draggable={false}
              />
              <p className="text-lg font-medium text-slate-400">Select a patient to begin</p>
            </div>
          </div>
        )}
      </div>

      {/* TOAST NOTIFICATIONS */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* SETTINGS MODAL */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        settings={userSettings}
        onSave={handleSaveSettings}
        userEmail={userEmail}
        loginTime={loginTime}
        onToast={showToast}
      />

      {/* CREATE PATIENT MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 sm:p-4 safe-pad-b">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-md max-h-[90dvh] overflow-y-auto p-6 sm:m-4">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><UserPlus className="text-teal-600" size={24}/> New Patient Folder</h2>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition"><X size={20} /></button>
            </div>
            <form onSubmit={submitCreatePatient}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-600 mb-1.5">Full Name</label>
                  <input autoFocus type="text" placeholder="e.g. Sarah Connor" value={newPatientName} onChange={(e) => setNewPatientName(e.target.value)} className="w-full min-h-[44px] px-4 py-3 rounded-xl border border-slate-200 bg-white text-base text-slate-800 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition" />
                </div>
                <div className="flex gap-4">
                  <div className="flex-1 min-w-0">
                    <label className="block text-sm font-semibold text-slate-600 mb-1.5 flex items-center gap-1"><Calendar size={14} /> Date of Birth <span className="text-rose-500">*</span></label>
                    <input type="date" value={newPatientDob} onChange={(e) => setNewPatientDob(e.target.value)} className="w-full min-h-[44px] px-4 py-3 rounded-xl border border-slate-200 bg-white text-base text-slate-800 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition" />
                    <p className="text-xs text-slate-400 mt-1">Required — pick a date or creation will fail.</p>
                  </div>
                  <div className="w-1/3">
                    <label className="block text-sm font-semibold text-slate-600 mb-1.5 flex items-center gap-1"><Users size={14} /> Sex</label>
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                      <button type="button" onClick={() => setNewPatientSex('M')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${newPatientSex === 'M' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>M</button>
                      <button type="button" onClick={() => setNewPatientSex('F')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${newPatientSex === 'F' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>F</button>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-600 mb-1.5">Folder / file number</label>
                  <input type="text" placeholder="Optional — e.g. MRN, filing ref" value={newPatientFolderNumber} onChange={(e) => setNewPatientFolderNumber(e.target.value)} className="w-full min-h-[44px] px-4 py-3 rounded-xl border border-slate-200 bg-white text-base text-slate-800 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-600 mb-1.5">Contact number</label>
                  <input type="tel" placeholder="Optional — phone or mobile" value={newPatientContact} onChange={(e) => setNewPatientContact(e.target.value)} className="w-full min-h-[44px] px-4 py-3 rounded-xl border border-slate-200 bg-white text-base text-slate-800 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition" />
                </div>
                <div className="pt-2 flex gap-3">
                  <button type="button" onClick={() => setShowCreateModal(false)} className="flex-1 px-4 py-3 rounded-xl font-medium text-slate-600 hover:bg-slate-100 transition">Cancel</button>
                  <button type="submit" disabled={!newPatientName.trim() || !newPatientDob || loading} className="flex-1 bg-teal-600 hover:bg-teal-700 text-white px-4 py-3 rounded-xl font-bold shadow-lg shadow-teal-600/20 disabled:opacity-50 disabled:shadow-none transition flex items-center justify-center gap-2">
                    {loading ? <Loader className="animate-spin" size={18}/> : 'Create Folder'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {patientToDelete && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 sm:p-4 safe-pad-b">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-md max-h-[90dvh] overflow-y-auto p-6 sm:m-4 border-2 border-rose-100">
            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mb-4 text-rose-500">
                <AlertTriangle size={32} />
              </div>
              <h2 className="text-xl font-bold text-slate-800">Delete Patient Folder?</h2>
              <p className="text-slate-500 mt-2 px-4">
                Are you sure you want to delete <span className="font-bold text-slate-800">{patientToDelete.name}</span>?
                This will move the folder to your Google Drive Trash.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setPatientToDelete(null)} className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition">Cancel</button>
              <button onClick={confirmDelete} className="flex-1 bg-rose-500 hover:bg-rose-600 text-white px-4 py-3 rounded-xl font-bold shadow-lg shadow-rose-500/20 transition flex items-center justify-center gap-2">
                {loading ? <Loader className="animate-spin" size={18}/> : <Trash2 size={18}/>}
                Delete Folder
              </button>
            </div>
          </div>
        </div>
      )}

      <MultiSessionScribe
        currentPatientId={selectedPatientId}
        currentPatientName={activePatient?.name ?? null}
        onError={(msg) => showToast(msg, 'error')}
        onTranscriptionQueued={() => showToast('Transcription ready in Editor & Scribe.', 'success')}
      />
    </div>
    </RecordingSessionsProvider>
  );
};
