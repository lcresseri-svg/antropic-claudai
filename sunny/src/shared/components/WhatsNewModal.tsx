// "Novità" popup — announces the changes of a release to ALL users, but ONLY
// when a specific release is opted in (VersionEntry.highlight === true). The
// admin still controls WHICH release fires the popup, by flagging its changelog
// entry.
//
// Wrapper sottile: la presentazione sta tutta in ReleaseDialog (condivisa con
// ReleaseNotice); qui resta SOLO la logica del "già visto", che è per-versione.
//
// "Already seen" is tracked per-version in localStorage (per user and browser/device).
// FUTURE (multi-device): move the flag to a per-user Firestore field
// (e.g. users/{uid}/meta/settings.whatsNewSeen) so it follows the user across
// devices instead of being local to this device.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { VERSIONS } from '../../appInfo';
import { ReleaseDialog } from './ReleaseDialog';
import {hasSeenWhatsNew,markWhatsNewSeen} from './whatsNewStorage';

/** Most recent highlighted release (VERSIONS is newest-first). */
const highlighted = () => VERSIONS.find(v => v.highlight);

/** True quando il popup Novità sta per aprirsi: serve al chiamante per non
 *  mostrare un secondo popup nella stessa sessione (mai due insieme). */
export function isWhatsNewPending(userId: string): boolean {
  const entry = highlighted();
  if (!entry) return false;
  return !hasSeenWhatsNew(userId,entry.version);
}

export function WhatsNewModal({userId}:{userId:string}) {
  const entry = highlighted();

  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!entry) return;
    setOpen(!hasSeenWhatsNew(userId,entry.version));
  }, [userId,entry?.version]);

  const close = () => {
    if (entry) {
      markWhatsNewSeen(userId,entry.version);
    }
    setOpen(false);
  };

  if (!entry) return null;

  return (
    <ReleaseDialog
      open={open}
      version={entry.version}
      date={entry.date}
      title={entry.title}
      subtitle={entry.subtitle}
      items={entry.highlights}
      bullets={entry.changes}
      primaryAction={entry.primaryAction}
      onClose={close}
    />
  );
}
