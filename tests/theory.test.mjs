import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCALES, DEFAULT_HARMONY, normalizeHarmony, buildChordBank, buildLegacyChordBank, chordNotes,
  melodyNotes, adaptiveScaleIntervals, applyModifiers, chordName, noteName, degreeName, importLegacyChord,
} from '../src/theory.mjs';

const pc = n => ((n % 12) + 12) % 12;
const uniqueSorted = values => [...new Set(values)].sort((a, b) => a - b);

test('all twelve scale IDs remain available and scale definitions are immutable', () => {
  assert.deepEqual(SCALES.map(scale => scale.id), ['major', 'natural_minor', 'harmonic_minor', 'melodic_minor',
    'dorian', 'phrygian', 'lydian', 'mixolydian', 'aeolian', 'locrian', 'major_pentatonic', 'minor_pentatonic']);
  assert.throws(() => SCALES[0].intervals.push(1), TypeError);
});

test('normalize settings handles invalid stored input and numeric bounds', () => {
  for (const input of [null, undefined, 'invalid', {}, { key: NaN, octave: Infinity }]) assert.deepEqual(normalizeHarmony(input), DEFAULT_HARMONY);
  assert.deepEqual(normalizeHarmony({ key: -13.9, scaleId: 'missing', extension: 9, color: -2,
    inversion: 10, spread: 2.9, octave: -40, strumMs: 200 }),
  { key: 11, scaleId: 'major', extension: 6, color: 0, inversion: 3, spread: 2, octave: -3, strumMs: 100 });
});

test('C major bank is I through vii diminished then high I', () => {
  const bank = buildChordBank();
  assert.deepEqual(bank.map(chord => chordName(chord)), ['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim', 'C']);
  assert.deepEqual(bank.map(chord => degreeName(chord)), ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'viio', 'I']);
  assert.deepEqual(chordNotes(bank[0]), [48, 52, 55]);
  assert.deepEqual(chordNotes(bank[7]), [60, 64, 67]);
});

test('sevenths and ninths are exact stacked scale thirds, including altered modes', () => {
  assert.deepEqual(chordNotes(buildChordBank({ extension: 1 })[0]), [48, 52, 55, 59]);
  assert.deepEqual(chordNotes(buildChordBank({ extension: 2 })[1]), [50, 53, 57, 60, 64]);
  const harmonicMinor = buildChordBank({ scaleId: 'harmonic_minor', extension: 2 });
  assert.deepEqual(harmonicMinor[4].intervals, [0, 4, 7, 10, 13]);
  assert.equal(chordName(harmonicMinor[4], { scaleId: 'harmonic_minor' }), 'G7b9');
  assert.equal(chordName(harmonicMinor[0], { scaleId: 'harmonic_minor' }), 'Cm(maj9)');
});

test('pentatonic pads continue naturally in the next octave', () => {
  const bank = buildChordBank({ scaleId: 'major_pentatonic' });
  assert.deepEqual(bank.map(chord => chord.degree), [0, 1, 2, 3, 4, 0, 1, 2]);
  assert.deepEqual(bank.map(chord => chord.register), [0, 0, 0, 0, 0, 1, 1, 1]);
  assert.deepEqual(bank[0].intervals, [0, 4, 9]);
});

test('every strict scale/key/extension bank stays within its scale and retains stack sizes', () => {
  for (const scale of SCALES) for (let key = 0; key < 12; key++) for (let extension = 0; extension < 3; extension++) {
    const settings = { key, scaleId: scale.id, extension };
    const allowed = new Set(scale.intervals.map(interval => pc(key + interval)));
    for (const chord of buildChordBank(settings)) {
      assert.equal(chord.intervals.length, 3 + extension);
      assert.equal(chord.source, 'diatonic');
      assert.ok(chordNotes(chord, settings).every(note => allowed.has(pc(note))), `${scale.id} ${key} ${extension}`);
      assert.ok(melodyNotes(chord, settings).every(note => note === null || allowed.has(pc(note))));
    }
  }
});

