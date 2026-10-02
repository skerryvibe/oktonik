import test from 'node:test';
import {navigate} from './navigate.mjs';
import assert from 'node:assert/strict';
import {createPilot,MELODY_PADS as M,CHORD_PADS as C,PAGES} from '../src/pilot.mjs';
import {STATE_PATH,encodeDocument,normalizeSettings} from '../src/settings.mjs';
function setup(settings={},profile='lab') {
  const commands=[];let saved;
  const p=createPilot({profile,read:path=>path===STATE_PATH?encodeDocument({melodyAftertouch:true,...settings},[]):null,
    write:(_path,s)=>{saved=s;return true;},send:c=>commands.push(c)});p.init();
  return {p,commands,saved:()=>saved,page:n=>navigate(p,n),
    pressures:()=>commands.filter(c=>c.op==='pressure')};
}
test('logical melody pressure is opt-in, bounded and coalesced until tick',()=>{
  assert.equal(normalizeSettings({}).melodyAftertouch,false);
  const h=setup();h.p.pressure(0,50);h.p.tick();assert.equal(h.pressures().length,0);
  h.p.pad(M[0],true);for(const v of [1,45,99])h.p.pressure(0,v);
  assert.equal(h.pressures().length,0);h.p.tick();
  assert.deepEqual(h.pressures(),[{op:'pressure',owner:8,pressure:99}]);
  for(const [i,v] of [[-1,5],[16,5],[0,128],[0,-1],[0,NaN],[0,1.5]])h.p.pressure(i,v);
  h.p.tick();assert.equal(h.pressures().length,1);
  h.p.pressure(0,0);h.p.tick();assert.equal(h.pressures().at(-1).pressure,0);
  const off=setup({melodyAftertouch:false});off.p.pad(M[0],true);off.p.pressure(0,90);off.p.tick();assert.equal(off.pressures().length,0);
});
test('pressure follows the owned voice across harmony and octave changes, never raw pad pitch',()=>{
  const h=setup({melodyMode:'chord',melodyFollow:'pad'});h.p.pad(M[1],true);h.p.pressure(1,75);h.p.tick();
  h.p.pad(C[1],true);h.p.tick();
  assert.equal(h.pressures().at(-1).owner,9);assert.equal(h.pressures().at(-1).pressure,75);
  const lastOn=h.commands.filter(c=>c.op==='on'&&c.owner===9).at(-1);
  assert.deepEqual(lastOn.notes,h.p.inspect().voices.find(([owner])=>owner===9)[1].notes);
  assert.ok(!('notes' in h.pressures().at(-1)));
  h.page('MELODY');h.p.knob(1,1);h.p.tick();assert.equal(h.pressures().at(-1).pressure,75);
});
test('release clears pressure with off, hold and pedal; late messages cannot revive it',()=>{
  for(const melodySustain of ['off','hold','pedal']) {
    const h=setup({melodySustain});h.p.pad(M[0],true);h.p.pressure(0,88);h.p.tick();
    h.p.pad(M[0],false);assert.equal(h.pressures().at(-1).pressure,0);
    const n=h.pressures().length;h.p.pressure(0,99);h.p.tick();assert.equal(h.pressures().length,n);
  }
});
test('disable is silent except pressure reset; toggle saves without a schema bump',()=>{
  const h=setup();h.p.pad(M[0],true);h.p.pressure(0,70);h.p.tick();h.page('M.EXTRA');
  const start=h.commands.length;h.p.knob(1,-1);
  assert.deepEqual(h.commands.slice(start),[{op:'pressure',owner:8,pressure:0}]);
  assert.equal(h.p.inspect().model.cells[1].value,'OFF');
  h.p.knob(1,1);h.p.tick();assert.equal(h.pressures().at(-1).pressure,0);
  h.p.unload();assert.equal(JSON.parse(h.saved()).schemaVersion,7);
  assert.match(h.saved(),/"melodyAftertouch":true/);
});
test('STOP, park and route changes discard queued pressure; Public is opt-in too',()=>{
  for(const action of [h=>h.p.panic(),h=>h.p.tick(null,true),h=>{h.page('MIDI');h.p.knob(3,1);}]) {
    const h=setup();h.p.pad(M[0],true);h.p.pressure(0,100);action(h);h.p.tick();
    assert.equal(h.pressures().length,0);
  }
  const h=setup({melodyAftertouch:false},'public');h.p.pad(M[0],true);h.p.pressure(0,100);h.p.tick();assert.equal(h.pressures().length,0);
  const enabled=setup({},'public');enabled.p.pad(M[0],true);enabled.p.pressure(0,100);enabled.p.tick();assert.equal(enabled.pressures().at(-1).pressure,100);
});
