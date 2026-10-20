import {useLocation} from 'react-router-dom';
import {useUiSessionState,useUiVersion} from '../providers/UiVersionProvider';
import type {PeriodType} from '../../features/dashboard/categoryAnalytics';

/** Summary links open their calendar month; previous analysis filters survive. */
export function useAnalysisPeriod(scope:string) {
  const location=useLocation();
  const ui3=useUiVersion()==='3.0';
  const month = ui3 ? new URLSearchParams(location.search).get('month') : null;
  const selectedMonth = month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : null;
  const now = new Date();
  const initialOffset = selectedMonth ? (now.getFullYear() - Number(selectedMonth.slice(0,4))) * 12 + now.getMonth() - Number(selectedMonth.slice(5)) + 1 : 0;
  const key=ui3&&(selectedMonth||location.state?.currentPeriod===true)?`${scope}.entry.${location.key}`:scope;
  const [period,setPeriod]=useUiSessionState<PeriodType>(`${key}.period`,'1m');
  const [offset,setOffset]=useUiSessionState(`${key}.offset`,initialOffset);
  return {period,setPeriod,offset,setOffset};
}
