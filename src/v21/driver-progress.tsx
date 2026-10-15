import type {GateOrder} from '../server/contracts';
import {api,useTask} from './client';
import {ErrorText} from './common';
export function DriverProgress({order,reload}:{order:GateOrder;reload:()=>Promise<unknown>}){
 const task=useTask();if(!order.riderPhone||order.state==='cancelled')return null;
 const sent=['sent','delivered','read'].includes(order.driverAlertStatus||'');
 const status=order.state==='delivered'?'Delivered':order.state==='on_the_way'?'On the way':order.driverAcceptedAt?'Accepted':order.driverViewedAt?'Viewed':sent?'Notified':['accepted','queued','sending'].includes(order.driverAlertStatus||'')?'Sending WhatsApp alert':'WhatsApp alert not sent';
 return <section className="v-stack"><strong>Delivery status: {status}</strong>{!order.driverViewedAt&&order.driverAlertAt&&Date.now()-order.driverAlertAt>=180000&&['new','cooking','ready'].includes(order.state)&&<button className="v-button secondary" disabled={task.busy} onClick={()=>void task.run(async()=>{await api('/orders/'+order.id+'/resend','POST',{});await reload();})}>Resend alert</button>}<ErrorText text={task.error}/></section>;
}
