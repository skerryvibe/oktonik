import test from 'node:test';
import {navigate} from './navigate.mjs';
import assert from 'node:assert/strict';
import {createPilot,PAGES,CHORD_PADS as C} from '../src/pilot.mjs';
import {STATE_PATH,encodeDocument,normalizeSettings,normalizeStep} from '../src/settings.mjs';
function setup(files=new Map()) {
  const commands=[];const p=createPilot({read:k=>files.get(k),write:(k,v)=>{files.set(k,v);return true;},send:c=>commands.push(c)});p.init();
  const page=name=>navigate(p,name);
  return {p,commands,files,page};
}
test('CHORDS has a STRUM gap shortcut; advanced STRUM settings affect only next attacks',()=>{
  const h=setup(new Map([[STATE_PATH,encodeDocument({bassEnabled:true,bassVelocityMode:'pad'},[])]]));
  h.p.pad(C[0],true,90);const voices=h.p.inspect().voices;
  h.page('CHORDS');assert.equal(h.p.inspect().model.pageName,'CHORDS');
  assert.equal(h.p.inspect().model.cells[6].id,'strumMs');h.page('STRUM');
  const before=h.commands.length;
  [4,3,30,20].forEach((delta,i)=>h.p.knob(i,delta));
  assert.deepEqual(h.p.inspect().voices,voices);assert.equal(h.commands.length,before);
  h.p.pad(C[0],false);h.p.pad(C[1],true,80);
  const chord=h.commands.findLast(c=>c.op==='on'&&c.owner===1);
  assert.deepEqual([chord.strum_ms,chord.strum_dir,chord.strum_time,chord.strum_vel],[20,3,30,20]);
  h.p.pad(72,true,70);
  const melody=h.commands.findLast(c=>c.op==='on'&&c.owner===8);
  assert.deepEqual([melody.strum_ms,melody.strum_dir,melody.strum_time,melody.strum_vel],[0,0,0,0]);
});
test('saved strum parameters survive global edits and project reload',()=>{
  const h=setup();h.page('STRUM');[6,2,40,50].forEach((d,i)=>h.p.knob(i,d));
  h.p.pad(C[0],true);h.p.step(0,true,{shift:true});
  const saved=structuredClone(h.p.inspect().progression[0].snapshot);
  h.p.knob(1,1);h.p.knob(2,-40);h.p.knob(3,-50);
  h.p.step(0,true);
  const on=h.commands.findLast(c=>c.op==='on'&&c.strum_ms===30);
  assert.deepEqual([on.strum_dir,on.strum_time,on.strum_vel],[2,40,50]);
  h.p.unload();const restored=setup(h.files);
  assert.deepEqual(restored.p.inspect().progression[0].snapshot,saved);
  assert.equal(restored.p.inspect().settings.strumDirection,3);
  const slot=restored.commands.find(c=>c.op==='slot'&&c.index===0);
  assert.deepEqual([slot.strum_dir,slot.strum_time,slot.strum_vel],[2,40,50]);
});
test('old settings and snapshots retain straight ascending strums; new parameters are bounded',()=>{
  const s=normalizeSettings({strumMs:20});
  assert.deepEqual([s.strumDirection,s.strumTiming,s.strumVelocity],[0,0,0]);
  const bad=normalizeSettings({strumDirection:99,strumTiming:-1,strumVelocity:999});
  assert.deepEqual([bad.strumDirection,bad.strumTiming,bad.strumVelocity],[3,0,100]);
  const old=normalizeStep({rootOffset:0,intervals:[0,4,7],snapshot:{notes:[48,52,55],key:0,bass:36,strumMs:15}});
  assert.deepEqual([old.snapshot.strumDirection,old.snapshot.strumTiming,old.snapshot.strumVelocity],[0,0,0]);
});
