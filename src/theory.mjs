// OKTONIK's musical model. Chords store intent, never cached MIDI notes.
const wrap = (n, size = 12) => ((n % size) + size) % size;
const integer = (value, fallback, min, max) => Number.isFinite(value)
  ? Math.min(max, Math.max(min, Math.trunc(value))) : fallback;
const uniqueSorted = values => [...new Set(values)].sort((a, b) => a - b);

export const SCALES = Object.freeze([
  ['major', 'Major', 'Major', [0, 2, 4, 5, 7, 9, 11]],
  ['natural_minor', 'Natural Minor', 'Nat min', [0, 2, 3, 5, 7, 8, 10]],
  ['harmonic_minor', 'Harmonic Minor', 'Harm min', [0, 2, 3, 5, 7, 8, 11]],
  ['melodic_minor', 'Melodic Minor', 'Mel min', [0, 2, 3, 5, 7, 9, 11]],
  ['dorian', 'Dorian', 'Dorian', [0, 2, 3, 5, 7, 9, 10]],
  ['phrygian', 'Phrygian', 'Phrygian', [0, 1, 3, 5, 7, 8, 10]],
  ['lydian', 'Lydian', 'Lydian', [0, 2, 4, 6, 7, 9, 11]],
  ['mixolydian', 'Mixolydian', 'Mixolyd', [0, 2, 4, 5, 7, 9, 10]],
  ['aeolian', 'Aeolian', 'Aeolian', [0, 2, 3, 5, 7, 8, 10]],
  ['locrian', 'Locrian', 'Locrian', [0, 1, 3, 5, 6, 8, 10]],
  ['major_pentatonic', 'Major Pentatonic', 'Maj pent', [0, 2, 4, 7, 9]],
  ['minor_pentatonic', 'Minor Pentatonic', 'Min pent', [0, 3, 5, 7, 10]],
].map(([id, name, short, intervals]) => Object.freeze({ id, name, short, intervals: Object.freeze(intervals) })));

export const DEFAULT_HARMONY = Object.freeze({
  key: 0, scaleId: 'major', extension: 0, color: 0,
  inversion: 0, spread: 0, octave: 0, strumMs: 0,
});

// Preserve 0.0.1 numeric IDs for triad, seventh and ninth.
export const EXTENSIONS = Object.freeze(['TRIAD', '7TH', '9TH', '6', 'ADD9', '11TH', '13TH']);
export const EXTENSION_ORDER = Object.freeze([0, 3, 4, 1, 2, 5, 6]);
export const CHORD_TYPES = Object.freeze(['AUTO', 'MAJ', 'MIN', 'DIM', 'AUG', 'SUS2', 'SUS4']);
export const PAD_EXTENSIONS = Object.freeze(['AUTO', 'TRIAD', '6', 'ADD9', '7', 'MAJ7', '9', 'MAJ9', '11', 'MAJ11', '13', 'MAJ13', 'DIM7']);
const TYPES = Object.freeze({ MAJ: [0,4,7], MIN: [0,3,7], DIM: [0,3,6], AUG: [0,4,8], SUS2: [0,2,7], SUS4: [0,5,7] });
export const MELODY_MODES = Object.freeze(['chord', 'scale', 'chromatic']);
export const BASS_OCTAVE_MIN = -5;
export const BASS_OCTAVE_MAX = 6;

const pitchDistance = (a, b) => {
  const distance = Math.abs(a - b) % 12;
  return Math.min(distance, 12 - distance);
};

/**
 * Return the current scale's pitch classes, with the smallest possible set of
 * substitutions needed to contain the played chord. The values are relative
 * to the global tonic, so the melodic pad layout remains stable in every key.
 * A major/minor third is used to choose the musically expected side of a
 * chromatic alteration (F -> F# for a dominant, A -> Ab for a borrowed minor).
 */
