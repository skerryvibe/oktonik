// Platform-independent timing in RATE-cell units. Original timing is immutable
// under quantization; the adapter converts the compiled view to DSP ticks.
export const EVENTS_PER_CELL=8;
export const EVENT_CAPACITY=16*EVENTS_PER_CELL;
export const TICKS_PER_CELL=10000;
export function normalizePerformance(raw) {
  if(!raw || !Number.isFinite(raw.start) || raw.start<0 || raw.start>=16 ||
     !Number.isFinite(raw.duration) || raw.duration<=0 || raw.duration>16)return null;
  return {start:raw.start,duration:raw.duration};
}
export function quantizedTiming(raw, strength=100) {
  const q=Math.max(0,Math.min(100,strength))/100;
  const start=raw.start+q*(Math.round(raw.start)-raw.start);
  const originalEnd=raw.start+raw.duration;
  // As in the original grid recorder, a fully quantized short note lasts at
  // least one cell. Continuous interpolation keeps partial strength meaningful.
  const targetEnd=Math.max(Math.round(originalEnd),Math.round(raw.start)+1);
  const end=originalEnd+q*(targetEnd-originalEnd);
  return {at:Math.round((start%16)*TICKS_PER_CELL)%(16*TICKS_PER_CELL),
    len:Math.max(1,Math.min(16*TICKS_PER_CELL,Math.round((end-start)*TICKS_PER_CELL)))};
}
export function cellEvents(cell) {return cell?[cell,...(cell.more||[])]:[];}
export function compileLane(lane,strength) {
  const result=Array(EVENT_CAPACITY).fill(null);let extra=16;
  lane.forEach((cell,index)=>cellEvents(cell).forEach((event,n)=>{
    const {more,...payload}=event;
    result[n?extra++:index]={cell:index,event:payload,
      ...(event.performance?quantizedTiming(event.performance,strength):{})};
  }));
  return result;
}
// Clear previously stored starts in the recorded span once per loop pass.
// Newly captured attacks sharing a cell survive together, unlike old grid-only
// replacement. The caller supplies a fresh map for each Record session/lane.
export function insertTake(lane,take,event,visited) {
  const start=take.position, end=start+(take.performance?.duration??take.timing.steps);
  const first=Math.floor(start), index=((first%16)+16)%16, pass=Math.floor(first/16);
  const kept=visited.get(index)===pass?cellEvents(lane[index]):[];
  if(kept.length>=EVENTS_PER_CELL)return false;
  for(let pos=first;pos<=Math.min(first+15,Math.max(first,Math.ceil(end-1e-9)-1));pos++) {
    const cell=pos%16, cycle=Math.floor(pos/16);
    if(visited.get(cell)!==cycle){lane[cell]=null;visited.set(cell,cycle);}
  }
  const events=[...kept.map(({more,...e})=>e),event];
  lane[index]={...events[0],...(events.length>1?{more:events.slice(1)}:{})};
  return true;
}
