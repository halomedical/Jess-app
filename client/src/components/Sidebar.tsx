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
          ? 'bg-teal-50 border-teal-200 text-teal-900 shadow-sm'
          : 'border-transparent hover:bg-white hover:border-slate-200 hover:shadow-sm text-slate-700'
      }`}
    >
      <div className="flex items-center gap-3 overflow-hidden">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold ${
          selectedPatientId === patient.id ? 'bg-teal-600 text-white' : 'bg-slate-300/90 text-slate-700 group-hover:bg-teal-100 group-hover:text-teal-900'
        }`}>
          {patient.name.charAt(0)}
        </div>
        <div className="min-w-0">
          <p className="font-medium truncate">{patient.name}</p>
          <p className="text-xs opacity-60 truncate">{patient.dob} • {patient.sex}</p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={(e) => { e.stopPropagation(); if (onDeletePatient) onDeletePatient(patient); }}
          className="p-2.5 min-w-[44px] min-h-[44px] rounded-lg opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all duration-200 hover:bg-rose-100 hover:text-rose-600 text-slate-400 flex items-center justify-center shrink-0"
          title="Delete Folder"
        >
          <Trash2 size={16} />
        </button>
        <ChevronRight size={16} className={`opacity-0 group-hover:opacity-100 transition-opacity ${
          selectedPatientId === patient.id ? 'opacity-100' : ''
        }`} />
      </div>
    </div>
  );

  return (
    <div className="w-full min-w-0 md:w-80 md:max-w-[20rem] md:shrink-0 bg-gradient-to-b from-slate-200 to-slate-100 h-full min-h-0 flex flex-col text-slate-700 border-r border-slate-300/90 shadow-[4px_0_20px_-6px_rgba(15,23,42,0.12)]">
      <div className="p-4 sm:p-6 safe-pad-t">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/90 shadow-md shadow-slate-900/10 flex items-center justify-center border border-slate-200/90 p-1 shrink-0">
              <img
                src="/halo-icon.png"
                alt=""
                className="w-full h-full object-contain"
                draggable={false}
              />
            </div>
            <div>
              <h1 className="font-display font-bold text-slate-800 text-base tracking-wide leading-tight">Dr Jess John</h1>
              <p className="text-[10px] text-teal-700 font-bold tracking-[0.2em] uppercase mt-0.5">Patient workspace</p>
            </div>
          </div>
          <button
            onClick={onOpenSettings}
            className="p-2 rounded-lg text-slate-600 hover:text-teal-800 hover:bg-slate-100/90 transition-all"
            title="Settings & Profile"
          >
            <Settings size={20} />
          </button>
        </div>
        <div className="relative group">
          <Search className="absolute left-3 top-3 text-slate-400 group-focus-within:text-teal-600 transition-colors" size={18} />
          <input
            type="text"
            placeholder="Search name, DOB, or condition..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white text-slate-800 text-base pl-10 pr-4 py-2.5 min-h-[44px] rounded-xl outline-none focus:ring-2 focus:ring-teal-400/60 border border-slate-200 focus:border-teal-400 transition-all placeholder:text-slate-400 shadow-sm"
          />
        </div>
        {isAiSearching && searchTerm.length >= 3 && (
          <div className="flex items-center gap-2 mt-2 px-1">
            <Loader2 size={12} className="text-teal-500 animate-spin" />
            <span className="text-[10px] text-teal-500 font-medium uppercase tracking-wider">Scanning patient records...</span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 custom-scrollbar">
        {!searchTerm && patients.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 px-2 mb-2">
              <Clock size={12} className="text-teal-500"/>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Recent Activity</h3>
            </div>
            {recentPatients.map(p => renderPatientRow(p, 'recent'))}
            <div className="my-4 border-t border-slate-300/70 mx-2"></div>
          </div>
        )}
        <div>
          <div className="flex items-center gap-2 px-2 mb-2">
            <Users size={12} className={searchTerm ? "text-teal-500" : "text-slate-500"}/>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              {searchTerm ? 'Search Results' : 'All Patients'}
              <span className="ml-1 opacity-60">({filteredPatients.length})</span>
            </h3>
          </div>
          {filteredPatients.length === 0 ? (
            <div className="text-center py-8 opacity-40"><p className="text-sm">No patients found</p></div>
          ) : (
            filteredPatients.map(p => renderPatientRow(p, 'all'))
          )}
        </div>
      </div>

      <div className="p-4 border-t border-slate-300/80 bg-slate-100/95 backdrop-blur-sm z-10 safe-pad-b">
        <button onClick={onCreatePatient} className="w-full bg-teal-600 hover:bg-teal-700 text-white min-h-[48px] p-3.5 rounded-xl font-bold transition-all shadow-md shadow-teal-900/15 flex items-center justify-center gap-2 mb-3 active:scale-[0.98]">
          <Plus size={20} /> New Patient Folder
        </button>
        <button onClick={onLogout} className="w-full flex items-center justify-center gap-2 text-xs font-medium text-slate-500 hover:text-slate-800 py-2 transition-colors">
          <LogOut size={14} /> SIGN OUT
        </button>
      </div>
    </div>
  );
};