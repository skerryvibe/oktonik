import test from 'node:test';
import assert from 'node:assert/strict';
import { createPilot, CHORD_PADS as C, MELODY_PADS as M, MODIFIER_PADS as X, PAGES } from '../src/pilot.mjs';
import { SCALES, EXTENSIONS, buildChordBank, chordNotes, melodyNotes, applyModifiers,
  chordName, degreeName, voiceLeadNotes } from '../src/theory.mjs';
import { STATE_PATH, decodeDocument, encodeDocument } from '../src/settings.mjs';

function setup(files = new Map()) {
  const commands = [];
  const pilot = createPilot({ read: path => files.get(path),
    write: (path, data) => { files.set(path, data); return true; },
    send: command => commands.push(command), moveAvailable: true });
  pilot.init();
  pilot.changePage(PAGES.indexOf('CHORDS'));
  return { pilot, files, commands };
}
const pc = n => ((n % 12) + 12) % 12;
const pitchSet = notes => [...new Set(notes.map(pc))].sort((a,b) => a-b);
const voice = (pilot, owner) => new Map(pilot.inspect().voices).get(owner)?.notes;

test('per-pad extension follows transposition, survives reload, and resets to current global value', () => {
  const { pilot, files } = setup();
  pilot.pad(C[1], true, 100, { shift: true });
  assert.equal(pilot.inspect().editIndex, 1);
  assert.equal(pilot.inspect().voices.length, 0);
  assert.equal(pilot.inspect().model.pageName, 'EDIT 2');
  pilot.knob(2, 6); // AUTO -> explicit ninth
  assert.equal(chordName(pilot.inspect().bank[1]), 'Dm9');
  assert.equal(chordName(pilot.inspect().bank[0]), 'C');
  pilot.pad(C[1], false);
  pilot.pad(C[1], true, 100, { shift: true }); // ALL
  pilot.knob(2, 3); // global sevenths
  assert.equal(chordName(pilot.inspect().bank[0]), 'Cmaj7');
  assert.equal(chordName(pilot.inspect().bank[1]), 'Dm9');
  pilot.knob(0, 2);
  assert.equal(chordName(pilot.inspect().bank[1], pilot.inspect().settings), 'Em9');
  pilot.unload();
  const restored = setup(files).pilot;
  assert.equal(chordName(restored.inspect().bank[1], restored.inspect().settings), 'Em9');
  restored.selectEdit(1); restored.resetEdit();
  assert.equal(chordName(restored.inspect().bank[1], restored.inspect().settings), 'Em7');
  assert.equal(restored.inspect().overrides[1], null);
});

test('v1 migration preserves numeric seventh/ninth IDs and never overwrites original settings', () => {
  const oldPath = STATE_PATH.replace(/-v\d\./, '-v1.');
  const old = JSON.stringify({ format: 'chord-pilot', schemaVersion: 1, settings: { extension: 2 },
    progression: [buildChordBank({ extension: 1 })[0]] });
  const { pilot, files } = setup(new Map([[oldPath, old]]));
  assert.equal(pilot.inspect().settings.extension, 2);
  pilot.tick();
  assert.equal(files.get(oldPath), old);
  assert.equal(JSON.parse(files.get(STATE_PATH)).schemaVersion, 7);
  assert.equal(decodeDocument(JSON.parse(files.get(STATE_PATH))).progression[0].intervals.length, 4);
});

test('6, add9, 11 and 13 contain the intended tones and remain playable for every scale', () => {
  const expected = { 3: [0,4,7,9], 4: [0,4,7,14], 5: [0,4,7,11,14,17], 6: [0,4,7,11,14,17,21] };
  for (const [extension, intervals] of Object.entries(expected)) {
    assert.deepEqual(buildChordBank({ extension: Number(extension) })[0].intervals, intervals);
  }
  for (const scale of SCALES) for (let ext = 0; ext < EXTENSIONS.length; ext++) {
    for (const key of [0, 1, 11]) for (const octave of [-3, 3]) {
      const settings = { scaleId: scale.id, extension: ext, key, octave, voiceLead: true };
      let previous = [];
      for (const chord of buildChordBank(settings)) {
        const notes = voiceLeadNotes(chord, settings, previous);
        assert.ok(notes.length && notes.length <= 8);
        assert.ok(notes.every(n => Number.isInteger(n) && n >= 0 && n <= 127));
        assert.deepEqual(pitchSet(notes), pitchSet(chord.intervals.map(n => n + key + chord.rootOffset)));
        assert.ok(notes.every(n => scale.intervals.includes(pc(n - key))));
        assert.equal(melodyNotes(chord, settings).length, 16);
        previous = notes;
      }
    }
  }
});

test('modifiers give the dominant of each chord, preserve sevenths on flips, and replace thirds for sus', () => {
  const bank = buildChordBank({ extension: 1 });
  assert.equal(chordName(applyModifiers(bank[1], { dom: true })), 'A7');
  assert.equal(degreeName(applyModifiers(bank[1], { dom: true })), 'V/ii');
  for (const chord of bank) {
    const dom = applyModifiers(chord, { dom: true });
    assert.equal(dom.rootOffset, pc(chord.rootOffset + 7));
    assert.deepEqual(dom.intervals, [0,4,7,10]);
  }
  assert.deepEqual(applyModifiers(bank[0], { flip: true }).intervals, [0,3,7,11]);
  assert.deepEqual(applyModifiers(bank[1], { flip: true }).intervals, [0,4,7,10]);
  assert.deepEqual(applyModifiers(bank[6], { flip: true }).intervals, bank[6].intervals);
  for (const sus of [2,4]) {
    const result = applyModifiers(bank[1], { sus });
    assert.ok(!result.intervals.includes(3) && !result.intervals.includes(4));
    assert.ok(result.intervals.includes(sus === 2 ? 2 : 5));
    assert.ok(result.intervals.includes(10));
  }
});

