import test from 'node:test';
import assert from 'node:assert/strict';
import { createPilot, PAGES, CHORD_PADS as C, MODIFIER_PADS as X } from '../src/pilot.mjs';
import { STATE_PATH, encodeDocument } from '../src/settings.mjs';
import { renderScreen } from '../src/display.mjs';

function setup(settings={}) {
  const commands=[];
  const pilot=createPilot({read:p=>p===STATE_PATH?encodeDocument(settings,[]):null,send:c=>commands.push(c)});
  pilot.init();
  return {pilot,commands,map:()=>pilot.inspect().model.chordMap,
    page:name=>pilot.changePage(PAGES.indexOf(name)-pilot.inspect().page)};
}

test('PLAY maps eight chords in physical order, with ten visible page markers',()=>{
  const h=setup();const labels=h.map().items.map(x=>x.label);
  assert.deepEqual(labels,['C','Dm','Em','F','G','Am','Bdim','C']);
  assert.equal(h.map().selected,-1);
  const texts=[],marks=[];
  renderScreen({clear(){},text(x,y,t){if(y===18||y===40)texts.push([x,y,t]);},
    line(x,y,x2,y2){if(y===6&&y2===6)marks.push(x);},rect(){},fill(x,y,w,height){if(y===2&&height===5)marks.push(x);}},h.pilot.inspect().model);
  assert.deepEqual(texts.map(x=>x[2]),['G','Am','Bdim','C','C','Dm','Em','F']);
  assert.equal(marks.length,11);
  assert.ok(marks.every(x=>x>=45&&x<64));
});

test('all modifier previews and combinations match actual attacks without preview MIDI',()=>{
  for(const modifiers of [[],...X.map(x=>[x]),[94,84],[94,92],[85,87],[92,86],[84,93]]) {
    for(let pad=0;pad<8;pad++) {
      const h=setup({extension:1,voiceLead:true});
      const before=h.commands.length;
      modifiers.forEach(x=>h.pilot.pad(x,true));
      const preview=h.map().items[pad];
      for(let n=0;n<5;n++)h.map();
      assert.equal(h.commands.length,before);
      h.pilot.pad(C[pad],true);
      assert.deepEqual(h.pilot.inspect().active.notes,preview.notes);
      assert.equal(h.pilot.inspect().model.chordLabel,preview.label);
      const voices=h.pilot.inspect().voices,sent=h.commands.length;
      modifiers.slice().reverse().forEach(x=>h.pilot.pad(x,false));
      assert.deepEqual(h.pilot.inspect().voices,voices);
      assert.equal(h.commands.length,sent);
    }
  }
});

test('BORROW latch previews survive release, and unlocking restores normal labels',()=>{
  const h=setup(),normal=h.map().items.map(x=>x.label);
  h.pilot.pad(94,true,100,{shift:true});h.pilot.pad(94,false);
  assert.notDeepEqual(h.map().items.map(x=>x.label),normal);
  assert.match(h.pilot.inspect().model.detail,/BORROW LOCK/);
  h.pilot.pad(94,true,100,{shift:true});h.pilot.pad(94,false);
  assert.deepEqual(h.map().items.map(x=>x.label),normal);
});

test('EDIT returns to PLAY and map reflects custom root, type, extension, inversion and explicit bass',()=>{
  const h=setup({bassEnabled:true});h.pilot.selectEdit(1);
  h.pilot.knob(0,1);h.pilot.knob(1,1);h.pilot.knob(2,5);h.pilot.knob(3,2);h.pilot.knob(7,14);
  h.pilot.selectEdit(-1);
  assert.equal(h.pilot.inspect().model.pageName,'PLAY');
  const preview=h.map().items[1];
  assert.match(preview.label,/\//);
  h.pilot.pad(C[1],true);
  assert.equal(h.pilot.inspect().model.chordLabel,preview.label);
  assert.deepEqual(h.pilot.inspect().active.notes,preview.notes);
  const settings=h.pilot.inspect().settings,sent=h.commands.length;
  h.pilot.focus(5,true);assert.equal(h.pilot.inspect().model.detail,'PAD 2: '+h.map().items[1].label);
  for(let i=0;i<8;i++)h.pilot.knob(i,1);
  assert.deepEqual(h.pilot.inspect().settings,settings);assert.equal(h.commands.length,sent);
  h.pilot.focus(5,false);assert.doesNotMatch(h.pilot.inspect().model.detail,/PAD 2:/);
});

test('gesture keeps bank names in the grid and slash bass only in the header',()=>{
  const h=setup({bassEnabled:true,bassGesture:true});h.pilot.pad(C[0],true);
  assert.equal(h.map().items[2].label,'Em');
  h.pilot.pad(C[2],true);h.pilot.pad(C[0],false);
  assert.equal(h.map().items[0].label,'C');
  assert.equal(h.pilot.inspect().model.chordLabel,'C/E');
  h.pilot.pad(C[0],true);assert.equal(h.pilot.inspect().model.chordLabel,'C');
  h.pilot.pad(C[2],false);h.pilot.pad(C[0],false);
  assert.equal(h.map().items[2].label,'Em');
});

test('IDEAS uses the same grid and modifier resolver; leaving restores bank map',()=>{
  const h=setup();h.page('IDEAS');h.pilot.knob(0,1);h.pilot.pad(87,true);
  assert.deepEqual(h.map(),h.pilot.inspect().model.ideaView);
  const expected=h.map().items[4];h.pilot.pad(C[4],true);
  assert.deepEqual(h.pilot.inspect().active.notes,expected.notes);
  assert.equal(h.pilot.inspect().model.chordLabel,expected.label);
  h.pilot.pad(C[4],false);h.pilot.pad(87,false);h.page('PLAY');
  assert.equal(h.pilot.inspect().ideasEnabled,false);
  assert.equal(h.map().items[0].label,'C');
});
