import { normalizeHarmony, importLegacyChord, EXTENSIONS, MELODY_MODES, BASS_OCTAVE_MIN, BASS_OCTAVE_MAX,
  CHORD_TYPES, PAD_EXTENSIONS, buildLegacyChordBank, applyModifiers, chordNotes, voiceLeadNotes, bassNotes } from './theory.mjs';
import {normalizePerformance,EVENTS_PER_CELL} from './timeline.mjs';

import {moduleId,globalStatePath} from './profile.mjs';
export const MODULE_DIR = '/data/UserData/schwung/modules/tools/' + moduleId();
export const STATE_PATH = globalStatePath();
export const STEP_COUNT = 16;
export const ROUTES = Object.freeze(['move', 'external', 'both', 'schwung']);
export const RATE_NAMES = Object.freeze(['1/16', '1/8', '1/4', '1/2', '1 BAR']);
const integer = (value, low, high, fallback) => Number.isFinite(Number(value))
  ? Math.max(low, Math.min(high, Math.round(Number(value)))) : fallback;
function strumSettings(input) {
  return {strumDirection:integer(input.strumDirection??0,0,3,0),
    strumTiming:integer(input.strumTiming??0,0,100,0),strumVelocity:integer(input.strumVelocity??0,0,100,0)};
}

export function normalizeSettings(raw = {}) {
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const { color: _legacyColor, ...harmony } = normalizeHarmony(input);
  return {
    ...harmony,
    ...strumSettings(input),
    channel: integer(input.channel ?? 0, 0, 15, 0),
    rate: integer(input.rate ?? 2, 0, 4, 2),
    gate: integer(input.gate ?? 85, 10, 100, 85),
    stepVelocity: integer(input.stepVelocity ?? 100, 1, 127, 100),
    route: ROUTES.includes(input.route) ? input.route : 'move',
    previewRoute: ROUTES.includes(input.previewRoute) ? input.previewRoute : 'move',
    voiceLead: input.voiceLead === true,
    melodyFollow: input.melodyFollow === 'pad' ? 'pad' : 'nearest',
    melodyMode: MELODY_MODES.includes(input.melodyMode) ? input.melodyMode : 'chord',
    melodyAdapt: input.melodyAdapt === true,
    melodyOctave: integer(input.melodyOctave ?? input.octave ?? 0, -3, 3, 0),
    melodyRoute: ROUTES.includes(input.melodyRoute) ? input.melodyRoute : ROUTES.includes(input.previewRoute) ? input.previewRoute : 'move',
    melodyChannel: integer(input.melodyChannel ?? input.channel ?? 0, 0, 15, 0),
    bassEnabled: input.bassEnabled === true,
    bassGesture: input.bassGesture === true,
    bassPlayback: input.bassPlayback === 'clip' ? 'clip' : 'follow',
    recordPart: ['both','chord','bass'].includes(input.recordPart) ? input.recordPart : 'both',
    quantize:integer(input.quantize??100,0,100,100),
    arpEnabled: input.arpEnabled === true,
    arpClock: input.arpClock === 'free' ? 'free' : 'sync',
    arpBpm: integer(input.arpBpm ?? 120, 30, 300, 120),
    arpHold: input.arpHold === true,
    arpRate: integer(input.arpRate ?? 0, 0, 4, 0),
    arpDirection: integer(input.arpDirection ?? 0, 0, 4, 0),
    arpRange: integer(input.arpRange ?? 1, 1, 4, 1),
    arpGate: integer(input.arpGate ?? 70, 10, 100, 70),
    arpSwing: integer(input.arpSwing ?? 0, 0, 50, 0),
    arpVelocity: integer(input.arpVelocity ?? 100, 1, 127, 100),
    arpRoute: ROUTES.includes(input.arpRoute) ? input.arpRoute : 'move',
    arpChannel: integer(input.arpChannel ?? 1, 0, 15, 1),
    bassMode: input.bassMode === 'low' ? 'low' : 'root',
    ideasColor: ['IN', 'MIX', 'OUT'].includes(input.ideasColor) ? input.ideasColor : 'MIX',
    ideasMode: input.ideasMode === 'to' ? 'to' : 'next',
    ideasTarget: integer(input.ideasTarget ?? 0, 0, 7, 0),
    bassOctave: integer(input.bassOctave ?? (normalizeHarmony(input).octave - integer(input.bassOctaves ?? 1, 1, 2, 1)), BASS_OCTAVE_MIN, BASS_OCTAVE_MAX, -1),
    bassVelocity: integer(input.bassVelocity ?? 100, 1, 127, 100),
    bassVelocityMode: input.bassVelocityMode === 'pad' ? 'pad' : 'fixed',
    chordSustain: ['off','hold','pedal'].includes(input.chordSustain) ? input.chordSustain : input.autoSustain === true ? 'hold' : 'off',
    melodySustain: ['off','hold','pedal'].includes(input.melodySustain) ? input.melodySustain : input.autoSustain === true ? 'hold' : 'off',
    bassSustain: ['off','hold','pedal'].includes(input.bassSustain) ? input.bassSustain : input.autoSustain === true ? 'hold' : 'off',
    bassRoute: ROUTES.includes(input.bassRoute) ? input.bassRoute : ROUTES.includes(input.previewRoute) ? input.previewRoute : 'move',
    bassChannel: integer(input.bassChannel ?? input.channel ?? 0, 0, 15, 0),
    autoSustain: input.autoSustain === true,
    melodyRetrigger: true,
  };
}