test('modifiers prepare the next attack without changing held notes; last-held sus wins', () => {
  const { pilot, commands } = setup();
  pilot.pad(C[1], true); pilot.pad(M[0], true);
  const count = commands.length, previous = pilot.inspect().voices;
  pilot.pad(X[0], true);
  assert.equal(commands.length, count);
  assert.deepEqual(pilot.inspect().voices, previous);
  pilot.pad(C[1], true);
  assert.deepEqual(pitchSet(voice(pilot, 1)), [1,4,7,9]); // A7
  assert.ok(pitchSet(voice(pilot, 1)).includes(pc(voice(pilot, 8)[0])));
  pilot.pad(X[0], false);
  assert.deepEqual(pitchSet(voice(pilot, 1)), [1,4,7,9]); // stays A7
  pilot.pad(X[2], true); pilot.pad(X[3], true);
  assert.equal(pilot.inspect().modifiers.sus, 4);
  pilot.pad(X[3], false);
  assert.equal(pilot.inspect().modifiers.sus, 2);
  pilot.pad(X[2], false);
  pilot.pad(C[1], true);
  assert.deepEqual(pitchSet(voice(pilot, 1)), [2,5,9]);
  pilot.pad(C[1], false); pilot.pad(M[0], false);
  assert.equal(pilot.inspect().voices.length, 0);
  assert.ok(pilot.inspect().overrides.every(n => n === null));
});

test('modifier before a chord, KEEP, capture and restart preserve the chosen harmony', () => {
  const { pilot, files } = setup();
  pilot.pad(X[0], true); pilot.pad(C[1], true);
  pilot.keepVariation();
  assert.equal(chordName(pilot.inspect().bank[1]), 'A7');
  assert.equal(pilot.inspect().modifiers.dom, false);
  pilot.pad(X[0], false);
  assert.equal(chordName(pilot.inspect().active.chord), 'A7');
  pilot.step(0, true, { shift: true });
  pilot.unload();
  const state = setup(files).pilot.inspect();
  assert.equal(chordName(state.bank[1]), 'A7');
  assert.equal(degreeName(state.progression[0]), 'V/ii');
  assert.equal(chordName(state.bank[0]), 'C');
});

test('voice leading reduces C to F movement, respects locked bass, and never drifts over cycles', () => {
  const bank = buildChordBank();
  const settings = { voiceLead: true, key: 0, octave: 0 };
  const start = chordNotes(bank[0]);
  const next = voiceLeadNotes(bank[3], settings, start);
  const distance = notes => notes.reduce((sum, n, i) => sum + Math.abs(n - start[i]), 0);
  assert.ok(distance(next) < distance(chordNotes(bank[3])));
  assert.ok(next.includes(48));
  const locked = { ...bank[3], inversion: 1, lockInversion: true };
  assert.deepEqual(voiceLeadNotes(locked, settings, start), chordNotes(locked));
  let previous = start;
  for (let pass = 0; pass < 100; pass++) for (const chord of bank) {
    previous = voiceLeadNotes(chord, settings, previous);
    assert.ok(previous[0] >= 36 && previous[0] <= 60);
  }
});

test('held melody keeps a shared tone, then takes the nearest new chord tone', () => {
  const { pilot } = setup(new Map([[STATE_PATH, encodeDocument({ melodyMode: 'chord', melodyOctave: 0 }, [])]]));
  pilot.pad(C[0], true); pilot.pad(M[0], true); // C4
  pilot.pad(C[3], true); // F: retains C4
  assert.deepEqual(voice(pilot, 8), [60]);
  pilot.pad(C[4], true); // G: B3 is closest
  assert.deepEqual(voice(pilot, 8), [59]);
  pilot.panic();
  assert.equal(pilot.inspect().voices.length, 0);
});

test('loop notes are stable, retain custom chords, and are used for melody and display', () => {
  const { pilot, commands } = setup(new Map([[STATE_PATH, encodeDocument({ voiceLead: true }, [])]]));
  pilot.pad(C[0], true); pilot.step(0, true, { shift: true }); pilot.pad(C[0], false);
  pilot.pad(C[3], true); pilot.step(1, true, { shift: true }); pilot.pad(C[3], false);
  const slots = pilot.inspect().loopNotes.map(n => [...n]);
  assert.ok(slots[0].some(n => slots[1].includes(n)));
  pilot.arm(true); pilot.pad(M[0], true);
  pilot.tick({ v: 1, armed: true, running: true, slot: 1, cycle: 1, loop_sounding: true });
  assert.deepEqual(pilot.inspect().active.notes, slots[1]);
  assert.ok(pitchSet(slots[1]).includes(pc(voice(pilot, 8)[0])));
  pilot.changePage(PAGES.indexOf('THEORY') - pilot.inspect().page);
  assert.ok(slots[1].every(n => pilot.inspect().model.theory.notes.includes(n)));
  assert.ok(commands.some(c => c.op === 'config' && c.legato === 1));
  pilot.tick(undefined, true);
  assert.equal(pilot.inspect().voices.length, 0);
  assert.equal(pilot.inspect().armed, true);
});

test('invalid overrides are discarded without damaging settings or valid progression', () => {
  const raw = JSON.parse(encodeDocument({}, [buildChordBank()[0]], []));
  raw.overrides = [{ extension: 900, inversion: -8, variant: { sus: 3 } }, { extension: 4 }];
  const restored = decodeDocument(raw);
  assert.equal(restored.overrides[0], null);
  assert.equal(restored.overrides[1].extension, 4);
  assert.ok(restored.progression[0]);
});
