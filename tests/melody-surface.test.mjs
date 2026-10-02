import test from 'node:test';
import {navigate} from './navigate.mjs';
import assert from 'node:assert/strict';
import { createPilot, CHORD_PADS as C, MELODY_PADS as M, MODIFIER_PADS as X,
  PAGES, MELODY_OWNER_START as MO, STEP_OWNER_START as SO, LIVE_BASS_OWNER as B } from '../src/pilot.mjs';
import { SCALES, buildChordBank, melodyNotes, bassNotes, chordName, applyModifiers } from '../src/theory.mjs';
import { STATE_PATH, encodeDocument, decodeDocument, normalizeSettings } from '../src/settings.mjs';

function setup(settings = {}, initialFiles) {
  const commands = [], files = initialFiles || new Map([[STATE_PATH, encodeDocument(settings, [])]]);
  let leds = [];
  const pilot = createPilot({ read: p => files.get(p), write: (p, text) => { files.set(p, text); return true; },
    send: c => commands.push(c), leds: values => { leds = values; } });
  pilot.init();
  return { pilot, commands, files, page: name => navigate(pilot,name),
    leds: () => { pilot.repaint(); return new Map(leds.map(led => [led.note, led.role])); } };
}
const voice = (pilot, owner) => new Map(pilot.inspect().voices).get(owner);
const snapshot = pilot => JSON.stringify({ voices: pilot.inspect().voices, active: pilot.inspect().active });
const pcs = notes => [...new Set(notes.filter(Number.isInteger).map(n => n % 12))].sort((a,b) => a-b);

test('all 16 right-hand pads ascend bottom-to-top with disjoint melody, step and bass ownership', () => {
  assert.deepEqual(M, [72,73,74,75,80,81,82,83,88,89,90,91,96,97,98,99]);
  const { pilot, commands } = setup({ bassEnabled: true });
  pilot.pad(C[0], true);
  for (let i = 0; i < 8; i++) pilot.step(i, true, { shift: true });
  for (let i = 0; i < 8; i++) pilot.step(i, true);
  const notes = melodyNotes(pilot.inspect().active.chord, pilot.inspect().settings);
  M.forEach((pad, i) => { pilot.pad(pad, true, 70 + i); assert.deepEqual(voice(pilot, MO + i).notes, [notes[i]]); });
  assert.equal(pilot.inspect().voices.length, 26); // chord + 8 previews + 16 melody + bass
  const ids = pilot.inspect().voices.map(([owner]) => owner);
  assert.equal(new Set(ids).size, 26);
  assert.ok(ids.includes(SO + 7) && ids.includes(B));
  assert.ok(commands.filter(c => c.op === 'on').every(c => c.owner >= 0 && c.owner <= B));
  M.forEach(pad => pilot.pad(pad, false));
  for (let i = 0; i < 8; i++) assert.ok(voice(pilot, SO + i));
  pilot.panic(); assert.equal(pilot.inspect().voices.length, 0);
});

test('modifier press/release is silent for every modifier, with held and sustained parts', () => {
  for (const autoSustain of [false, true]) for (const modifier of X) {
    const { pilot, commands } = setup({ autoSustain, bassEnabled: true });
    const initial = commands.length;
    pilot.pad(modifier, true); pilot.pad(modifier, false);
    assert.equal(commands.length, initial);
    pilot.pad(C[1], true); pilot.pad(M[1], true); pilot.pad(M[15], true);
    if (autoSustain) { pilot.pad(C[1], false); pilot.pad(M[1], false); pilot.pad(M[15], false); }
    const before = snapshot(pilot), length = commands.length;
    pilot.pad(modifier, true); pilot.pad(modifier, false);
    assert.equal(commands.length, length);
    assert.equal(snapshot(pilot), before);
  }
});

