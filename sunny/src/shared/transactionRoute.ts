const localDate=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export function transactionRoute(filters:Record<string,string>,start:Date,end:Date) {
  return `/transactions?${new URLSearchParams({...filters,from:localDate(start),to:localDate(end)})}`;
}
export function readTransactionRange(query:URLSearchParams):{from:string;to:string}|null {
  const from=query.get('from'),to=query.get('to');
  const valid=(s:string|null):s is string=>!!s&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
  return valid(from)&&valid(to)&&from<=to?{from,to}:null;
}
