import test from 'node:test';
import assert from 'node:assert/strict';
import {createPilot,CHORD_PADS as C,MODIFIER_PADS as X,STOP_PAD} from '../src/pilot.mjs';
import {STATE_PATH,encodeDocument} from '../src/settings.mjs';
import {renderScreen} from '../src/display.mjs';

function setup(settings={}) {
  const commands=[];
  const p=createPilot({profile:'lab',read:path=>path===STATE_PATH?encodeDocument(settings,[]):null,
    write:()=>true,send:c=>commands.push(c)});
  p.init();
  const settle=()=>{for(let i=0;i<100;i++)p.tick();};
  const model=()=>p.inspect().model;
  const expected=()=>`${model().chordLabel} | ${model().degreeLabel}`;
  return {p,commands,settle,model,expected};
}
test('Lab PLAY retains chord and function after release and notice timeout',()=>{
  const h=setup();h.p.pad(C[3],true);h.p.pad(C[3],false);h.settle();
  assert.match(h.model().detail,/^F \|/);assert.equal(h.model().detail,h.expected());
  const text=[];renderScreen({clear(){},line(){},rect(){},fill(){},text(x,y,t){if(y===55)text.push(t);}},h.model());
  assert.equal(text[0],h.expected());
});
test('Lab bass gesture footer follows slash bass immediately, without MIDI from rendering',()=>{
  for(const sustain of ['off','hold','pedal']) {
    const h=setup({bassEnabled:true,bassGesture:true,chordSustain:sustain,bassSustain:sustain});
    h.p.pad(C[0],true);h.p.pad(C[2],true);
    assert.match(h.model().detail,/^C\/E \|/);assert.equal(h.model().detail,h.expected());
    h.p.pad(C[0],false);assert.match(h.model().detail,/^C\/E \|/);
    h.p.pad(C[0],true);assert.match(h.model().detail,/^C \|/);
    h.p.pad(C[2],false);h.p.pad(C[0],false);h.settle();
    assert.equal(h.model().detail,h.expected());
    const count=h.commands.length;for(let n=0;n<10;n++)h.p.repaint(true);
    assert.equal(h.commands.length,count);
  }
});
test('Lab modifier preview and parameter touch temporarily replace active chord footer',()=>{
  for(const modifier of X) {
    const h=setup();h.p.pad(C[0],true);h.p.pad(C[0],false);
    h.p.pad(modifier,true);h.p.pad(C[3],true);h.p.pad(C[3],false);
    h.p.pad(modifier,false);h.settle();assert.equal(h.model().detail,h.expected());
    h.p.focus(5,true);assert.match(h.model().detail,/^Voice leading:/);
    h.p.focus(5,false);h.settle();assert.equal(h.model().detail,h.expected());
  }
});
test('Lab EDIT parameter hints and held STOP retain priority over chord footer',()=>{
  const h=setup();h.p.selectEdit(0);h.p.knob(2,1);
  assert.match(h.model().detail,/extension/i);
  h.p.selectEdit(-1);h.p.pad(C[0],true);h.p.pad(C[0],false);h.settle();
  assert.equal(h.model().detail,h.expected());
  h.p.pad(STOP_PAD,true);assert.equal(h.model().detail,'STOP - all notes off');
  h.p.pad(STOP_PAD,false);h.settle();assert.equal(h.model().detail,h.expected());
});