test('a played variant remains latched after modifier release and unrelated parameter edits', () => {
  const { pilot, page } = setup({ autoSustain: true, bassEnabled: true, voiceLead: false });
  pilot.pad(X[0], true); pilot.pad(C[1], true); pilot.pad(C[1], false); pilot.pad(X[0], false);
  assert.equal(chordName(pilot.inspect().active.chord), 'A7');
  const chord = [...voice(pilot, 1).notes];
  page('MELODY'); pilot.knob(1, -1); page('BASS'); pilot.knob(1, 2);
  assert.deepEqual(voice(pilot, 1).notes, chord);
  assert.equal(voice(pilot, 1).sustained, true);
  page('B.EXTRA');pilot.knob(0,1);pilot.pad(X[2], true); pilot.knob(1, -10); // changing bass velocity cannot apply pending sus
  assert.equal(chordName(pilot.inspect().active.chord), 'A7');
  pilot.pad(X[2], false); pilot.pad(C[1], true);
  assert.equal(chordName(pilot.inspect().active.chord), 'Dm');
});

test('overlapping sus modifiers are sampled on attack and release never changes that attack', () => {
  const { pilot } = setup();
  pilot.pad(X[2], true); pilot.pad(X[3], true); pilot.pad(C[0], true);
  assert.equal(chordName(pilot.inspect().active.chord), 'Csus4');
  pilot.pad(X[3], false);
  assert.equal(chordName(pilot.inspect().active.chord), 'Csus4');
  pilot.pad(C[0], true);
  assert.equal(chordName(pilot.inspect().active.chord), 'Csus2');
  pilot.pad(X[2], false);
  assert.equal(chordName(pilot.inspect().active.chord), 'Csus2');
  pilot.pad(C[0], true);
  assert.equal(chordName(pilot.inspect().active.chord), 'C');
});

test('KEEP and capture use the played variation, not a subsequently prepared variation', () => {
  const { pilot, files } = setup();
  pilot.pad(X[0], true); pilot.pad(C[1], true); pilot.pad(X[0], false);
  pilot.pad(X[2], true); pilot.keepVariation();
  assert.equal(chordName(pilot.inspect().bank[1]), 'A7');
  assert.equal(chordName(pilot.inspect().active.chord), 'A7');
  pilot.step(0, true, { shift: true }); pilot.unload();
  const state = decodeDocument(JSON.parse(files.get(STATE_PATH)));
  assert.equal(chordName(state.overrides[1].customChord), 'A7');
  assert.equal(chordName(state.progression[0]), 'A7');
});

test('SCALE and CHROM are fixed across chords, while CHORD follows the played harmony', () => {
  for (const melodyMode of ['chord', 'scale', 'chromatic']) {
    const { pilot, commands } = setup({ melodyMode, melodyFollow: 'pad' });
    pilot.pad(C[0], true); M.forEach(p => pilot.pad(p, true));
    const before = M.map((_, i) => voice(pilot, MO + i)?.notes[0]);
    const length = commands.length;
    pilot.pad(C[1], true);
    const after = M.map((_, i) => voice(pilot, MO + i)?.notes[0]);
    if (melodyMode === 'chord') {
      assert.notDeepEqual(after, before);
      assert.deepEqual(pcs(after), [2,5,9]);
    } else {
      assert.deepEqual(after, before);
      assert.ok(!commands.slice(length).some(c => c.op === 'on' && c.owner >= MO && c.owner < SO));
    }
    pilot.panic();
  }
});

test('all keys and scales have exact ascending 16-pad layouts and chromatic semitone steps', () => {
  for (const scale of SCALES) for (let key = 0; key < 12; key++) {
    const chord = applyModifiers(buildChordBank({ scaleId: scale.id })[1], { dom: true });
    const options = { scaleId: scale.id, key, melodyOctave: -1 };
    const scaleNotes = melodyNotes(chord, { ...options, melodyMode: 'scale' });
    assert.deepEqual(scaleNotes, Array.from({ length: 16 }, (_, i) =>
      48 + key + scale.intervals[i % scale.intervals.length] + 12 * Math.floor(i / scale.intervals.length)));
    assert.deepEqual(melodyNotes(chord, { ...options, melodyMode: 'chromatic' }),
      Array.from({ length: 16 }, (_, i) => 48 + key + i));
  }
});

