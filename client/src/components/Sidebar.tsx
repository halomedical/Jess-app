import React, { useState, useEffect, useRef } from 'react';
import type { Patient, UserSettings } from '../../../shared/types';
import { Plus, LogOut, Search, Trash2, ChevronRight, Users, Clock, Settings, Loader2 } from 'lucide-react';
import { searchPatientsByConcept } from '../services/api';

interface SidebarProps {
  patients: Patient[];
  selectedPatientId: string | null;
  recentPatientIds: string[];
  onSelectPatient: (id: string) => void;
  onCreatePatient: () => void;
  onDeletePatient: (patient: Patient) => void;
  onLogout: () => void;
  onOpenSettings: () => void;
  userEmail?: string;
  userSettings?: UserSettings | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  patients,
  selectedPatientId,
  recentPatientIds,
  onSelectPatient,
  onCreatePatient,
  onDeletePatient,
  onLogout,
  onOpenSettings,
  userEmail,
  userSettings,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [aiSearchResults, setAiSearchResults] = useState<string[] | null>(null);
  const [isAiSearching, setIsAiSearching] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Local filter (instant)
  const localFiltered = patients.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.dob.includes(searchTerm)
  );

  // Trigger AI concept search after debounce when local results are few
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    setAiSearchResults(null);

    if (!searchTerm.trim() || searchTerm.length < 3) return;

    // Only trigger AI search if local results are sparse (concept search)
    if (localFiltered.length <= 2) {
      searchTimeoutRef.current = setTimeout(async () => {
        setIsAiSearching(true);
        try {
          const ids = await searchPatientsByConcept(searchTerm, patients, {});
          setAiSearchResults(ids);
        } catch {
          setAiSearchResults(null);
        }
        setIsAiSearching(false);
      }, 600);
    }

    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); };
  }, [searchTerm, patients]);

  // Merge local + AI results
  const filteredPatients = searchTerm.trim()
    ? patients.filter(p => {
        const localMatch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.dob.includes(searchTerm);
        const aiMatch = aiSearchResults?.includes(p.id) ?? false;
        return localMatch || aiMatch;
      })
    : patients;

  // Show recently opened patients (by tracked IDs), falling back to first 3 if no history
  const recentPatients = recentPatientIds.length > 0
    ? recentPatientIds
        .map(id => patients.find(p => p.id === id))
        .filter((p): p is Patient => !!p)
        .slice(0, 3)
    : patients.slice(0, 3);

  const renderPatientRow = (patient: Patient, keyPrefix: string) => (
    <div
      key={`${keyPrefix}-${patient.id}`}
      onClick={() => onSelectPatient(patient.id)}
      className={`group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all border mb-1 ${
        selectedPatientId === patient.id
          ? 'bg-teal-600/95 border-teal-400/50 text-white shadow-md shadow-black/25'
          : 'border-transparent hover:bg-teal-800/65 hover:border-teal-700/40 text-teal-50'
      }`}
    >
      <div className="flex items-center gap-3 overflow-hidden">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
          selectedPatientId === patient.id
            ? 'bg-white text-teal-800'
            : 'bg-teal-800/90 text-teal-100 group-hover:bg-teal-700 group-hover:text-white'
        }`}>
          {patient.name.charAt(0)}
        </div>
        <div className="min-w-0">
          <p className="font-medium truncate">{patient.name}</p>
          <p className={`text-xs truncate ${selectedPatientId === patient.id ? 'text-teal-100/85' : 'text-teal-200/70'}`}>
            {patient.dob} • {patient.sex}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={(e) => { e.stopPropagation(); if (onDeletePatient) onDeletePatient(patient); }}
          className="p-2.5 min-w-[44px] min-h-[44px] rounded-lg opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all duration-200 hover:bg-rose-900/50 hover:text-rose-200 text-teal-300/80 hover:text-rose-200 flex items-center justify-center shrink-0"
          title="Delete Folder"
        >
          <Trash2 size={16} />
        </button>
        <ChevronRight
          size={16}
          className={`opacity-0 group-hover:opacity-100 transition-opacity text-teal-200/90 ${
            selectedPatientId === patient.id ? 'opacity-100 text-white' : ''
          }`}
        />
      </div>
    </div>
  );

  return (
    <div className="w-full min-w-0 md:w-80 md:max-w-[20rem] md:shrink-0 bg-gradient-to-b from-teal-900 via-teal-950 to-[#0a1f1c] h-full min-h-0 flex flex-col text-teal-50 border-r border-teal-800/90 shadow-[6px_0_28px_-8px_rgba(6,40,36,0.55)]">
      <div className="p-4 sm:p-6 safe-pad-t">
        <div className="flex items-center justify-between mb-6 sm:mb-8">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-white/95 shadow-lg shadow-black/25 flex items-center justify-center border border-teal-600/30 p-1 shrink-0">
              <img
                src="/halo-icon.png"
                alt=""
                className="w-full h-full object-contain"
                draggable={false}
              />
            </div>
            <div className="min-w-0">
              <h1 className="font-display font-bold text-white text-base tracking-wide leading-tight truncate">Dr Jess John</h1>
              <p className="text-[10px] text-teal-300 font-bold tracking-[0.2em] uppercase mt-0.5">Patient workspace</p>
            </div>
          </div>
          <button
            onClick={onOpenSettings}
            className="p-2.5 min-w-[44px] min-h-[44px] rounded-lg text-teal-200/90 hover:text-white hover:bg-teal-800/80 active:bg-teal-800 transition-all shrink-0"
            title="Settings & Profile"
          >
            <Settings size={20} />
          </button>
        </div>
        <div className="relative group">
          <Search className="absolute left-3 top-3 text-teal-600/80 group-focus-within:text-teal-600 transition-colors pointer-events-none" size={18} />
          <input
            type="text"
            placeholder="Search name, DOB, or condition..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white text-slate-800 text-base pl-10 pr-4 py-2.5 min-h-[44px] rounded-xl outline-none focus:ring-2 focus:ring-teal-400/70 border border-teal-900/20 focus:border-teal-500 transition-all placeholder:text-slate-400 shadow-inner shadow-black/5"
          />
        </div>
        {isAiSearching && searchTerm.length >= 3 && (
          <div className="flex items-center gap-2 mt-2 px-1">
            <Loader2 size={12} className="text-teal-300 animate-spin" />
            <span className="text-[10px] text-teal-300/95 font-medium uppercase tracking-wider">Scanning patient records...</span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-2 sidebar-dark-scroll min-h-0">
        {!searchTerm && patients.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 px-2 mb-2">
              <Clock size={12} className="text-teal-400 shrink-0" />
              <h3 className="text-xs font-bold text-teal-300/90 uppercase tracking-wider">Recent Activity</h3>
            </div>
            {recentPatients.map(p => renderPatientRow(p, 'recent'))}
            <div className="my-4 border-t border-teal-800/70 mx-2" />
          </div>
        )}
        <div>
          <div className="flex items-center gap-2 px-2 mb-2">
            <Users size={12} className={searchTerm ? 'text-teal-400 shrink-0' : 'text-teal-400/80 shrink-0'} />
            <h3 className="text-xs font-bold text-teal-300/90 uppercase tracking-wider">
              {searchTerm ? 'Search Results' : 'All Patients'}
              <span className="ml-1 opacity-70">({filteredPatients.length})</span>
            </h3>
          </div>
          {filteredPatients.length === 0 ? (
            <div className="text-center py-8 text-teal-400/50">
              <p className="text-sm">No patients found</p>
            </div>
          ) : (
            filteredPatients.map(p => renderPatientRow(p, 'all'))
          )}
        </div>
      </div>

      <div className="p-4 border-t border-teal-800/90 bg-teal-950/80 backdrop-blur-md z-10 safe-pad-b">
        <button
          onClick={onCreatePatient}
          className="w-full bg-teal-500 hover:bg-teal-400 text-teal-950 min-h-[48px] p-3.5 rounded-xl font-bold transition-all shadow-lg shadow-black/25 flex items-center justify-center gap-2 mb-3 active:scale-[0.98] border border-teal-400/30"
        >
          <Plus size={20} strokeWidth={2.5} /> New Patient Folder
        </button>
        <button
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 text-xs font-medium text-teal-300/90 hover:text-white py-2.5 min-h-[44px] transition-colors rounded-lg hover:bg-teal-900/50"
        >
          <LogOut size={14} /> SIGN OUT
        </button>
      </div>
    </div>
  );
};