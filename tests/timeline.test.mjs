import test from 'node:test';
import assert from 'node:assert/strict';
import {quantizedTiming,compileLane,insertTake,cellEvents,EVENT_CAPACITY} from '../src/timeline.mjs';
import {createChordRecorder} from '../src/recording.mjs';
import {createPilot,PAGES,CHORD_PADS as C} from '../src/pilot.mjs';
import {encodeDocument,decodeDocument,normalizeStep,STATE_PATH,normalizeBassStep} from '../src/settings.mjs';

test('quantize 0/70/100 interpolates original attacks/releases without mutation',()=>{
  const raw={start:2.2,duration:1.1};
  assert.deepEqual(quantizedTiming(raw,0),{at:22000,len:11000});
  assert.deepEqual(quantizedTiming(raw,70),{at:20600,len:10300});
  assert.deepEqual(quantizedTiming(raw,100),{at:20000,len:10000});
  assert.deepEqual(raw,{start:2.2,duration:1.1});
  assert.deepEqual(quantizedTiming({start:15.8,duration:.1},100),{at:0,len:10000});
  assert.deepEqual(quantizedTiming({start:15.8,duration:.1},0),{at:158000,len:1000});
});
test('raw capture preserves host-beat timing at every rate and long holds are bounded',()=>{
  for(const [rate,span] of [.25,.5,1,2,4].entries()){
    const r=createChordRecorder({preserveTiming:true});r.start(0,15.8*span,rate,{},90);
    const take=r.release(0,17.1*span);
    assert.equal(take.index,15);assert.equal(take.performance.start,15.8);
    assert.ok(Math.abs(take.performance.duration-1.3)<1e-10);
  }
  const r=createChordRecorder({preserveTiming:true});r.start(0,0,2,{},1);
  assert.equal(r.release(0,1000).performance.duration,16);
});
test('multiple same-cell events persist and later loop passes replace that cell',()=>{
  const lane=Array(16).fill(null),visited=new Map();
  for(let n=0;n<8;n++)assert.equal(insertTake(lane,{position:n/10,performance:{duration:.05}},
    {note:36+n,steps:1,velocity:80,performance:{start:n/10,duration:.05}},visited),true);
  assert.equal(cellEvents(lane[0]).length,8);
  const before=JSON.stringify(lane);
  assert.equal(insertTake(lane,{position:.9,performance:{duration:.05}},{note:99},visited),false);
  assert.equal(JSON.stringify(lane),before);
  assert.equal(insertTake(lane,{position:16.1,performance:{duration:.1}},{note:50},visited),true);
  assert.equal(cellEvents(lane[0]).length,1);assert.equal(lane[0].note,50);
});
function harness(settings={}){
  let beat=0,ready=true;const files=new Map([[STATE_PATH,encodeDocument(settings,[])]]),commands=[];
  const p=createPilot({clock:()=>({beat,ready}),read:k=>files.get(k),write:(k,v)=>{files.set(k,v);return true;},send:c=>commands.push(c)});p.init();
  return {p,files,commands,time:b=>beat=b,page:n=>p.changePage(PAGES.indexOf(n)-p.inspect().page)};
}
test('controller keeps all attacks, QNT is reversible after reload, Undo restores original',()=>{
  const h=harness({quantize:0,bassEnabled:true});h.p.record();
  h.time(.1);h.p.pad(C[0],true,83);h.time(.3);h.p.pad(C[0],false);
  h.time(.6);h.p.pad(C[2],true,64);h.time(.8);h.p.pad(C[2],false);h.p.record();
  assert.equal(cellEvents(h.p.inspect().progression[0]).length,2);
  assert.equal(cellEvents(h.p.inspect().bassProgression[0]).length,2);
  const original=JSON.stringify(h.p.inspect().progression);
  h.page('SEQ');h.p.knob(5,63);h.p.knob(5,7);
  assert.equal(h.p.inspect().settings.quantize,70);
  assert.equal(h.commands.findLast(c=>c.op==='slot'&&c.index===0).at,300);
  assert.equal(JSON.stringify(h.p.inspect().progression),original);
  h.p.knob(5,-63);h.p.knob(5,-7);
  assert.equal(h.commands.findLast(c=>c.op==='slot'&&c.index===16).at,6000);
  h.p.unload();const restored=createPilot({read:k=>h.files.get(k)});restored.init();
  assert.equal(JSON.stringify(restored.inspect().progression),original);
  h.p.undo();assert.ok(h.p.inspect().progression.every(e=>!e));
});
test('event editor selects later attacks without losing timing, and manual copies are grid-based',()=>{
  const h=harness();h.p.record();h.time(.2);h.p.pad(C[0],true);h.time(.3);h.p.pad(C[0],false);
  h.time(.6);h.p.pad(C[2],true);h.time(.8);h.p.pad(C[2],false);h.p.record();
  h.page('SEQ');h.p.step(0,true);h.p.knob(7,1);h.p.knob(0,1);
  const events=cellEvents(h.p.inspect().progression[0]);assert.equal(events[0].rootOffset,0);assert.equal(events[1].rootOffset,5);
  assert.equal(events[1].performance.start,.6);h.p.step(0,false);
  h.p.step(4,true,{shift:true});assert.equal(h.p.inspect().progression[4].performance,undefined);
});
test('normalization bounds extra events and preserves them in every cell through save',()=>{
  const h=harness();h.p.step(0,true,{shift:true});const chord=h.p.inspect().progression[0];
  const cell={...chord,performance:{start:5.2,duration:.2},more:Array.from({length:20},()=>({...chord,performance:{start:5.3,duration:.1}}))};
  const lane=Array(16).fill(null);lane[5]=normalizeStep(cell);
  const saved=decodeDocument(JSON.parse(encodeDocument({},lane)));
  assert.equal(saved.progression[5].more.length,7);
  assert.equal(compileLane(saved.progression,0).filter(Boolean).length,8);
  assert.equal(compileLane(saved.progression,0).length,EVENT_CAPACITY);
  assert.equal(normalizeBassStep({note:36,performance:{start:Infinity,duration:1}}).performance,undefined);
});