test('mode changes clean up released sustained notes and remap held pads safely', () => {
  const { pilot, page, files } = setup({ autoSustain: true });
  pilot.pad(C[0], true); pilot.pad(M[1], true); pilot.pad(M[2], true); pilot.pad(M[2], false);
  page('MELODY');
  assert.equal(pilot.inspect().model.cells.length, 8);
  pilot.knob(0, 1);
  assert.equal(pilot.inspect().settings.melodyMode, 'scale');
  assert.deepEqual(voice(pilot, MO + 1).notes, [62]);
  assert.equal(voice(pilot, MO + 2), undefined);
  assert.equal(pilot.inspect().model.cells[2].value, 'OFF');
  pilot.knob(0, 1);
  assert.deepEqual(voice(pilot, MO + 1).notes, [61]);
  pilot.pad(M[1], false); pilot.unload();
  assert.equal(decodeDocument(JSON.parse(files.get(STATE_PATH))).settings.melodyMode, 'chromatic');
});

test('SCALE and CHROM highlight played chord tones without moving pads for a pending modifier', () => {
  for (const melodyMode of ['scale', 'chromatic']) {
    const { pilot, leds } = setup({ melodyMode });
    pilot.pad(C[0], true); pilot.pad(C[0], false);
    const pitches = melodyNotes(pilot.inspect().active.chord, pilot.inspect().settings);
    const before = M.map(p => leds().get(p));
    M.forEach((p, i) => assert.equal(['root','chordTone'].includes(leds().get(p)), [0,4,7].includes(pitches[i] % 12)));
    pilot.pad(X[0], true);
    assert.deepEqual(M.map(p => leds().get(p)), before);
    pilot.pad(C[1], true); pilot.pad(C[1], false); // A7
    M.forEach((p, i) => assert.equal(['root','chordTone'].includes(leds().get(p)), [1,4,7,9].includes(pitches[i] % 12)));
  }
});

test('adaptive SCALE follows only an actually played modifier chord and leaves the base scale unchanged after release', () => {
  const { pilot, page, leds } = setup({ melodyMode: 'scale', melodyAdapt: false, autoSustain: true });
  pilot.pad(C[0], true); pilot.pad(C[0], false);
  const base = melodyNotes(pilot.inspect().active.chord, pilot.inspect().settings);
  page('MELODY'); pilot.knob(2, 1); // ADAPT ON
  pilot.pad(X[0], true); // pending DOM must not move the scale
  assert.deepEqual(melodyNotes(pilot.inspect().active.chord, pilot.inspect().settings), base);
  const before = [...base];
  pilot.pad(C[1], true); pilot.pad(C[1], false); pilot.pad(X[0], false);
  const adapted = melodyNotes(pilot.inspect().active.chord, pilot.inspect().settings);
  assert.notDeepEqual(adapted, before);
  assert.ok(adapted.filter(Number.isInteger).some((note, i) => note !== before[i]));
  assert.equal(leds().get(M[0]) === 'chordTone' || leds().get(M[1]) === 'chordTone', true);
  pilot.pad(C[0], true);
  assert.deepEqual(melodyNotes(pilot.inspect().active.chord, pilot.inspect().settings), before);
});

test('adaptation clears released sustained melody on a changed chord while held melody remaps', () => {
  const { pilot, page } = setup({ melodyMode: 'scale', melodyAdapt: true, autoSustain: true });
  pilot.pad(C[0], true); pilot.pad(M[0], true); pilot.pad(M[1], true); pilot.pad(M[1], false);
  page('MELODY'); pilot.pad(C[1], true);
  assert.ok(voice(pilot, MO).notes);
  assert.equal(voice(pilot, MO + 1), undefined);
});

