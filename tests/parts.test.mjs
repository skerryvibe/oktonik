import test from 'node:test';
import assert from 'node:assert/strict';
import { createPilot, LIVE_BASS_OWNER as B, PAGES } from '../src/pilot.mjs';
import { buildChordBank, chordNotes, melodyNotes, bassNotes } from '../src/theory.mjs';
import { STATE_PATH, encodeDocument, decodeDocument } from '../src/settings.mjs';

function setup(settings = {}) {
  const commands = [], files = new Map([[STATE_PATH, encodeDocument(settings, [])]]);
  const pilot = createPilot({ read: p => files.get(p), write: (p, text) => { files.set(p, text); return true; },
    send: c => commands.push(c), moveAvailable: true });
  pilot.init();
  const page = name => pilot.changePage(PAGES.indexOf(name) - pilot.inspect().page);
  return { pilot, page, commands, files };
}
const voices = p => new Map(p.inspect().voices);

test('new melody strikes request retrigger while automatic revoicing does not', () => {
  const { pilot, commands } = setup();
  pilot.pad(68, true); pilot.pad(72, true);
  assert.equal(commands.filter(c => c.op === 'on' && c.owner === 8).at(-1).retrigger, 1);
  pilot.pad(69, true);
  assert.equal(commands.filter(c => c.op === 'on' && c.owner === 8).at(-1).retrigger, 0);
  pilot.pad(72, false); pilot.pad(72, true);
  assert.equal(commands.filter(c => c.op === 'on' && c.owner === 8).at(-1).retrigger, 1);
});

test('auto sustain holds chord, melody and bass until the next chord, then releases the old period', () => {
  const { pilot, commands } = setup({ autoSustain: true, bassEnabled: true });
  pilot.pad(68, true); pilot.pad(72, true);
  pilot.pad(72, false); pilot.pad(68, false);
  for (const owner of [0, 8, B]) {
    assert.equal(voices(pilot).get(owner).sustained, true);
    assert.ok(commands.some(c => c.op === 'hold' && c.owner === owner));
  }
  pilot.pad(69, true);
  assert.equal(voices(pilot).has(0), false); assert.equal(voices(pilot).has(8), false);
  assert.ok(voices(pilot).has(1) && voices(pilot).has(B));
  pilot.pad(69, false);
  pilot.panic();
  assert.equal(pilot.inspect().voices.length, 0);
  assert.equal(pilot.inspect().armed, false);
});

test('turning sustain off stops only released notes; held notes keep playing', () => {
  const { pilot, page } = setup({ autoSustain: true, bassEnabled: true });
  pilot.pad(68, true); pilot.pad(72, true); pilot.pad(72, false);
  page('MELODY'); pilot.knob(4, -1);
  assert.equal(voices(pilot).has(8), false);
  assert.ok(voices(pilot).has(0) && voices(pilot).has(B));
  page('CHORDS');pilot.knob(7,-1);page('BASS');pilot.knob(5,-1);
  pilot.pad(68, false);
  assert.equal(pilot.inspect().voices.length, 0);
});

test('held melody follows the next chord; modifiers alone leave released melody sustained', () => {
  const { pilot } = setup({ autoSustain: true });
  pilot.pad(68, true); pilot.pad(68, false); pilot.pad(72, true);
  pilot.pad(69, true);
  assert.ok(voices(pilot).has(8));
  pilot.pad(72, false); pilot.pad(84, true); // dominant is only prepared
  assert.equal(voices(pilot).get(8).sustained, true);
  pilot.pad(69, true); // next actual chord releases the previous pedal period
  assert.equal(voices(pilot).has(8), false);
  assert.ok(voices(pilot).has(1));
});

test('independent octaves transpose held and sustained melody without moving the chord', () => {
  const { pilot, page } = setup({ autoSustain: true, voiceLead: false });
  pilot.pad(68, true); pilot.pad(72, true);
  const chord = voices(pilot).get(0).notes, melody = voices(pilot).get(8).notes[0];
  page('MELODY'); pilot.knob(1, 1);
  assert.deepEqual(voices(pilot).get(0).notes, chord);
  assert.equal(voices(pilot).get(8).notes[0], melody + 12);
  pilot.pad(72, false); pilot.knob(1, 1);
  assert.equal(voices(pilot).get(8).notes[0], melody + 24);
  page('CHORDS'); pilot.knob(3, -1);
  assert.deepEqual(voices(pilot).get(0).notes, chord.map(n => n - 12));
  assert.equal(voices(pilot).get(8).notes[0], melody + 24);
});