export function adaptiveScaleIntervals(rawChord, input = {}) {
  const chord = chordData(rawChord);
  const settings = normalizeHarmony(input);
  const base = [...selectedScale(settings).intervals];
  if (!chord || input.melodyAdapt !== true || !base.length) return base;
  const chordPcs = uniqueSorted(chord.intervals.map(interval => wrap(interval + chord.rootOffset)));
  const extras = chordPcs.filter(note => !base.includes(note));
  if (!extras.length) return base;
  const hasMinorThird = chord.intervals.includes(3) && !chord.intervals.includes(4);
  const result = [...base];
  const replaced = new Set();
  for (const extra of extras) {
    const candidates = result.map((note, index) => ({ note, index }))
      .filter(candidate => !chordPcs.includes(candidate.note) && !replaced.has(candidate.index));
    if (!candidates.length) { result.push(extra); replaced.add(result.length - 1); continue; }
    candidates.sort((a, b) => {
      const distance = pitchDistance(a.note, extra) - pitchDistance(b.note, extra);
      if (distance) return distance;
      // Raised major thirds replace the lower chromatic neighbour; minor
      // thirds replace the upper neighbour. This gives C# in A7 and Ab in Fm.
      const preferred = candidate => hasMinorThird
        ? wrap(candidate.note - extra) === 1 ? 0 : 1
        : wrap(extra - candidate.note) === 1 ? 0 : 1;
      const direction = preferred(a) - preferred(b);
      return direction || a.index - b.index;
    });
    const chosen = candidates[0];
    result[chosen.index] = extra;
    replaced.add(chosen.index);
  }
  return uniqueSorted(result);
}

export function normalizeHarmony(input = {}) {
  const value = input && typeof input === 'object' ? input : {};
  return {
    key: Number.isFinite(value.key) ? wrap(Math.trunc(value.key)) : 0,
    scaleId: SCALES.some(scale => scale.id === value.scaleId) ? value.scaleId : 'major',
    extension: integer(value.extension, 0, 0, EXTENSIONS.length - 1),
    color: integer(value.color, 0, 0, 2),
    inversion: integer(value.inversion, 0, -3, 3),
    spread: integer(value.spread, 0, 0, 2),
    octave: integer(value.octave, 0, -3, 3),
    strumMs: integer(value.strumMs, 0, 0, 100),
  };
}

function selectedScale(settings) {
  return SCALES.find(scale => scale.id === settings.scaleId) || SCALES[0];
}

function scaleTone(scale, position) {
  return scale.intervals[wrap(position, scale.intervals.length)]
    + 12 * Math.floor(position / scale.intervals.length);
}

function stack(scale, degree, count) {
  // Every other scale note: heptatonic triads/7ths/9ths, contained pentatonic shapes.
  return Array.from({ length: count }, (_, i) => scaleTone(scale, degree + i * 2) - scaleTone(scale, degree));
}

function extendedStack(scale, degree, extension) {
  const root = scaleTone(scale, degree);
  if (extension === 3) return uniqueSorted([...stack(scale, degree, 3), scaleTone(scale, degree + 5) - root]);
  if (extension === 4) return uniqueSorted([...stack(scale, degree, 3), scaleTone(scale, degree + 1) - root + 12]);
  return stack(scale, degree, extension === 5 ? 6 : extension === 6 ? 7 : 3 + extension);
}

export function buildChordBank(input = {}) {
  const settings = normalizeHarmony(input);
  const scale = selectedScale(settings);
  const bank = Array.from({ length: 8 }, (_, index) => {
    const degree = index % scale.intervals.length;
    return {
      rootOffset: scale.intervals[degree], intervals: extendedStack(scale, degree, settings.extension),
      degree, source: 'diatonic', register: Math.floor(index / scale.intervals.length),
      inversion: settings.inversion, spread: settings.spread,
    };
  });
  return bank;
}