test('out-of-range melody pads are dark and never send invalid MIDI; returning to range works', () => {
  const { pilot, page, commands, leds } = setup({ key: 11, melodyOctave: 3 });
  pilot.pad(C[0], true);
  assert.equal(leds().get(M[15]), 'off');
  const length = commands.length;
  pilot.pad(M[15], true); pilot.pad(M[15], false);
  assert.equal(commands.length, length);
  assert.equal(voice(pilot, MO + 15), undefined);
  page('MELODY'); pilot.knob(1, -6);
  assert.notEqual(leds().get(M[15]), 'off');
  pilot.pad(M[15], true); assert.ok(voice(pilot, MO + 15));
  pilot.knob(1, 6); assert.equal(voice(pilot, MO + 15), undefined);
  assert.ok(commands.filter(c => c.op === 'on').every(c => c.notes.every(n => Number.isInteger(n) && n >= 0 && n <= 127)));
  pilot.pad(M[15], false); pilot.panic();
});

test('bass octave is independent of chord octave, supports zero and positive values, and stops outside MIDI', () => {
  const { pilot, page } = setup({ bassEnabled: true });
  pilot.pad(C[0], true); pilot.step(0, true, { shift: true });
  page('BASS');
  assert.deepEqual(voice(pilot, B).notes, [36]);
  page('CHORDS');pilot.knob(3, 2); assert.deepEqual(voice(pilot, B).notes, [36]);page('BASS');
  pilot.knob(1, 1); assert.deepEqual(voice(pilot, B).notes, [48]);
  pilot.knob(1, 2); assert.deepEqual(voice(pilot, B).notes, [72]);
  assert.deepEqual(pilot.inspect().loopBass[0], [36]); // saved register is frozen
  pilot.knob(1, -63); assert.equal(voice(pilot, B), undefined);
  assert.deepEqual(pilot.inspect().loopBass[0], [36]);
  pilot.knob(1, 1); assert.deepEqual(voice(pilot, B).notes, [0]);
  pilot.knob(1, 63); assert.deepEqual(voice(pilot, B).notes, [120]);
  assert.deepEqual(bassNotes(buildChordBank({ key: 11 })[1], { key: 11, bassOctave: 6 }), []);
});

test('v3 migration preserves bass pitch, melody routing and edited chords without overwriting the old file', () => {
  for (const octave of [-3, 0, 3]) for (const bassOctaves of [1, 2]) {
    const previous = { format: 'chord-pilot', schemaVersion: 3, version: '0.0.3',
      settings: { octave, bassOctaves, bassEnabled: true, melodyOctave: 1, melodyRoute: 'external', melodyChannel: 5 },
      progression: [buildChordBank()[0]], overrides: [{ extension: 4 }] };
    const path = STATE_PATH.replace(/-v\d\./, '-v3.'), content = JSON.stringify(previous);
    const { pilot, files } = setup({}, new Map([[path, content]]));
    const state = pilot.inspect();
    assert.equal(state.settings.bassOctave, octave - bassOctaves);
    assert.equal(state.settings.melodyMode, 'chord');
    assert.equal(state.settings.melodyChannel, 5); assert.equal(state.settings.melodyRoute, 'external');
    assert.equal(state.overrides[0].extension, 4);
    assert.deepEqual(state.loopBass[0], bassNotes(previous.progression[0], previous.settings));
    pilot.tick();
    assert.equal(files.get(path), content);
    assert.equal(JSON.parse(files.get(STATE_PATH)).schemaVersion, 7);
    assert.equal(JSON.parse(files.get(STATE_PATH)).settings.bassOctaves, undefined);
  }
  assert.equal(normalizeSettings({ bassOctave: 0, octave: 3, bassOctaves: 2 }).bassOctave, 0);
});

test('disarming a running loop clears latched UI voices so edits cannot resurrect released notes', () => {
  const { pilot, page } = setup({ autoSustain: true, bassEnabled: true });
  pilot.pad(C[0], true); pilot.step(0, true, { shift: true }); pilot.pad(C[0], false);
  pilot.arm(true);
  pilot.tick({ v: 1, armed: true, running: true, slot: 0, cycle: 0, loop_sounding: true, bass_sounding: true });
  pilot.pad(M[15], true); pilot.pad(M[15], false);
  assert.equal(voice(pilot, MO + 15).sustained, true);
  pilot.arm(false);
  assert.equal(pilot.inspect().voices.length, 0);
  page('MELODY'); pilot.knob(1, -1);
  assert.equal(pilot.inspect().voices.length, 0);
});
