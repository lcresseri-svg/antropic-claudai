/** Shared UI3 period choices: selected state has dedicated fill/ink tokens. */
export function PeriodSelector<T extends string>({label,value,options,onChange}:{
  label:string; value:T; options:readonly {value:T;label:string}[]; onChange:(value:T)=>void;
}) {
  return <div role="group" aria-label={label} className="ui-period-selector">
    {options.map(option=><button key={option.value} type="button" aria-pressed={value===option.value}
      onClick={()=>onChange(option.value)} className="ui-period-choice">{option.label}</button>)}
  </div>;
}
