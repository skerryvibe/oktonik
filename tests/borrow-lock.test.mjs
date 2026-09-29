import test from 'node:test';
import assert from 'node:assert/strict';
import { createPilot, CHORD_PADS as C, MELODY_PADS as M, PAGES, STOP_PAD, LIVE_BASS_OWNER } from '../src/pilot.mjs';
import { STATE_PATH, encodeDocument } from '../src/settings.mjs';
import { chordName, melodyNotes } from '../src/theory.mjs';

function setup(settings = {}, files = new Map([[STATE_PATH, encodeDocument(settings, [])]])) {
  const commands = [], leds = [];
  const pilot = createPilot({ read: p => files.get(p), write: (p, value) => { files.set(p, value); return true; },
    send: c => commands.push(c), leds: values => leds.push(values) });
  pilot.init();
  const latch = () => { pilot.pad(94, true, 100, { shift: true }); pilot.pad(94, false); };
  const play = (index, modifier) => {
    if (modifier) pilot.pad(modifier, true);
    pilot.pad(C[index], true); pilot.pad(C[index], false);
    if (modifier) pilot.pad(modifier, false);
    return chordName(pilot.inspect().active.chord, pilot.inspect().settings);
  };
  return { pilot, commands, leds, files, latch, play };
}

test('Shift + BORROW toggles once per physical press and does not arm momentary borrow when unlocking', () => {
  const { pilot, commands } = setup();
  const before = commands.length;
  pilot.pad(94, true, 100, { shift: true });
  pilot.pad(94, true, 70, { shift: true });
  assert.equal(pilot.inspect().borrowLocked, true);
  pilot.pad(94, false);
  assert.equal(pilot.inspect().modifiers.borrow, true);
  pilot.pad(94, true, 100, { shift: true });
  assert.equal(pilot.inspect().borrowLocked, false);
  assert.equal(pilot.inspect().modifiers.borrow, undefined); // Even before lifting BORROW.
  pilot.pad(94, false, 0, { shift: true });
  assert.equal(commands.length, before);
  pilot.pad(94, true); assert.equal(pilot.inspect().modifiers.borrow, true);
  pilot.pad(94, false); assert.equal(pilot.inspect().modifiers.borrow, undefined);
});

test('latched BORROW supports ii-V-I and SUB on borrowed targets without changing the saved bank', () => {
  const { pilot, latch, play } = setup();
  const bank = structuredClone(pilot.inspect().bank), settings = pilot.inspect().settings;
  latch();
  assert.equal(play(3, 92), 'Gm7b5'); // II of borrowed Fm.
  assert.equal(play(3, 84), 'C7');
  assert.equal(play(3), 'Fm');
  assert.equal(play(3, 93), 'F#7'); // Existing display spelling of Gb7.
  assert.equal(play(5), 'Ab');
  pilot.pad(94, true); pilot.pad(94, false); // Plain press does not toggle the latch.
  assert.equal(play(5), 'Ab');
  assert.equal(pilot.inspect().borrowLocked, true);
  assert.deepEqual(pilot.inspect().bank, bank);
  assert.deepEqual(pilot.inspect().settings, settings);
  latch(); assert.equal(play(3), 'F'); assert.equal(play(5), 'Am');
});

test('locking/unlocking is silent with sustained chord, bass and melody; next attack chooses the harmony', () => {
  for (const mode of ['chord', 'scale', 'chromatic']) {
    const { pilot, commands, latch, play } = setup({ autoSustain: true, bassEnabled: true, melodyMode: mode, melodyAdapt: true });
    play(3); pilot.pad(M[2], true);
    let voices = structuredClone(pilot.inspect().voices), count = commands.length;
    latch();
    assert.deepEqual(pilot.inspect().voices, voices); assert.equal(commands.length, count);
    assert.equal(play(3), 'Fm');
    const active = pilot.inspect().active.chord;
    assert.equal(new Map(pilot.inspect().voices).get(LIVE_BASS_OWNER).notes[0] % 12, 5);
    if (mode !== 'chord') assert.equal(new Map(pilot.inspect().voices).get(10).notes[0], melodyNotes(active,
      {...pilot.inspect().settings, ...(mode === 'scale' ? {scaleId:'natural_minor'} : {})})[2]);
    voices = structuredClone(pilot.inspect().voices); count = commands.length;
    latch();
    assert.deepEqual(pilot.inspect().voices, voices); assert.equal(commands.length, count);
    assert.equal(chordName(pilot.inspect().active.chord), 'Fm');
    assert.equal(play(3), 'F');
  }
});

test('BORROW lock remains visible through page changes, EDIT, STOP and parking; reopening starts unlocked', () => {
  const { pilot, leds, latch, play, files } = setup();
  latch();
  for (const page of PAGES) {
    pilot.changePage(PAGES.indexOf(page) - pilot.inspect().page);
    for (let i=0; i<70; i++) pilot.tick();
    assert.equal(pilot.inspect().model.borrowLocked, true);
    assert.equal(leds.at(-1).find(l => l.note === 94 && !l.button).role, 'borrowLocked');
  }
  pilot.selectEdit(3); pilot.changePage(1);
  assert.equal(pilot.inspect().model.pageCount, 1);
  assert.equal(pilot.inspect().model.borrowLocked, true);
  pilot.pad(STOP_PAD, true); pilot.pad(STOP_PAD, false);
  assert.equal(pilot.inspect().borrowLocked, true);
  pilot.tick(null, true); pilot.tick(null, false);
  assert.equal(play(3), 'Fm');
  pilot.unload();
  assert.equal(pilot.inspect().borrowLocked, false);
  assert.equal(setup({}, files).pilot.inspect().borrowLocked, false);
});

test('KEEP on the single EDIT page commits a borrowed chord and clears its latch to prevent double borrowing', () => {
  const { pilot, latch, play, files } = setup();
  latch(); assert.equal(play(5), 'Ab');
  pilot.selectEdit(5); pilot.knob(5, 1);
  assert.equal(pilot.inspect().borrowLocked, false);
  assert.equal(play(5), 'Ab'); // A second borrow of this chromatic root would give Abm.
  assert.equal(pilot.inspect().model.pageCount, 1);
  pilot.unload();
  assert.equal(setup({}, files).play(5), 'Ab');
  pilot.knob(6, 1); assert.equal(play(5), 'Am');
});

test('latched borrow never rewrites saved progression previews', () => {
  const { pilot, latch, play } = setup();
  play(3); pilot.step(0, true, { shift: true }); pilot.step(0, false);
  const saved = structuredClone(pilot.inspect().progression);
  latch(); pilot.step(0, true);
  assert.equal(chordName(pilot.inspect().active.chord), 'F');
  assert.deepEqual(pilot.inspect().progression, saved);
  assert.equal(play(3), 'Fm');
});

test('BORROW lock also approaches parallel-major targets from a minor key', () => {
  const { latch, play } = setup({ scaleId: 'natural_minor' });
  latch();
  assert.equal(play(3, 92), 'Gm7');
  assert.equal(play(3, 84), 'C7');
  assert.equal(play(3), 'F');
  latch(); assert.equal(play(3), 'Fm');
});
