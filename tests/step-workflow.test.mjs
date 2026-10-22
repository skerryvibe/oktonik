import test from 'node:test';
import assert from 'node:assert/strict';
import {createPilot,CHORD_PADS,MELODY_PADS,STEP_OWNER_START,PAGES} from '../src/pilot.mjs';
import {encodeDocument,STATE_PATH} from '../src/settings.mjs';
function setup() {
 let ready=true;const commands=[];
 const text=encodeDocument({bassEnabled:true,bassVelocityMode:'pad',bassSustain:'hold',melodySustain:'hold',chordSustain:'hold',bassRoute:'external',bassChannel:3,melodyRoute:'schwung',melodyChannel:5},[],[],[{note:36,velocity:64,steps:1}],[{note:72,velocity:83,steps:1}]);
 const p=createPilot({read:k=>k===STATE_PATH?text:null,write:()=>true,clock:()=>({ready,beat:0}),send:c=>{commands.push(c);return true;}});p.init();
 return {p,commands,stopClock:()=>ready=false};
}
test('stopped Move clock unlocks clip edits even while SEQ remains armed',()=>{
 const h=setup();h.p.menu();h.p.arm(true);h.p.knob(0,1);assert.equal(h.p.inspect().progression.length,16);
 h.stopClock();h.p.knob(0,1);h.p.knob(1,1);h.p.knob(2,-20);
 const c=h.p.inspect().clips.parts.chord.clips[0];assert.equal(c.length,32);assert.equal(c.rate,3);assert.equal(c.quantize,80);assert.equal(h.p.inspect().armed,true);
});
test('bass and melody steps audition saved pitch, velocity and route in part and clip views; release never holds',()=>{
 for(const clips of [false,true])for(const [track,part,note,velocity,route,channel] of [[1,'bass',36,64,1,3],[2,'melody',72,83,3,5]]){
  const h=setup();if(clips)h.p.menu();h.p.track(track);const n=h.commands.length;
  h.p.step(0,true);const on=h.commands.slice(n).filter(c=>c.op==='on');assert.equal(on.length,1);
  assert.deepEqual(on[0].notes,[note]);assert.equal(on[0].velocity,velocity);assert.equal(on[0].route,route);assert.equal(on[0].channel,channel);
  h.p.step(0,false);assert.ok(h.commands.some(c=>c.op==='off'&&c.owner===STEP_OWNER_START));
  assert.ok(!h.p.inspect().voices.some(([o])=>o===STEP_OWNER_START));
  assert.ok(!h.commands.slice(n).some(c=>c.op==='hold'));
 }
});
test('Shift steps remember released bass/melody pads and target only the edited clip',()=>{
 const h=setup();h.p.pad(CHORD_PADS[0],true,79);h.p.pad(CHORD_PADS[0],false);
 h.p.pad(MELODY_PADS[1],true,92);const pitch=h.commands.findLast(c=>c.op==='on'&&c.owner===9).notes[0];h.p.pad(MELODY_PADS[1],false);
 h.p.track(1);h.p.step(3,true,{shift:true});h.p.step(3,false);assert.equal(h.p.inspect().bassProgression[3].velocity,79);
 h.p.track(2);h.p.step(3,true,{shift:true});h.p.step(3,false);assert.equal(h.p.inspect().melodyProgression[3].note,pitch);
 h.p.menu();h.p.pad(77,true,100,{shift:true});h.p.pad(77,false);h.p.step(4,true,{shift:true});h.p.step(4,false);
 assert.equal(h.p.inspect().melodyProgression[4],null);assert.equal(h.p.inspect().clips.parts.melody.clips[1].events[4].note,pitch);
 h.p.step(4,true,{delete:true});h.p.step(4,false);assert.equal(h.p.inspect().clips.parts.melody.clips[1].events[4],null);
});
test('chord steps audition only chords, without new bass or ARP source, in both views',()=>{
 for(const clips of [false,true]){
  const h=setup();h.p.pad(CHORD_PADS[0],true);h.p.step(0,true,{shift:true});h.p.step(0,false);h.p.pad(CHORD_PADS[0],false);h.p.panic();
  if(clips)h.p.menu();else h.p.track(0);const n=h.commands.length;h.p.step(0,true);
  assert.ok(h.commands.slice(n).some(c=>c.op==='on'&&c.owner===24));assert.ok(!h.commands.slice(n).some(c=>c.op==='on'&&c.owner===40));
  assert.ok(!h.commands.slice(n).some(c=>c.op==='arpsrc'&&c.notes.length));
  h.p.step(0,false);assert.equal(h.p.inspect().voices.length,0);
 }
});
test('NOTE editing releases old audition and immediately plays new pitch on the same part route',()=>{
 for(const clipView of [false,true])for(const [track,base,route,channel] of [[1,36,1,3],[2,72,3,5]]){
  const h=setup();if(clipView)h.p.menu();h.p.track(track);h.p.step(0,true);
  const n=h.commands.length;h.p.knob(0,1);
  const updates=h.commands.slice(n),off=updates.findIndex(c=>c.op==='off'&&c.owner===24),on=updates.findIndex(c=>c.op==='on'&&c.owner===24);
  assert.ok(off>=0&&on>off);assert.deepEqual(updates[on].notes,[base+1]);assert.equal(updates[on].route,route);assert.equal(updates[on].channel,channel);
  h.p.knob(0,-1);assert.deepEqual(h.commands.findLast(c=>c.op==='on'&&c.owner===24).notes,[base]);
  h.p.step(0,false);assert.ok(!h.p.inspect().voices.some(([o])=>o===24));
  const released=h.commands.length;h.p.knob(0,1);assert.ok(!h.commands.slice(released).some(c=>c.op==='on'&&c.owner===24));
 }
});