// Read-only compatibility for converting the old pad-8 special case.
export function buildLegacyChordBank(input = {}) {
  const settings = normalizeHarmony(input), scale = selectedScale(settings);
  const bank = buildChordBank(settings);
  if (settings.color === 1) {
    // Parallel minor iv for major-family scales, parallel major IV for minor-family scales.
    const parallel = SCALES.find(item => item.id === (scale.intervals.includes(3) ? 'major' : 'natural_minor'));
    bank[7] = {
      rootOffset: 5, intervals: extendedStack(parallel, 3, settings.extension),
      degree: Math.max(0, scale.intervals.indexOf(5)), source: 'borrowed', register: 0,
      inversion: settings.inversion, spread: settings.spread,
    };
  } else if (settings.color === 2) {
    // V/V, or V of the fifth scale degree for Locrian (whose fifth is diminished).
    const fifth = scale.intervals.indexOf(7);
    const targetDegree = fifth >= 0 ? fifth : Math.min(4, scale.intervals.length - 1);
    bank[7] = {
      rootOffset: wrap(scale.intervals[targetDegree] + 7),
      intervals: extendedStack(SCALES.find(s => s.id === 'mixolydian'), 0, settings.extension),
      degree: targetDegree, source: 'secondary', register: 0,
      inversion: settings.inversion, spread: settings.spread,
    };
  }
  return bank;
}

export function chordType(chord) {
  const intervals = chord?.intervals || [];
  if (intervals.includes(3)) return intervals.includes(6) ? 'DIM' : 'MIN';
  if (intervals.includes(4)) return intervals.includes(8) ? 'AUG' : 'MAJ';
  return intervals.includes(2) ? 'SUS2' : intervals.includes(5) ? 'SUS4' : 'MAJ';
}

function explicitIntervals(type, extension) {
  const triad = [...(TYPES[type] || TYPES.MAJ)];
  if (extension === 'TRIAD') return triad;
  if (extension === 'DIM7') return [0,3,6,9];
  if (extension === '6') return [...triad,9];
  if (extension === 'ADD9') return [...triad,14];
  const seventh = extension.startsWith('MAJ') ? 11 : 10;
  const size = Number(extension.replace('MAJ',''));
  return [...triad, seventh, ...(size >= 9 ? [14] : []), ...(size >= 11 ? [17] : []), ...(size >= 13 ? [21] : [])];
}

function replaceType(intervals, type) {
  if (!TYPES[type]) return [...intervals];
  // Replace only the structural triad; retain sevenths and upper extensions.
  return uniqueSorted([...TYPES[type], ...intervals.filter(n => n >= 9)]);
}

export function buildPadChord(input = {}, index = 0, override = {}) {
  const settings = normalizeHarmony(input);
  let chord = override.customChord ? chordData(override.customChord)
    : buildChordBank({ ...settings, ...override })[index];
  if (!chord) return null;
  chord = applyModifiers(chord, override.variant, settings);
  if (Number.isInteger(override.rootOffset)) chord = { ...chord, rootOffset: wrap(override.rootOffset), source: 'custom' };
  const type = override.chordType && override.chordType !== 'AUTO' ? override.chordType : chordType(chord);
  const explicit = PAD_EXTENSIONS.includes(override.extensionName) && override.extensionName !== 'AUTO';
  if (explicit) chord = { ...chord, intervals: explicitIntervals(type, override.extensionName), source: 'custom' };
  else if (override.chordType && override.chordType !== 'AUTO')
    chord = { ...chord, intervals: replaceType(chord.intervals, type), source: 'custom' };
  return { ...chord,
    inversion: Number.isInteger(override.inversion) ? override.inversion : chord.inversion,
    spread: Number.isInteger(override.spread) ? override.spread : chord.spread,
    bassMode: ['auto', 'root', 'low', 'note'].includes(override.bassMode) ? override.bassMode : chord.bassMode,
    ...(Number.isInteger(override.bassOffset) ? { bassOffset: override.bassOffset } : {}),
    lockInversion: typeof override.lockInversion === 'boolean' ? override.lockInversion : chord.lockInversion === true };
}

function extensionFamily(chord) {
  const n = chord.intervals;
  return n.some(x => x >= 21) ? 6 : n.some(x => x >= 17) ? 5
    : n.includes(14) ? n.length >= 5 ? 2 : 4
    : n.includes(9) && !n.includes(10) && !n.includes(11) && chordType(chord) !== 'DIM' ? 3
    : n.length >= 4 ? 1 : 0;
}

