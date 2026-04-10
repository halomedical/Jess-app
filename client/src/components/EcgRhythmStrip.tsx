import React, { useId } from 'react';

type Variant = 'sidebar' | 'light';

const BEAT_PATH =
  'M0 16 L10 16 L12 14.5 L14 16 L20 16 L22 16 L24 5 L27 27 L30 16 L44 16 Q52 16 58 11 Q64 6 70 16 L90 16';

interface Props {
  variant?: Variant;
  className?: string;
}

/**
 * Decorative ECG-style rhythm strip (not for clinical use).
 */
export const EcgRhythmStrip: React.FC<Props> = ({ variant = 'sidebar', className = '' }) => {
  const rawId = useId().replace(/:/g, '');
  const patternId = `ecg-pattern-${rawId}`;

  const colorWrap =
    variant === 'sidebar'
      ? 'text-[#4FB6B2]/45'
      : 'text-[#4FB6B2]/35';

  return (
    <div
      className={`relative w-full select-none pointer-events-none ${className}`}
      aria-hidden
    >
      {variant === 'sidebar' && (
        <div
          className="absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-white to-transparent z-[1]"
          aria-hidden
        />
      )}
      {variant === 'sidebar' && (
        <div
          className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[#F7F9FB] to-transparent z-[1]"
          aria-hidden
        />
      )}
      <svg
        className={`block w-full h-6 sm:h-7 ${colorWrap}`}
        viewBox="0 0 360 32"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id={patternId} patternUnits="userSpaceOnUse" width="90" height="32">
            <path
              d={BEAT_PATH}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.35"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </pattern>
        </defs>
        <rect x="0" y="0" width="360" height="32" fill={`url(#${patternId})`} />
      </svg>
    </div>
  );
};
