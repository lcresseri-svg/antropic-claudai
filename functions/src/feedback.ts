import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { ADMIN_UID, sendToUser } from './shared';

// ─────────────────────────────────────────────────────────────────────────────
// FEEDBACK — notify the admin when a user submits feedback.
// Each new document in the top-level `feedback` collection triggers a push to
// the admin's devices (reuses the existing FCM helper; no new infrastructure).
// ─────────────────────────────────────────────────────────────────────────────

export const onFeedbackCreated = onDocumentCreated(
  { document: 'feedback/{fid}', region: 'europe-west1' },
  async (event) => {
    const d = event.data?.data() ?? {};
    const type = (d.type as string | undefined) ?? 'other';
    const text = ((d.text as string | null | undefined) ?? '').slice(0, 90);
    const titles: Record<string, string> = {
      bug: '🐞 Feedback: problema',
      idea: '💡 Feedback: idea',
      confusion: '😕 Feedback: confusione',
      other: '💬 Nuovo feedback',
    };
    const title = titles[type] ?? '💬 Nuovo feedback';
    const body = text || 'Hai ricevuto un nuovo feedback.';
    try {
      await sendToUser(ADMIN_UID, title, body, undefined, 'feedback');
    } catch (err) {
      console.error('onFeedbackCreated: notify failed:', err);
    }
  }
);