export function borrowedScaleId(input = {}) {
  return selectedScale(normalizeHarmony(input)).intervals.includes(3) ? 'major' : 'natural_minor';
}

// Preparing BORROW must not let the previously played, unborrowed chord
// immediately overwrite the parallel scale. Once a borrowed chord is played,
// ordinary ADAPT can accommodate its secondary dominants and other colours.
export function melodyHarmony(input, borrow = false, chordBorrow = false) {
  if (!borrow || input.melodyMode !== 'scale' || input.melodyAdapt !== true) return input;
  return { ...input, scaleId: borrowedScaleId(input), melodyAdapt: chordBorrow };
}

function borrowedChord(chord, input) {
  const scale = selectedScale(normalizeHarmony(input));
  const parallel = SCALES.find(s => s.id === borrowedScaleId(input));
  const scaleIndex = scale.intervals.indexOf(chord.rootOffset);
  // A pentatonic position keeps its heptatonic identity (e.g. G is V, not IV).
  const degree = scaleIndex < 0 ? -1 : scale.intervals.length === 7 ? scaleIndex
    : [0,1,1,2,2,3,3,4,5,5,6,6][chord.rootOffset];
  if (degree < 0) {
    // An off-scale custom root has no corresponding scale degree to borrow.
    // Keep its root and use the parallel major/minor quality instead.
    const type = chordType(chord);
    return { ...chord, intervals: replaceType(chord.intervals, type === 'MIN' ? 'MAJ' : type === 'MAJ' ? 'MIN' : type), source: 'borrowed' };
  }
  return { ...chord, rootOffset: parallel.intervals[degree],
    intervals: extendedStack(parallel, degree, extensionFamily(chord)), degree, source: 'borrowed' };
}

export function applyModifiers(rawChord, modifiers = {}, input = {}) {
  const chord = chordData(rawChord);
  if (!chord) return null;
  let result = modifiers.borrow ? borrowedChord(chord, input) : { ...chord, intervals: [...chord.intervals] };
  const target = result;
  if (modifiers.sub || modifiers.ii || modifiers.dom) {
    const mode = modifiers.sub ? 'sub' : modifiers.ii ? 'ii' : 'dom';
    const minor = target.intervals.includes(3) && !target.intervals.includes(4);
    result = { ...target, rootOffset: wrap(target.rootOffset + (mode === 'sub' ? 1 : mode === 'ii' ? 2 : 7)),
      intervals: mode === 'ii' ? [0,3,minor ? 6 : 7,10] : [0,4,7,10],
      source: mode === 'sub' ? 'substitute' : mode === 'ii' ? 'approach' : 'secondary',
      targetOffset: target.rootOffset, targetIntervals: [...target.intervals] };
  }
  if (modifiers.flip) {
    // Flip only an actual major/minor third. Diminished, augmented and sus
    // shapes keep their identity; higher color tones and sevenths stay intact.
    const major = result.intervals.includes(4) && result.intervals.includes(7);
    const minor = result.intervals.includes(3) && result.intervals.includes(7);
    if (major || minor) result.intervals = result.intervals.map(n => n === (major ? 4 : 3) ? (major ? 3 : 4) : n);
  }
  if (modifiers.sus === 2 || modifiers.sus === 4) {
    result.intervals = result.intervals.filter(n => n !== 3 && n !== 4);
    result.intervals.push(modifiers.sus === 2 ? 2 : 5);
  }
  result.intervals = uniqueSorted(result.intervals);
  return result;
}