export function normalizeChord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (!Number.isInteger(raw.rootOffset) || raw.rootOffset < 0 || raw.rootOffset > 11
      || !Array.isArray(raw.intervals) || !raw.intervals.length || raw.intervals.length > 8
      || !raw.intervals.includes(0)
      || raw.intervals.some(n => !Number.isInteger(n) || n < 0 || n > 36)) return null;
  return {
    rootOffset: raw.rootOffset,
    intervals: [...new Set(raw.intervals)].sort((a, b) => a - b),
    degree: integer(raw.degree ?? 0, -1, 11, 0),
    source: ['diatonic', 'borrowed', 'secondary', 'approach', 'substitute', 'custom'].includes(raw.source) ? raw.source : 'diatonic',
    register: integer(raw.register ?? 0, -4, 4, 0),
    inversion: integer(raw.inversion ?? 0, 0, 7, 0),
    spread: integer(raw.spread ?? 0, 0, 2, 0),
    ...(raw.lockInversion === true ? { lockInversion: true } : {}),
    ...(['root', 'low'].includes(raw.bassMode) ? { bassMode: raw.bassMode } : {}),
    ...(raw.bassMode === 'note' && Number.isInteger(raw.bassOffset) && Math.abs(raw.bassOffset) <= 192
      ? { bassMode: 'note', bassOffset: raw.bassOffset } : {}),
    ...(Number.isInteger(raw.targetOffset) && raw.targetOffset >= 0 && raw.targetOffset < 12
      && Array.isArray(raw.targetIntervals) && raw.targetIntervals.includes(0)
      && raw.targetIntervals.length <= 8 && raw.targetIntervals.every(n => Number.isInteger(n) && n >= 0 && n <= 36)
      ? { targetOffset: raw.targetOffset, targetIntervals: [...raw.targetIntervals] } : {}),
  };
}

// Independent, absolute-pitch bass events. Missing lanes in old projects are empty.
export function normalizeBassStep(raw, nested=false) {
  if (!raw || !Number.isInteger(raw.note) || raw.note < 0 || raw.note > 127) return null;
  const performance=normalizePerformance(raw.performance);
  const more=nested!==true&&Array.isArray(raw.more)?raw.more.slice(0,EVENTS_PER_CELL-1).map(e=>normalizeBassStep(e,true)).filter(Boolean):[];
  return {note:raw.note,steps:integer(raw.steps??1,1,16,1),velocity:integer(raw.velocity??100,1,127,100),
    ...(performance?{performance}:{}),...(more.length?{more}:{})};
}

