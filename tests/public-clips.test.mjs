import test from 'node:test';
import assert from 'node:assert/strict';
import {createPilot,CHORD_PADS as C,MELODY_PADS as M} from '../src/pilot.mjs';
import {encodeDocument,STATE_PATH} from '../src/settings.mjs';
import {globalStatePath} from '../src/profile.mjs';

function setup(profile, files=new Map()) {
 const path=globalStatePath(profile);
 if(!files.has(path))files.set(path,encodeDocument({bassEnabled:true,bassGesture:true,bassVelocityMode:'pad'},[]));
 let beat=0;const commands=[];
 const p=createPilot({profile,read:k=>files.get(k===STATE_PATH?path:k),write:(k,v)=>{files.set(k===STATE_PATH?path:k,v);return true;},
  clock:()=>({beat,ready:true}),send:c=>commands.push(c)});p.init();
 return {p,commands,files,time:b=>beat=b};
}
for(const profile of ['public','lab']) {
 test(`${profile}: ALL records chord, gesture bass and melody, freezes harmony and reloads`,()=>{
  const h=setup(profile);h.p.recordContext();assert.equal(h.p.inspect().model.recordTarget,'all');
  h.p.pad(C[0],true,91);h.p.pad(M[0],true,74);
  h.time(1);h.p.pad(C[2],true,66);h.p.pad(M[0],false);
  h.time(2);h.p.pad(C[0],false);h.p.pad(C[2],false);h.p.recordContext();
  const state=h.p.inspect();
  assert.equal(state.progression.filter(Boolean).length,1);
  assert.deepEqual(state.bassProgression.filter(Boolean).map(e=>[e.note%12,e.velocity]),[[0,91],[4,66]]);
  assert.equal(state.melodyProgression.filter(Boolean).length,1);
  const frozen=state.progression[0].snapshot;
  h.p.knob(4,1);h.p.knob(5,1);assert.deepEqual(h.p.inspect().progression[0].snapshot,frozen);
  h.p.unload();const restored=setup(profile,h.files);
  for(const lane of ['progression','bassProgression','melodyProgression'])assert.deepEqual(restored.p.inspect()[lane],state[lane]);
  assert.equal(restored.p.inspect().recordArmed,false);
  for(const op of ['slot','bassslot','melodyslot'])assert.ok(restored.commands.some(c=>c.op===op&&c.notes.length));
 });
 test(`${profile}: melody overdub and Undo preserve other lanes`,()=>{
  const h=setup(profile);h.p.pad(C[0],true);h.p.pad(C[0],false);h.p.step(0,true);h.p.step(0,false);
  const before=h.p.inspect();h.p.track(2);h.p.recordContext();
  assert.equal(h.p.inspect().model.recordTarget,'melody');
  h.p.pad(M[1],true,88);h.time(1);h.p.pad(M[1],false);h.p.recordContext();
  assert.ok(h.p.inspect().melodyProgression.some(Boolean));
  assert.deepEqual(h.p.inspect().progression,before.progression);
  assert.deepEqual(h.p.inspect().bassProgression,before.bassProgression);
  h.p.undo();assert.deepEqual(h.p.inspect().melodyProgression,before.melodyProgression);
  assert.deepEqual(h.p.inspect().progression,before.progression);
 });
 test(`${profile}: clips copy independently, deletion is undoable, length survives reload`,()=>{
  const h=setup(profile),press=(n,m={})=>{h.p.pad(n,true,100,m);h.p.pad(n,false);};
  press(C[0]);h.p.step(0,true);h.p.step(0,false);
  const original=h.p.inspect().progression[0];h.p.menu();
  press(92,{copy:true});press(93,{copy:true});h.p.copyHeld(false);
  assert.deepEqual(h.p.inspect().clips.parts.chord.clips[1].events[0],original);
  press(92,{delete:true});assert.equal(h.p.inspect().progression[0],null);
  assert.deepEqual(h.p.inspect().clips.parts.chord.clips[1].events[0],original);
  h.p.undo();assert.deepEqual(h.p.inspect().progression[0],original);
  h.p.knob(0,1);h.p.knob(0,1);assert.equal(h.p.inspect().clips.parts.chord.clips[0].length,64);
  h.p.knob(0,-1);assert.equal(h.p.inspect().clips.parts.chord.clips[0].length,32);
  h.p.unload();assert.equal(setup(profile,h.files).p.inspect().clips.parts.chord.clips[0].length,32);
 });
}