// Evaluate a bounded set of inversions in a tonic-anchored register. The
// anchor never follows the previous chord, so repeated cycles cannot drift.
export function voiceLeadNotes(chord, settings = {}, previous = []) {
  const plain = chordNotes(chord, settings);
  if (!plain.length || !settings.voiceLead || chord.lockInversion || !previous.length) return plain;
  const normalized = normalizeHarmony(settings);
  const anchor = 48 + normalized.key + normalized.octave * 12;
  let best = plain, bestScore = Infinity;
  for (let inversion = 0; inversion < Math.min(chord.intervals.length, 4); inversion++) {
    const base = chordNotes({ ...chord, inversion }, settings);
    for (let shift = -24; shift <= 24; shift += 12) {
      const notes = base.map(n => n + shift);
      if (notes[0] < Math.max(0, anchor - 12) || notes[0] > Math.min(115, anchor + 12)
          || notes[notes.length - 1] > 127) continue;
      const distance = (a, b) => a.reduce((sum, n) => sum + Math.min(...b.map(m => Math.abs(n - m))), 0);
      const shared = notes.filter(n => previous.includes(n)).length;
      const score = distance(notes, previous) + distance(previous, notes)
        - shared * 3 + Math.abs(notes[0] - plain[0]) * 0.08;
      if (score < bestScore) { best = notes; bestScore = score; }
    }
  }
  return best;
}

export function nearestMelodyNote(chord, settings, previous, fallback) {
  if (!Number.isInteger(fallback)) return null;
  if (!Number.isInteger(previous)) return fallback;
  const pitches = new Set(chord.intervals.map(n => wrap(n + settings.key + chord.rootOffset)));
  let best = fallback;
  for (let note = Math.max(0, fallback - 24); note <= Math.min(127, fallback + 24); note++) {
    if (pitches.has(wrap(note)) && Math.abs(note - previous) < Math.abs(best - previous)) best = note;
  }
  return best;
}

function validIntervals(values) {
  return Array.isArray(values) && values.length > 0 && values.length <= 8
    && values.every(value => Number.isInteger(value) && value >= 0 && value <= 36)
    && values.includes(0);
}

function chordData(chord) {
  if (!chord || typeof chord !== 'object' || !Number.isFinite(chord.rootOffset) || !validIntervals(chord.intervals)) return null;
  return {
    ...chord,
    rootOffset: wrap(Math.trunc(chord.rootOffset)), intervals: uniqueSorted(chord.intervals),
    register: integer(chord.register, 0, -8, 8),
    inversion: integer(chord.inversion, 0, -7, 7), spread: integer(chord.spread, 0, 0, 2),
  };
}

function fitMidiTogether(notes) {
  const sorted = uniqueSorted(notes);
  if (!sorted.length) return [];
  // Move the whole voicing by octaves; clamping individual notes destroys intervals.
  const lowShift = Math.ceil(-sorted[0] / 12);
  const highShift = Math.floor((127 - sorted[sorted.length - 1]) / 12);
  if (lowShift > highShift) return [];
  const shift = Math.max(lowShift, Math.min(highShift, 0)) * 12;
  return sorted.map(note => note + shift);
}

export function chordNotes(rawChord, input = {}) {
  const chord = chordData(rawChord);
  if (!chord) return [];
  const settings = normalizeHarmony(input);
  const limit = chord.intervals.length - 1;
  const inversion = Math.max(-limit, Math.min(chord.inversion, limit));
  let intervals;
  if (inversion < 0) {
    // Move the highest k tones below the remaining chord as a block. Extended
    // voicings may span multiple octaves: retain spacing and avoid collisions.
    const split=chord.intervals.length+inversion;
    const shift=12*(Math.floor((chord.intervals[chord.intervals.length-1]-chord.intervals[0])/12)+1);
    intervals=chord.intervals.map((interval,i)=>i>=split?interval-shift:interval);
  } else {
    const bass = chord.intervals[inversion];
    intervals = chord.intervals.map((interval, i) => i < inversion
      ? interval + 12 * Math.max(1, Math.ceil((bass - interval) / 12)) : interval);
  }
  intervals.sort((a, b) => a - b);
  intervals = intervals.map((interval, i) => {
    if (chord.spread === 1 && i % 2 === 1) return interval + 12;
    if (chord.spread === 2 && i > 0) return interval + Math.ceil(i / 2) * 12;
    return interval;
  });
  const root = 48 + settings.key + chord.rootOffset + (settings.octave + chord.register) * 12;
  return fitMidiTogether(intervals.map(interval => root + interval));
}

