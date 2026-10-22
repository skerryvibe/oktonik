import test from 'node:test';
import assert from 'node:assert/strict';
import {createPilot,PAGES,MELODY_PADS as M,CHORD_PADS as C} from '../src/pilot.mjs';
import {encodeDocument,STATE_PATH} from '../src/settings.mjs';
function setup(files=new Map([[STATE_PATH,encodeDocument({recordPart:'melody',melodyMode:'scale'},[])]])) {
 let beat=0,ready=true;const commands=[];
 const p=createPilot({read:k=>files.get(k),write:(k,v)=>{files.set(k,v);return true;},clock:()=>({beat,ready}),send:c=>commands.push(c)});p.init();
 return {p,files,commands,time:(b,r=true)=>{beat=b;ready=r;},page:n=>p.changePage(PAGES.indexOf(n)-p.inspect().page)};
}
test('polyphonic melody recording preserves pitch/velocity/duration independently and reloads',()=>{
 const h=setup();h.p.step(0,true,{shift:true});const chords=h.p.inspect().progression;
 h.p.record();h.p.pad(M[0],true,71);h.time(.5);h.p.pad(M[1],true,92);
 const pitches=h.p.inspect().voices.filter(([o])=>o===8||o===9).map(([,v])=>v.notes[0]);
 h.time(1);h.p.pad(M[1],false);h.time(2);h.p.pad(M[0],false);h.p.record();
 const events=h.p.inspect().melodyProgression[0];assert.equal(events.note,pitches[1]);assert.equal(events.more[0].note,pitches[0]);
 assert.equal(events.velocity,92);assert.equal(events.performance.duration,.5);assert.equal(events.more[0].performance.duration,2);
 assert.deepEqual(h.p.inspect().progression,chords);
 const melody=h.p.inspect().melodyProgression;h.p.pad(C[3],true);assert.deepEqual(h.p.inspect().melodyProgression,melody);
 h.p.unload();const restored=setup(h.files);assert.deepEqual(restored.p.inspect().melodyProgression,melody);
 assert.ok(restored.commands.some(c=>c.op==='melodyslot'&&c.notes[0]===pitches[0]));
});
test('melody step editor, deletion and Undo stay in their lane',()=>{
 const h=setup();h.p.record();h.p.pad(M[0],true);h.time(1);h.p.pad(M[0],false);h.p.record();
 h.p.undo();assert.ok(h.p.inspect().melodyProgression.every(v=>!v));
 h.time(2);h.p.record();h.p.pad(M[1],true,80);h.time(3);h.p.pad(M[1],false);h.p.record();
 h.page('MELODY');h.p.step(2,true);assert.equal(h.p.inspect().model.pageName,'M.STP3');
 const pitch=h.p.inspect().melodyProgression[2].note;h.p.knob(0,1);h.p.knob(1,1);h.p.knob(2,-10);h.p.knob(3,-5);
 const event=h.p.inspect().melodyProgression[2];assert.equal(event.note,pitch+1);assert.equal(event.steps,2);assert.equal(event.velocity,70);assert.equal(event.performance.nudge,-.05);
 h.p.step(2,false);h.p.step(2,true,{delete:true});assert.equal(h.p.inspect().melodyProgression[2],null);
});
test('clock loss finalizes every held melody owner and route config matches live melody',()=>{
 const h=setup();h.p.record();h.p.pad(M[0],true);h.p.pad(M[2],true);h.time(1);h.p.tick();h.time(1,false);h.p.tick();
 h.p.record();assert.equal(h.p.inspect().melodyProgression[0].more.length,1);
 assert.ok(h.commands.some(c=>c.op==='melodyconfig'&&c.channel===h.p.inspect().settings.melodyChannel));
});
