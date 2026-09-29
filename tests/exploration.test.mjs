import test from 'node:test';
import assert from 'node:assert/strict';
import { createPilot, CHORD_PADS as C, MELODY_PADS as M, MODIFIER_PADS, STOP_PAD, PAGES, LIVE_BASS_OWNER } from '../src/pilot.mjs';
import { buildChordBank, buildLegacyChordBank, buildPadChord, applyModifiers, chordName, chordNotes,
  degreeName, SCALES, CHORD_TYPES, PAD_EXTENSIONS, melodyNotes, adaptiveScaleIntervals } from '../src/theory.mjs';
import { STATE_PATH, encodeDocument, normalizeChord, normalizeOverride } from '../src/settings.mjs';

function setup(settings = {}, files = new Map([[STATE_PATH, encodeDocument(settings, [])]])) {
  const commands = [];
  const pilot = createPilot({ read: p => files.get(p), write: (p, v) => { files.set(p, v); return true; },
    send: c => commands.push(c) });
  pilot.init();
  pilot.changePage(PAGES.indexOf('CHORDS'));
  const turn = (id, delta) => {
    const i = pilot.inspect().model.cells.findIndex(c => c.id === id);
    assert.ok(i >= 0, id); pilot.knob(i, delta);
  };
  const play = (index, modifier) => {
    if (modifier) pilot.pad(modifier, true);
    pilot.pad(C[index], true); pilot.pad(C[index], false);
    if (modifier) pilot.pad(modifier, false);
    return pilot.inspect().active.chord;
  };
  return { pilot, commands, files, turn, play };
}
const pitchClasses = notes => [...new Set(notes.filter(Number.isInteger).map(n => (n + 120) % 12))].sort((a,b) => a-b);

test('top row is II, SUB, BORROW, STOP and every modifier remains silent', () => {
  assert.deepEqual(MODIFIER_PADS.slice(4), [92,93,94]); assert.equal(STOP_PAD, 95);
  const { pilot, commands } = setup({ autoSustain: true, bassEnabled: true });
  pilot.pad(C[0], true); pilot.pad(M[1], true); pilot.pad(C[0], false);
  const voices = structuredClone(pilot.inspect().voices), count = commands.length;
  for (const p of [92,93,94]) { pilot.pad(p, true); pilot.pad(p, false); }
  assert.deepEqual(pilot.inspect().voices, voices); assert.equal(commands.length, count);
  pilot.pad(95, true); assert.equal(commands.at(-1).op, 'kill');
});

test('same target pad performs major and minor ii-V-I without cumulative changes', () => {
  for (let key=0; key<12; key++) {
    const { pilot, play } = setup({ key, voiceLead: false });
    const g = pilot.inspect().bank[4], d = pilot.inspect().bank[1];
    const ii = play(4,92), v = play(4,84), tonic = play(4);
    assert.deepEqual(pitchClasses(ii.intervals.map(n => n+ii.rootOffset)), [0,4,7,9]); // Am7 relative to key
    assert.deepEqual(pitchClasses(v.intervals.map(n => n+v.rootOffset)), [0,2,6,9]); // D7
    assert.deepEqual(tonic,g); assert.equal(degreeName(ii,{key}), 'ii/V');
    const minorII = play(1,92), minorV = play(1,84);
    assert.equal(minorII.rootOffset,4); assert.deepEqual(minorII.intervals,[0,3,6,10]);
    assert.equal(minorV.rootOffset,9); assert.deepEqual(minorV.intervals,[0,4,7,10]);
    assert.deepEqual(play(1),d);
  }
});

test('SUB is the dominant one semitone above the saved target, including custom roots', () => {
  const chord = buildPadChord({}, 0, { rootOffset: 3, chordType: 'MIN', extensionName: '9' });
  const sub = applyModifiers(chord, { sub: true });
  assert.equal(sub.rootOffset,4); assert.deepEqual(sub.intervals,[0,4,7,10]);
  assert.equal(sub.targetOffset,3); assert.deepEqual(sub.targetIntervals,chord.intervals);
  assert.equal(chordName(applyModifiers(buildChordBank()[0], {sub:true})), 'Db7');
  assert.equal(degreeName(applyModifiers(buildChordBank()[0], {sub:true})), 'subV/I');
});

