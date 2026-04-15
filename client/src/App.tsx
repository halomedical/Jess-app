import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { PatientWorkspace } from './pages/PatientWorkspace';
import { RecordingSessionsProvider } from './features/scribe/RecordingSessionsContext';
import { RecordingSessionPatientSwitchEffect } from './features/scribe/RecordingSessionPatientSwitchEffect';
import { Toast } from './components/Toast';
import { SettingsModal } from './components/SettingsModal';
import { checkAuth, getLoginUrl, logout, fetchAllPatients, createPatient, deletePatient, loadSettings, saveSettings, ApiError } from './services/api';
import type { Patient, UserSettings } from '../../shared/types';
import { LogIn, Loader, X, UserPlus, Calendar, Users, AlertTriangle, Trash2, ScanLine, Mic } from 'lucide-react';
import { SignInBranding } from './components/SignInBranding';
import { EcgRhythmStrip } from './components/EcgRhythmStrip';
import { parsePatientSticker } from './utils/patientSticker';
import { transcribeAudio } from './services/api';

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
  const [newPatientReferringDoctor, setNewPatientReferringDoctor] = useState("");
  const [newPatientVisitType, setNewPatientVisitType] = useState<'new' | 'follow_up'>('new');
  const [newPatientVisitDate, setNewPatientVisitDate] = useState("");
  const [stickerRaw, setStickerRaw] = useState('');
  const [stickerError, setStickerError] = useState<string | null>(null);
  const [stickerCameraOpen, setStickerCameraOpen] = useState(false);
  const stickerVideoRef = React.useRef<HTMLVideoElement | null>(null);
  const stickerStreamRef = React.useRef<MediaStream | null>(null);
  const stickerScanTickRef = React.useRef<number | null>(null);
  const [dictatingDetails, setDictatingDetails] = useState(false);
  const detailsRecorderRef = React.useRef<MediaRecorder | null>(null);
  const detailsChunksRef = React.useRef<Blob[]>([]);

  const localIsoDate = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

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

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const selectPatientAndCloseMobile = useCallback(
    (id: string | null) => {
      selectPatient(id);
      setMobileSidebarOpen(false);
    },
    [selectPatient]
  );

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
    setMobileSidebarOpen(false);
    selectPatient(null);
  };

  const openCreateModal = () => {
    setLoading(false);
    setNewPatientVisitDate(localIsoDate());
    setStickerRaw('');
    setStickerError(null);
    setStickerCameraOpen(false);
    setShowCreateModal(true);
  };

  const stopStickerCamera = useCallback(() => {
    if (stickerScanTickRef.current) {
      window.clearInterval(stickerScanTickRef.current);
      stickerScanTickRef.current = null;
    }
    stickerStreamRef.current?.getTracks().forEach((t) => t.stop());
    stickerStreamRef.current = null;
    if (stickerVideoRef.current) stickerVideoRef.current.srcObject = null;
    setStickerCameraOpen(false);
  }, []);

  const applyStickerParsed = useCallback((raw: string) => {
    const parsed = parsePatientSticker(raw);
    if (parsed.name) setNewPatientName(parsed.name);
    if (parsed.dob) setNewPatientDob(parsed.dob);
    if (parsed.sex) setNewPatientSex(parsed.sex);
    if (parsed.folderNumber) setNewPatientFolderNumber(parsed.folderNumber);
    if (parsed.contactNumber) setNewPatientContact(parsed.contactNumber);
    if (parsed.referringDoctor) setNewPatientReferringDoctor(parsed.referringDoctor);
  }, []);

  const startStickerCamera = useCallback(async () => {
    setStickerError(null);
    setStickerCameraOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      stickerStreamRef.current = stream;
      if (stickerVideoRef.current) {
        stickerVideoRef.current.srcObject = stream;
        await stickerVideoRef.current.play().catch(() => {});
      }
      const Detector = (window as any).BarcodeDetector as
        | undefined
        | (new (opts: { formats: string[] }) => { detect: (video: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>> });
      if (!Detector) {
        setStickerError('Camera scanning is not supported in this browser. Use a USB scanner or paste the sticker text.');
        return;
      }
      const detector = new Detector({ formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'pdf417', 'datamatrix'] });
      if (stickerScanTickRef.current) window.clearInterval(stickerScanTickRef.current);
      stickerScanTickRef.current = window.setInterval(async () => {
        const video = stickerVideoRef.current;
        if (!video) return;
        try {
          const codes = await detector.detect(video);
          const v = codes?.[0]?.rawValue?.trim();
          if (v) {
            setStickerRaw(v);
            applyStickerParsed(v);
            stopStickerCamera();
          }
        } catch {
          // ignore scan errors; keep polling
        }
      }, 400);
    } catch (e) {
      setStickerError(getErrorMessage(e));
      stopStickerCamera();
    }
  }, [applyStickerParsed, getErrorMessage, stopStickerCamera]);

  const startDictateDetails = useCallback(async () => {
    setStickerError(null);
    setDictatingDetails(true);
    detailsChunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType =
        typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm';
      const mr = new MediaRecorder(stream, { mimeType });
      detailsRecorderRef.current = mr;
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) detailsChunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        try {
          const blob = new Blob(detailsChunksRef.current, { type: mimeType });
          const base64 = await new Promise<string>((resolve, reject) => {
            const r = new FileReader();
            r.onloadend = () => {
              const result = r.result as string;
              const i = result.indexOf(',');
              resolve(i >= 0 ? result.slice(i + 1) : result);
            };
            r.onerror = () => reject(r.error ?? new Error('Read failed'));
            r.readAsDataURL(blob);
          });
          const transcript = (await transcribeAudio(base64, mimeType)).trim();
          if (!transcript) {
            setStickerError('No speech detected for patient details.');
            return;
          }
          // Fast path: treat dictated details like sticker text (many clinicians will say "Name..., DOB..., male/female...")
          setStickerRaw(transcript);
          applyStickerParsed(transcript);
        } catch (err) {
          setStickerError(getErrorMessage(err));
        } finally {
          stream.getTracks().forEach((t) => t.stop());
          setDictatingDetails(false);
          detailsRecorderRef.current = null;
          detailsChunksRef.current = [];
        }
      };
      mr.start(250);
    } catch (err) {
      setStickerError(getErrorMessage(err));
      setDictatingDetails(false);
    }
  }, [applyStickerParsed, getErrorMessage]);

  const stopDictateDetails = useCallback(() => {
    const mr = detailsRecorderRef.current;
    if (!mr) return;
    try {
      mr.stop();
    } catch {
      /* ignore */
    }
  }, []);

  const submitCreatePatient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPatientName.trim()) return;
    if (!newPatientDob) {
      showToast('Please select a date of birth.', 'error');
      return;
    }
    if (!newPatientVisitDate) {
      showToast('Please select the visit date.', 'error');
      return;
    }

    setLoading(true);
    try {
      const newP = await createPatient(newPatientName, newPatientDob, newPatientSex, {
        folderNumber: newPatientFolderNumber.trim() || undefined,
        contactNumber: newPatientContact.trim() || undefined,
        referringDoctor: newPatientReferringDoctor.trim() || undefined,
        visitType: newPatientVisitType,
        visitDate: newPatientVisitDate,
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
        setNewPatientReferringDoctor("");
        setNewPatientVisitType('new');
        setNewPatientVisitDate(localIsoDate());
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
      <div className="flex min-h-[100dvh] h-[100dvh] w-full items-center justify-center bg-[#F7F9FB] safe-pad-t safe-pad-b safe-pad-x">
        <div className="flex flex-col items-center gap-4">
          <Loader className="animate-spin text-[#4FB6B2]" size={32} />
          <p className="text-sm text-[#6B7280] font-medium">Loading…</p>
        </div>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="flex min-h-[100dvh] h-[100dvh] w-full items-center justify-center bg-[#F7F9FB] safe-pad-t safe-pad-b safe-pad-x overflow-y-auto">
        <div className="max-w-sm w-full text-center px-6 py-4">
          <SignInBranding className="mb-6" />
          <h1 className="text-xl font-semibold text-[#1F2937] mb-2">Welcome</h1>
          <p className="text-[#6B7280] mb-8 text-sm leading-relaxed">
            Sign in to access your secure patient workspace.
          </p>

          <button onClick={handleSignIn} className="w-full flex items-center justify-center gap-3 bg-[#4FB6B2] hover:bg-[#3FA6A2] text-white px-6 py-4 rounded-[10px] transition-all shadow-[0_1px_2px_rgba(0,0,0,0.05)] font-semibold text-lg active:scale-[0.98]">
            {loading ? <Loader className="animate-spin" /> : <LogIn size={20} />}
            {loading ? "Connecting..." : "Sign In with Google"}
          </button>

          <p className="mt-8 text-xs text-[#9CA3AF]">Secure Environment &bull; POPIA Compliant</p>
        </div>
      </div>
    );
  }

  const activePatient = patients.find(p => p.id === selectedPatientId);

  return (
    <RecordingSessionsProvider>
    <RecordingSessionPatientSwitchEffect patientId={selectedPatientId} />
    <div className="flex min-h-[100dvh] h-[100dvh] max-h-[100dvh] w-full bg-[#F7F9FB] font-sans text-[#1F2937] overflow-hidden relative">
      <div className={`${selectedPatientId ? 'hidden md:flex' : 'flex'} h-full min-h-0 w-full md:w-auto shrink-0 z-20`}>
        <Sidebar
          patients={patients}
          selectedPatientId={selectedPatientId}
          recentPatientIds={recentPatientIds}
          onSelectPatient={selectPatientAndCloseMobile}
          onCreatePatient={openCreateModal}
          onDeletePatient={handleDeleteRequest}
          onLogout={handleLogout}
          onOpenSettings={() => setShowSettings(true)}
          userEmail={userEmail}
          userSettings={userSettings}
        />
      </div>

      {selectedPatientId && mobileSidebarOpen ? (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-[45] bg-[#1F2937]/25 md:hidden"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-[50] flex w-[min(calc(100vw-3rem),20rem)] min-h-0 shadow-[0_1px_2px_rgba(0,0,0,0.05)] md:hidden">
            <Sidebar
              patients={patients}
              selectedPatientId={selectedPatientId}
              recentPatientIds={recentPatientIds}
              onSelectPatient={selectPatientAndCloseMobile}
              onCreatePatient={() => {
                setMobileSidebarOpen(false);
                openCreateModal();
              }}
              onDeletePatient={handleDeleteRequest}
              onLogout={handleLogout}
              onOpenSettings={() => {
                setMobileSidebarOpen(false);
                setShowSettings(true);
              }}
              userEmail={userEmail}
              userSettings={userSettings}
            />
          </div>
        </>
      ) : null}

      <div className={`flex-1 flex flex-col min-h-0 h-full relative ${!selectedPatientId ? 'hidden md:flex' : 'flex'}`}>
        {activePatient ? (
          <PatientWorkspace
            patient={activePatient}
            onBack={() => selectPatient(null)}
            onDataChange={refreshPatients}
            onToast={showToast}
            userEmail={userEmail}
            onOpenMobileNav={() => setMobileSidebarOpen(true)}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-[#9CA3AF] relative overflow-hidden bg-[#F7F9FB]">
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
              <p className="text-lg font-medium text-[#6B7280]">Select a patient to begin</p>
              <div className="mt-10 w-full max-w-lg px-2 opacity-90">
                <EcgRhythmStrip variant="light" />
              </div>
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
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#1F2937]/25 backdrop-blur-[2px] p-0 sm:p-4 safe-pad-b">
          <div className="bg-white rounded-t-[12px] sm:rounded-[12px] border border-[#E5E7EB] shadow-[0_1px_2px_rgba(0,0,0,0.05)] w-full max-w-lg max-h-[90dvh] overflow-y-auto p-6 sm:m-4">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-[#1F2937] flex items-center gap-2"><UserPlus className="text-[#4FB6B2]" size={24}/> New Patient Folder</h2>
              <button
                onClick={() => {
                  stopStickerCamera();
                  setShowCreateModal(false);
                }}
                className="text-[#9CA3AF] hover:text-[#1F2937] p-1 rounded-full hover:bg-[#F1F5F9] transition"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={submitCreatePatient}>
              <div className="space-y-4">
                <div className="rounded-[12px] border border-[#E5E7EB] bg-[#F7F9FB] p-3">
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#6B7280] mb-2">
                    Scan patient sticker
                  </label>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="flex-1">
                      <input
                        autoFocus
                        type="text"
                        placeholder="Scan barcode/QR (USB scanner) or paste sticker text…"
                        value={stickerRaw}
                        onChange={(e) => {
                          const v = e.target.value;
                          setStickerRaw(v);
                          setStickerError(null);
                          if (v.trim().length >= 6) applyStickerParsed(v);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (!stickerRaw.trim()) return;
                            applyStickerParsed(stickerRaw);
                          }
                        }}
                        className="w-full min-h-[44px] px-4 py-3 rounded-[10px] border border-[#E5E7EB] bg-white text-sm text-[#1F2937] focus:border-[#4FB6B2] focus:ring-2 focus:ring-[#E6F4F3] outline-none transition"
                      />
                      <p className="mt-1 text-[11px] text-[#9CA3AF]">
                        Tip: most scanners “type” then press Enter automatically.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => (stickerCameraOpen ? stopStickerCamera() : void startStickerCamera())}
                        className="min-h-[44px] rounded-[10px] border border-[#E5E7EB] bg-white px-3 text-sm font-bold text-[#1F2937] hover:bg-[#F1F5F9]"
                        title="Use camera to scan QR/barcode"
                      >
                        <ScanLine className="h-4 w-4 inline-block mr-2 text-[#4FB6B2]" />
                        {stickerCameraOpen ? 'Stop' : 'Camera'}
                      </button>
                      <button
                        type="button"
                        onClick={() => (dictatingDetails ? stopDictateDetails() : void startDictateDetails())}
                        className={`min-h-[44px] rounded-[10px] px-3 text-sm font-bold text-white ${
                          dictatingDetails ? 'bg-rose-500 hover:bg-rose-600' : 'bg-[#4FB6B2] hover:bg-[#3FA6A2]'
                        }`}
                        title="Dictate patient details (name, DOB, sex, etc.)"
                      >
                        <Mic className="h-4 w-4 inline-block mr-2" />
                        {dictatingDetails ? 'Stop' : 'Dictate'}
                      </button>
                    </div>
                  </div>
                  {stickerError ? (
                    <p className="mt-2 rounded-[10px] border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-800">
                      {stickerError}
                    </p>
                  ) : null}
                  {stickerCameraOpen ? (
                    <div className="mt-3 overflow-hidden rounded-[12px] border border-[#E5E7EB] bg-black">
                      <video ref={stickerVideoRef} className="h-48 w-full object-cover" playsInline muted />
                    </div>
                  ) : null}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-[#6B7280] mb-1.5">Full Name</label>
                  <input type="text" placeholder="e.g. Sarah Connor" value={newPatientName} onChange={(e) => setNewPatientName(e.target.value)} className="w-full min-h-[44px] px-4 py-3 rounded-[10px] border border-[#E5E7EB] bg-white text-base text-[#1F2937] focus:border-[#4FB6B2] focus:ring-2 focus:ring-[#E6F4F3] outline-none transition" />
                </div>
                <div className="flex gap-4">
                  <div className="flex-1 min-w-0">
                    <label className="block text-sm font-semibold text-[#6B7280] mb-1.5 flex items-center gap-1"><Calendar size={14} /> Date of Birth <span className="text-rose-500">*</span></label>
                    <input type="date" value={newPatientDob} onChange={(e) => setNewPatientDob(e.target.value)} className="w-full min-h-[44px] px-4 py-3 rounded-[10px] border border-[#E5E7EB] bg-white text-base text-[#1F2937] focus:border-[#4FB6B2] focus:ring-2 focus:ring-[#E6F4F3] outline-none transition" />
                    <p className="text-xs text-[#9CA3AF] mt-1">Required — pick a date or creation will fail.</p>
                  </div>
                  <div className="w-1/3">
                    <label className="block text-sm font-semibold text-[#6B7280] mb-1.5 flex items-center gap-1"><Users size={14} /> Sex</label>
                    <div className="flex bg-[#F1F5F9] p-1 rounded-[10px]">
                      <button type="button" onClick={() => setNewPatientSex('M')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${newPatientSex === 'M' ? 'bg-white text-[#4FB6B2] shadow-[0_1px_2px_rgba(0,0,0,0.05)]' : 'text-[#9CA3AF] hover:text-[#6B7280]'}`}>M</button>
                      <button type="button" onClick={() => setNewPatientSex('F')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${newPatientSex === 'F' ? 'bg-white text-[#4FB6B2] shadow-[0_1px_2px_rgba(0,0,0,0.05)]' : 'text-[#9CA3AF] hover:text-[#6B7280]'}`}>F</button>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#6B7280] mb-1.5">Folder number</label>
                  <input type="text" placeholder="e.g. MRN, filing reference" value={newPatientFolderNumber} onChange={(e) => setNewPatientFolderNumber(e.target.value)} className="w-full min-h-[44px] px-4 py-3 rounded-[10px] border border-[#E5E7EB] bg-white text-base text-[#1F2937] focus:border-[#4FB6B2] focus:ring-2 focus:ring-[#E6F4F3] outline-none transition" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#6B7280] mb-1.5">Cellphone number</label>
                  <input type="tel" placeholder="e.g. 082 123 4567" value={newPatientContact} onChange={(e) => setNewPatientContact(e.target.value)} className="w-full min-h-[44px] px-4 py-3 rounded-[10px] border border-[#E5E7EB] bg-white text-base text-[#1F2937] focus:border-[#4FB6B2] focus:ring-2 focus:ring-[#E6F4F3] outline-none transition" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#6B7280] mb-1.5">Referring doctor</label>
                  <input type="text" placeholder="e.g. Dr A. Nkomo" value={newPatientReferringDoctor} onChange={(e) => setNewPatientReferringDoctor(e.target.value)} className="w-full min-h-[44px] px-4 py-3 rounded-[10px] border border-[#E5E7EB] bg-white text-base text-[#1F2937] focus:border-[#4FB6B2] focus:ring-2 focus:ring-[#E6F4F3] outline-none transition" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#6B7280] mb-1.5">Patient visit</label>
                  <div className="flex bg-[#F1F5F9] p-1 rounded-[10px] gap-1">
                    <button
                      type="button"
                      onClick={() => setNewPatientVisitType('new')}
                      className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${newPatientVisitType === 'new' ? 'bg-white text-[#4FB6B2] shadow-[0_1px_2px_rgba(0,0,0,0.05)]' : 'text-[#9CA3AF] hover:text-[#6B7280]'}`}
                    >
                      New patient
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewPatientVisitType('follow_up')}
                      className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${newPatientVisitType === 'follow_up' ? 'bg-white text-[#4FB6B2] shadow-[0_1px_2px_rgba(0,0,0,0.05)]' : 'text-[#9CA3AF] hover:text-[#6B7280]'}`}
                    >
                      Follow-up
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#6B7280] mb-1.5 flex items-center gap-1">
                    <Calendar size={14} /> Visit date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={newPatientVisitDate}
                    onChange={(e) => setNewPatientVisitDate(e.target.value)}
                    className="w-full min-h-[44px] px-4 py-3 rounded-[10px] border border-[#E5E7EB] bg-white text-base text-[#1F2937] focus:border-[#4FB6B2] focus:ring-2 focus:ring-[#E6F4F3] outline-none transition"
                  />
                  <p className="text-xs text-[#9CA3AF] mt-1">Encounter or registration date (defaults to today).</p>
                </div>
                <div className="pt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      stopStickerCamera();
                      setShowCreateModal(false);
                    }}
                    className="flex-1 px-4 py-3 rounded-[10px] font-medium text-[#1F2937] bg-white border border-[#E5E7EB] hover:bg-[#F1F5F9] transition"
                  >
                    Cancel
                  </button>
                  <button type="submit" disabled={!newPatientName.trim() || !newPatientDob || !newPatientVisitDate || loading} className="flex-1 bg-[#4FB6B2] hover:bg-[#3FA6A2] text-white px-4 py-3 rounded-[10px] font-bold shadow-[0_1px_2px_rgba(0,0,0,0.05)] disabled:opacity-50 transition flex items-center justify-center gap-2">
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
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#1F2937]/25 backdrop-blur-[2px] p-0 sm:p-4 safe-pad-b">
          <div className="bg-white rounded-t-[12px] sm:rounded-[12px] border-2 border-rose-100 shadow-[0_1px_2px_rgba(0,0,0,0.05)] w-full max-w-md max-h-[90dvh] overflow-y-auto p-6 sm:m-4">
            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mb-4 text-rose-500">
                <AlertTriangle size={32} />
              </div>
              <h2 className="text-xl font-bold text-[#1F2937]">Delete Patient Folder?</h2>
              <p className="text-[#6B7280] mt-2 px-4">
                Are you sure you want to delete <span className="font-bold text-[#1F2937]">{patientToDelete.name}</span>?
                This will move the folder to your Google Drive Trash.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setPatientToDelete(null)} className="flex-1 px-4 py-3 rounded-[10px] font-bold text-[#1F2937] bg-white border border-[#E5E7EB] hover:bg-[#F1F5F9] transition">Cancel</button>
              <button onClick={confirmDelete} className="flex-1 bg-rose-500 hover:bg-rose-600 text-white px-4 py-3 rounded-[10px] font-bold shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition flex items-center justify-center gap-2">
                {loading ? <Loader className="animate-spin" size={18}/> : <Trash2 size={18}/>}
                Delete Folder
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
    </RecordingSessionsProvider>
  );
};