export function melodyNotes(rawChord, input = {}) {
  const chord = chordData(rawChord);
  if (!chord) return [];
  const settings = normalizeHarmony(input);
  const mode = MELODY_MODES.includes(input.melodyMode) ? input.melodyMode : 'chord';
  const tones = mode === 'scale' ? adaptiveScaleIntervals(chord, { ...input, ...settings })
    : mode === 'chromatic' ? Array.from({ length: 12 }, (_, i) => i)
    : uniqueSorted(chord.intervals.map(interval => wrap(interval)));
  const octave = integer(input.melodyOctave, settings.octave, -3, 3);
  const root = 60 + settings.key + (mode === 'chord' ? chord.rootOffset : 0) + octave * 12;
  // Keep the physical layout fixed: unavailable high notes are silent pads,
  // never folded into a lower octave or duplicated on another pad.
  return Array.from({ length: 16 }, (_, i) => {
    const note = root + tones[i % tones.length] + 12 * Math.floor(i / tones.length);
    return note >= 0 && note <= 127 ? note : null;
  });
}

export function explicitBassNote(chord, input = {}) {
  if (!chord || chord.bassMode !== 'note' || !Number.isInteger(chord.bassOffset)) return null;
  return 48 + normalizeHarmony(input).key + chord.rootOffset + (chord.register || 0) * 12 + chord.bassOffset;
}

export function bassNotes(rawChord, input = {}, voicing = chordNotes(rawChord, input)) {
  const chord = chordData(rawChord);
  if (!chord || !voicing.length) return [];
  const settings = normalizeHarmony(input);
  const explicit = explicitBassNote(chord, settings);
  if (explicit !== null) return explicit >= 0 && explicit <= 127 ? [explicit] : [];
  // Separate register from the chord's octave, inversion and voice leading.
  // The legacy fallback preserves 0.0.3 pitches when importing settings.
  const legacyOctave = settings.octave - integer(input.bassOctaves, 1, 1, 2);
  const octave = integer(input.bassOctave, legacyOctave, BASS_OCTAVE_MIN, BASS_OCTAVE_MAX);
  const mode = ['root', 'low'].includes(chord.bassMode) ? chord.bassMode : input.bassMode;
  // LOW follows the actual bottom voice, with its own register offset. Removing
  // C.OCT keeps the bass register independent when the chord part is transposed.
  const note = mode === 'low' ? Math.min(...voicing) + (octave - settings.octave) * 12
    : 48 + settings.key + chord.rootOffset + (octave + chord.register) * 12;
  return note >= 0 && note <= 127 ? [note] : [];
}

const NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
export function noteName(note) {
  return Number.isFinite(note) ? NOTE_NAMES[wrap(Math.trunc(note))] : '--';
}

const NATURALS = [0, 2, 4, 5, 7, 9, 11];
const LETTERS = 'CDEFGAB';
function spellAtLetter(pc, letterIndex) {
  const position = wrap(letterIndex, 7);
  const alteration = wrap(pc - NATURALS[position] + 6) - 6;
  if (Math.abs(alteration) > 2) return noteName(pc);
  return LETTERS[position] + (alteration >= 0 ? '#'.repeat(alteration) : 'b'.repeat(-alteration));
}

function rootSpelling(chord, settings) {
  const rootPc = wrap(settings.key + chord.rootOffset);
  const scale = selectedScale(settings);
  const tonicLetter = LETTERS.indexOf(noteName(settings.key)[0]);
  if (chord.source === 'diatonic' && scale.intervals.length === 7) {
    const degree = scale.intervals.indexOf(chord.rootOffset);
    if (degree >= 0) return spellAtLetter(rootPc, tonicLetter + degree);
  }
  const steps = [0, 1, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6][chord.rootOffset];
  return spellAtLetter(rootPc, tonicLetter + steps);
}

