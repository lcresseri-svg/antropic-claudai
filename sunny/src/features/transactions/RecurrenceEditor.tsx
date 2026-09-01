import { RecurrenceRule } from '../../types';

const WEEKDAYS = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];
const MONTHS = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const unitLabel: Record<RecurrenceRule['freq'], string> = { daily:'giorno', weekly:'settimana', monthly:'mese', yearly:'anno' };

export function RecurrenceEditor({ value, anchorDate, onChange }: {
  value: RecurrenceRule; anchorDate: string; onChange: (rule: RecurrenceRule) => void;
}) {
  const mode = value.mode ?? 'interval';
  const set = (patch: Partial<RecurrenceRule>) => onChange({ ...value, ...patch });
  const calendarFreq = value.freq === 'daily' ? 'weekly' : value.freq;
  const plural = (value.interval ?? 1) === 1 ? unitLabel[value.freq] : ({daily:'giorni',weekly:'settimane',monthly:'mesi',yearly:'anni'} as const)[value.freq];
  return <div className="space-y-3">
    <div>
      <label className="text-xs font-medium text-secondary mb-2 block">Modalità</label>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => onChange({ freq: value.freq, mode:'interval', interval:value.interval ?? 1, anchorDate })}
          className={`py-2 rounded-xl text-xs font-semibold ${mode==='interval'?'bg-gold text-bg':'bg-elevated text-secondary'}`}>Intervallo</button>
        <button type="button" onClick={() => onChange({ freq: calendarFreq, mode:'calendar', weekday:1, dayOfMonth:1, monthOfYear:1 })}
          className={`py-2 rounded-xl text-xs font-semibold ${mode==='calendar'?'bg-gold text-bg':'bg-elevated text-secondary'}`}>Calendario</button>
      </div>
    </div>
    {mode === 'interval' ? <div>
      <label className="text-xs font-medium text-secondary mb-2 block">Si ripete</label>
      <div className="grid grid-cols-[90px_1fr] gap-2">
        <input type="number" min={1} max={999} value={value.interval ?? 1}
          onChange={e => set({ interval:Math.max(1,Math.min(999,Number(e.target.value)||1)), anchorDate })}
          className="bg-elevated rounded-xl px-3 py-3 text-primary text-sm outline-none" aria-label="Intervallo" />
        <select value={value.freq} onChange={e => onChange({ freq:e.target.value as RecurrenceRule['freq'], mode:'interval', interval:value.interval ?? 1, anchorDate })}
          className="bg-elevated rounded-xl px-3 py-3 text-primary text-sm outline-none appearance-none">
          <option value="daily">Giorni</option><option value="weekly">Settimane</option><option value="monthly">Mesi</option><option value="yearly">Anni</option>
        </select>
      </div>
      <p className="text-[11px] text-secondary mt-1.5 px-1">Ogni {value.interval ?? 1} {plural}, dalla data della transazione.</p>
    </div> : <div className="space-y-2">
      <select value={calendarFreq} onChange={e => onChange({ freq:e.target.value as RecurrenceRule['freq'], mode:'calendar', weekday:1, dayOfMonth:1, monthOfYear:1 })}
        className="w-full bg-elevated rounded-xl px-3 py-3 text-primary text-sm outline-none appearance-none">
        <option value="weekly">Ogni settimana</option><option value="monthly">Ogni mese</option><option value="yearly">Ogni anno</option>
      </select>
      {calendarFreq==='weekly' && <select value={value.weekday ?? 1} onChange={e=>set({weekday:Number(e.target.value)})}
        className="w-full bg-elevated rounded-xl px-3 py-3 text-primary text-sm outline-none appearance-none">
        {WEEKDAYS.map((x,i)=><option key={x} value={i}>{x}</option>)}
      </select>}
      {(calendarFreq==='monthly'||calendarFreq==='yearly') && <select value={value.dayOfMonth ?? 1} onChange={e=>set({dayOfMonth:e.target.value==='last'?'last':Number(e.target.value)})}
        className="w-full bg-elevated rounded-xl px-3 py-3 text-primary text-sm outline-none appearance-none">
        {Array.from({length:31},(_,i)=><option key={i+1} value={i+1}>Giorno {i+1}</option>)}<option value="last">Ultimo giorno del mese</option>
      </select>}
      {calendarFreq==='yearly' && <select value={value.monthOfYear ?? 1} onChange={e=>set({monthOfYear:Number(e.target.value)})}
        className="w-full bg-elevated rounded-xl px-3 py-3 text-primary text-sm outline-none appearance-none">
        {MONTHS.map((x,i)=><option key={x} value={i+1}>{x}</option>)}
      </select>}
    </div>}
  </div>;
}
