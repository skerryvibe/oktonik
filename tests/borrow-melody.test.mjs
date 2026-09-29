import test from 'node:test';
import assert from 'node:assert/strict';
import {createPilot, CHORD_PADS as C, MELODY_PADS as M} from '../src/pilot.mjs';
import {encodeDocument} from '../src/settings.mjs';
import {melodyHarmony, borrowedScaleId} from '../src/theory.mjs';
function setup(settings={}) {
  const commands=[];
  const p=createPilot({read:()=>encodeDocument({melodyMode:'scale',melodyAdapt:true,...settings},[]),write:()=>true,send:c=>commands.push(c)});p.init();
  const scale=()=>M.slice(0,7).map((pad,i)=>{
    p.pad(pad,true,90);const note=commands.findLast(c=>c.op==='on'&&c.owner===8+i).notes[0];
    p.pad(pad,false);return note%12;
  });
  return {p,commands,scale};
}
test('BORROW changes the entire scale immediately, silently, and returns on release',()=>{
  const {p,commands,scale}=setup();
  p.pad(C[0],true);p.pad(M[2],true);const before=commands.length;
  p.pad(94,true);assert.equal(commands.length,before);
  assert.deepEqual(scale(),[0,2,3,5,7,8,10]);
  p.pad(94,false);
  assert.deepEqual(scale(),[0,2,4,5,7,9,11]);
});
test('locked BORROW keeps full parallel scale after borrowed chords and toggles off',()=>{
  const {p,scale}=setup();
  p.pad(94,true,100,{shift:true});p.pad(94,false);
  p.pad(C[3],true);p.pad(C[3],false);
  assert.deepEqual(scale(),[0,2,3,5,7,8,10]);
  p.pad(94,true,100,{shift:true});p.pad(94,false);
  p.pad(C[0],true);
  assert.deepEqual(scale(),[0,2,4,5,7,9,11]);
});
test('minor BORROW uses parallel major and preserves the tonic',()=>{
  const {p,scale}=setup({scaleId:'natural_minor',key:2});p.pad(94,true);
  assert.deepEqual(scale(),[2,4,6,7,9,11,1]);
});
test('ADAPT OFF leaves original scale unchanged during BORROW',()=>{
  const {p,scale}=setup({melodyAdapt:false});p.pad(94,true);p.pad(C[3],true);
  assert.deepEqual(scale(),[0,2,4,5,7,9,11]);
});
test('secondary dominants still adapt within the borrowed scale',()=>{
  const {p,scale}=setup();p.pad(94,true);p.pad(84,true);p.pad(C[0],true);
  // G7 approaching borrowed Cm: B natural replaces Bb; Eb and Ab remain.
  assert.deepEqual(scale(),[0,2,3,5,7,8,11]);
});
test('borrow context leaves chord/chromatic modes alone and shares chord scale selection',()=>{
  for(const melodyMode of ['chord','chromatic']) {
    const input={melodyMode,melodyAdapt:true,scaleId:'major'};
    assert.equal(melodyHarmony(input,true,true),input);
  }
  assert.equal(borrowedScaleId({scaleId:'dorian'}),'major');
  assert.equal(borrowedScaleId({scaleId:'major_pentatonic'}),'natural_minor');
  assert.equal(melodyHarmony({melodyMode:'scale',melodyAdapt:true},true,true).melodyAdapt,true);
});