// Exact pitch-class matches keep labels honest for unusual modal/pentatonic shapes.
const SUFFIXES = new Map([
  [[0], ''], [[0, 7], '5'],
  [[0, 4, 7], ''], [[0, 3, 7], 'm'], [[0, 3, 6], 'dim'], [[0, 4, 8], 'aug'],
  [[0, 2, 7], 'sus2'], [[0, 5, 7], 'sus4'],
  [[0, 4, 7, 11], 'maj7'], [[0, 4, 7, 10], '7'], [[0, 3, 7, 10], 'm7'],
  [[0, 3, 7, 11], 'm(maj7)'], [[0, 3, 6, 10], 'm7b5'], [[0, 3, 6, 9], 'dim7'],
  [[0, 4, 8, 11], 'maj7#5'], [[0, 4, 8, 10], '7#5'],
  [[0, 2, 4, 7, 11], 'maj9'], [[0, 2, 4, 7, 10], '9'], [[0, 2, 3, 7, 10], 'm9'],
  [[0, 2, 3, 7, 11], 'm(maj9)'], [[0, 2, 3, 6, 10], 'm9b5'],
  [[0, 1, 3, 6, 10], 'm7b5(b9)'], [[0, 1, 4, 7, 10], '7b9'],
  [[0, 3, 4, 7, 10], '7#9'], [[0, 2, 4, 8, 11], 'maj9#5'],
  [[0, 4, 7, 9], '6'], [[0, 3, 7, 9], 'm6'],
  [[0, 2, 4, 7], 'add9'], [[0, 2, 3, 7], 'm(add9)'],
  [[0, 2, 4, 7, 9], '6/9'], [[0, 2, 3, 7, 9], 'm6/9'],
  [[0, 5, 7, 10], '7sus4'], [[0, 2, 5, 7, 10], '9sus4'],
  [[0, 2, 7, 10], '7sus2'], [[0, 5, 7, 11], 'maj7sus4'], [[0, 2, 7, 11], 'maj7sus2'],
  [[0, 2, 4, 5, 7, 10], '11'], [[0, 2, 4, 5, 7, 11], 'maj11'],
  [[0, 2, 3, 5, 7, 10], 'm11'], [[0, 2, 3, 5, 7, 11], 'm(maj11)'],
  [[0, 2, 4, 6, 7, 11], 'maj9#11'],
  [[0, 2, 4, 5, 7, 9, 10], '13'], [[0, 2, 4, 5, 7, 9, 11], 'maj13'],
  [[0, 2, 3, 5, 7, 9, 10], 'm13'], [[0, 2, 4, 6, 7, 9, 11], 'maj13#11'],
  [[0, 4, 9], '6(no5)'], [[0, 3, 10], 'm7(no5)'], [[0, 5, 10], '7sus4(no5)'],
].map(([notes, suffix]) => [notes.join(','), suffix]));
const INTERVAL_NAMES = ['1', 'b9', '9', 'b3', '3', '11', 'b5', '5', '#5', '6', 'b7', '7'];

export function chordName(rawChord, input = {}, actualNotes) {
  const chord = chordData(rawChord);
  if (!chord) return '--';
  const settings = normalizeHarmony(input);
  const root = rootSpelling(chord, settings);
  const pcs = uniqueSorted(chord.intervals.map(interval => wrap(interval)));
  const suffix = SUFFIXES.get(pcs.join(',')) ?? `(${pcs.map(pc => INTERVAL_NAMES[pc]).join(',')})`;
  const bassPc = wrap((actualNotes?.length ? actualNotes : chordNotes(chord, settings))[0]);
  const rootPc = wrap(settings.key + chord.rootOffset);
  if (bassPc === rootPc) return root + suffix;
  const steps = [0, 1, 1, 2, 2, 3, 4, 4, 4, 5, 6, 6][wrap(bassPc - rootPc)];
  return root + suffix + '/' + spellAtLetter(bassPc, LETTERS.indexOf(root[0]) + steps);
}