test('BORROW maps scale degrees to parallel mode, including pentatonic V and chromatic custom roots', () => {
  const bank=buildChordBank();
  assert.deepEqual(bank.map(c => chordName(applyModifiers(c,{borrow:true}))), ['Cm','Ddim','Eb','Fm','Gm','Ab','Bb','Cm']);
  const minor={scaleId:'natural_minor'};
  assert.deepEqual(buildChordBank(minor).map(c=>chordName(applyModifiers(c,{borrow:true},minor),minor)), ['C','Dm','Em','F','G','Am','Bdim','C']);
  const pent={scaleId:'major_pentatonic'};
  assert.equal(applyModifiers(buildChordBank(pent)[3],{borrow:true},pent).rootOffset,7);
  const custom=buildPadChord({},0,{rootOffset:1,chordType:'MAJ',extensionName:'MAJ7'});
  const borrowed=applyModifiers(custom,{borrow:true});
  assert.equal(borrowed.rootOffset,1); assert.deepEqual(borrowed.intervals,[0,3,7,11]);
});

test('last-held II/DOM/SUB wins; BORROW first sets the target and releases never revoice', () => {
  const { pilot }=setup();
  pilot.pad(92,true); pilot.pad(84,true); pilot.pad(C[4],true);
  assert.equal(chordName(pilot.inspect().active.chord),'D7');
  pilot.pad(84,false);
  assert.equal(chordName(pilot.inspect().active.chord),'D7');
  pilot.pad(C[4],true); assert.equal(chordName(pilot.inspect().active.chord),'Am7');
  pilot.pad(93,true); pilot.pad(C[4],true); assert.equal(chordName(pilot.inspect().active.chord),'Ab7');
  pilot.pad(93,false); pilot.pad(92,false);
  pilot.pad(94,true); pilot.pad(92,true); pilot.pad(C[3],true); // II of borrowed Fm
  assert.equal(chordName(pilot.inspect().active.chord),'Gm7b5');
  assert.equal(pilot.inspect().active.chord.targetOffset,5);
  assert.deepEqual(pilot.inspect().active.chord.targetIntervals,[0,3,7]);
});

test('ROOT/TYPE/EXT persist independently, transpose with KEY and distinguish C7/Cmaj7/Cmmaj7', () => {
  const {pilot,turn,files}=setup();
  pilot.selectEdit(0);
  assert.deepEqual(pilot.inspect().model.cells.slice(0,5).map(c=>c.label),['ROOT','TYPE','EXT','INV','SPRD']);
  turn('chordType',1); turn('extensionName',4);
  assert.equal(chordName(pilot.inspect().bank[0]),'C7');
  turn('extensionName',1); assert.equal(chordName(pilot.inspect().bank[0]),'Cmaj7');
  turn('chordType',1); assert.equal(chordName(pilot.inspect().bank[0]),'Cm(maj7)');
  turn('rootOffset',1); assert.equal(pilot.inspect().bank[0].rootOffset,1);
  assert.equal(pilot.inspect().settings.key,0);
  pilot.pad(C[0],true,100,{shift:true}); turn('key',2);
  assert.equal(pilot.inspect().bank[0].rootOffset,1);
  assert.equal(chordName(pilot.inspect().bank[0],pilot.inspect().settings),'Ebm(maj7)');
  pilot.unload();
  const restored=setup({},files).pilot;
  assert.deepEqual(restored.inspect().bank,pilot.inspect().bank);
  restored.selectEdit(0); restored.resetEdit();
  assert.equal(chordName(restored.inspect().bank[0],restored.inspect().settings),'D');
});