export function normalizeOverride(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const result = {};
  for (const [key, max] of [['extension', EXTENSIONS.length - 1], ['inversion', 7], ['spread', 2], ['rootOffset', 11]]) {
    if (Number.isInteger(raw[key]) && raw[key] >= 0 && raw[key] <= max) result[key] = raw[key];
  }
  if (typeof raw.lockInversion === 'boolean') result.lockInversion = raw.lockInversion;
  if (['auto', 'root', 'low'].includes(raw.bassMode)) result.bassMode = raw.bassMode;
  if (raw.bassMode === 'note' && Number.isInteger(raw.bassOffset) && Math.abs(raw.bassOffset) <= 192) {
    result.bassMode = 'note'; result.bassOffset = raw.bassOffset;
  }
  if (CHORD_TYPES.includes(raw.chordType) && raw.chordType !== 'AUTO') result.chordType = raw.chordType;
  if (PAD_EXTENSIONS.includes(raw.extensionName) && raw.extensionName !== 'AUTO') result.extensionName = raw.extensionName;
  if (result.extensionName === 'DIM7') result.chordType = 'DIM';
  const custom = normalizeChord(raw.customChord);
  if (custom) result.customChord = custom;
  if (raw.variant && typeof raw.variant === 'object') {
    const variant = { dom: raw.variant.dom === true, flip: raw.variant.flip === true,
      sus: [2, 4].includes(raw.variant.sus) ? raw.variant.sus : 0 };
    for (const key of ['ii', 'sub', 'borrow']) if (raw.variant[key] === true) variant[key] = true;
    if (Object.values(variant).some(Boolean)) result.variant = variant;
  }
  return Object.keys(result).length ? result : null;
}

// Frozen pitches and tonal context; routing, velocity, bass enable, rate and
// gate remain live performance controls rather than changing saved voicings.
export function normalizeStep(raw, nested=false) {
  const chord = normalizeChord(raw);
  if (!chord) return null;
  const performance=normalizePerformance(raw.performance);
  if(performance)chord.performance=performance;
  const more=nested!==true&&Array.isArray(raw.more)?raw.more.slice(0,EVENTS_PER_CELL-1).map(e=>normalizeStep(e,true)).filter(e=>e?.snapshot):[];
  if(more.length)chord.more=more;
  if(raw.timing && typeof raw.timing==='object') chord.timing={
    steps:integer(raw.timing.steps,1,16,1),
    ...(Number.isInteger(raw.timing.velocity)&&raw.timing.velocity>0&&raw.timing.velocity<=127?{velocity:raw.timing.velocity}:{})};
  const snap = raw.snapshot;
  if (!snap) return chord;
  if (!Array.isArray(snap.notes) || !snap.notes.length || snap.notes.length > 8
      || snap.notes.some(n => !Number.isInteger(n) || n < 0 || n > 127)
      || !Number.isInteger(snap.key) || snap.key < 0 || snap.key > 11
      || !Number.isInteger(snap.bass) || snap.bass < -1 || snap.bass > 127) return null;
  const harmony = normalizeHarmony(snap);
  return { ...chord, snapshot: { notes: [...new Set(snap.notes)].sort((a,b) => a-b),
    bass: snap.bass, key: snap.key, scaleId: harmony.scaleId,
    strumMs: harmony.strumMs, ...strumSettings(snap), voiceLead: snap.voiceLead === true } };
}

export function freezeStep(chord, settings, notes) {
  if (!chord) return null;
  if (chord.snapshot) return normalizeStep(chord);
  notes = notes || chordNotes(chord, settings);
  return normalizeStep({ ...chord, snapshot: { notes: [...notes],
    bass: bassNotes(chord, settings, notes)[0] ?? -1,
    key: settings.key, scaleId: settings.scaleId, strumMs: settings.strumMs,
    ...strumSettings(settings),
    voiceLead: settings.voiceLead } });
}