test('octaves remain independent with voice leading enabled', () => {
  const { pilot, page } = setup({ voiceLead: true });
  pilot.pad(68, true); pilot.pad(71, true); pilot.pad(72, true);
  const melody = voices(pilot).get(8).notes;
  page('CHORDS'); pilot.knob(3, 1);
  assert.deepEqual(voices(pilot).get(8).notes, melody);
  assert.equal(pilot.inspect().settings.melodyOctave, 0);
});

test('bass uses the root, not inversion bass, and respects the MIDI lower boundary', () => {
  const c = buildChordBank({ inversion: 1 })[0];
  assert.deepEqual(chordNotes(c), [52, 55, 60]);
  assert.deepEqual(bassNotes(c, { bassOctaves: 1 }), [36]);
  assert.deepEqual(bassNotes(c, { bassOctaves: 2 }), [24]);
  assert.deepEqual(bassNotes(c, { octave: -3, bassOctaves: 2 }), []);
  for (const chord of buildChordBank({ key: 11 })) {
    const settings = { key: 11, octave: -3, melodyOctave: 3, bassOctaves: 2 };
    const bass = bassNotes(chord, settings);
    assert.ok(bass.every(n => n >= 0 && n <= 127 && n % 12 === (11 + chord.rootOffset) % 12));
    assert.ok(melodyNotes(chord, settings).every(n => n === null || Number.isInteger(n) && n >= 0 && n <= 127));
  }
});

test('bass enable and depth update live notes and loop slots, while disabling stops the bass', () => {
  const { pilot, page, commands } = setup();
  pilot.pad(68, true); pilot.step(0, true, { shift: true });
  assert.equal(voices(pilot).has(B), false);
  page('BASS'); pilot.knob(0, 1);
  assert.deepEqual(voices(pilot).get(B).notes, [36]);
  assert.equal(commands.filter(c => c.op === 'slot' && c.index === 0).at(-1).bass, 36);
  pilot.knob(1, -1);
  assert.deepEqual(voices(pilot).get(B).notes, [24]);
  pilot.knob(0, -1);
  assert.equal(voices(pilot).has(B), false);
  assert.equal(commands.filter(c => c.op === 'slot' && c.index === 0).at(-1).bass, -1);
});

test('three parts have separate destinations and channels; route change terminates old voices', () => {
  const { pilot, commands, page, files } = setup({ bassEnabled: true, previewRoute: 'external', channel: 2,
    melodyRoute: 'schwung', melodyChannel: 4, bassRoute: 'move', bassChannel: 6 });
  pilot.pad(68, true); pilot.pad(72, true);
  const ons = commands.filter(c => c.op === 'on');
  const expect = (owner, route, channel) => {
    const c = ons.filter(c => c.owner === owner).at(-1);
    assert.equal(c.route, route); assert.equal(c.channel, channel);
  };
  expect(0, 1, 2); expect(8, 3, 4); expect(B, 0, 6);
  page('MIDI'); pilot.knob(3, 1);
  assert.equal(pilot.inspect().voices.length, 0);
  assert.ok(commands.some(c => c.op === 'off' && c.owner === 0));
  pilot.unload();
  const restored = decodeDocument(JSON.parse(files.get(STATE_PATH))).settings;
  assert.equal(restored.melodyChannel, 5); assert.equal(restored.channel, 2); assert.equal(restored.bassChannel, 6);
});

test('v2 migration inherits old melody octave and routing and preserves edited chords', () => {
  const previous = { format: 'chord-pilot', schemaVersion: 2, version: '0.0.2',
    settings: { octave: -1, previewRoute: 'both', channel: 3 },
    overrides: [{ extension: 4 }], progression: [buildChordBank()[0]] };
  const state = decodeDocument(previous);
  assert.equal(state.settings.melodyOctave, -1);
  assert.equal(state.settings.melodyRoute, 'both'); assert.equal(state.settings.melodyChannel, 3);
  assert.equal(state.settings.autoSustain, false); assert.equal(state.settings.bassEnabled, false);
  assert.equal(state.settings.melodyRetrigger, true);
  assert.equal(state.overrides[0].extension, 4); assert.ok(state.progression[0]);
});

test('sustain forces full loop gates and clears released live notes at a loop boundary and parking', () => {
  const { pilot, commands } = setup({ autoSustain: true, bassEnabled: true, gate: 20 });
  assert.equal(commands.find(c => c.op === 'config').gate, 100);
  pilot.pad(68, true); pilot.step(0, true, { shift: true }); pilot.pad(68, false);
  pilot.pad(72, true); pilot.pad(72, false); pilot.arm(true);
  pilot.tick({ v: 1, armed: true, running: true, slot: 0, cycle: 0, loop_sounding: true, bass_sounding: true });
  assert.equal(pilot.inspect().voices.length, 0);
  pilot.pad(72, true); pilot.pad(72, false); pilot.tick(undefined, true);
  assert.equal(pilot.inspect().voices.length, 0);
});