test('explicit chord recipes are valid, ascending and preserve every chord pitch in adaptive melody', () => {
  for (const type of CHORD_TYPES.slice(1)) for (const ext of PAD_EXTENSIONS.slice(1)) {
    if (ext==='DIM7' && type!=='DIM') continue;
    for (const scale of SCALES) {
      const settings={key:11,scaleId:scale.id,melodyMode:'scale',melodyAdapt:true};
      const c=buildPadChord(settings,0,{rootOffset:1,chordType:type,extensionName:ext});
      assert.ok(normalizeChord(c));
      assert.ok(c.intervals.length<=8 && c.intervals.every(n=>n>=0 && n<=36));
      const notes=chordNotes(c,settings);
      assert.ok(notes.every(n=>n>=0 && n<=127));
      const adapted=adaptiveScaleIntervals(c,settings);
      assert.ok(c.intervals.every(n=>adapted.includes((n+c.rootOffset)%12)));
      const melody=melodyNotes(c,settings).filter(Number.isInteger);
      assert.ok(melody.every((n,i)=>i===0 || n>melody[i-1]));
    }
  }
});

test('new variations update held melody and bass only on an actual chord attack', () => {
  for (const mode of ['chord','scale','chromatic']) {
    const {pilot,commands}=setup({autoSustain:true,bassEnabled:true,melodyMode:mode,melodyAdapt:true});
    pilot.pad(C[4],true); pilot.pad(M[1],true);
    for (const modifier of [92,93,94]) {
      const before=commands.length; pilot.pad(modifier,true); assert.equal(commands.length,before);
      pilot.pad(C[4],true);
      const active=pilot.inspect().active.chord;
      const v=new Map(pilot.inspect().voices);
      assert.equal(v.get(LIVE_BASS_OWNER).notes[0]%12,active.rootOffset);
      if(mode==='chord') assert.ok(active.intervals.some(n=>(n+active.rootOffset)%12===v.get(9).notes[0]%12));
      if(mode==='scale') assert.equal(v.get(9).notes[0],melodyNotes(active,pilot.inspect().settings)[1]);
      if(mode==='chromatic') assert.equal(v.get(9).notes[0],61);
      const count=commands.length; pilot.pad(modifier,false); assert.equal(commands.length,count);
    }
  }
});

test('KEEP stores exact played variations; edited kept roots are not transformed again', () => {
  for(const modifier of [84,92,93,94]) {
    const {pilot,play,turn,files}=setup();
    const played=play(3,modifier);
    pilot.keepVariation();
    assert.deepEqual(pilot.inspect().bank[3].intervals,played.intervals);
    assert.equal(pilot.inspect().bank[3].rootOffset,played.rootOffset);
    turn('rootOffset',1);
    assert.equal(pilot.inspect().bank[3].rootOffset,(played.rootOffset+1)%12);
    pilot.step(0,true,{shift:true}); pilot.unload();
    const restored=setup({},files).pilot;
    assert.deepEqual(restored.inspect().bank,pilot.inspect().bank);
    assert.ok(restored.inspect().progression[0]);
  }
});

test('v4 color becomes an ordinary custom pad without changing its sound or old file', () => {
  for(const color of [1,2]) {
    const oldPath=STATE_PATH.replace(/-v\d\./,'-v4.');
    const settings={key:2,scaleId:'major',extension:1,color};
    const override={extension:2,inversion:1,spread:1,lockInversion:true,variant:{flip:true}};
    const legacy=applyModifiers(buildLegacyChordBank({...settings,...override})[7],override.variant,settings);
    const stored=JSON.stringify({format:'chord-pilot',schemaVersion:4,settings,overrides:Array(7).fill(null).concat(override),progression:[legacy]});
    const files=new Map([[oldPath,stored]]), {pilot}=setup({},files);
    const state=pilot.inspect();
    assert.equal(state.settings.color,undefined);
    assert.deepEqual(chordNotes(state.bank[7],settings),chordNotes(legacy,settings));
    pilot.tick(); assert.equal(files.get(oldPath),stored);
    assert.equal(JSON.parse(files.get(STATE_PATH)).schemaVersion,7);
    const restored=setup({},files).pilot; assert.deepEqual(restored.inspect().bank,state.bank);
    restored.selectEdit(7); restored.resetEdit();
    assert.equal(restored.inspect().bank[7].rootOffset,0);
  }
  assert.deepEqual(buildChordBank({color:2}),buildChordBank());
});

test('malformed new pad fields are discarded without corrupting existing valid edits', () => {
  const value=normalizeOverride({rootOffset:15,chordType:'evil',extensionName:'invalid',customChord:{intervals:[500]},spread:1});
  assert.deepEqual(value,{spread:1});
});
