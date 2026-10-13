import {useLocation} from 'react-router-dom';
import {useUiSessionState,useUiVersion} from '../providers/UiVersionProvider';
import type {PeriodType} from '../../features/dashboard/categoryAnalytics';

/** A current-month summary opens its own context; previous analysis filters survive. */
export function useAnalysisPeriod(scope:string) {
  const location=useLocation();
  const ui3=useUiVersion()==='3.0';
  const key=ui3&&location.state?.currentPeriod===true?`${scope}.entry.${location.key}`:scope;
  const [period,setPeriod]=useUiSessionState<PeriodType>(`${key}.period`,'1m');
  const [offset,setOffset]=useUiSessionState(`${key}.offset`,0);
  return {period,setPeriod,offset,setOffset};
}