const ROMANS = ['I', 'bII', 'II', 'bIII', 'III', 'IV', 'bV', 'V', 'bVI', 'VI', 'bVII', 'VII'];
function roman(rootOffset, intervals, diatonicDegree = -1) {
  const pcs = new Set(intervals.map(interval => wrap(interval)));
  let numeral = ROMANS[wrap(rootOffset)];
  if (diatonicDegree >= 0 && diatonicDegree < 7) {
    const alteration = wrap(rootOffset - NATURALS[diatonicDegree] + 6) - 6;
    const accidental = alteration >= 0 ? '#'.repeat(alteration) : 'b'.repeat(-alteration);
    numeral = accidental + ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][diatonicDegree];
  }
  if (pcs.has(3) && !pcs.has(4)) numeral = numeral.toLowerCase();
  if (pcs.has(3) && pcs.has(6) && !pcs.has(7)) numeral += 'o';
  if (pcs.has(4) && pcs.has(8) && !pcs.has(7)) numeral += '+';
  return numeral;
}

export function degreeName(rawChord, input = {}) {
  const chord = chordData(rawChord);
  if (!chord) return '--';
  const scale = selectedScale(normalizeHarmony(input));
  if (['secondary', 'approach', 'substitute'].includes(chord.source)) {
    const prefix = chord.source === 'approach' ? (chord.intervals.includes(6) ? 'iiø/' : 'ii/') : chord.source === 'substitute' ? 'subV/' : 'V/';
    if (Number.isInteger(chord.targetOffset) && validIntervals(chord.targetIntervals)) {
      return prefix + roman(chord.targetOffset, chord.targetIntervals);
    }
    const target = integer(chord.degree, 0, 0, scale.intervals.length - 1);
    return prefix + roman(scale.intervals[target], stack(scale, target, 3), scale.intervals.length === 7 ? target : -1);
  }
  const degree = scale.intervals.length === 7 ? scale.intervals.indexOf(chord.rootOffset) : -1;
  return roman(chord.rootOffset, chord.intervals, degree);
}

const LEGACY_TRIADS = {
  major: [0, 4, 7], minor: [0, 3, 7], diminished: [0, 3, 6], augmented: [0, 4, 8],
  sus2: [0, 2, 7], sus4: [0, 5, 7], power: [0, 7],
  m7b5: [0, 3, 6, 10], half_diminished: [0, 3, 6, 10], dim7: [0, 3, 6, 9],
};
const LEGACY_EXTENSIONS = new Set(['6', '7', 'maj7', 'add9', '9', 'm9', 'maj9', '11']);

export function importLegacyChord(raw) {
  if (!raw || typeof raw !== 'object' || !Number.isInteger(raw.tonicOffset)) return null;
  let intervals;
  if (raw.intervals !== undefined) {
    if (!validIntervals(raw.intervals)) return null;
    intervals = uniqueSorted(raw.intervals);
  } else {
    if (!Object.prototype.hasOwnProperty.call(LEGACY_TRIADS, raw.quality)) return null;
    if (raw.extensions !== undefined && (!Array.isArray(raw.extensions)
      || raw.extensions.some(extension => !LEGACY_EXTENSIONS.has(extension)))) return null;
    intervals = [...LEGACY_TRIADS[raw.quality]];
    for (const extension of raw.extensions || []) {
      if (extension === '6') intervals.push(9);
      if (extension === '7') intervals.push(['diminished', 'dim7'].includes(raw.quality) ? 9 : 10);
      if (extension === 'maj7') intervals.push(11);
      if (extension === 'add9') intervals.push(14);
      if (extension === '9' || extension === 'm9') intervals.push(10, 14);
      if (extension === 'maj9') intervals.push(11, 14);
      if (extension === '11') intervals.push(10, 14, 17);
    }
    intervals = uniqueSorted(intervals).slice(0, 6);
  }
  const source = ['borrowed', 'secondary'].includes(raw.sourceClass) ? raw.sourceClass : 'diatonic';
  return {
    rootOffset: wrap(raw.tonicOffset), intervals,
    degree: integer(source === 'secondary' ? raw.targetDegree : raw.scaleDegree, 0, 0, 6),
    source, register: integer(raw.registerShift, 0, -8, 8),
    inversion: integer(raw.inversion, 0, 0, 3), spread: integer(raw.spread, 0, 0, 2),
  };
}
