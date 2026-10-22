import test from 'node:test';
import assert from 'node:assert/strict';
import {createPilot,CHORD_PADS as C,MELODY_PADS as M,LIVE_BASS_OWNER as B,STEP_OWNER_START as S} from '../src/pilot.mjs';
import {encodeDocument,STATE_PATH} from '../src/settings.mjs';
function setup(){let saved=encodeDocument({bassEnabled:true,bassVelocityMode:'pad',bassSustain:'off',strumMs:10},[],[]),beat=0;const commands=[];
 const io={read:k=>k===STATE_PATH?saved:null,write:(k,v)=>{saved=v;return true;},send:c=>{commands.push(c);return true;},clock:()=>({ready:true,beat})};
const p=createPilot(io);p.init();return {p,commands,io,time:v=>beat=v};}
test('plain empty step 13 stores each part; occupied steps open editors and signed INV persists',()=>{
 const {p,io}=setup();p.pad(C[0],true);p.pad(C[0],false);p.step(12,true);p.step(12,false);
 assert.ok(p.inspect().progression[12]);p.step(12,true);assert.equal(p.inspect().model.cells[4].value,'ROOT');
 p.knob(4,-1);assert.equal(p.inspect().model.cells[4].value,'-1');p.knob(4,1);assert.equal(p.inspect().model.cells[4].value,'ROOT');
 p.knob(4,2);assert.equal(p.inspect().model.cells[4].value,'+2');p.step(12,false);
 p.track(1);p.pad(C[2],true);p.pad(C[2],false);p.step(12,true);p.step(12,false);assert.ok(p.inspect().bassProgression[12]);
 p.track(2);p.pad(M[0],true);p.pad(M[0],false);p.step(12,true);p.step(12,false);assert.ok(p.inspect().melodyProgression[12]);
 p.unload();const again=createPilot(io);again.init();again.step(12,true);assert.equal(again.inspect().model.cells[4].value,'+2');
});
test('step strum is independent, survives SAVED extension and reload, and reaches DSP/audition',()=>{
 const h=setup(),{p}=h;p.pad(C[0],true);p.step(0,true,{shift:true});p.step(0,false);p.pad(C[0],false);p.track(0);p.step(0,true);
 const notes=p.inspect().progression[0].snapshot.notes;
 assert.equal(p.inspect().model.cells[5].id,'eventStrum');p.knob(5,4);
 assert.equal(p.inspect().settings.strumMs,10);assert.equal(p.inspect().progression[0].snapshot.strumMs,30);
 assert.equal(h.commands.findLast(c=>c.op==='slot'&&c.index===0).strum_ms,30);
 p.knob(1,1);p.knob(1,-1);assert.equal(p.inspect().progression[0].snapshot.strumMs,30);
 assert.deepEqual(p.inspect().progression[0].snapshot.notes,notes);
 p.knob(5,63);assert.equal(p.inspect().progression[0].snapshot.strumMs,100);
 p.knob(5,-63);assert.equal(p.inspect().progression[0].snapshot.strumMs,0);p.knob(5,6);
 p.step(0,false);p.step(0,true);assert.equal(h.commands.findLast(c=>c.op==='on'&&c.owner===S).strum_ms,30);
 p.step(0,false);p.unload();const again=createPilot(h.io);again.init();assert.equal(again.inspect().progression[0].snapshot.strumMs,30);
});
test('bass track pads audition bass alone and releases never select chords, including after changing track',()=>{
 for(const order of [[0,2],[2,0]]){
  const {p,commands}=setup();p.track(1);p.browse(1);const n=commands.length;
  p.pad(C[0],true,57);p.pad(C[2],true,82);
  const on=commands.slice(n).filter(c=>c.op==='on');assert.equal(on.length,2);assert.ok(on.every(c=>c.owner===B));assert.equal(on[1].velocity,82);
  assert.equal(p.inspect().active.index,0);p.track(0);const start=commands.length;
  for(const i of order)p.pad(C[i],false);
  assert.ok(!commands.slice(start).some(c=>c.op==='on'));assert.ok(!p.inspect().voices.some(([o])=>o===B));
  p.pad(C[2],true);assert.ok(commands.slice(start).some(c=>c.op==='on'&&c.owner===2));
 }
});
test('bass-only recording captures bass without changing chord clip',()=>{
 const h=setup(),{p}=h;p.pad(C[0],true);p.step(0,true,{shift:true});p.step(0,false);p.pad(C[0],false);
 const chords=structuredClone(p.inspect().progression);p.track(1);p.recordContext();const n=h.commands.length;
 h.time(0);p.pad(C[0],true,67);h.time(.8);p.pad(C[0],false);h.time(1);p.pad(C[2],true,89);h.time(1.8);p.pad(C[2],false);p.recordContext();
 assert.deepEqual(p.inspect().progression,chords);assert.ok(p.inspect().bassProgression.filter(Boolean).length>=2);
 assert.ok(h.commands.slice(n).filter(c=>c.op==='on').every(c=>c.owner===B));
});
test('entering bass track while holding a chord does not strand its follow-bass on release',()=>{
 const {p,commands}=setup();p.pad(C[0],true);assert.ok(p.inspect().voices.some(([o])=>o===B));
 p.track(1);const start=commands.length;p.pad(C[0],false);
 assert.ok(!p.inspect().voices.some(([o])=>o===B));assert.ok(!commands.slice(start).some(c=>c.op==='on'));
});