function migrateSteps(slots, settings) {
  let previous = [];
  const notes = [];
  // Reproduce the old loop's voicings once, then keep them fixed.
  for (let pass = 0; pass < 2; pass++) slots.forEach((chord, i) => {
    notes[i] = chord?.snapshot?.notes || (chord ? voiceLeadNotes(chord, settings, previous) : []);
    if (chord) previous = notes[i];
  });
  return slots.map((chord, i) => freezeStep(chord, settings, notes[i]));
}

export function decodeDocument(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid settings document');
  const native = raw.format === 'chord-pilot' && [1, 2, 3, 4, 5, 6, 7].includes(raw.schemaVersion);
  if (raw.format && !native) throw new Error('Unsupported settings version');
  const old = native ? raw.settings : raw;
  const settings = normalizeSettings(native ? old : {
    ...old, extension: old.extensionBias, color: old.colorDepth, inversion: old.inversionBias,
  });
  const slots = Array.isArray(raw.progression) ? raw.progression : [];
  const progression = migrateSteps(Array.from({ length: STEP_COUNT }, (_, index) => native
    ? normalizeStep(slots[index]) : normalizeChord(importLegacyChord(slots[index]))), settings);
  const overrides = Array.from({ length: 8 }, (_, i) => normalizeOverride(raw.overrides?.[i]));
  const color = native ? old?.color : old?.colorDepth;
  if ((!native || raw.schemaVersion < 5) && (color === 1 || color === 2)) {
    const override = overrides[7] || {};
    const chord = buildLegacyChordBank({ ...settings, ...override, color })[7];
    overrides[7] = normalizeOverride({ customChord: applyModifiers(chord, override.variant, settings),
      lockInversion: override.lockInversion === true });
  }
  const bassProgression=Array.from({length:STEP_COUNT},(_,i)=>normalizeBassStep(raw.bassProgression?.[i]));
  return { settings, progression, overrides, bassProgression };
}

export function encodeDocument(settings, progression, overrides = [], bassProgression = []) {
  return JSON.stringify({
    format: 'chord-pilot', schemaVersion: 7, version: '0.1.0-rc.2',
    settings: normalizeSettings(settings),
    progression: migrateSteps(Array.from({ length: STEP_COUNT }, (_, i) => normalizeStep(progression[i])), normalizeSettings(settings)),
    overrides: Array.from({ length: 8 }, (_, i) => normalizeOverride(overrides[i])),
    bassProgression: Array.from({length:STEP_COUNT},(_,i)=>normalizeBassStep(bassProgression[i])),
  });
}

export function readSettings(read) {
  const MODULE_DIR = '/data/UserData/schwung/modules/tools/chord-pilot'; // Read-only legacy migration.
  // A fresh Chord Pilot starts clean. Only this module's own older files migrate.
  const paths = [STATE_PATH, ...[6,5,4,3,2,1].map(v=>STATE_PATH.replace('-v7.',`-v${v}.`)),
    ...[7,6,5,4,3,2,1].map(v=>`${MODULE_DIR}/pilot-state-v${v}.json`), MODULE_DIR + '/settings.json'];
  const warnings = [];
  for (const path of paths) {
    try {
      const text = read(path);
      if (!text) continue;
      if (text.length > 262144) throw new Error('Settings file too large');
      const state = decodeDocument(JSON.parse(text));
      return { ...state, imported: path !== STATE_PATH, source: path, warnings };
    } catch (_error) { warnings.push(path); }
  }
  // New-project defaults only. Keep decoder fallbacks unchanged so older
  // documents without melody fields retain their historical behavior.
  return { settings: normalizeSettings({ melodyMode: 'scale', melodyOctave: -1, melodyAdapt: true, bassVelocityMode: 'pad' }),
    progression: Array(STEP_COUNT).fill(null), bassProgression:Array(STEP_COUNT).fill(null), overrides: Array(8).fill(null), imported: false, warnings };
}
