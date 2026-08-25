// Testa di pagina, solo desktop.
//
// Su `md+` l'header mobile è nascosto (`AppHeader` è `md:hidden`) e fino a ora
// molte schermate perdevano il contesto: si arrivava su una colonna di card
// senza sapere dove si era. Questo è il titolo che manca — più, al massimo,
// UNA azione secondaria o i controlli propri della schermata.
//
// Il CTA "Aggiungi" non entra mai qui: vive in fondo alla sidebar, e averlo in
// due posti farebbe dubitare che siano la stessa cosa.
import { ReactNode } from 'react';

interface Props {
  title: string;
  subtitle?: ReactNode;
  /** Una sola azione secondaria, o i controlli della schermata. */
  action?: ReactNode;
  /** Su alcune schermate il titolo mobile esiste già (AnalysisHeader): lì
   *  questa testa resta comunque solo desktop, non si duplica. */
  className?: string;
}

export function PageHead({ title, subtitle, action, className = '' }: Props) {
  return (
    <div className={`hidden md:flex items-end justify-between gap-5 mb-5 ${className}`}>
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-primary tracking-[-0.03em] truncate">{title}</h1>
        {subtitle && <p className="mt-1 text-[13px] text-secondary truncate">{subtitle}</p>}
      </div>
      {action && <div className="flex-none">{action}</div>}
    </div>
  );
}
