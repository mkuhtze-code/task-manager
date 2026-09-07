import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type {
  MeetingExportPreferences,
  MeetingExportRecord,
  MeetingExportSections,
  MeetingExportType,
  MeetingExportCounts,
  MeetingTranscriptStatus,
} from '@/lib/meetingExport';
import {
  DEFAULT_MEETING_EXPORT_PREFS,
  applyFailure,
  applySuccess,
  normalizeMeetingExportPrefs,
} from '@/lib/meetingExport';

// ── meeting_exports data access ───────────────────────────────────────
// Thin Supabase adapter over the pure record lifecycle: load newest-first,
// persist new attempts, prune successes past the cap, and keep the
// per-user export preferences in sync. The change-detection math itself
// lives in fingerprint.ts using the loaded records.

export type MeetingExportRecordInput = {
  status: 'successful' | 'failed';
  exportType: MeetingExportType;
  fingerprint: string | null;
  sections: MeetingExportSections | null;
  counts: MeetingExportCounts;
  transcriptionRequested: boolean;
  transcriptionStatus: MeetingTranscriptStatus;
  missingMediaCount: number;
  fileSize: number | null;
  errorReason: string | null;
};

export function useMeetingExports(meetingId: string | null, userId: string | null) {
  const [records, setRecords] = useState<MeetingExportRecord[]>([]);
  const [prefs, setPrefs] = useState<MeetingExportPreferences>(DEFAULT_MEETING_EXPORT_PREFS);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (!meetingId || !userId) return;
    setLoaded(false);
    const [{ data: exportRows }, { data: settings }] = await Promise.all([
      supabase
        .from('meeting_exports')
        .select('*')
        .eq('meeting_id', meetingId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
      supabase
        .from('user_settings')
        .select('meeting_export_prefs')
        .eq('user_id', userId)
        .maybeSingle(),
    ]);
    setRecords((exportRows as MeetingExportRecord[]) || []);
    setPrefs(normalizeMeetingExportPrefs(settings?.meeting_export_prefs));
    setLoaded(true);
  }, [meetingId, userId]);

  useEffect(() => {
    if (meetingId && userId) void refresh();
  }, [refresh, meetingId, userId]);

  const savePrefs = useCallback(
    async (next: MeetingExportPreferences) => {
      if (!userId) return;
      await supabase.from('user_settings').update({ meeting_export_prefs: next }).eq('user_id', userId);
      setPrefs(next);
    },
    [userId]
  );

  // Persist one attempt. A success applies the cap/prune lifecycle; a
  // failure is prepended and stays until the next success.
  const persistRecord = useCallback(
    async (input: MeetingExportRecordInput): Promise<void> => {
      if (!meetingId || !userId) return;
      const { data: inserted, error } = await supabase
        .from('meeting_exports')
        .insert({
          user_id: userId,
          meeting_id: meetingId,
          status: input.status,
          export_type: input.exportType,
          fingerprint: input.fingerprint,
          selected_sections: input.sections,
          observation_count: input.counts.observations,
          photo_count: input.counts.photos,
          audio_count: input.counts.audio,
          decision_count: input.counts.decisions,
          action_count: input.counts.actions,
          participant_count: input.counts.participants,
          transcription_requested: input.transcriptionRequested,
          transcription_status: input.transcriptionStatus,
          missing_media_count: input.missingMediaCount,
          file_size: input.fileSize,
          error_reason: input.errorReason,
        })
        .select('*')
        .single();
      if (error) {
        console.error('Could not record the export', error);
        return;
      }
      const row = inserted as MeetingExportRecord;
      if (input.status === 'successful') {
        const { dropped, next } = applySuccess(records, row);
        if (dropped.length > 0) {
          await supabase
            .from('meeting_exports')
            .delete()
            .eq('user_id', userId)
            .in(
              'id',
              dropped.map((d) => d.id)
            );
        }
        setRecords(next);
      } else {
        setRecords(applyFailure(records, row));
      }
    },
    [meetingId, userId, records]
  );

  return { records, prefs, loaded, refresh, savePrefs, persistRecord };
}