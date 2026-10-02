import test from 'node:test';
import assert from 'node:assert/strict';
import {SCALES,EXTENSIONS,buildChordBank,chordNotes,chordName,voiceLeadNotes,bassNotes} from '../src/theory.mjs';
import {normalizeChord,normalizeOverride,encodeDocument,decodeDocument,STATE_PATH} from '../src/settings.mjs';
import {createPilot,CHORD_PADS as C,LIVE_BASS_OWNER} from '../src/pilot.mjs';

test('negative inversions move upper voices below root without changing positive voicings',()=>{
  const c=buildChordBank()[0];
  for(const [inv,notes,name] of [[-2,[40,43,48],'C/E'],[-1,[43,48,52],'C/G'],[0,[48,52,55],'C'],[1,[52,55,60],'C/E'],[2,[55,60,64],'C/G']]) {
    const chord={...c,inversion:inv};
    assert.deepEqual(chordNotes(chord),notes);assert.equal(chordName(chord),name);
    assert.deepEqual(voiceLeadNotes({...chord,lockInversion:true},{voiceLead:true},[60,64,67]),notes);
  }
  const seventh={...c,intervals:[0,4,7,11],inversion:-1};
  assert.deepEqual(chordNotes(seventh),[47,48,52,55]);assert.equal(chordName(seventh),'Cmaj7/B');
  assert.deepEqual(chordNotes({...c,intervals:[0,4,7,14],inversion:-1}),[38,48,52,55]);
});
test('downward inversions retain pitch classes and bass identity at all scales and MIDI bounds',()=>{
  const pcs=notes=>[...new Set(notes.map(n=>(n%12+12)%12))].sort((a,b)=>a-b);
  for(const scale of SCALES)for(let extension=0;extension<EXTENSIONS.length;extension++)for(const key of [0,6,11]) {
    const c=buildChordBank({scaleId:scale.id,extension,key})[0];
    for(let inv=1-c.intervals.length;inv<0;inv++)for(const spread of [0,1,2])for(const octave of [-3,0,3]) {
      const notes=chordNotes({...c,inversion:inv,spread},{key,octave});
      assert.ok(notes.length && notes.every(n=>Number.isInteger(n)&&n>=0&&n<=127));
      assert.deepEqual(pcs(notes),pcs(c.intervals.map(n=>n+key+c.rootOffset)));
      assert.equal(notes[0]%12,(key+c.rootOffset+c.intervals[c.intervals.length+inv])%12);
      assert.ok(notes.every((n,i)=>!i||n>notes[i-1]));
    }
  }
});
test('normalizers retain signed inversion and lock independently, with bounded values',()=>{
  const c={...buildChordBank()[0],inversion:-2,lockInversion:true};
  assert.equal(normalizeChord(c).inversion,-2);
  assert.deepEqual(normalizeOverride({inversion:-2,lockInversion:true}),{inversion:-2,lockInversion:true});
  assert.equal(normalizeOverride({inversion:-8}),null);
  assert.equal(normalizeChord({...c,inversion:-900}).inversion,-7);
});
test('EDIT crosses ROOT downward, locks against LEAD, and Shift+INV explicitly restores AUTO',()=>{
  const commands=[];const p=createPilot({read:()=>encodeDocument({voiceLead:true,bassEnabled:true,bassMode:'root',divisi:true},[]),send:c=>commands.push(c),write:()=>true});p.init();
  p.pad(C[0],true);p.selectEdit(0);p.knob(3,-1);
  assert.equal(p.inspect().model.cells[3].value,'-1');assert.equal(p.inspect().bank[0].lockInversion,true);
  assert.deepEqual(p.inspect().voices.find(([o])=>o===0)[1].notes,[43,48,52]);
  assert.deepEqual(p.inspect().voices.find(([o])=>o===LIVE_BASS_OWNER)[1].notes,[36]);
  assert.equal(commands.findLast(c=>c.op==='on'&&c.owner===0).divisi,1);
  p.knob(3,1);assert.equal(p.inspect().model.cells[3].value,'AUTO');
  assert.equal(p.inspect().bank[0].lockInversion,false);
  p.knob(3,1);assert.equal(p.inspect().model.cells[3].value,'ROOT');
  p.knob(3,1);assert.equal(p.inspect().model.cells[3].value,'+1');
  p.knob(3,-63);assert.equal(p.inspect().model.cells[3].value,'-2');
  p.knob(3,1,{shift:true});assert.equal(p.inspect().model.cells[3].value,'AUTO');
  assert.equal(p.inspect().bank[0].lockInversion,false);
  p.knob(3,1);assert.equal(p.inspect().model.cells[3].value,'ROOT');
  p.knob(3,-1);assert.equal(p.inspect().model.cells[3].value,'AUTO');
  assert.equal(p.inspect().bank[0].lockInversion,false);
  p.pad(C[0],false);p.panic();assert.equal(p.inspect().voices.length,0);
});
test('AUTO selected without Shift stays unlocked after project reload',()=>{
  const files=new Map();
  const make=()=>createPilot({read:path=>files.get(path),write:(path,data)=>{files.set(path,data);return true;},send:()=>{}});
  const p=make();p.init();p.selectEdit(0);
  p.knob(3,2);assert.equal(p.inspect().model.cells[3].value,'+1');
  p.knob(3,-2);assert.equal(p.inspect().model.cells[3].value,'AUTO');
  p.unload();
  const next=make();next.init();next.selectEdit(0);
  assert.equal(next.inspect().model.cells[3].value,'AUTO');
  assert.equal(next.inspect().bank[0].lockInversion,false);
});
test('negative voicings and snapshots survive reload; ROOT/LOW bass remain independent',()=>{
  const files=new Map(),commands=[];
  const make=()=>createPilot({read:path=>files.get(path),write:(path,data)=>{files.set(path,data);return true;},send:c=>commands.push(c)});
  const p=make();p.init();p.selectEdit(0);p.knob(3,-2);p.selectEdit(-1);p.pad(C[0],true);p.step(0,true,{shift:true});
  const frozen=structuredClone(p.inspect().progression[0]);p.pad(C[0],false);p.unload();
  const doc=decodeDocument(JSON.parse(files.get(STATE_PATH)));assert.equal(doc.overrides[0].inversion,-2);
  assert.deepEqual(doc.progression[0].snapshot.notes,[40,43,48]);
  const next=make();next.init();assert.equal(next.inspect().bank[0].inversion,-2);
  assert.deepEqual(next.inspect().progression[0],frozen);
  const chord=next.inspect().bank[0],notes=chordNotes(chord);
  assert.deepEqual(bassNotes(chord,{bassMode:'root',bassOctave:-1},notes),[36]);
  assert.deepEqual(bassNotes(chord,{bassMode:'low',bassOctave:-1},notes),[28]);
});
