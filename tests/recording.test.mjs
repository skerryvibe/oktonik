import test from 'node:test';
import assert from 'node:assert/strict';
import {createChordRecorder,STEP_BEATS} from '../src/recording.mjs';
import {createPilot,PAGES,CHORD_PADS as C,STOP_PAD} from '../src/pilot.mjs';
import {encodeDocument,normalizeStep,STATE_PATH} from '../src/settings.mjs';
import {chordName} from '../src/theory.mjs';
import {createProjectPilot,ACTIVE_SET_PATH} from '../src/project.mjs';
test('recorder quantizes host beats at all rates, preserves payload, closes only its owner',()=>{
  for(let rate=0;rate<5;rate++) {
    const r=createChordRecorder(),span=STEP_BEATS[rate],payload={name:'Cm7'};
    r.start(4,span*15.12,rate,payload,83);
    assert.equal(r.release(2,span*16),null);
    assert.deepEqual(r.release(4,span*18.1),{index:15,payload,timing:{steps:3,velocity:83}});
    assert.equal(r.release(4,span*20),null);
  }
});
test('short attacks, same-cell replacement, long holds, seek and clock loss are bounded',()=>{
  const r=createChordRecorder();r.start(0,0,2,{},90);
  assert.equal(r.start(1,.1,2,{},60).timing.steps,1);
  assert.equal(r.release(1,100).timing.steps,16);
  r.start(0,10,2,{},99);r.observe(12,true);
  assert.equal(r.observe(0,true).timing.steps,2);assert.equal(r.inspect(),null);
  r.start(0,0,2,{},99);r.observe(4,true);
  assert.equal(r.observe(NaN,false).timing.steps,4);
  assert.equal(r.start(0,NaN,0,{},1),null);
});
function setup(settings={},files=new Map([[STATE_PATH,encodeDocument(settings,[])]])) {
  let clock={beat:0,ready:false};const commands=[];
  const p=createPilot({clock:()=>clock,read:k=>files.get(k),write:(k,v)=>{files.set(k,v);return true;},send:c=>commands.push(c)});p.init();
  return {p,commands,files,time:(beat,ready=true)=>clock={beat,ready},page:name=>p.changePage(PAGES.indexOf(name)-p.inspect().page)};
}
test('Bass Gesture records a separate C/E/G lane and survives owner release and reload',()=>{
  const h=setup({bassEnabled:true,bassGesture:true,bassVelocityMode:'pad'});
  h.p.record();h.time(0);h.p.pad(C[0],true,91);
  h.time(1);h.p.pad(C[2],true,72);
  h.time(2);h.p.pad(C[0],false);h.p.pad(C[4],true,65);
  h.time(3);h.p.pad(C[2],false);h.time(4);h.p.pad(C[4],false);
  const state=h.p.inspect();assert.equal(state.progression.filter(Boolean).length,1);
  assert.equal(state.progression[0].timing.steps,4);
  assert.deepEqual(state.bassProgression.filter(Boolean).map(e=>[e.note%12,e.steps,e.velocity]),[[0,1,91],[4,1,72],[7,2,65]]);
  assert.equal(state.settings.bassPlayback,'clip');h.p.unload();
  assert.deepEqual(setup({},h.files).p.inspect().bassProgression,state.bassProgression);
});
test('bass-only overdub preserves chords, selects roots, and ignores old/shifted releases',()=>{
  const h=setup({bassEnabled:true,bassVelocityMode:'pad',recordPart:'bass'});
  h.p.step(0,true,{shift:true});h.p.step(0,false);
  const chords=h.p.inspect().progression;h.p.record();const start=h.commands.length;
  h.time(0);h.p.pad(C[0],true,91);h.time(1);h.p.pad(C[2],true,74);
  h.time(2);h.p.pad(C[0],false);assert.ok(h.p.inspect().voices.some(([owner])=>owner===40));
  h.time(3);h.p.pad(C[2],false,0,{shift:true});h.p.record();
  assert.deepEqual(h.p.inspect().progression,chords);
  assert.deepEqual(h.p.inspect().bassProgression.filter(Boolean).map(e=>[e.note%12,e.steps,e.velocity]),[[0,1,91],[4,2,74]]);
  assert.ok(h.commands.slice(start).filter(c=>c.op==='on').every(c=>c.owner===40));
  assert.equal(h.p.inspect().voices.length,0);
  assert.equal(h.commands.find(c=>c.op==='record'&&c.enabled).record_part,2);
});
test('chord-only recording preserves bass events and suppresses live automatic bass',()=>{
  const files=new Map([[STATE_PATH,encodeDocument({bassEnabled:true,bassPlayback:'clip',recordPart:'chord'},[],[],[{note:36,steps:8,velocity:68}])]]);
  const h=setup({},files),bass=h.p.inspect().bassProgression;h.p.record();const start=h.commands.length;
  h.time(0);h.p.pad(C[3],true,83);h.time(4);h.p.pad(C[3],false);h.p.record();
  assert.deepEqual(h.p.inspect().bassProgression,bass);assert.equal(chordName(h.p.inspect().progression[0]),'F');
  assert.ok(h.commands.slice(start).filter(c=>c.op==='on').every(c=>c.owner!==40));
});
test('changing record part finalizes/disarms, persists choice but never armed state',()=>{
  const h=setup({bassEnabled:true});h.p.record();h.time(0);h.p.pad(C[0],true);h.time(2);
  h.page('SEQ');h.p.knob(7,2);assert.equal(h.p.inspect().recordArmed,false);
  assert.equal(h.p.inspect().progression[0].timing.steps,2);assert.equal(h.p.inspect().bassProgression[0].steps,2);
  assert.equal(h.p.inspect().voices.length,0);h.p.unload();
  const p=setup({},h.files).p;assert.equal(p.inspect().settings.recordPart,'bass');assert.equal(p.inspect().recordArmed,false);
});
test('Undo restores overwritten recording lanes and playback mode, including an active take',()=>{
  for(const part of ['both','chord','bass']) {
    const h=setup({bassEnabled:true,recordPart:part});h.p.step(0,true,{shift:true});h.p.step(0,false);
    const before=h.p.inspect();h.p.record();h.time(0);h.p.pad(C[3],true,72);h.time(3);
    if(part!=='bass'){h.p.pad(C[3],false);h.p.record();}
    h.p.undo();const after=h.p.inspect();
    assert.deepEqual(after.progression,before.progression);assert.deepEqual(after.bassProgression,before.bassProgression);
    assert.equal(after.settings.bassPlayback,before.settings.bassPlayback);
    assert.equal(after.armed,false);assert.equal(after.recordArmed,false);assert.equal(after.voices.length,0);
    assert.equal(after.canUndo,false);h.p.unload();
    const restored=setup({},h.files).p.inspect();assert.deepEqual(restored.progression,before.progression);
    assert.deepEqual(restored.bassProgression,before.bassProgression);
  }
});
test('Undo does not erase subsequent manual edits, and does not survive project reload',()=>{
  const h=setup();h.p.record();h.time(0);h.p.pad(C[0],true);h.time(2);h.p.pad(C[0],false);h.p.record();
  assert.equal(h.p.inspect().canUndo,true);h.p.step(4,true,{shift:true});h.p.step(4,false);
  const saved=h.p.inspect().progression;h.p.undo();assert.deepEqual(h.p.inspect().progression,saved);
  h.p.unload();assert.equal(setup({},h.files).p.inspect().canUndo,false);
});
test('page-sensitive steps address bass/chords and never audition chords during Record',()=>{
  const h=setup({bassEnabled:true,recordPart:'bass'});h.p.step(0,true,{shift:true});h.p.step(0,false);
  h.p.record();h.time(0);h.p.pad(C[2],true);h.time(2);h.p.pad(C[2],false);h.p.record();
  const chords=h.p.inspect().progression;
  h.page('BASS');h.p.step(0,true);assert.equal(h.p.inspect().model.pageName,'B.STP1');
  h.p.knob(0,1);h.p.step(0,false);assert.deepEqual(h.p.inspect().progression,chords);
  h.page('MELODY');const start=h.commands.length;h.p.step(0,true,{delete:true});h.p.step(0,false);
  assert.ok(!h.commands.slice(start).some(c=>c.op==='on'));assert.deepEqual(h.p.inspect().progression,chords);
  h.page('CHORDS');h.p.step(0,true);assert.equal(h.p.inspect().model.pageName,'C.STP1');h.p.step(0,false);
  h.p.record();
  for(const name of ['BASS','CHORDS','PLAY','SEQ','MELODY']) {
    h.page(name);const n=h.commands.length;h.p.step(0,true);h.p.step(0,false);
    assert.ok(!h.commands.slice(n).some(c=>c.op==='on'),name);
  }
});
test('step LEDs show the page lane, with no phantom chord cells on MELODY',()=>{
  const seed=setup();seed.p.step(0,true,{shift:true});let leds=[];
  const p=createPilot({read:()=>encodeDocument({},seed.p.inspect().progression,[],[null,{note:40,steps:1,velocity:80}]),leds:l=>leds=l});p.init();
  const go=name=>{p.changePage(PAGES.indexOf(name)-p.inspect().page);p.repaint();};
  go('BASS');assert.equal(leds.find(l=>l.note===16).role,'off');assert.equal(leds.find(l=>l.note===17).role,'stored');
  go('CHORDS');assert.equal(leds.find(l=>l.note===16).role,'stored');assert.equal(leds.find(l=>l.note===17).role,'off');
  go('MELODY');assert.ok(leds.filter(l=>l.note>=16&&l.note<=31).every(l=>l.role==='off'));
});
test('bass-only requires enabled bass and playback harmony still updates during take',()=>{
  const h=setup({recordPart:'bass'});h.p.record();assert.equal(h.p.inspect().recordArmed,false);
  h.page('BASS');h.p.knob(0,1);h.p.pad(C[3],true);h.p.step(4,true,{shift:true});h.p.pad(C[3],false);
  h.p.record();h.time(4);h.p.pad(C[0],true);
  h.p.tick({v:1,armed:true,running:true,slot:4,event:4,cycle:0});
  assert.equal(chordName(h.p.inspect().active.chord),'F');
  assert.ok(h.p.inspect().voices.some(([owner])=>owner===40));
  h.time(5);h.p.pad(C[0],false);h.p.pad(STOP_PAD,true);assert.equal(h.p.inspect().voices.length,0);
});
test('hold-step editor changes only selected lane and closes on matching release',()=>{
  const h=setup({bassEnabled:true,bassGesture:true});h.p.record();h.time(0);h.p.pad(C[0],true);
  h.time(2);h.p.pad(C[2],true);h.time(4);h.p.pad(C[0],false);h.p.pad(C[2],false);h.p.record();
  const bass=h.p.inspect().bassProgression;h.page('SEQ');h.p.step(0,true);
  assert.equal(h.p.inspect().model.pageName,'C.STP1');h.p.knob(0,2);h.p.knob(1,2);h.p.knob(2,1);h.p.knob(3,-10);
  assert.equal(h.p.inspect().progression[0].rootOffset,2);assert.equal(h.p.inspect().progression[0].timing.steps,5);
  assert.deepEqual(h.p.inspect().bassProgression,bass);
  h.p.step(1,false);assert.equal(h.p.inspect().stepEdit,0);
  h.p.step(0,false);assert.equal(h.p.inspect().model.pageName,'SEQ');h.p.knob(3,1);
  const chords=h.p.inspect().progression;h.p.step(2,true);assert.equal(h.p.inspect().model.pageName,'B.STP3');
  h.p.knob(0,1);h.p.knob(1,2);h.p.knob(2,-20);h.p.step(2,false);
  assert.deepEqual(h.p.inspect().progression,chords);
  assert.equal(h.p.inspect().bassProgression[2].note,bass[2].note+1);
  assert.equal(h.p.inspect().bassProgression[2].steps,4);
  h.p.step(2,true,{delete:true});assert.equal(h.p.inspect().bassProgression[2],null);
  assert.deepEqual(h.p.inspect().progression,chords);
});
test('legacy projects have no bass lane and use FOLLOW; clock loss closes both takes',()=>{
  const h=setup({bassEnabled:true});assert.equal(h.p.inspect().settings.bassPlayback,'follow');
  assert.ok(h.p.inspect().bassProgression.every(e=>e===null));
  h.p.record();h.time(0);h.p.pad(C[0],true,67);h.time(3);h.p.tick();h.time(NaN,false);h.p.tick();
  assert.equal(h.p.inspect().bassProgression[0].steps,3);
  assert.equal(h.p.inspect().progression[0].timing.steps,3);
});
test('record armed waits for clock then saves length/velocity, wraps, and persists unchanged',()=>{
  const h=setup();h.p.record();h.p.pad(C[0],true,91);h.p.pad(C[0],false);
  assert.ok(h.p.inspect().progression.every(c=>!c));
  h.time(15.1);h.p.pad(C[0],true,91);h.time(18.1);h.p.pad(C[0],false);
  const step=h.p.inspect().progression[15];
  assert.deepEqual(step.timing,{steps:3,velocity:91});assert.equal(chordName(step),'C');
  assert.equal(h.commands.findLast(c=>c.op==='slot'&&c.index===15).duration,3);
  h.p.record();h.p.unload();const restored=setup({},h.files);
  assert.deepEqual(restored.p.inspect().progression[15],step);assert.equal(restored.p.inspect().recordArmed,false);
});
test('new chord press closes previous recording; late release never ends the new chord',()=>{
  const h=setup();h.p.record();h.time(0);h.p.pad(C[0],true,100);
  h.time(4);h.p.pad(C[3],true,50);h.time(5);h.p.pad(C[0],false);
  assert.equal(h.p.inspect().progression[0].timing.steps,4);
  assert.equal(h.p.inspect().progression[4],null);
  h.time(6);h.p.pad(C[3],false);assert.deepEqual(h.p.inspect().progression[4].timing,{steps:2,velocity:50});
});
test('recorded span overwrites only its covered cells; STOP finalizes safely and disarms',()=>{
  const h=setup();for(const i of [0,1,2,8])h.p.step(i,true,{shift:true});
  h.p.record();h.time(0);h.p.pad(C[3],true,80);h.time(3);h.p.pad(STOP_PAD,true);
  const a=h.p.inspect();assert.equal(chordName(a.progression[0]),'F');
  assert.equal(a.progression[0].timing.steps,3);assert.equal(a.progression[1],null);assert.equal(a.progression[2],null);
  assert.equal(chordName(a.progression[8]),'C');assert.equal(a.recordArmed,false);assert.equal(a.voices.length,0);
});
test('bass gesture selectors do not create chord attacks or close a take until all pads release',()=>{
  const h=setup({bassEnabled:true,bassGesture:true});h.p.record();h.time(0);h.p.pad(C[0],true);
  h.time(1);h.p.pad(C[2],true);h.time(2);h.p.pad(C[0],false);
  assert.ok(h.p.inspect().progression.every(c=>!c));h.time(4);h.p.pad(C[2],false);
  assert.equal(h.p.inspect().progression[0].timing.steps,4);
});
test('LEN changes selected event and normalization bounds lengths without altering old snapshots',()=>{
  const h=setup();h.p.step(0,true,{shift:true});const old=h.p.inspect().progression[0];assert.equal(old.timing,undefined);
  h.page('SEQ');h.p.step(0,true);h.p.knob(2,3);h.p.step(0,false);assert.equal(h.p.inspect().progression[0].timing.steps,4);
  assert.deepEqual(h.p.inspect().progression[0].snapshot,old.snapshot);
  assert.equal(normalizeStep({...old,timing:{steps:999,velocity:-1}}).timing.steps,16);
});
test('park, unload and rate changes finalize pending takes and disarm Record',()=>{
  for(const action of ['park','unload','rate']) {
    const h=setup();h.p.record();h.time(0);h.p.pad(C[0],true,71);h.time(3);
    if(action==='park')h.p.tick(null,true);
    else if(action==='unload')h.p.unload();
    else {h.page('SEQ');h.p.knob(1,1);}
    assert.equal(h.p.inspect().recordArmed,false);
    assert.deepEqual(h.p.inspect().progression[0].timing,{steps:3,velocity:71});
    assert.equal(h.commands.filter(c=>c.op==='record').at(-1).enabled,0);
  }
});
test('long events do not revoice held melody at every continuation step',()=>{
  const h=setup({melodyMode:'chord',melodySustain:'hold'});h.p.step(0,true,{shift:true});h.page('SEQ');h.p.step(0,true);h.p.knob(2,3);h.p.step(0,false);h.p.panic();
  h.p.tick({v:1,armed:true,running:true,slot:0,event:0,cycle:0});h.p.pad(72,true);h.p.pad(72,false);
  const n=h.commands.length;h.p.tick({v:1,armed:true,running:true,slot:1,event:0,cycle:0});
  assert.equal(h.commands.length,n);assert.ok(h.p.inspect().voices.some(([owner])=>owner===8));
});
test('project switch saves the pending take only to the outgoing project and never restores REC armed',()=>{
  const files=new Map([[ACTIVE_SET_PATH,'set-A\nFirst']]);let now=0,beat=0;
  const p=createProjectPilot({read:k=>files.get(k),write:(k,v)=>{files.set(k,v);return true;},
    now:()=>now,ensureDir:()=>true,clock:()=>({beat,ready:true})});p.init();p.record();p.pad(C[0],true,69);
  beat=3;now=1000;files.set(ACTIVE_SET_PATH,'set-B\nSecond');p.tick();
  assert.equal(p.inspect().recordArmed,false);assert.ok(p.inspect().progression.every(c=>!c));
  now=2000;files.set(ACTIVE_SET_PATH,'set-A\nFirst');p.tick();
  assert.deepEqual(p.inspect().progression[0].timing,{steps:3,velocity:69});assert.equal(p.inspect().recordArmed,false);
});
