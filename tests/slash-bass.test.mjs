import test from 'node:test';
import assert from 'node:assert/strict';
import { createPilot, CHORD_PADS as C, PAGES, LIVE_BASS_OWNER as B, STOP_PAD } from '../src/pilot.mjs';
import { encodeDocument, STATE_PATH, normalizeChord, normalizeOverride } from '../src/settings.mjs';
import { bassNotes, buildPadChord, chordNotes, explicitBassNote, applyModifiers } from '../src/theory.mjs';

function setup() {
  const files=new Map([[STATE_PATH,encodeDocument({bassEnabled:true,autoSustain:true},[])]]), commands=[];
  const pilot=createPilot({read:p=>files.get(p),write:(p,t)=>{files.set(p,t);return true;},send:c=>commands.push(c)});pilot.init();
  const turn=(id,delta,shift=false)=>{const i=pilot.inspect().model.cells.findIndex(c=>c.id===id);assert.ok(i>=0,id);pilot.knob(i,delta,{shift});};
  const page=name=>{pilot.selectEdit(-1);pilot.changePage(PAGES.indexOf(name)-pilot.inspect().page);};
  const choose=(pad,note)=>{
    pilot.selectEdit(pad);turn('bassMode',-63);turn('bassMode',3+note%12);
    const raw=explicitBassNote(pilot.inspect().bank[pad],pilot.inspect().settings);
    turn('bassMode',(note-raw)/12,true);pilot.selectEdit(-1);
  };
  const play=i=>{pilot.pad(C[i],true);pilot.pad(C[i],false);return new Map(pilot.inspect().voices).get(B)?.notes;};
  return {pilot,turn,page,choose,play,files,commands};
}

test('slash bass permits C-C/B-Am, C-G/B-Am and C-C/E-F without changing chord voicings',()=>{
  for(const [middlePad,middleBass,lastPad] of [[0,35,5],[4,35,5],[0,40,3]]) {
    const h=setup();
    assert.deepEqual(h.play(0),[36]);h.pilot.step(0,true,{shift:true});
    const original=chordNotes(h.pilot.inspect().bank[middlePad],h.pilot.inspect().settings);
    h.choose(middlePad,middleBass);assert.deepEqual(h.play(middlePad),[middleBass]);
    assert.deepEqual(new Map(h.pilot.inspect().voices).get(middlePad).notes,original);
    assert.equal(h.pilot.inspect().model.chordLabel,middlePad===4?'G/B':middleBass===35?'C/B':'C/E');
    h.pilot.step(1,true,{shift:true});h.play(lastPad);h.pilot.step(2,true,{shift:true});
    assert.deepEqual(h.pilot.inspect().loopBass.slice(0,3),[[36],[middleBass],[lastPad===5?45:41]]);
    // Choose A1 explicitly for a descending C2-B1-A1 rather than A2.
    if(lastPad===5){h.choose(lastPad,33);h.play(lastPad);h.pilot.step(2,true,{shift:true});assert.deepEqual(h.pilot.inspect().loopBass.slice(0,3),[[36],[35],[33]]);}
  }
});

test('explicit bass octave ignores global bass/chord registers, inversions and LEAD; key/root transpose it',()=>{
  const h=setup();h.choose(0,35);h.play(0);
  h.page('BASS');h.turn('bassOctave',3);h.page('CHORDS');h.turn('octave',2);
  assert.deepEqual(new Map(h.pilot.inspect().voices).get(B).notes,[35]);
  h.page('CHORDS');h.turn('voiceLead',1);h.turn('spread',2);assert.deepEqual(h.play(0),[35]);
  h.pilot.selectEdit(0);h.turn('padInversion',2);assert.deepEqual(h.play(0),[35]);
  h.turn('rootOffset',2);assert.deepEqual(h.play(0),[37]);
  h.page('CHORDS');h.turn('key',2);assert.deepEqual(h.play(0),[39]);
});

test('explicit bass snapshots and per-pad choices survive reload, while AUTO/ROOT/LOW and RESET remain available',()=>{
  const h=setup();h.choose(0,35);h.play(0);h.pilot.step(15,true,{shift:true});
  h.choose(0,40);h.play(0);assert.deepEqual(h.pilot.inspect().loopBass[15],[35]);
  h.pilot.unload();const restored=createPilot({read:p=>h.files.get(p)});restored.init();
  restored.pad(C[0],true);assert.deepEqual(new Map(restored.inspect().voices).get(B).notes,[40]);
  restored.step(15,true);assert.deepEqual(new Map(restored.inspect().voices).get(B).notes,[35]);
  assert.equal(restored.inspect().model.chordLabel,'C/B');
  h.pilot.selectEdit(0);h.turn('bassMode',-63);assert.equal(h.pilot.inspect().bank[0].bassMode,'auto');
  h.turn('bassMode',1);assert.equal(h.pilot.inspect().bank[0].bassMode,'root');
  h.turn('bassMode',1);assert.equal(h.pilot.inspect().bank[0].bassMode,'low');
  h.pilot.resetEdit();assert.equal(h.pilot.inspect().overrides[0],null);
});

test('all 128 explicit MIDI bass notes are selectable; octave extremes preserve pitch class and never send invalid notes',()=>{
  const h=setup();
  for(let n=0;n<128;n++){
    h.choose(0,n);assert.deepEqual(h.play(0),[n]);
    h.pilot.selectEdit(0);h.turn('bassMode',63,true);
    const high=explicitBassNote(h.pilot.inspect().bank[0],h.pilot.inspect().settings);
    assert.ok(high<=127&&high>=116);assert.equal(high%12,n%12);
    h.turn('bassMode',-63,true);assert.equal(explicitBassNote(h.pilot.inspect().bank[0],h.pilot.inspect().settings),n%12);
    h.pilot.selectEdit(-1);
  }
  assert.ok(h.commands.filter(c=>c.op==='on').every(c=>c.notes.every(n=>n>=0&&n<=127)));
  h.choose(0,127);h.page('CHORDS');h.turn('key',1);assert.equal(h.play(0),undefined);
  h.pilot.selectEdit(0);h.turn('bassMode',1,true);assert.equal(explicitBassNote(h.pilot.inspect().bank[0],h.pilot.inspect().settings),128);
  h.turn('bassMode',-1,true);assert.deepEqual(h.play(0),[116]);
  h.pilot.pad(STOP_PAD,true);assert.equal(h.pilot.inspect().voices.length,0);
});

test('manual bass remains optional, validates stored offsets, survives KEEP and follows modifier root shifts',()=>{
  const plain=buildPadChord({},0);
  for(const bassOffset of [NaN,Infinity,1.5,193,'4']) {
    assert.notEqual(normalizeChord({...plain,bassMode:'note',bassOffset}).bassMode,'note');
    assert.equal(normalizeOverride({bassMode:'note',bassOffset}),null);
  }
  const c=buildPadChord({},0,{bassMode:'note',bassOffset:-13});
  assert.deepEqual(bassNotes(c),[35]);assert.deepEqual(bassNotes(applyModifiers(c,{dom:true})),[42]);
  const h=setup();h.choose(0,35);h.pilot.pad(85,true);h.play(0);h.pilot.pad(85,false);
  h.pilot.selectEdit(0);h.pilot.keepVariation();assert.equal(h.pilot.inspect().bank[0].bassMode,'note');
  assert.deepEqual(h.play(0),[35]);
  h.page('BASS');h.turn('bassEnabled',-1);assert.equal(new Map(h.pilot.inspect().voices).has(B),false);
  h.turn('bassEnabled',1);assert.deepEqual(h.play(0),[35]);
});