test('legacy color conversion retains the original pad-8 borrowed and secondary harmonies', () => {
  for (const scale of SCALES) for (let extension = 0; extension < 3; extension++) {
    const settings = { scaleId: scale.id, extension };
    const strict = buildLegacyChordBank(settings);
    for (const color of [1, 2]) {
      const bank = buildLegacyChordBank({ ...settings, color });
      assert.deepEqual(bank.slice(0, 7), strict.slice(0, 7));
      assert.equal(bank[7].source, color === 1 ? 'borrowed' : 'secondary');
      assert.equal(bank[7].intervals.length, 3 + extension);
      assert.ok(bank[7].degree >= 0 && bank[7].degree < scale.intervals.length);
    }
  }
  assert.equal(chordName(buildLegacyChordBank({ color: 1 })[7]), 'Fm');
  assert.equal(degreeName(buildLegacyChordBank({ color: 1 })[7]), 'iv');
  assert.equal(chordName(buildLegacyChordBank({ color: 2, extension: 1 })[7]), 'D7');
  assert.equal(degreeName(buildLegacyChordBank({ color: 2 })[7]), 'V/V');
  assert.equal(degreeName(buildLegacyChordBank({ scaleId: 'locrian', color: 2 })[7], { scaleId: 'locrian' }), 'V/bV');
  assert.equal(degreeName(buildLegacyChordBank({ scaleId: 'lydian' })[3], { scaleId: 'lydian' }), '#ivo');
});

test('inversions preserve bass identity even with extended pentatonic stacks', () => {
  assert.deepEqual(chordNotes(buildChordBank({ inversion: 1 })[0]), [52, 55, 60]);
  assert.equal(chordName(buildChordBank({ inversion: 1 })[0]), 'C/E');
  assert.equal(chordName(buildChordBank({ inversion: 2, spread: 2 })[0]), 'C/G');
  for (const scale of SCALES) for (let extension = 0; extension < 3; extension++) for (let inversion = 0; inversion < 4; inversion++) {
    const chord = buildChordBank({ scaleId: scale.id, extension, inversion })[0];
    const expectedBass = pc(chord.intervals[Math.min(inversion, chord.intervals.length - 1)]);
    assert.equal(pc(chordNotes(chord)[0]), expectedBass, `${scale.id} ${extension} ${inversion}`);
  }
});

test('chords fit as a group; 16-note melody has silent out-of-range pads without clipping or folding', () => {
  for (const scale of SCALES) for (let key = 0; key < 12; key++) for (let extension = 0; extension < 3; extension++) {
    for (let color = 0; color < 3; color++) for (const octave of [-3, 0, 3]) for (let spread = 0; spread < 3; spread++) {
      const settings = { key, scaleId: scale.id, extension, color, octave, spread, inversion: 3 };
      for (const chord of buildChordBank(settings)) {
        const notes = chordNotes(chord, settings);
        const melody = melodyNotes(chord, settings);
        assert.deepEqual(notes, uniqueSorted(notes));
        assert.ok(notes.every(note => Number.isInteger(note) && note >= 0 && note <= 127));
        assert.deepEqual(uniqueSorted(notes.map(pc)), uniqueSorted(chord.intervals.map(interval => pc(key + chord.rootOffset + interval))));
        assert.equal(melody.length, 16);
        const playable = melody.filter(Number.isInteger);
        assert.deepEqual(playable, uniqueSorted(playable));
        assert.ok(melody.every(note => note === null || note >= 0 && note <= 127 && notes.some(other => pc(other) === pc(note))));
      }
    }
  }
});

test('melody starts above the chord root and follows only its pitch classes', () => {
  assert.deepEqual(melodyNotes(buildChordBank()[0]), [60, 64, 67, 72, 76, 79, 84, 88, 91, 96, 100, 103, 108, 112, 115, 120]);
  const chord = buildChordBank({ key: 7 })[4];
  assert.deepEqual(chordNotes(chord, { key: 7 }), [62, 66, 69]);
  assert.equal(chordName(chord, { key: 7 }), 'D');
});

test('adaptive scale makes the smallest chromatic substitutions for played borrowed and dominant chords', () => {
  const major = { scaleId: 'major', key: 0, melodyMode: 'scale' };
  const bank = buildChordBank(major);
  assert.deepEqual(adaptiveScaleIntervals(bank[0], major), [0, 2, 4, 5, 7, 9, 11]);
  assert.deepEqual(adaptiveScaleIntervals(applyModifiers(bank[1], { dom: true }), { ...major, melodyAdapt: true }), [1, 2, 4, 5, 7, 9, 11]);
  assert.deepEqual(adaptiveScaleIntervals({ rootOffset: 9, intervals: [0, 4, 7, 10] }, { ...major, melodyAdapt: true }), [1, 2, 4, 5, 7, 9, 11]);
  assert.deepEqual(adaptiveScaleIntervals({ rootOffset: 5, intervals: [0, 3, 7] }, { ...major, melodyAdapt: true }), [0, 2, 4, 5, 7, 8, 11]);
  assert.deepEqual(adaptiveScaleIntervals({ rootOffset: 5, intervals: [0, 3, 7] }, major), [0, 2, 4, 5, 7, 9, 11]);
});

