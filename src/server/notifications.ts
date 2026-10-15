import {orderMoney,type GateOrder} from './contracts';
export type NoticeKind='activation'|'assignment'|'ready'|'connector'|'cancellation';
export interface Notice {parameters:string[];orderId?:string;assignedPhone?:string}
export const noticeTemplates={
 connector:{name:'kasi_connector_earned',body:'Good news — {{1}} just paid for Kasi Move. You’ve earned R75. Your total so far: R{{2}}. Payouts happen every Friday.',example:['Thandi’s Corner','150.00']},
 ready:{name:'kasi_delivery_ready',body:'Ready for delivery: order #{{1}} from {{2}}. Items: {{3}}. Customer: {{4}}, {{5}}. Address and gate note: {{6}}. Customer pays R{{7}} by {{8}}. Your agreed delivery rate is R{{9}}, paid by the vendor. Open your delivery: {{10}}.',example:['1048','Thandi’s Corner','1 x Russian Special','Thabo','0711234567','1142 Mamelodi West, Gate 3','60.00','cash','15.00','https://move.kasiaihub.com/team/access']},
 activation:{name:'kasi_payment_confirmed',body:'Your payment for {{1}} is confirmed. Your Kasi Move plan is active. Open your stall or check its operating hours here: {{2}}.',example:['Thandi’s Corner','https://move.kasiaihub.com/kitchen']},
 assignment:{name:'kasi_delivery_assigned',body:'Delivery assigned: order #{{1}} from {{2}}. Items: {{3}}. Customer: {{4}}, {{5}}. Address and gate note: {{6}}. Customer pays R{{7}} by {{8}}. Your agreed delivery rate is R{{9}}, paid by the vendor. Open your delivery: {{10}}.',example:['1048','Thandi’s Corner','1 x Russian Special','Thabo','0711234567','1142 Mamelodi West, Gate 3','60.00','cash','15.00','https://move.kasiaihub.com/rider']},
 cancellation:{name:'kasi_order_cancelled',body:'Order #{{1}} from {{2}} has been cancelled by the customer before cooking started. Do not prepare this order. Check your kitchen: {{3}}.',example:['1048','Thabo','https://move.kasiaihub.com/kitchen']}
} as const;
export function orderNotice(kind:'assignment'|'cancellation',order:GateOrder,stallName:string):Notice {
 if(kind==='cancellation')return {orderId:order.id,parameters:[String(order.number),order.customerName,'https://move.kasiaihub.com/kitchen']};
 const items=order.lines.map(l=>l.quantity+' x '+l.name+(l.extras?.length?' ('+l.extras.map(e=>e.name).join(', ')+')':'')).join('; ');
 return {orderId:order.id,assignedPhone:order.riderPhone!,parameters:[String(order.number),stallName,items.length>600?items.slice(0,575)+'… Full order in app':items,order.customerName,order.customerPhone,order.gateNote,(orderMoney(order).totalCents/100).toFixed(2),order.method==='card'?'card payments — bring the speed point machine':'cash',((order.riderFeeCents??1000)/100).toFixed(2),'https://move.kasiaihub.com/rider']};
}
