import test from 'node:test';
import assert from 'node:assert/strict';
import {createPilot,PAGES,CHORD_PADS as C} from '../src/pilot.mjs';
import {chordName} from '../src/theory.mjs';
function setup(){const commands=[],leds=[];const p=createPilot({send:c=>commands.push(c),leds:v=>leds.push(v),write:()=>true});p.init();return {p,commands,leds};}
test('empty grid arms and displays all sixteen running positions',()=>{
  const {p,commands,leds}=setup();p.play();assert.equal(p.inspect().armed,true);
  assert.ok(commands.some(c=>c.op==='arm'&&c.enabled===1));
  for(let slot=0;slot<16;slot++) {
    p.tick({v:1,running:true,slot,cycle:0});p.repaint();
    assert.equal(leds.at(-1).find(l=>l.note===16+slot).role,'held');
  }
  assert.ok(p.inspect().progression.every(c=>!c));
});
test('SEQ hold chord plus step places/replaces without changing other slots or live voices',()=>{
  const {p}=setup();p.changePage(PAGES.indexOf('SEQ'));p.pad(C[0],true);
  const voices=structuredClone(p.inspect().voices);
  p.step(0,true);p.step(8,true);p.step(15,true);
  assert.deepEqual(p.inspect().voices,voices);
  assert.deepEqual(p.inspect().progression.map((c,i)=>c?i:null).filter(i=>i!==null),[0,8,15]);
  p.pad(C[0],false);p.pad(C[3],true);p.step(8,true);p.pad(C[3],false);
  assert.equal(chordName(p.inspect().progression[0]),'C');assert.equal(chordName(p.inspect().progression[8]),'F');
  p.step(8,true,{delete:true});assert.equal(p.inspect().progression[8],null);
  assert.equal(chordName(p.inspect().progression[15]),'C');
});
test('step placement uses the held chord even if the transport updates active harmony',()=>{
  const {p}=setup();p.pad(C[3],true);p.step(0,true,{shift:true});p.pad(C[3],false);
  p.changePage(PAGES.indexOf('SEQ'));p.pad(C[0],true);
  p.tick({v:1,running:true,slot:0,cycle:0});assert.equal(chordName(p.inspect().active.chord),'F');
  p.step(4,true);assert.equal(chordName(p.inspect().progression[4]),'C');
  assert.deepEqual(p.inspect().progression[4].snapshot.notes,[48,52,55]);
});
