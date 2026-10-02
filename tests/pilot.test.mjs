import test from 'node:test';
import assert from 'node:assert/strict';
import { createPilot, CHORD_PADS, MELODY_PADS, PAGES } from '../src/pilot.mjs';
import { decodeDocument } from '../src/settings.mjs';

function harness(initial = {}) {
  const commands = [];
  const frames = [];
  const writes = [];
  const pilot = createPilot({
    read: () => initial.text || null,
    write: (path, text) => { writes.push({ path, text }); return true; },
    send: command => commands.push(command),
    render: model => frames.push(model),
    announce: () => {},
    moveAvailable: true,
  });
  return { pilot, commands, frames, writes };
}

test('PLAY starts with the map; HARMONY keeps eight knob positions', () => {
  const { pilot, frames } = harness();
  pilot.init();
  assert.equal(pilot.inspect().model.pageName, 'PLAY');
  assert.equal(pilot.inspect().model.chordMap.items.length, 8);
  assert.deepEqual(PAGES, ['PLAY', 'CHORDS', 'IDEAS', 'MELODY', 'BASS', 'ARP', 'SEQ', 'MIDI', 'THEORY']);
  pilot.changePage(PAGES.indexOf('CHORDS'));
  const state = pilot.inspect();
  assert.equal(state.model.pageName, 'CHORDS');
  assert.equal(state.model.cells.length, 8);
  assert.deepEqual(state.model.cells.map(cell => cell.fullLabel), [
    'Key', 'Scale', 'Extension', 'Chord octave', 'Spread', 'Voice leading', 'Strum', 'Chord sustain',
  ]);
  assert.ok(frames.length >= 1);
});

test('left lower pads play chords and right lower pads play melody simultaneously', () => {
  const { pilot, commands } = harness();
  pilot.init();
  pilot.pad(CHORD_PADS[0], true, 100);
  pilot.pad(MELODY_PADS[0], true, 90);
  let state = pilot.inspect();
  assert.ok(state.voices.some(([owner]) => owner === 0));
  assert.ok(state.voices.some(([owner]) => owner === 8));
  assert.ok(commands.some(command => command.op === 'on' && command.owner === 0));
  assert.ok(commands.some(command => command.op === 'on' && command.owner === 8));
  pilot.pad(CHORD_PADS[1], true, 100);
  state = pilot.inspect();
  assert.equal(state.active.index, 1);
  assert.ok(state.voices.some(([owner]) => owner === 8));
  pilot.pad(MELODY_PADS[0], false);
  pilot.pad(CHORD_PADS[1], false);
  pilot.pad(CHORD_PADS[0], false);
  assert.equal(pilot.inspect().voices.length, 0);
  assert.ok(commands.filter(command => command.op === 'off').length >= 2);
});

test('steps, capture and loop changes share the same active harmony', () => {
  const { pilot, commands } = harness();
  pilot.init();
  pilot.pad(CHORD_PADS[0], true);
  pilot.pad(CHORD_PADS[0], false);
  pilot.step(0, true, { shift: true });
  assert.equal(pilot.inspect().progression.filter(Boolean).length, 1);
  pilot.capture();
  pilot.pad(CHORD_PADS[1], true);
  pilot.pad(CHORD_PADS[1], false);
  assert.equal(pilot.inspect().progression.filter(Boolean).length, 2);
  pilot.step(0, true);
  pilot.step(0, false);
  pilot.arm(true);
  pilot.tick({ v: 1, armed: true, running: true, slot: 0, cycle: 0, sounding: true });
  assert.equal(pilot.inspect().active.kind, 'slot');
  assert.equal(pilot.inspect().active.index, 0);
  assert.ok(commands.some(command => command.op === 'arm' && command.enabled === 1));
  pilot.step(1, true, { delete: true });
  assert.equal(pilot.inspect().progression[1], null);
});

test('pages and knob changes are readable and persisted', () => {
  const { pilot, writes } = harness();
  pilot.init();
  pilot.changePage(PAGES.indexOf('CHORDS'));
  pilot.focus(2);
  assert.equal(pilot.inspect().model.focused, 2);
  assert.match(pilot.inspect().model.detail, /Extension/);
  pilot.knob(2, 3);
  assert.equal(pilot.inspect().settings.extension, 1);
  pilot.changePage(PAGES.indexOf('SEQ') - pilot.inspect().page);
  assert.equal(pilot.inspect().model.pageName, 'SEQ');
  pilot.knob(1, 1);
  assert.equal(pilot.inspect().settings.rate, 3);
  pilot.changePage(1);
  assert.equal(pilot.inspect().model.pageName, 'MIDI');
  pilot.changePage(PAGES.indexOf('THEORY') - pilot.inspect().page);
  assert.equal(pilot.inspect().model.pageName, 'THEORY');
  assert.ok(pilot.inspect().model.theory);
  for (let i = 0; i < 35; i++) pilot.tick();
  assert.ok(writes.length >= 1);
  const decoded = decodeDocument(JSON.parse(writes.at(-1).text));
  assert.equal(decoded.settings.extension, 1);
  assert.equal(decoded.settings.rate, 3);
});

test('legacy settings import is read into the new state format', () => {
  const old = JSON.stringify({ key: 2, scaleId: 'dorian', extensionBias: 1, colorDepth: 2,
    progression: [{ tonicOffset: 0, quality: 'minor', extensions: ['7'], scaleDegree: 0 }] });
  const { pilot } = harness({ text: old });
  pilot.init();
  const state = pilot.inspect();
  assert.equal(state.settings.key, 2);
  assert.equal(state.settings.scaleId, 'dorian');
  assert.equal(state.progression[0].source, 'diatonic');
  assert.equal(state.progression[0].intervals.length, 4);
});