test('adaptive scale preserves tonic and ordered pad positions while containing every chord pitch class', () => {
  for (const scale of SCALES) for (const key of [0, 5, 11]) {
    for (const chord of buildChordBank({ scaleId: scale.id, key, color: 2 })) {
      const settings = { scaleId: scale.id, key, melodyMode: 'scale', melodyAdapt: true };
      const intervals = adaptiveScaleIntervals(chord, settings);
      assert.ok(intervals.length <= scale.intervals.length);
      assert.equal(intervals[0], scale.intervals[0]);
      const chordPcs = chord.intervals.map(n => pc(n + chord.rootOffset + key));
      const melodyPcs = intervals.map(n => pc(n + key));
      assert.ok(chordPcs.every(note => melodyPcs.includes(note)), `${scale.id} ${key}`);
      const notes = melodyNotes(chord, settings);
      assert.ok(notes.every(note => note === null || note >= 0 && note <= 127));
    }
  }
});

test('naming spells diatonic roots and inversion basses conventionally', () => {
  assert.equal(noteName(61), 'Db');
  assert.equal(noteName(-1), 'B');
  assert.equal(noteName(NaN), '--');
  assert.equal(chordName(buildChordBank({ key: 7 })[6], { key: 7 }), 'F#dim');
  assert.equal(chordName(buildChordBank({ key: 5 })[3], { key: 5 }), 'Bb');
  assert.equal(chordName(buildChordBank({ extension: 2 })[0]), 'Cmaj9');
  assert.equal(chordName(buildChordBank({ extension: 2 })[1]), 'Dm9');
  assert.equal(chordName(buildChordBank({ scaleId: 'major_pentatonic', extension: 2 })[0]), 'C6/9');
  assert.equal(chordName(buildChordBank({ key: 1, inversion: 1 })[0], { key: 1 }), 'Db/F');
});

test('legacy import preserves supported families and explicit interval overrides', () => {
  const examples = [
    ['major', ['maj9'], [0, 4, 7, 11, 14]], ['minor', ['11'], [0, 3, 7, 10, 14, 17]],
    ['diminished', ['7'], [0, 3, 6, 9]], ['augmented', [], [0, 4, 8]],
    ['sus2', [], [0, 2, 7]], ['sus4', [], [0, 5, 7]], ['power', [], [0, 7]],
    ['half_diminished', [], [0, 3, 6, 10]], ['dim7', [], [0, 3, 6, 9]],
  ];
  for (const [quality, extensions, intervals] of examples) {
    const chord = importLegacyChord({ tonicOffset: 5, quality, extensions, inversion: 1, spread: 2, registerShift: -1, scaleDegree: 3 });
    assert.deepEqual(chord, { rootOffset: 5, intervals, inversion: 1, spread: 2, register: -1, degree: 3, source: 'diatonic' });
    assert.deepEqual(uniqueSorted(chordNotes(chord).map(pc)), uniqueSorted(intervals.map(interval => pc(interval + 5))));
  }
  assert.deepEqual(importLegacyChord({ tonicOffset: 0, quality: 'custom', intervals: [7, 0, 4, 4] }).intervals, [0, 4, 7]);
  const dominant = importLegacyChord({ tonicOffset: 2, quality: 'major', extensions: ['7'], sourceClass: 'secondary', targetDegree: 4 });
  assert.equal(degreeName(dominant), 'V/V');
});

test('malformed legacy chords and invalid playable chords fail closed', () => {
  for (const raw of [null, [], {}, { tonicOffset: '0', quality: 'major' }, { tonicOffset: 0, quality: 'prototype' },
    { tonicOffset: 0, quality: 'major', extensions: ['wat'] }, { tonicOffset: 0, intervals: [] },
    { tonicOffset: 0, intervals: [0, Infinity] }, { tonicOffset: 0, intervals: [1, 4, 7] }]) {
    assert.equal(importLegacyChord(raw), null);
  }
  for (const raw of [null, {}, { rootOffset: 0, intervals: [0, 1000] }]) {
    assert.deepEqual(chordNotes(raw), []);
    assert.deepEqual(melodyNotes(raw), []);
    assert.equal(chordName(raw), '--');
    assert.equal(degreeName(raw), '--');
  }
});
