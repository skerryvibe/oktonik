// Platform-independent timing in RATE-cell units. Original timing is immutable
// under quantization; the adapter converts the compiled view to DSP ticks.
export const EVENTS_PER_CELL=8;
export const EVENT_CAPACITY=16*EVENTS_PER_CELL;
export const MAX_CLIP_STEPS=64;
export const TICKS_PER_CELL=10000;
export function normalizePerformance(raw) {
  if(!raw || !Number.isFinite(raw.start) || raw.start<0 || raw.start>=MAX_CLIP_STEPS ||
     !Number.isFinite(raw.duration) || raw.duration<=0 || raw.duration>MAX_CLIP_STEPS)return null;
  return {start:raw.start,duration:raw.duration,
    ...(Number.isFinite(raw.nudge)&&raw.nudge!==0?{nudge:Math.max(-.99,Math.min(.99,raw.nudge))}:{})};
}
export function quantizedTiming(raw, strength=100,length=16) {
  const q=Math.max(0,Math.min(100,strength))/100;
  const start=raw.start+q*(Math.round(raw.start)-raw.start);
  const originalEnd=raw.start+raw.duration;
  // As in the original grid recorder, a fully quantized short note lasts at
  // least one cell. Continuous interpolation keeps partial strength meaningful.
  const targetEnd=Math.max(Math.round(originalEnd),Math.round(raw.start)+1);
  const end=originalEnd+q*(targetEnd-originalEnd);
  const nudged=((start+(raw.nudge??0))%length+length)%length;
  return {at:Math.round(nudged*TICKS_PER_CELL)%(length*TICKS_PER_CELL),
    len:Math.max(1,Math.min(length*TICKS_PER_CELL,Math.round((end-start)*TICKS_PER_CELL)))};
}
export function cellEvents(cell) {return cell?[cell,...(cell.more||[])]:[];}
export function compileLane(lane,strength,gate=100,clipEnd=false) {
  const length=lane.length;
  const result=Array(EVENT_CAPACITY).fill(null);let extra=length;
  lane.forEach((cell,index)=>cellEvents(cell).forEach((event,n)=>{
    const {more,...payload}=event;
    const slot=n?extra++:index;if(slot>=EVENT_CAPACITY)return;
    result[slot]={cell:index,event:payload,
      ...(event.performance?quantizedTiming(event.performance,strength,length):n||index>=16?{at:index*TICKS_PER_CELL,len:Math.round((event.timing?.steps??event.steps??gate/100)*TICKS_PER_CELL)}:{})};
  }));
  if(clipEnd)for(const entry of result)if(entry){
    entry.at??=entry.cell*TICKS_PER_CELL;
    entry.len=Math.max(1,Math.min(entry.len??Math.round((entry.event.timing?.steps??entry.event.steps??gate/100)*TICKS_PER_CELL),length*TICKS_PER_CELL-entry.at));
  }
  return result;
}
// Clear previously stored starts in the recorded span once per loop pass.
// Newly captured attacks sharing a cell survive together, unlike old grid-only
// replacement. The caller supplies a fresh map for each Record session/lane.
export function insertTake(lane,take,event,visited) {
  const length=lane.length;
  const start=take.position, end=start+(take.performance?.duration??take.timing.steps);
  const first=Math.floor(start), index=((first%length)+length)%length, pass=Math.floor(first/length);
  const kept=visited.get(index)===pass?cellEvents(lane[index]):[];
  // Reserve one DSP slot per cell plus extra attacks. Reject before modifying data.
  const extraCount=lane.reduce((sum,c)=>sum+Math.max(0,cellEvents(c).length-1),0);
  if(kept.length>=EVENTS_PER_CELL || (kept.length && length+extraCount>=EVENT_CAPACITY))return false;
  for(let pos=first;pos<=Math.min(first+length-1,Math.max(first,Math.ceil(end-1e-9)-1));pos++) {
    const cell=pos%length, cycle=Math.floor(pos/length);
    if(visited.get(cell)!==cycle){lane[cell]=null;visited.set(cell,cycle);}
  }
  const events=[...kept.map(({more,...e})=>e),event];
  lane[index]={...events[0],...(events.length>1?{more:events.slice(1)}:{})};
  return true;
}
