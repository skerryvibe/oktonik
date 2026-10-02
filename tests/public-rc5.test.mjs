import test from 'node:test';
import assert from 'node:assert/strict';
import {createPilot,CHORD_PADS as C} from '../src/pilot.mjs';
import {decodeDocument} from '../src/settings.mjs';
test('Public has no Shift menus; melody aftertouch is on main knob 6',()=>{
  let saved;const p=createPilot({profile:'public',write:(_,s)=>{saved=s;return true;}});p.init();
  p.shift(true);assert.equal(p.inspect().model.pageName,'PLAY');
  assert.ok(!p.inspect().model.cells.some(c=>c.id==='divisi'));
  p.knob(6,2);p.shift(false);
  p.changePage(1);p.shift(true);assert.equal(p.inspect().model.pageName,'CHORD');p.shift(false);
  p.changePage(1);p.shift(true);assert.equal(p.inspect().model.pageName,'MELODY');p.knob(5,1);p.shift(false);
  for(const name of ['BASS','MIDI']) {
    p.changePage(1);p.shift(true);assert.equal(p.inspect().model.pageName,name);assert.equal(p.inspect().model.extraLayer,false);p.shift(false);
  }
  p.unload();const state=decodeDocument(JSON.parse(saved));
  assert.equal(state.settings.strumMs,10);
  assert.equal(state.settings.strumDirection,0);assert.equal(state.settings.strumTiming,0);
  assert.equal(state.settings.strumVelocity,0);assert.equal(state.settings.melodyAftertouch,true);
});
test('Public signed INV restores AUTO and PLAY footer keeps active harmony',()=>{
  const p=createPilot({profile:'public',write:()=>true});p.init();
  p.selectEdit(0);p.knob(3,-1);assert.equal(p.inspect().bank[0].inversion,-1);
  p.knob(3,1);assert.equal(p.inspect().model.cells[3].value,'AUTO');assert.equal(p.inspect().bank[0].lockInversion,false);
  p.selectEdit(-1);p.pad(C[1],true);
  for(let i=0;i<100;i++)p.tick();
  const m=p.inspect().model;assert.equal(m.detail,`${m.chordLabel} | ${m.degreeLabel}`);
  assert.ok(!m.detail.includes('chord roots'));
});
