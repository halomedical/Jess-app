import React from 'react';

/**
 * Minimal wordmark inspired by the practice letterhead — name styling only (no credentials).
 */
export const SignInBranding: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`select-none ${className}`}>
    <svg
      viewBox="0 0 360 100"
      className="w-full max-w-[300px] h-auto mx-auto text-slate-900"
      role="img"
      aria-label="Dr Jess John"
    >
      <defs>
        <linearGradient id="signInAccent" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#0d9488" />
          <stop offset="100%" stopColor="#0f766e" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="352" height="92" rx="10" fill="none" stroke="url(#signInAccent)" strokeWidth="1.5" opacity="0.45" />
      <text
        x="180"
        y="48"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', Times, serif"
        fontSize="28"
        fontWeight="700"
        letterSpacing="0.06em"
        fill="currentColor"
      >
        DR JESS JOHN
      </text>
      <line x1="48" y1="62" x2="312" y2="62" stroke="url(#signInAccent)" strokeWidth="1.25" opacity="0.75" />
      <text
        x="180"
        y="86"
        textAnchor="middle"
        fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif"
        fontSize="10"
        fontWeight="700"
        letterSpacing="0.35em"
        fill="#0f766e"
      >
        CARDIOLOGIST
      </text>
    </svg>
  </div>
);
