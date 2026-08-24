// One-shot release notice shown on app entry: bottom sheet on mobile, centered
// card on desktop. Shown once per user per notice id (see releaseNoticeStorage);
// mounted in the authenticated shell only, and only after the initial data
// load, so it never covers the loading state. Dismissible (backdrop, ✕, Esc,
// CTA). Reusable: ship a future notice by changing RELEASE_NOTICE_ID and the
// texts.
//
// Wrapper sottile: la presentazione sta in shared/components/ReleaseDialog
// (la stessa del popup Novità); qui resta SOLO la logica del "già visto", che
// è per-utente e non per-versione.
//
// NB: keep it the ONLY release popup — il WhatsNewModal si accende per le voci
// VERSIONS con `highlight`, quindi una release annunciata qui NON deve avere
// quel flag. Il montaggio in App.tsx aggiunge una seconda rete di sicurezza
// (isWhatsNewPending): mai due popup insieme.

import { useState, useEffect } from 'react';
import { ReleaseDialog } from '../../shared/components/ReleaseDialog';
import { RELEASE_NOTICE_ID, hasSeenReleaseNotice, markReleaseNoticeSeen } from './releaseNoticeStorage';

const BULLETS = [
  'Il TFR non conta più nel flusso di cassa: resta nel capitale investito e nel patrimonio.',
  'I versamenti senza conto (es. contributi del datore) contano come entrate del flusso.',
  'Il controvalore degli investimenti si aggiorna da solo a ogni versamento o disinvestimento.',
  'Puoi distribuire un versamento una tantum su 3, 6 o 12 mesi nelle statistiche — il movimento resta unico.',
  'Nuovo dettaglio degli investimenti: guadagno totale, rendimento annualizzato e storico dei versamenti.',
];

export function ReleaseNotice({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!hasSeenReleaseNotice(userId, RELEASE_NOTICE_ID)) setOpen(true);
  }, [userId]);

  const dismiss = () => {
    markReleaseNoticeSeen(userId, RELEASE_NOTICE_ID);
    setOpen(false);
  };

  return (
    <ReleaseDialog
      open={open}
      title="Investimenti e flussi più chiari"
      subtitle="Entrate, uscite e investimenti ora seguono i movimenti reali dei tuoi conti."
      bullets={BULLETS}
      onClose={dismiss}
    />
  );
}
