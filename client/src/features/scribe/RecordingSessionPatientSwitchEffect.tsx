import { useEffect, useRef } from 'react';
import { useRecordingSessions } from './RecordingSessionsContext';

/**
 * When navigating away from a patient (or switching patients), park an in-progress recording
 * so the mic is not stuck on a chart that is no longer open.
 */
export function RecordingSessionPatientSwitchEffect({ patientId }: { patientId: string | null }) {
  const { activeRecordingPatientId, isLiveCapturing, isMicHeldPaused, parkRecording } = useRecordingSessions();
  const prevRef = useRef<string | null>(null);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = patientId;
    if (
      prev &&
      prev !== patientId &&
      activeRecordingPatientId === prev &&
      (isLiveCapturing || isMicHeldPaused)
    ) {
      parkRecording(prev).catch(() => {});
    }
  }, [patientId, activeRecordingPatientId, isLiveCapturing, isMicHeldPaused, parkRecording]);

  return null;
}
