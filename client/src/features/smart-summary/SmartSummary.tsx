import React, { useState } from 'react';
import { Sparkles, Loader2, ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
  summary: string[];
  loading: boolean;
}

export const SmartSummary: React.FC<Props> = ({ summary, loading }) => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="bg-white border border-[#E5E7EB] rounded-[10px] shadow-[0_1px_2px_rgba(0,0,0,0.05)] overflow-hidden">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between gap-2 p-4 hover:bg-[#F7F9FB] transition-colors"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-[#4FB6B2]" />
          <h3 className="font-semibold text-[#1F2937]">Patient summary</h3>
        </div>
        {collapsed ? (
          <ChevronDown className="w-4 h-4 text-[#4FB6B2]" />
        ) : (
          <ChevronUp className="w-4 h-4 text-[#4FB6B2]" />
        )}
      </button>

      {!collapsed && (
        <div className="px-4 pb-4">
          {loading ? (
            <div className="flex items-center gap-2 text-[#4FB6B2] py-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm text-[#6B7280]">Analyzing patient history...</span>
            </div>
          ) : summary.length > 0 ? (
            <ul className="space-y-2">
              {summary.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm text-[#1F2937]">
                  <span className="block w-1.5 h-1.5 mt-1.5 rounded-full bg-[#4FB6B2] shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[#6B7280] italic">No summary available.</p>
          )}
        </div>
      )}
    </div>
  );
};
