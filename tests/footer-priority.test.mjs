import test from 'node:test';
import {navigate} from './navigate.mjs';
import assert from 'node:assert/strict';
import {createPilot,PAGES} from '../src/pilot.mjs';
import {encodeDocument} from '../src/settings.mjs';
import {renderScreen} from '../src/display.mjs';

function setup() {
  const p=createPilot({read:()=>encodeDocument({chordSustain:'pedal',previewRoute:'both',
    melodyRoute:'external',melodyChannel:0,bassEnabled:true,bassChannel:3,arpClock:'free'},[]),write:()=>true});p.init();
  const page=name=>navigate(p,name);
  const settle=()=>{for(let i=0;i<70;i++)p.tick();};
  return {p,page,settle};
}
function footer(model) {
  const texts=[]; const draw={clear(){},line(){},rect(){},fill(){},text(x,y,t){if(y===55)texts.push(t);}};
  renderScreen(draw,model);return texts.join('');
}
test('shared pedal warning never obscures knob edits on part pages or EDIT',()=>{
  const {p,page,settle}=setup();
  for(const [name,index] of [['CHORDS',4],['STRUM',0],['MELODY',1],['BASS',1],['ARP',1],['A.CLOCK',1]]) {
    page(name);p.knob(index,1);
    const m=p.inspect().model,c=m.cells[index];
    assert.equal(m.detail,`${c.fullLabel}: ${c.fullValue}`);
    assert.ok(!footer(m).includes('CC64'),name);
  }
  p.selectEdit(0);p.knob(0,1);
  let m=p.inspect().model;
  assert.equal(m.detail,`${m.cells[0].fullLabel}: ${m.cells[0].fullValue}`);
  assert.ok(!footer(m).includes('CC64'));
  p.selectEdit(-1);page('MIDI');settle();
  assert.match(footer(p.inspect().model),/CC64: shared channel/);
});
test('MIDI shows the edited route, then warning at idle; separating channels clears warning',()=>{
  const {p,page,settle}=setup();page('MIDI');settle();
  p.knob(0,-1); // BOTH -> EXTERNAL, still overlaps melody.
  assert.match(p.inspect().model.detail,/Chord output/);
  assert.ok(!footer(p.inspect().model).includes('CC64'));settle();
  assert.match(footer(p.inspect().model),/CC64/);
  p.knob(3,1);settle();
  assert.doesNotMatch(footer(p.inspect().model),/CC64/);
});
