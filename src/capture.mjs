// Retrospective live performance history; no hardware or transport dependencies.
export function suggestTempo(onsets,currentBpm) {
  const points=[];
  for(const s of [...onsets].filter(Number.isFinite).sort((a,b)=>a-b))
    if(!points.length||s-points.at(-1)>.05)points.push(s);
  if(points.length<4||points.at(-1)-points[0]<1.5)return null;
  const gaps=points.slice(1).map((s,i)=>s-points[i]).filter(s=>s>=.1&&s<=2);
  if(gaps.length<3)return null;
  let best=null;
  for(let bpm=60;bpm<=180;bpm++){
    const errors=gaps.map(s=>{const n=s*bpm/60;return Math.abs(n-Math.max(.5,Math.round(n*2)/2));});
    const error=errors.reduce((a,b)=>a+b,0)/errors.length;
    const support=errors.filter(e=>e<.1).length/errors.length;
    const score=error+.035*Math.abs(Math.log(bpm/currentBpm));
    if(!best||score<best.score)best={bpm,error,support,score};
  }
  return best.error<=.065&&best.support>=.8?{bpm:best.bpm,confidence:'TRY'}:null;
}

// Reinterpret recorded seconds as beats at the confirmed BPM, across all lanes.
export function retimeCapture(take,ratio) {
  if(!Number.isFinite(ratio)||ratio<=0)return {error:'Invalid capture tempo'};
  const entries=Object.entries(take.lanes).flatMap(([part,lane])=>lane.flatMap(c=>c?[c,...(c.more||[])].map(e=>({part,e})):[]));
  const end=Math.max(0,...entries.map(({e})=>(e.performance.start+e.performance.duration)*ratio));
  const length=[16,32,64].find(n=>n>=end-1e-6);
  if(!length)return {error:'Tempo needs over 4 bars'};
  const lanes={};
  for(const {part,e} of entries){
    const event=JSON.parse(JSON.stringify(e));delete event.more;
    event.performance={start:e.performance.start*ratio,duration:e.performance.duration*ratio};
    const steps=Math.max(1,Math.ceil(event.performance.duration));
    if(part==='chord')event.timing.steps=steps;else event.steps=steps;
    const lane=lanes[part]??(lanes[part]=Array(length).fill(null)),index=Math.floor(event.performance.start);
    if(!lane[index])lane[index]=event;
    else {const more=lane[index].more??(lane[index].more=[]);if(more.length>=7)return {error:'Tempo too dense'};more.push(event);}
  }
  if(Object.values(lanes).some(lane=>length+lane.reduce((n,e)=>n+(e?.more?.length||0),0)>128))return {error:'Tempo too dense'};
  return {length,lanes};
}
export function trimCapture(take,start,end) {
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start)return {error:'Invalid capture range'};
  const lanes={};
  for(const [part,lane] of Object.entries(take.lanes)){
    for(const cell of lane)for(const e of cell?[cell,...(cell.more||[])]:[]){
      const a=Math.max(start,e.performance.start),b=Math.min(end,e.performance.start+e.performance.duration);
      if(b<=a)continue;
      const event=JSON.parse(JSON.stringify(e));delete event.more;
      event.performance={start:a-start,duration:b-a};
      const dst=lanes[part]??(lanes[part]=Array(64).fill(null)),index=Math.floor(a-start);
      if(!dst[index])dst[index]=event;
      else {const more=dst[index].more??(dst[index].more=[]);if(more.length>=7)return {error:'Range too dense'};more.push(event);}
    }
  }
  return Object.keys(lanes).length?{...take,lanes}:{error:'Range has no notes'};
}
export function createCaptureHistory() {
  let events=[],held=new Map(),last=null,bpm=null,beat=0,overflowUntil=-Infinity;
  let anchor=null,phase=null,lastActivity=null;
  const clear=()=>{events=[];held.clear();overflowUntil=-Infinity;lastActivity=null;};
  function time(ms,tempo,clock={}) {
    if(!Number.isFinite(ms)||!Number.isFinite(tempo)||tempo<20||tempo>999){clear();last=null;return null;}
    if(last!==null && (ms<last || tempo!==bpm))clear();
    if(last!==null && ms>=last)beat+=(ms-last)*tempo/60000;
    if(clock.ready && Number.isFinite(clock.beat) && clock.beat>=0){
      if(anchor===null)anchor=beat-clock.beat;
      const expected=clock.beat+anchor;
      // A seek is a new musical timeline, not a very long captured rest.
      if(Math.abs(expected-beat)>.5){clear();anchor=beat-clock.beat;}
      else beat=expected;
      phase=anchor;
    }else {anchor=null;phase=null;}
    last=ms;bpm=tempo;
    if(!held.size && lastActivity!==null && ms-lastActivity>30000)clear();
    // Keep enough history to choose complete bars, independent of button delay.
    const end=held.size?beat:Math.max(-Infinity,...events.map(e=>e.end??e.start));
    events=events.filter(e=>(e.end??beat)>=end-32);
    while(events.length>512){events.shift();overflowUntil=Infinity;}
    for(const [id,e] of held)if(!events.includes(e))held.delete(id);
    return beat;
  }
  function stop(owner,at){const e=held.get(owner);if(e){e.end=Math.max(e.start,at??e.start);held.delete(owner);lastActivity=last;}}
  return {clear,time,stop,
    start(owner,part,payload,velocity,at){
      // In free playing, one silent 4/4 bar separates rehearsal attempts.
      if(at!==null && phase===null && !held.size && events.length && at-Math.max(...events.map(e=>e.end??e.start))>=4)clear();
      stop(owner,at);if(at===null)return;
      const e={part,payload,velocity,start:at,phase};events.push(e);held.set(owner,e);lastActivity=last;
    },
    snapshot(at){
      if(at===null)return null;
      if(at<overflowUntil || events.length>512)return {error:'Capture too dense'};
      const phraseEnd=Math.max(-Infinity,...events.map(e=>Math.max(e.start+1/32,e.end??at)));
      const recent=events.filter(e=>(e.end??at)>phraseEnd-20);
      if(!recent.length)return null;
      const grid=recent[0].phase;
      const aligned=grid!==null && recent.every(e=>e.phase!==null&&Math.abs(e.phase-grid)<.125);
      const first=Math.min(...recent.map(e=>e.start));
      // Tolerate up to 1/32 beat of release lateness at a bar line; never move attacks.
      const end=aligned?grid+Math.ceil((phraseEnd-grid-1/32)/4)*4:phraseEnd;
      const origin=aligned?Math.max(grid+Math.floor((first-grid)/4)*4,end-16):Math.max(phraseEnd-16,first);
      const length=[16,32,64].find(n=>n/4>=end-origin-1e-6)??64;
      const lanes={};
      for(const e of recent){
        if((e.end??at)<=origin && e.start<origin)continue;
        const start=Math.max(0,(e.start-origin)*4);
        if(start>=length)continue;
        const duration=Math.min(length-start,Math.max(1/8,((e.end??at)-Math.max(origin,e.start))*4));
        const event={...JSON.parse(JSON.stringify(e.payload)),performance:{start,duration}};
        if(e.part==='chord')event.timing={steps:Math.max(1,Math.ceil(duration)),velocity:e.velocity};
        else Object.assign(event,{steps:Math.max(1,Math.ceil(duration)),velocity:e.velocity});
        const lane=lanes[e.part]??(lanes[e.part]=Array(length).fill(null)),index=Math.floor(start);
        if(!lane[index])lane[index]=event;
        else {const more=lane[index].more??(lane[index].more=[]);if(more.length>=7)return {error:'Capture too dense'};more.push(event);}
      }
      if(Object.values(lanes).some(lane=>length+lane.reduce((n,e)=>n+(e?.more?.length||0),0)>128))return {error:'Capture too dense'};
      const suggestion=!aligned&&recent.every(e=>e.phase===null)?suggestTempo(recent.filter(e=>e.start>=origin).map(e=>(e.start-origin)*60/bpm),bpm):null;
      return {length,lanes,aligned,bpm,suggestion};
    }
  };
}
