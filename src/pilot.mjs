import { SCALES, EXTENSIONS, EXTENSION_ORDER, buildPadChord, CHORD_TYPES, PAD_EXTENSIONS, chordType, chordNotes, melodyNotes, chordName, noteName, degreeName,
  applyModifiers, voiceLeadNotes, nearestMelodyNote, bassNotes, explicitBassNote, adaptiveScaleIntervals, melodyHarmony, MELODY_MODES, BASS_OCTAVE_MIN, BASS_OCTAVE_MAX } from './theory.mjs';
import { normalizeChord, normalizeStep, normalizeBassStep, freezeStep, normalizeOverride, readSettings, encodeDocument, STATE_PATH, STEP_COUNT, ROUTES, RATE_NAMES } from './settings.mjs';
import { generateIdeas, generateIdeasTo, ideasContext, IDEA_COLORS, ideaStyle } from './ideas.mjs';
import { createBassGesture, nearestBassPitch } from './bass-gesture.mjs';
import { createChordRecorder } from './recording.mjs';
import {compileLane,cellEvents,insertTake} from './timeline.mjs';
import {BUILD_PROFILE, PRODUCT_NAME, PRODUCT_VERSION, PUBLIC_PAGES} from './profile.mjs';

export const CHORD_PADS = Object.freeze([68, 69, 70, 71, 76, 77, 78, 79]);
export const MELODY_PADS = Object.freeze([72, 73, 74, 75, 80, 81, 82, 83, 88, 89, 90, 91, 96, 97, 98, 99]);
export const MODIFIER_PADS = Object.freeze([84, 85, 86, 87, 92, 93, 94]);
export const STOP_PAD = 95;
export const PAGES = Object.freeze(['PLAY', 'CHORDS', 'IDEAS', 'MELODY', 'BASS', 'ARP', 'SEQ', 'MIDI', 'THEORY']);
export const EXTRA_PAGES = Object.freeze({PLAY:'STRUM',CHORDS:'STRUM',MELODY:'M.EXTRA',BASS:'B.EXTRA',ARP:'A.CLOCK',MIDI:'ENSEMBL'});
export const MELODY_OWNER_START = 8;
export const STEP_OWNER_START = 24;
export const LIVE_BASS_OWNER = STEP_OWNER_START + STEP_COUNT;
const wrap = (n, length) => ((n % length) + length) % length;
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const routeLabels = ['MOVE', 'USB-A', 'BOTH', 'SCHW'];
const routeFull = ['Move / USB-C', 'USB-A', 'Both', 'Schwung chain'];
const bassNoteName = note => noteName(note) + (Math.floor(note / 12) - 1);

// All physical gestures enter here; the Schwung adapter only supplies IO.
export function createPilot(io = {}) {
  const publicBuild = (io.profile ?? BUILD_PROFILE) === 'public';
  const pages = publicBuild ? PUBLIC_PAGES : PAGES;
  let ideasView = false;
  let extraHeld = false;
  const extraPages = publicBuild ? {} : EXTRA_PAGES;
  const currentPage = () => ideasView ? 'IDEAS' : extraHeld && editIndex<0 && stepEdit<0 ? extraPages[pages[page]] || pages[page] : pages[page];
  const send = command => io.send?.(command);
  const loaded = readSettings(io.read || (() => null));
  let settings = loaded.settings;
  // Runtime restrictions must not overwrite the dormant Lab configuration.
  const dormant = publicBuild ? Object.fromEntries(['arpEnabled','bassPlayback','strumDirection','strumTiming','strumVelocity'].map(k=>[k,settings[k]])) : {};
  if (publicBuild) Object.assign(settings,{arpEnabled:false,bassPlayback:'follow',strumDirection:0,strumTiming:0,strumVelocity:0});
  const progression = loaded.progression;
  const bassProgression=loaded.bassProgression;
  let seqPart='chord', stepEdit=-1, stepEditExtension='AUTO',stepEvent=0;
  let runtimeChords=[],runtimeBass=[];
  const slotCache=new Map(),chordVisited=new Map(),bassVisited=new Map();
  let recordLimit=false;
  function editedEvent(){return cellEvents((seqPart==='bass'?bassProgression:progression)[stepEdit])[stepEvent];}
  const overrides = loaded.overrides;
  let editIndex = -1, lastVoicing = [];
  let editReturnPage = 0;
  let stopHeld = false, borrowLocked = false, borrowDown = false;
  let ideasEnabled = false, ideas = [], ideasSource = null, ideaSelected = -1;
  let ideasGoal = null;
  const heldModifiers = [];
  const bassGesture = createBassGesture();
  let gestureBass = null, arpSource = '';
  let gestureVelocity = null;
  const sustainModes = ['off','hold','pedal'];
  const partName = kind => kind === 'bass' ? 'bass' : kind === 'melody' ? 'melody' : 'chord';
  const pedalParts = {chord:0,melody:1,bass:2};
  const pedalState = {};
  function pedal(part, enabled) {
    const output={...partOutput(part),...(!publicBuild && settings.divisi && part==='chord'?{divisi:1,channels:[...settings.ensembleChannels]}:{})}, key=enabled?JSON.stringify(output):'';
    if ((pedalState[part] || '')===key) return;
    pedalState[part]=key;
    send({op:'pedal',owner:pedalParts[part],enabled:+enabled,...output});
  }
  function pedalsOff() { for (const part of Object.keys(pedalParts)) pedal(part,false); }
  function sharedPedalChannel() {
    const outputs=[...(!publicBuild&&settings.divisi?[...new Set(settings.ensembleChannels)]:[settings.channel]).map(ch=>['chord',settings.previewRoute,ch]),['melody',settings.melodyRoute,settings.melodyChannel],
      ...(settings.bassEnabled?[['bass',settings.bassRoute,settings.bassChannel]]:[]),
      ...(settings.arpEnabled?[['arp',settings.arpRoute,settings.arpChannel]]:[])];
    const dests=r=>r==='both'?['move','external']:[r];
    return outputs.some(([part,route,ch],i)=>settings[part+'Sustain']==='pedal' && outputs.some(([,r,c],j)=>i!==j && ch===c && dests(route).some(d=>dests(r).includes(d))));
  }
  let loopNotes = Array.from({ length: STEP_COUNT }, () => []);
  let loopBass = Array.from({ length: STEP_COUNT }, () => []);
  function buildBank() {
    return Array.from({ length: 8 }, (_, i) => buildPadChord(settings, i, overrides[i] || {}));
  }
  function modifierState() {
    const sus = [...heldModifiers].reverse().find(i => i === 2 || i === 3);
    const approach = [...heldModifiers].reverse().find(i => i === 0 || i === 4 || i === 5);
    return { dom: approach === 0, flip: heldModifiers.includes(1), sus: sus === 2 ? 2 : sus === 3 ? 4 : 0,
      ...(approach === 4 ? { ii: true } : {}), ...(approach === 5 ? { sub: true } : {}),
      ...(borrowLocked || heldModifiers.includes(6) ? { borrow: true } : {}) };
  }
  function playable(index, variant = modifierState()) { return applyModifiers(bank[index], variant, settings); }
  function voiced(chord) { return chord.snapshot ? [...chord.snapshot.notes] : voiceLeadNotes(chord, settings, lastVoicing); }
  function context(chord = active.chord) {
    return chord?.snapshot ? { ...settings, key: chord.snapshot.key, scaleId: chord.snapshot.scaleId } : settings;
  }
  function melodyContext(chord = active.chord) {
    return melodyHarmony(context(chord), modifierState().borrow === true, active.variant?.borrow === true);
  }
  function harmonyLabel(chord, notes, editing = false, preview = false) {
    const harmony = context(chord), label = chordName(chord, harmony, notes);
    if (!editing && !preview && gestureBass !== null && settings.bassEnabled)
      return label.split('/')[0] + (gestureBass % 12 === wrap(harmony.key + chord.rootOffset, 12) ? '' : '/' + noteName(gestureBass));
    // For explicit slash bass, show the bass part rather than confusing it
    // with the lowest note of the independently inverted chord instrument.
    if (chord.bassMode !== 'note' || (!editing && !settings.bassEnabled)) return label;
    const bass = chord.snapshot ? chord.snapshot.bass : explicitBassNote(chord, harmony);
    if (bass === null || bass < 0 || bass > 127) return label;
    const name = label.split('/')[0];
    return bass % 12 === wrap(harmony.key + chord.rootOffset, 12) ? name : name + '/' + noteName(bass);
  }
  let bank = buildBank();
  let active = { kind: 'bank', index: 0, chord: bank[0], variant: {} };
  const voices = new Map();
  const melodyHeld = Array(MELODY_PADS.length).fill(0);
  const melodyPressure = Array(MELODY_PADS.length).fill(0);
  const sentPressure = Array(MELODY_PADS.length).fill(0);
  function pressure(index, value) {
    if (parked || !settings.melodyAftertouch || !Number.isInteger(index) ||
        index < 0 || index >= melodyHeld.length || !melodyHeld[index] ||
        !Number.isInteger(value) || value < 0 || value > 127) return;
    melodyPressure[index] = value;
  }
  function flushPressure() {
    if (parked) return;
    melodyPressure.forEach((value,index) => {
      if (!voices.has(index + MELODY_OWNER_START) || value === sentPressure[index]) return;
      if (send({op:'pressure',owner:index + MELODY_OWNER_START,pressure:value}) !== false)
        sentPressure[index] = value;
    });
  }
  let page = 0, focused = -1, touch = -1, detail = '', detailTicks = 0, controlDetail = false;
  let selectedSlot = -1, capture = false, nextCapture = 0;
  let recordArmed=false;
  let takeBefore=null, undoTake=null;
  function beginTakeUndo() {
    takeBefore={chords:settings.recordPart!=='bass'?progression.map(normalizeStep):null,
      bass:settings.recordPart!=='chord'&&settings.bassEnabled?bassProgression.map(normalizeBassStep):null,
      bassPlayback:settings.bassPlayback,changed:false};
  }
  function undo() {
    if(parked)return;
    setRecord(false);
    if(!undoTake){describe('No recording to undo');return;}
    setArm(false);clearLive();
    if(undoTake.chords)undoTake.chords.forEach((event,i)=>progression[i]=normalizeStep(event));
    if(undoTake.bass){undoTake.bass.forEach((event,i)=>bassProgression[i]=normalizeBassStep(event));settings.bassPlayback=undoTake.bassPlayback;}
    undoTake=null;config();syncSlots();markSave();ledsDirty=true;dirty=true;
    describe('Recording undone; stopped');
  }
  function stepPart() {
    const name=currentPage();
    return name==='BASS'?'bass':name==='MELODY'?'melody':name==='SEQ'?seqPart:'chord';
  }
  let bassRecordOwner=-1;
  const recordsChords=()=>recordArmed && settings.recordPart!=='bass';
  const recordsBass=()=>recordArmed && settings.recordPart!=='chord';
  const recorder=createChordRecorder({preserveTiming:true});
  const bassRecorder=createChordRecorder({preserveTiming:true});
  function readClock(){try{return io.clock?.()||{beat:-1,ready:false};}catch(_){return {beat:-1,ready:false};}}
  function commitTake(take) {
    if(!take)return;
    const event=normalizeStep({...take.payload,timing:take.timing,performance:take.performance});
    if(!insertTake(progression,take,event,chordVisited)){recordLimit=true;return;}
    if(takeBefore)takeBefore.changed=true;
    selectedSlot=take.index;syncSlots();markSave();ledsDirty=true;dirty=true;
  }
  function commitBassTake(take) {
    if(!take)return;
    const event=normalizeBassStep({note:take.payload,...take.timing,performance:take.performance});
    if(!insertTake(bassProgression,take,event,bassVisited)){recordLimit=true;return;}
    if(takeBefore)takeBefore.changed=true;
    settings.bassPlayback='clip';config();syncSlots();markSave();ledsDirty=true;dirty=true;
  }
  function recordBass(owner) {
    if(!recordsBass())return;
    const clock=readClock();commitBassTake(bassRecorder.observe(clock.beat,clock.ready));
    const voice=voices.get(LIVE_BASS_OWNER);
    if(clock.ready && voice?.notes.length)commitBassTake(bassRecorder.start(owner,clock.beat,settings.rate,voice.notes[0],voice.velocity));
  }
  function finishRecording(){const clock=readClock();commitTake(recorder.observe(clock.beat,clock.ready));commitTake(recorder.stop(clock.ready?clock.beat:undefined));
    commitBassTake(bassRecorder.observe(clock.beat,clock.ready));commitBassTake(bassRecorder.stop(clock.ready?clock.beat:undefined));}
  function setRecord(enabled) {
    if (publicBuild && enabled) return;
    if(Boolean(enabled)===recordArmed)return;
    if(enabled && settings.recordPart==='bass' && !settings.bassEnabled){describe('Enable BASS before REC');return;}
    if(!enabled){finishRecording();if(takeBefore?.changed)undoTake=takeBefore;takeBefore=null;}
    else {beginTakeUndo();chordVisited.clear();bassVisited.clear();recordLimit=false;}
    clearLive();bassRecordOwner=-1;
    recordArmed=Boolean(enabled);send({op:'record',enabled:+recordArmed,record_part:['both','chord','bass'].indexOf(settings.recordPart)});
    if(recordArmed)stepEdit=-1;
    if(recordArmed){setCapture(false);setArm(true);}
    describe(recordArmed?`REC ${settings.recordPart.toUpperCase()}: Move Play`:'REC off');ledsDirty=true;
  }
  function recordAttack(owner,chord,notes,velocity) {
    if(!recordsChords())return;
    const clock=readClock();commitTake(recorder.observe(clock.beat,clock.ready));
    if(!clock.ready){describe('REC waiting for clock');return;}
    const payload=freezeStep(chord,settings,notes);
    commitTake(recorder.start(owner,clock.beat,settings.rate,payload,velocity));
  }
  function recordRelease(owner){const clock=readClock();commitTake(recorder.observe(clock.beat,clock.ready));commitTake(recorder.release(owner,clock.ready?clock.beat:undefined));
    commitBassTake(bassRecorder.observe(clock.beat,clock.ready));commitBassTake(bassRecorder.release(owner,clock.ready?clock.beat:undefined));}
  let armed = false, parked = false, dirty = true, dirtySave = loaded.imported, saveTicks = loaded.imported ? 1 : -1;
  let dsp = { armed: false, running: false, slot: -1, cycle: -1, sounding: false };
  const moveAvailable = io.moveAvailable !== false;
  let ledsDirty = true;

  function ideasTarget() { return ideasGoal || ideasSource || active.chord; }
  function newIdeas(source = active.chord, captureTarget = false) {
    const shift = (source.snapshot?.key ?? settings.key) - settings.key;
    ideasSource = normalizeChord({ ...source, rootOffset: wrap(source.rootOffset + shift, 12),
      ...(Number.isInteger(source.targetOffset) ? { targetOffset: wrap(source.targetOffset + shift, 12) } : {}) });
    if(captureTarget || !ideasGoal) ideasGoal=normalizeChord(ideasSource);
    const options={color:settings.ideasColor,borrow:borrowLocked,bank};
    ideas = settings.ideasMode === 'to' ? generateIdeasTo(ideasSource,ideasTarget(),settings,options)
      : generateIdeas(ideasSource, settings, options);
    ideaSelected = -1; dirty = true; ledsDirty = true;
    describe(settings.ideasMode==='to'?'TO '+chordName(ideasTarget(),settings):'Ideas from ' + chordName(ideasSource, settings));
  }
  function setIdeas(enabled) {
    if (enabled === ideasEnabled) return;
    ideasEnabled = enabled; focused = -1; touch = -1;
    if (enabled) newIdeas(active.chord,true);
    else { ideaSelected = -1; describe('Original chord pads'); }
    ledsDirty = true;
  }
  function ideaVariant() {
    const variant = modifierState();
    // The locked BORROW context is already resolved in the suggestion bank.
    // Plain momentary BORROW still works when no latch is active.
    return { ...variant, borrow: !borrowLocked && heldModifiers.includes(6) };
  }
  // One logical-input query for attacks and both chord maps. No MIDI effects.
  function chordForInput(index, variant = ideasEnabled ? ideaVariant() : modifierState()) {
    return ideasEnabled ? ideas[index] ? applyModifiers(ideas[index].chord, variant, ideasContext(settings, borrowLocked)) : null
      : playable(index, variant);
  }
  function inputPreview(index) {
    const chord = chordForInput(index);
    if (!chord) return {label:'--'};
    const notes = voiced(chord);
    return {label:harmonyLabel(chord,notes,false,true),chord,notes};
  }

  function describe(text) {
    detail = String(text); detailTicks = 65; dirty = true; controlDetail = false;
    io.announce?.(detail);
  }
  function markSave() { dirtySave = true; saveTicks = 30; }
  function save() {
    if (!dirtySave) return true;
    const result = io.write?.(STATE_PATH, encodeDocument({...settings,...dormant}, progression, overrides, bassProgression)) === true;
    if (result) { dirtySave = false; saveTicks = -1; }
    else { saveTicks = 90; describe('Save pending'); }
    return result;
  }
  function config() {
    send({ op: 'config', channel: settings.channel, route: ROUTES.indexOf(settings.route), divisi: !publicBuild && settings.divisi ? 1 : 0,
      ...(!publicBuild?{channels:[...settings.ensembleChannels]}:{}),
      rate: settings.rate, gate: settings.autoSustain ? 100 : settings.gate, move_available: moveAvailable ? 1 : 0,
      legato: settings.voiceLead ? 1 : 0, bass_route: ROUTES.indexOf(settings.bassRoute),
      bass_channel: settings.bassChannel, bass_velocity: settings.bassVelocity,
      bass_clip:+(settings.bassEnabled && settings.bassPlayback==='clip') });
    send({ op: 'arp', enabled: +settings.arpEnabled, rate: settings.arpRate,
      direction: settings.arpDirection, range: settings.arpRange, gate: settings.arpGate,
      swing: settings.arpSwing, hold: +settings.arpHold, velocity: settings.arpVelocity,
      route: ROUTES.indexOf(settings.arpRoute), channel: settings.arpChannel,
      clock: settings.arpClock === 'free' ? 1 : 0, bpm: settings.arpBpm });
  }
  function syncArp() {
    const harmony = [...voices.values()].filter(v => ['bank', 'slot', 'idea'].includes(v.kind));
    const selected = harmony.find(v => v.kind === active.kind && v.index === active.index) || harmony[harmony.length - 1];
    const notes = selected?.notes || [];
    const key = JSON.stringify(notes);
    if (key !== arpSource) { arpSource = key; send({ op: 'arpsrc', notes }); }
  }
  function sendSlot(command) {
    const key=command.op+command.index,json=JSON.stringify(command);
    if(slotCache.get(key)===json)return;
    if(!command.notes.length && command.index>=16 && !slotCache.has(key))return;
    if(send(command)!==false)slotCache.set(key,json);
  }
  function strumCommand(s) {
    return {strum_ms:s?.strumMs??0,strum_dir:s?.strumDirection??0,strum_time:s?.strumTiming??0,strum_vel:s?.strumVelocity??0};
  }
  function syncSlots() {
    if (publicBuild) return;
    progression.forEach((chord, i) => {
      loopNotes[i] = chord ? [...chord.snapshot.notes] : [];
      loopBass[i] = settings.bassEnabled && chord?.snapshot.bass >= 0 ? [chord.snapshot.bass] : [];
    });
    runtimeChords=compileLane(progression,settings.quantize);runtimeBass=compileLane(bassProgression,settings.quantize);
    runtimeChords.forEach((entry,index)=>{
      const chord=entry?.event;
      sendSlot({op:'slot',index,notes:chord?.snapshot.notes||[],bass:settings.bassEnabled?(chord?.snapshot.bass??-1):-1,
        duration:chord?.timing?.steps??0,velocity:chord?.timing?.velocity??settings.stepVelocity,
        ...strumCommand(chord?.snapshot),legato:chord?.snapshot.voiceLead?1:0,
        ...(entry?.at!==undefined?{at:entry.at,len:entry.len}:{})});
    });
    runtimeBass.forEach((entry,index)=>sendSlot({op:'bassslot',index,notes:entry?[entry.event.note]:[],duration:entry?.event.steps??1,velocity:entry?.event.velocity??100,
      ...(entry?.at!==undefined?{at:entry.at,len:entry.len}:{})}));
  }
  function stop(owner) {
    if (owner >= MELODY_OWNER_START && owner < MELODY_OWNER_START + melodyHeld.length)
      sentPressure[owner - MELODY_OWNER_START] = 0;
    if (voices.has(owner)) { send({ op: 'off', owner }); voices.delete(owner); dirty = true; ledsDirty = true; }
  }
  function release(owner) {
    const voice = voices.get(owner);
    const mode = settings[partName(voice?.kind)+'Sustain'];
    if (voice && mode !== 'off') {
      if (voice.sustained) return;
      voice.sustained = true; voice.pedaled = mode === 'pedal';
      send({ op: voice.pedaled ? 'off' : 'hold', owner }); dirty = true; ledsDirty = true;
    } else stop(owner);
  }
  function clearSustained() {
    pedalsOff();
    for (const [owner, voice] of [...voices]) if (voice.sustained) stop(owner);
    if (!bassGesture.inspect().active) gestureBass = null;
  }
  function beginHarmony() {
    pedalsOff(); gestureVelocity = null;
    // Release the previous pedal period, including released melody notes.
    // Physically held melody pads will be revoiced by activate().
    for (const [owner, voice] of [...voices]) if (voice.sustained || (voice.kind !== 'melody' && settings[partName(voice.kind)+'Sustain'] !== 'off')) stop(owner);
    // Held melody notes continue under the new pedal period.
    if (settings.melodySustain === 'pedal' && melodyHeld.some(Boolean)) pedal('melody',true);
  }
  function partOutput(kind) {
    if (kind === 'melody') return { route: ROUTES.indexOf(settings.melodyRoute), channel: settings.melodyChannel };
    if (kind === 'bass') return { route: ROUTES.indexOf(settings.bassRoute), channel: settings.bassChannel };
    return { route: ROUTES.indexOf(settings.previewRoute), channel: settings.channel };
  }
  function play(owner, notes, velocity, meta, attack = false) {
    notes = notes.filter(n => Number.isInteger(n) && n >= 0 && n <= 127);
    if (!notes.length) { stop(owner); return; }
    if (settings[partName(meta.kind)+'Sustain'] === 'pedal') pedal(partName(meta.kind),true);
    send({ op: 'on', owner, notes, velocity: clamp(Math.round(velocity), 1, 127),
      ...partOutput(meta.kind), retrigger: attack && settings.melodyRetrigger ? 1 : 0,
      ...(!publicBuild && settings.divisi && partName(meta.kind)==='chord'?{divisi:1,channels:[...settings.ensembleChannels]}:{}),
      ...strumCommand(meta.kind === 'slot' ? meta.chord.snapshot : ['bank','idea'].includes(meta.kind) ? settings : null),
      ...(['bank', 'slot', 'idea'].includes(meta.kind) ? { legato: (meta.chord.snapshot?.voiceLead ?? settings.voiceLead) ? 1 : 0 } : {}) });
    voices.set(owner, { ...meta, sustained: false, notes: [...notes], velocity });
    if (meta.kind === 'melody') sentPressure[meta.index] = 0;
    dirty = true; ledsDirty = true;
  }
  function revoiceMelody(octaveShift = 0, reset = false) {
    const harmony = melodyContext();
    const pitches = melodyNotes(active.chord, harmony);
    melodyHeld.forEach((velocity, index) => {
      if (!velocity) return;
      const owner = index + MELODY_OWNER_START;
      const old = voices.get(owner)?.notes[0];
      const previous = Number.isInteger(old) ? old + octaveShift * 12 : old;
      const note = settings.melodyMode === 'chord' && settings.melodyFollow === 'nearest' && !reset
        ? nearestMelodyNote(active.chord, harmony, previous, pitches[index]) : pitches[index];
      if (!same(voices.get(owner)?.notes, [note])) play(owner, [note], velocity, { kind: 'melody', index });
    });
    if (octaveShift || reset) for (const [owner, voice] of [...voices]) {
      if (voice.kind !== 'melody' || !voice.sustained || voice.pedaled) continue;
      if (reset) { stop(owner); continue; }
      const note = settings.melodyMode === 'chord' && settings.melodyFollow === 'nearest'
        ? nearestMelodyNote(active.chord, harmony, voice.notes[0] + octaveShift * 12, pitches[voice.index]) : pitches[voice.index];
      play(owner, [note], voice.velocity, voice);
      if (voices.has(owner)) { voices.get(owner).sustained = true; send({ op: 'hold', owner }); }
    }
    ledsDirty = true; dirty = true;
  }
  function syncLiveBass() {
    syncArp();
    if(recordArmed && settings.recordPart==='bass')return;
    if(recordsChords() && settings.recordPart==='chord'){stop(LIVE_BASS_OWNER);pedal('bass',false);return;}
    const harmony = [...voices.values()].filter(v => ['bank', 'slot', 'idea'].includes(v.kind));
    const selected = harmony.find(v => v.kind === active.kind && v.index === active.index) || harmony[harmony.length - 1];
    if (!settings.bassEnabled) { stop(LIVE_BASS_OWNER); pedal('bass',false); return; }
    if (!selected || (selected.sustained && settings.bassSustain !== 'hold')) { release(LIVE_BASS_OWNER); return; }
    const snap = selected.chord.snapshot;
    const notes = gestureBass !== null ? [gestureBass] : snap ? snap.bass >= 0 ? [snap.bass] : [] : bassNotes(selected.chord, settings, selected.notes);
    if (!notes.length) { stop(LIVE_BASS_OWNER); return; }
    const velocity = settings.bassVelocityMode === 'pad' ? gestureVelocity ?? selected.velocity : settings.bassVelocity;
    if (!same(voices.get(LIVE_BASS_OWNER)?.notes, notes) || voices.get(LIVE_BASS_OWNER)?.velocity !== velocity) {
      if(settings.bassSustain==='pedal' && voices.has(LIVE_BASS_OWNER)) {stop(LIVE_BASS_OWNER);pedal('bass',false);}
      play(LIVE_BASS_OWNER, notes, velocity, { kind: 'bass', chord: selected.chord });
    }
    const bass = voices.get(LIVE_BASS_OWNER);
    if (bass && selected.sustained && !bass.sustained) release(LIVE_BASS_OWNER);
  }
  function activate(chord, kind, index, notes = voiced(chord), variant = {}) {
    active = { chord, kind, index, notes, variant }; lastVoicing = [...notes]; revoiceMelody();
  }
  function refreshHarmony(melodyShift = 0, resetMelody = false) {
    bank = buildBank();
    const next = active.kind === 'bank' ? playable(active.index, active.variant) : active.kind === 'idea' ? active.chord
      : Number.isInteger(active.eventId)?runtimeChords[active.eventId]?.event:progression[active.index];
    const adaptiveMelody = settings.melodyMode === 'chord' || (settings.melodyMode === 'scale' && settings.melodyAdapt);
    const currentMelody = active.chord ? melodyNotes(active.chord, melodyContext()) : [];
    const nextMelody = next ? melodyNotes(next, melodyContext(next)) : [];
    if (adaptiveMelody && next && !same(currentMelody, nextMelody)) {
      for (const [owner, voice] of [...voices]) if (voice.kind === 'melody' && voice.sustained) stop(owner);
    }
    if (next) { active.chord = next; active.notes = voiced(next); lastVoicing = [...active.notes]; }
    else { active = { kind: 'bank', index: 0, chord: bank[0], notes: voiced(bank[0]), variant: {} }; }
    for (const [owner, voice] of [...voices]) {
      if (voice.pedaled) continue;
      if (voice.kind === 'melody' || voice.kind === 'bass') continue;
      const chord = voice.kind === 'bank' ? playable(voice.index, voice.variant) : voice.kind === 'idea' ? voice.chord : progression[voice.index];
      if (chord) {
        const notes = voiced(chord);
        // Parameter edits need not re-strike unchanged held chords.
        if (same(voice.notes, notes)) { voices.get(owner).chord = chord; continue; }
        play(owner, notes, voice.velocity, { ...voice, chord });
        if (voice.sustained) { voices.get(owner).sustained = true; send({ op: 'hold', owner }); }
      }
      else stop(owner);
    }
    revoiceMelody(melodyShift, resetMelody); syncLiveBass(); syncSlots(); dirty = true; ledsDirty = true;
  }
  function clearLive() {
    stepEdit=-1;bassRecordOwner=-1;
    pedalsOff(); gestureVelocity = null;
    bassGesture.reset(); gestureBass = null;
    arpSource = '[]'; send({ op: 'arpsrc', notes: [], enabled: 0 });
    for (const owner of [...voices.keys()]) stop(owner);
    melodyHeld.fill(0); melodyPressure.fill(0); sentPressure.fill(0);
    heldModifiers.length = 0; borrowDown = false;
    if (active.kind === 'bank') { active.variant = {}; active.chord = bank[active.index]; active.notes = chordNotes(active.chord, settings); }
    lastVoicing = []; ledsDirty = true;
  }
  function freeSlot(start = 0) {
    for (let offset = 0; offset < STEP_COUNT; offset++) {
      const index = wrap(start + offset, STEP_COUNT);
      if (!progression[index]) return index;
    }
    return -1;
  }
  function storeSlot(index, chord, notes = active.notes) {
    undoTake=null;
    const {performance,more,...manual}=chord||{};
    progression[index] = freezeStep(chord?manual:null, settings, chord ? notes || voiced(chord) : []);
    if (progression[index] && gestureBass !== null) {
      progression[index].snapshot.bass = gestureBass;
      progression[index].bassMode = 'note';
      progression[index].bassOffset = gestureBass - (48 + context(chord).key + chord.rootOffset + chord.register * 12);
    }
    selectedSlot = index; syncSlots(); markSave(); dirty = true; ledsDirty = true;
  }
  function setCapture(enabled) {
    if (publicBuild) return;
    if(enabled&&recordArmed)setRecord(false);
    nextCapture = freeSlot(nextCapture);
    capture = Boolean(enabled) && nextCapture >= 0;
    describe(enabled && !capture ? 'Progression full' : `Capture ${capture ? 'on' : 'off'}`);
    ledsDirty = true;
  }
  function setArm(enabled) {
    if (publicBuild && enabled) return;
    if(!enabled&&recordArmed)setRecord(false);
    armed = Boolean(enabled);
    send({ op: 'arm', enabled: armed ? 1 : 0 });
    if (!armed) {
      if (dsp.running) clearSustained();
      dsp = { ...dsp, armed: false, running: false, slot: -1, sounding: false, loop_sounding: false, bass_sounding: false };
    }
    describe(armed ? 'SEQ armed: Move Play' : 'SEQ off'); ledsDirty = true;
  }
  function selectEdit(index) {
    extraHeld=false;
    stepEdit=-1;stepEvent=0;
    if (ideasEnabled && index >= 0) { describe('IDEAS off to edit'); return; }
    if (index < 0) setIdeas(false);
    if (index >= 0 && editIndex < 0) editReturnPage = page;
    if (index < 0 && editIndex >= 0) page = editReturnPage;
    editIndex = clamp(index, -1, 7);
    if (editIndex >= 0) page = pages.indexOf('CHORDS');
    focused = -1; touch = -1;
    describe(index < 0 ? 'Editing all chords' : `Edit ${index + 1}: ${chordName(bank[index], settings)}`);
    ledsDirty = true;
  }
  function resetEdit() {
    if (editIndex < 0) { describe('Select a pad to reset'); return; }
    overrides[editIndex] = null; refreshHarmony(); markSave(); describe('Pad follows global');
  }
  function keepVariation() {
    if (active.kind !== 'bank' || !Object.values(active.variant || {}).some(Boolean)) { describe('Play a variation first'); return; }
    const index = active.index;
    // Capture the played chord before changing the bank. Offsets remain relative
    // to KEY, so later transposition preserves its identity and all extensions.
    overrides[index] = normalizeOverride({ customChord: active.chord,
      lockInversion: active.chord.lockInversion === true });
    active.variant = {};
    for (const voice of voices.values()) if (voice.kind === 'bank' && voice.index === index) voice.variant = {};
    // KEEP commits the played variation, so release the preparation latch too:
    // otherwise the next strike could borrow the newly saved chord a second time.
    const wasBorrowLocked = borrowLocked;
    heldModifiers.length = 0; borrowLocked = false; editIndex = index; page = pages.indexOf('CHORDS');
    refreshHarmony(); markSave(); describe(wasBorrowLocked ? 'Kept; BORROW unlocked' : `Kept on pad ${index + 1}`);
  }
  function pad(note, pressed, velocity = 100, modifiers = {}) {
    if (parked) return;
    if (note === STOP_PAD) {
      if (pressed && !stopHeld) panic();
      stopHeld = pressed; ledsDirty = true; dirty = true;
      return;
    }
    const modifier = MODIFIER_PADS.indexOf(note);
    if (modifier >= 0) {
      if (modifier === 6) {
        if (pressed && borrowDown) return; // One toggle per physical press.
        borrowDown = pressed;
        if (pressed && modifiers.shift) {
          borrowLocked = !borrowLocked;
          if (ideasEnabled) newIdeas(ideasSource);
          ledsDirty = true;
          describe(borrowLocked ? 'BORROW locked' : 'BORROW off: next chord');
          return; // Do not also arm a momentary BORROW on the unlock gesture.
        }
      }
      const at = heldModifiers.indexOf(modifier);
      if (at >= 0) heldModifiers.splice(at, 1);
      if (pressed) heldModifiers.push(modifier);
      // Modifiers only prepare the next bank-pad attack. They never revoice
      // a held/sustained chord, bass, melody or running progression.
      ledsDirty = true;
      const names = heldModifiers.filter(i => i !== 6).map(i => ['DOM', 'MAJ/MIN', 'SUS2', 'SUS4', 'II', 'SUB'][i]);
      if (borrowLocked || heldModifiers.includes(6)) names.push(borrowLocked ? 'BORROW locked' : 'BORROW');
      describe(names.length ? 'Next: ' + names.join(' ') : 'Next: saved harmony');
      return;
    }
    const chordIndex = CHORD_PADS.indexOf(note);
    if (chordIndex >= 0) {
      // Bass-only overdub uses root selectors, not harmony anchors. Releases
      // never choose another pitch; only the last pressed owner can end it.
      if(recordArmed && settings.recordPart==='bass' && (!pressed || !modifiers.shift)) {
        if(!pressed) {
          recordRelease(chordIndex);
          if(bassRecordOwner===chordIndex){release(LIVE_BASS_OWNER);bassRecordOwner=-1;}
          return;
        }
        const chord=chordForInput(chordIndex);
        if(!chord)return;
        const notes=bassNotes({...chord,bassMode:'root'},settings,chordNotes(chord,settings));
        if(!notes.length)return;
        stop(LIVE_BASS_OWNER);pedal('bass',false);
        const vel=settings.bassVelocityMode==='pad'?velocity:settings.bassVelocity;
        play(LIVE_BASS_OWNER,notes,vel,{kind:'bass',chord});bassRecordOwner=chordIndex;
        recordBass(chordIndex);describe('Bass '+bassNoteName(notes[0]));return;
      }
      if (!pressed) {
        if (bassGesture.inspect().active) {
          const action = bassGesture.release(chordIndex);
          if (action.type === 'end') {
            recordRelease(action.anchor);
            release(action.anchor);
            if (settings.chordSustain === 'off' && settings.bassSustain === 'off') gestureBass = null;
            syncLiveBass();
          }
          dirty = true; ledsDirty = true; return;
        }
        recordRelease(chordIndex);release(chordIndex); syncLiveBass(); return;
      }
      if (modifiers.shift) {
        if (ideasEnabled) { describe('IDEAS off to edit'); return; }
        selectEdit(modifiers.delete ? chordIndex : editIndex === chordIndex ? -1 : chordIndex);
        if (modifiers.delete) resetEdit();
        return;
      }
      const kind = ideasEnabled ? 'idea' : 'bank';
      const variant = ideasEnabled ? ideaVariant() : modifierState();
      const chord = chordForInput(chordIndex, variant);
      if (!chord) { describe('No suggestion'); return; }
      if (settings.bassGesture && settings.bassEnabled) {
        const action = bassGesture.press(chordIndex);
        if (action.type === 'none') return;
        if (action.type === 'bass') {
          gestureVelocity = velocity;
          gestureBass = nearestBassPitch(settings.key + chord.rootOffset,
            gestureBass ?? voices.get(LIVE_BASS_OWNER)?.notes[0] ?? 36);
          syncLiveBass(); recordBass(bassGesture.inspect().anchor); dirty = true; ledsDirty = true; return;
        }
      }
      gestureBass = null; // A new harmony attack ends the previous sustained slash choice.
      const notes = voiced(chord);
      beginHarmony();
      play(chordIndex, notes, velocity, { kind, index: chordIndex, chord, variant });
      activate(chord, kind, chordIndex, notes, variant);
      recordAttack(chordIndex,chord,notes,velocity);
      if (ideasEnabled) {
        ideaSelected = chordIndex;
        active.ideaReason = Object.values(variant).some(Boolean) ? degreeName(chord, ideasContext(settings, borrowLocked)) : ideas[chordIndex].reason;
      }
      syncLiveBass();
      recordBass(chordIndex);
      if (capture) {
        const slot = freeSlot(nextCapture);
        if (slot >= 0) { storeSlot(slot, chord); nextCapture = wrap(slot + 1, STEP_COUNT); }
        if (freeSlot(nextCapture) < 0) capture = false;
      }
      describe(ideasEnabled ? active.ideaReason : chordName(chord, settings) + ' ' + degreeName(chord, settings));
      return;
    }
    const melodyIndex = MELODY_PADS.indexOf(note);
    if (melodyIndex >= 0) {
      const pitch = melodyNotes(active.chord, melodyContext())[melodyIndex];
      if (pressed && !Number.isInteger(pitch)) { describe('Note outside MIDI'); return; }
      melodyHeld[melodyIndex] = pressed ? clamp(velocity, 1, 127) : 0;
      melodyPressure[melodyIndex] = 0;
      if (pressed) {
        play(melodyIndex + MELODY_OWNER_START, [pitch], velocity, { kind: 'melody', index: melodyIndex }, true);
      } else { flushPressure(); release(melodyIndex + MELODY_OWNER_START); }
    }
  }
  function endGesture() {
    const state = bassGesture.inspect();
    if (state.active) { stop(state.anchor); stop(LIVE_BASS_OWNER); }
    bassGesture.reset(); gestureBass = null;
  }
  function step(index, pressed, modifiers = {}) {
    if (publicBuild) return;
    if (parked || !Number.isInteger(index) || index < 0 || index >= STEP_COUNT) return;
    if (!pressed) { if(stepEdit===index){stepEdit=-1;focused=-1;touch=-1;dirty=true;} release(STEP_OWNER_START + index); syncLiveBass(); return; }
    // No step audition may leak a live chord into bass-only recording.
    if(recordArmed){describe('Finish REC before editing');return;}
    stepEdit=-1;stepEvent=0;
    const part=stepPart();
    if(part==='melody'){describe('Melody recording: next');return;}
    seqPart=part;
    if(part==='bass') {
      selectedSlot=index;ledsDirty=true;dirty=true;
      if(modifiers.delete){undoTake=null;bassProgression[index]=null;syncSlots();markSave();describe(`Cleared bass ${index+1}`);return;}
      if(modifiers.shift) {
        const voice=voices.get(LIVE_BASS_OWNER);
        if(!voice){describe('Play a bass note first');return;}
        undoTake=null;
        bassProgression[index]=normalizeBassStep({note:voice.notes[0],velocity:voice.velocity,steps:1});
        settings.bassPlayback='clip';config();syncSlots();markSave();return;
      }
      if(bassProgression[index]){stepEdit=index;describe(`Bass step ${index+1}`);}else describe(`Bass ${index+1} empty`);
      return;
    }
    if (modifiers.delete) {
      stop(STEP_OWNER_START + index); storeSlot(index, null); syncLiveBass(); describe(`Cleared step ${index + 1}`); return;
    }
    const held = currentPage()==='SEQ' ? [...voices.values()].filter(v=>['bank','idea'].includes(v.kind)&&!v.sustained).pop() : null;
    if(held&&!modifiers.shift){storeSlot(index,held.chord,held.notes);describe(`Saved step ${index+1}`);return;}
    if (modifiers.shift) {
      storeSlot(index, active.chord); describe(`Saved step ${index + 1}`); return;
    }
    selectedSlot = index; ledsDirty = true; dirty = true;
    if (!progression[index]) { describe(`Step ${index + 1} empty`); return; }
    if(['SEQ','CHORDS'].includes(currentPage())){stepEdit=index;stepEditExtension='AUTO';focused=-1;describe(`Chord step ${index+1}`);}
    endGesture();
    const notes = voiced(progression[index]);
    beginHarmony();
    play(STEP_OWNER_START + index, notes, progression[index].timing?.velocity??settings.stepVelocity, { kind: 'slot', index, chord: progression[index] });
    activate(progression[index], 'slot', index, notes);
    syncLiveBass();
    describe(`Step ${index + 1} ${chordName(active.chord, context())}`);
  }
  // Each setting has one home, with PLAY aliasing CHORDS. EDIT is contextual:
  // its fields affect only the selected chord, never global key/scale.
  function cells() {
    const scale = SCALES.find(s => s.id === settings.scaleId) || SCALES[0];
    const editing = editIndex >= 0 ? { ...settings, ...overrides[editIndex] } : settings;
    const field = (id, label, value, fullLabel = label, fullValue = value, hint = '') =>
      ({ id, label, value: String(value), fullLabel, fullValue: String(fullValue), disabled: !!hint,
        disabledValue: id === 'gate' ? String(value) : '--', hint });
    const blank = () => ({ label: '', value: '', disabled: true });
    if(stepEdit>=0) {
      const event=editedEvent(),count=cellEvents((seqPart==='bass'?bassProgression:progression)[stepEdit]).length;
      const selector=field('eventSelect','EVENT',`${stepEvent+1}/${count}`,'Event in step');
      if(event)return seqPart==='bass' ? [
        field('eventNote','NOTE',bassNoteName(event.note),'Bass pitch'),
        field('eventLength','LEN',event.steps,'Length (steps)'),field('eventVelocity','VEL',event.velocity,'Velocity'),
        blank(),blank(),blank(),blank(),selector] : [
        field('eventRoot','ROOT',noteName(event.snapshot.key+event.rootOffset),'Chord root'),
        field('eventExtension','EXT',stepEditExtension==='AUTO'?'SAVED':stepEditExtension,'Change extension'),
        field('eventLength','LEN',event.timing?.steps??1,'Length (steps)'),
        field('eventVelocity','VEL',event.timing?.velocity??settings.stepVelocity,'Velocity'),
        blank(),blank(),blank(),selector];
    }
    const mode = settings.melodyMode;
    const layout = {
      CHORDS: [
        field('key', 'KEY', noteName(settings.key), 'Key'),
        field('scaleId', 'SCALE', scale.short, 'Scale', scale.name),
        field('extension', 'EXT', EXTENSIONS[settings.extension], 'Extension'),
        field('octave', 'OCT', settings.octave, 'Chord octave'),
        field('spread', 'SPRD', ['CLOSE', 'OPEN', 'WIDE'][settings.spread], 'Spread'),
        field('voiceLead', 'LEAD', settings.voiceLead ? 'ON' : 'OFF', 'Voice leading'),
        field('strumMs','STRUM',settings.strumMs,'Strum',settings.strumMs+'ms'),
        field('chordSustain', 'SUST', settings.chordSustain.toUpperCase(), 'Chord sustain'),
      ],
      STRUM: [
        field('strumMs','GAP',settings.strumMs,'Note spacing',settings.strumMs+'ms'),
        field('strumDirection','DIR',['UP','DOWN','ALT','RAND'][settings.strumDirection],'Strum direction'),
        field('strumTiming','TIME',settings.strumTiming+'%','Timing variation'),
        field('strumVelocity','VEL',settings.strumVelocity+'%','Velocity variation'),
        blank(), blank(),
        publicBuild ? blank() : field('divisi','DIV',settings.divisi?'NOTE':'OFF','Divisi',settings.divisi?'Shift+MIDI: channels':'Off'),
      ],
      IDEAS: [
        field('ideasEnabled', 'IDEAS', ideasEnabled ? 'ON' : 'OFF', 'Ideas'),
        field('ideasColor', 'STYLE', ideaStyle(settings.ideasColor), 'Ideas style'),
        field('ideasNew', 'NEW', 'TURN', 'New ideas', 'From played chord', ideasEnabled ? '' : 'Turn IDEAS on first'),
        field('ideasMode','MODE',settings.ideasMode.toUpperCase(),'Ideas mode'),
      ],
      MELODY: [
        field('melodyMode', 'MODE', ['CHORD', 'SCALE', 'CHROM'][MELODY_MODES.indexOf(mode)], 'Melody mode'),
        field('melodyOctave', 'M.OCT', settings.melodyOctave, 'Melody octave'),
        field('melodyAdapt', 'ADAPT', settings.melodyAdapt ? 'ON' : 'OFF', 'Adaptive scale', settings.melodyAdapt ? 'ON' : 'OFF', mode === 'scale' ? '' : 'ADAPT: use SCALE mode'),
        publicBuild ? field('melodyFollow', 'TRACK', settings.melodyFollow === 'nearest' ? 'NEAR' : 'PAD', 'Held melody', settings.melodyFollow === 'nearest' ? 'Nearest chord tone' : 'Pad position', mode === 'chord' ? '' : 'TRACK: use CHORD mode') : blank(),
        field('melodySustain','SUST',settings.melodySustain.toUpperCase(),'Melody sustain'),
        publicBuild ? field('melodyAftertouch','AT',settings.melodyAftertouch?'POLY':'OFF','Melody aftertouch') : blank(),
      ],
      BASS: [
        field('bassEnabled', 'BASS', settings.bassEnabled ? 'ON' : 'OFF', 'Automatic bass'),
        field('bassOctave', 'B.OCT', settings.bassOctave, 'Bass octave'),
        publicBuild ? field('bassVelocity', 'B.VEL', settings.bassVelocity, 'Bass velocity', settings.bassVelocity, settings.bassVelocityMode==='pad'?'VEL PAD follows attack':'') : blank(),
        field('bassMode', 'B.NTE', settings.bassMode.toUpperCase(), 'Bass note'),
        field('bassGesture', 'GEST', settings.bassGesture ? 'ON' : 'OFF', 'Hold chord: bass gesture'),
        field('bassSustain','SUST',settings.bassSustain.toUpperCase(),'Bass sustain'),
        publicBuild ? field('bassVelocityMode','VEL',settings.bassVelocityMode.toUpperCase(),'Bass velocity mode') : blank(),
      ],
      'M.EXTRA': [
        publicBuild ? blank() : field('melodyFollow','TRACK',settings.melodyFollow==='nearest'?'NEAR':'PAD','Held melody',settings.melodyFollow==='nearest'?'Nearest chord tone':'Pad position',mode==='chord'?'':'TRACK: use CHORD mode'),
        field('melodyAftertouch','AT',settings.melodyAftertouch?'POLY':'OFF','Melody aftertouch'),
      ],
      'B.EXTRA': [
        field('bassVelocityMode','VEL',settings.bassVelocityMode.toUpperCase(),'Bass velocity mode'),
        field('bassVelocity','B.VEL',settings.bassVelocity,'Bass velocity',settings.bassVelocity,settings.bassVelocityMode==='pad'?'VEL PAD follows attack':''),
        field('bassPlayback','SEQ',settings.bassPlayback.toUpperCase(),'Sequenced bass'),
      ],
      SEQ: [
        field('arm', 'RUN', dsp.running ? 'PLAY' : armed ? 'ARMED' : 'OFF', 'Loop'),
        field('rate', 'RATE', RATE_NAMES[settings.rate], 'Step rate'),
        field('gate', 'GATE', settings.autoSustain ? 'HOLD' : settings.gate + '%', 'Gate', settings.gate + '%', settings.autoSustain ? 'SUST HOLD: full gate' : ''),
        field('seqPart', 'PART', seqPart.toUpperCase(), 'Step editing part'),
        field('stepVelocity', 'S.VEL', settings.stepVelocity, 'Step velocity'),
        field('quantize','QNT',settings.quantize+'%','Quantization strength'),
        field('record','REC',recordArmed?(dsp.running?'REC':'ARM'):'OFF','Record '+settings.recordPart),
        field('recordPart','R.PRT',settings.recordPart.toUpperCase(),'Recording part'),
      ],
      ARP: [
        field('arpEnabled', 'ARP', settings.arpEnabled ? 'ON' : 'OFF', 'Arpeggiator'),
        field('arpRate', 'RATE', RATE_NAMES[settings.arpRate], 'Arp rate'),
        field('arpDirection', 'DIR', ['UP', 'DOWN', 'UP/DN', 'RAND', 'CHORD'][settings.arpDirection], 'Arp direction'),
        field('arpRange', 'RANGE', settings.arpRange, 'Arp octave range', settings.arpRange, settings.arpDirection === 4 ? 'CHORD uses source voicing' : ''),
        field('arpGate', 'GATE', settings.arpGate + '%', 'Arp gate'),
        field('arpSwing', 'SWING', settings.arpSwing + '%', 'Arp swing'),
        field('arpVelocity', 'VEL', settings.arpVelocity, 'Arp velocity'),
        field('arpHold', 'HOLD', settings.arpHold ? 'ON' : 'OFF', 'Arp hold'),
      ],
      'A.CLOCK': [
        field('arpClock', 'CLOCK', settings.arpClock.toUpperCase(), 'Arp clock'),
        field('arpBpm', 'BPM', settings.arpBpm, 'Free tempo', settings.arpBpm + ' BPM', settings.arpClock === 'free' ? '' : 'BPM: use FREE clock'),
      ],
      MIDI: [
        field('previewRoute', 'C.OUT', routeLabels[ROUTES.indexOf(settings.previewRoute)], 'Chord output', routeFull[ROUTES.indexOf(settings.previewRoute)]),
        field('channel', 'C.CH', settings.channel + 1, 'Chord channel',settings.channel+1,!publicBuild&&settings.divisi?'DIV: Shift+MIDI':''),
        field('melodyRoute', 'M.OUT', routeLabels[ROUTES.indexOf(settings.melodyRoute)], 'Melody output', routeFull[ROUTES.indexOf(settings.melodyRoute)]),
        field('melodyChannel', 'M.CH', settings.melodyChannel + 1, 'Melody channel'),
        field('bassRoute', 'B.OUT', routeLabels[ROUTES.indexOf(settings.bassRoute)], 'Bass output', routeFull[ROUTES.indexOf(settings.bassRoute)]),
        field('bassChannel', 'B.CH', settings.bassChannel + 1, 'Bass channel'),
        publicBuild ? blank() : field('arpRoute', 'A.OUT', routeLabels[ROUTES.indexOf(settings.arpRoute)], 'Arp output'),
        publicBuild ? blank() : field('arpChannel', 'A.CH', settings.arpChannel + 1, 'Arp channel'),
      ],
      ENSEMBL: settings.ensembleChannels.map((ch,i)=>field(`ensemble${i}`,`V${i+1}.CH`,ch+1,`Voice ${i+1} channel`,ch+1)),
    };
    if (editIndex >= 0) {
      const saved = overrides[editIndex] || {}, chord = bank[editIndex];
      const type = saved.chordType || 'AUTO';
      const ext = saved.extensionName || (Number.isInteger(saved.extension) ? EXTENSIONS[saved.extension] : 'AUTO');
      const inv = saved.lockInversion === true || (saved.lockInversion === undefined && chord.lockInversion)
        ? clamp(chord.inversion,1-chord.intervals.length,chord.intervals.length-1) : null;
      return [
        field('rootOffset', 'ROOT', noteName(settings.key + chord.rootOffset), 'Chord root'),
        field('chordType', 'TYPE', type, 'Chord type', type === 'AUTO' ? 'Auto: ' + chordType(chord) : type),
        field('extensionName', 'EXT', ext, 'Pad extension'),
        field('padInversion', 'INV', inv === null ? 'AUTO' : inv === 0 ? 'ROOT' : inv>0?'+'+inv:inv, 'Inversion',inv===null?'AUTO':`${inv===0?'ROOT':inv>0?'+'+inv:inv} (Shift: AUTO)`),
        field('spread', 'SPRD', ['CLOSE','OPEN','WIDE'][chord.spread], 'Pad spread'),
        field('keep', 'KEEP', 'TURN', 'Keep played variation'),
        field('reset', 'RESET', 'TURN', 'Reset this pad'),
        field('bassMode', 'B.NTE', chord.bassMode === 'note' ? bassNoteName(explicitBassNote(chord, settings))
          : (saved.bassMode || chord.bassMode || 'auto').toUpperCase(),
          chord.bassMode === 'note' ? 'Bass (Shift: octave)' : 'Pad bass note'),
      ];
    }
    // Both profiles keep the PLAY map but share their CHORD control model.
    // Reuse the exact controls so ranges, persistence and note handling agree.
    const row = layout[currentPage() === 'PLAY' ? 'CHORDS' : currentPage()];
    return row ? Array.from({ length: 8 }, (_, i) => row[i] || blank()) : [];
  }
  function focus(index, held = true) {
    if (index < 0 || index > 7) return;
    const cell = cells()[index];
    if (!cell?.id) return;
    touch = held ? index : -1;
    focused = cell.disabled ? -1 : index;
    describe(cell.id==='padInversion'?`INV ${cell.value} | Shift:AUTO`:cell.hint || `${cell.fullLabel}: ${cell.fullValue}`);
    controlDetail = true;
  }
  function knob(index, delta, modifiers = {}) {
    if (parked || !delta || index < 0 || index > 7) return;
    const control = cells()[index];
    if (!control?.id) return;
    if (control.disabled) { focused = -1; describe(control.hint); return; }
    delta = clamp(Math.trunc(delta), -63, 63);
    const id = control.id;
    if(id==='quantize') {
      if(recordArmed)setRecord(false);
      settings.quantize=clamp(settings.quantize+delta,0,100);syncSlots();markSave();describe('Quantize: '+settings.quantize+'%');return;
    }
    if(id==='eventSelect') {
      stepEvent=clamp(stepEvent+delta,0,cellEvents((seqPart==='bass'?bassProgression:progression)[stepEdit]).length-1);
      stepEditExtension='AUTO';describe('Event '+(stepEvent+1));return;
    }
    if(id==='recordPart') {
      const next=['both','chord','bass'][clamp(['both','chord','bass'].indexOf(settings.recordPart)+delta,0,2)];
      if(next!==settings.recordPart){setRecord(false);settings.recordPart=next;markSave();}
      describe('Record part: '+next.toUpperCase());return;
    }
    if(id==='seqPart'){seqPart=delta>0?'bass':'chord';focused=-1;ledsDirty=true;describe('Steps: '+seqPart);return;}
    if(id==='bassPlayback'){undoTake=null;settings.bassPlayback=delta>0?'clip':'follow';config();markSave();describe('Bass sequence: '+settings.bassPlayback);return;}
    if(stepEdit>=0 && id.startsWith('event')) {
      undoTake=null;
      const event=editedEvent();
      if(seqPart==='bass') {
        if(id==='eventNote')event.note=clamp(event.note+delta*(modifiers.shift?12:1),0,127);
        if(id==='eventLength'){event.steps=clamp(event.steps+delta,1,16);if(event.performance)event.performance.duration=event.steps;}
        if(id==='eventVelocity')event.velocity=clamp(event.velocity+delta,1,127);
      } else if(id==='eventLength'||id==='eventVelocity') {
        event.timing={steps:event.timing?.steps??1,velocity:event.timing?.velocity??settings.stepVelocity};
        const key=id==='eventLength'?'steps':'velocity';event.timing[key]=clamp(event.timing[key]+delta,1,key==='steps'?16:127);
        if(key==='steps'&&event.performance)event.performance.duration=event.timing.steps;
      } else if(id==='eventRoot') {
        const shift=clamp(delta,-Math.min(...event.snapshot.notes),127-Math.max(...event.snapshot.notes));
        event.rootOffset=wrap(event.rootOffset+shift,12);event.snapshot.notes=event.snapshot.notes.map(n=>n+shift);
        if(event.snapshot.bass>=0)event.snapshot.bass=clamp(event.snapshot.bass+shift,0,127);
      } else if(id==='eventExtension') {
        const current=PAD_EXTENSIONS.indexOf(stepEditExtension);
        stepEditExtension=PAD_EXTENSIONS[clamp(Math.max(0,current)+delta,1,PAD_EXTENSIONS.length-1)];
        const chord=buildPadChord({...settings,key:event.snapshot.key,scaleId:event.snapshot.scaleId},0,{customChord:event,extensionName:stepEditExtension});
        // Preserve the saved register, not today's global chord octave.
        const base={...settings,key:event.snapshot.key,octave:0,voiceLead:false};
        const notes=chordNotes(chord,base),offset=12*Math.round((event.snapshot.notes[0]-notes[0])/12);
        const shifted=notes.map(n=>n+offset);
        if(shifted.every(n=>n>=0&&n<=127)){
          const edited=normalizeStep({...chord,timing:event.timing,performance:event.performance,snapshot:{...event.snapshot,notes:shifted},more:event.more});
          if(stepEvent)progression[stepEdit].more[stepEvent-1]=edited;else progression[stepEdit]=edited;
        }
      }
      syncSlots();markSave();focused=index;const cell=cells()[index];describe(`${cell.fullLabel}: ${id==='eventExtension'?stepEditExtension:cell.fullValue}`);return;
    }
    if(id==='record'){setRecord(delta>0);return;}
    if(id==='rate'&&recordArmed){setRecord(false);}
    if(id==='bassEnabled'&&recordArmed){setRecord(false);}
    if (id === 'ideasEnabled') { setIdeas(delta > 0); return; }
    if (id === 'ideasNew') { newIdeas(active.chord,true); return; }
    if(id==='ideasMode') {
      const value=delta>0?'to':'next';
      if(settings[id]!==value){settings[id]=value;markSave();if(ideasEnabled)newIdeas(active.chord,true);}
      focused=index;const cell=cells()[index];describe(`${cell.fullLabel}: ${cell.fullValue}`);return;
    }
    if (id === 'ideasColor') {
      const value = IDEA_COLORS[clamp(IDEA_COLORS.indexOf(settings.ideasColor) + delta, 0, 2)];
      if (value !== settings.ideasColor) {
        settings.ideasColor = value; markSave();
        if (ideasEnabled) newIdeas(ideasSource);
      }
      focused = index; describe('Ideas style: ' + ideaStyle(value)); return;
    }
    if (id === 'reset') { resetEdit(); return; }
    if (id === 'keep') {
      if (active.kind !== 'bank' || active.index !== editIndex) { describe('Play this pad variant'); return; }
      keepVariation(); return;
    }
    if (id === 'arm') { setArm(delta > 0); return; }
    if (id === 'capture') { setCapture(delta > 0); return; }
    const before = { ...settings }, beforeOverride = JSON.stringify(overrides);
    const perPad = editIndex >= 0;
    if (id === 'bassMode' && perPad) {
      const chord = bank[editIndex], patch = { ...overrides[editIndex] };
      const explicit = explicitBassNote(chord, settings);
      let note = explicit;
      if (modifiers.shift) {
        if (note === null) { describe('Choose bass note first'); return; }
        const pc = wrap(note, 12), wanted = clamp(note + delta * 12, pc, pc + Math.floor((127 - pc) / 12) * 12);
        // Never reverse the knob direction to repair an out-of-range note
        // caused by a later transposition. Move toward the range deliberately.
        if ((delta > 0 && wanted >= note) || (delta < 0 && wanted <= note)) note = wanted;
      } else {
        const modes = ['auto', 'root', 'low'];
        const current = note !== null ? 3 + wrap(note, 12) : Math.max(0, modes.indexOf(chord.bassMode || 'auto'));
        const selected = clamp(current + delta, 0, 14);
        if (selected < 3) { patch.bassMode = modes[selected]; delete patch.bassOffset; note = null; }
        else {
          const previous = explicit ?? bassNotes(chord, settings)[0] ?? 36;
          const pc = selected - 3;
          // Keep the chosen octave while turning through pitch classes. At
          // MIDI boundaries move by an octave, never clamp to another pitch.
          note = Math.floor(clamp(previous, 0, 127) / 12) * 12 + pc;
          if (note > 127) note -= 12;
        }
      }
      if (note !== null) {
        patch.bassMode = 'note';
        patch.bassOffset = note - (48 + settings.key + chord.rootOffset + chord.register * 12);
      }
      overrides[editIndex] = normalizeOverride(patch);
      if (beforeOverride !== JSON.stringify(overrides)) { refreshHarmony(); markSave(); }
      focused = index;
      describe(note === null ? 'Bass: ' + patch.bassMode.toUpperCase() : 'Bass ' + bassNoteName(note) + ' | Shift: octave');
      return;
    }
    const editing = perPad ? { ...settings, ...overrides[editIndex] } : settings;
    let value = settings[id];
    if (id === 'rootOffset') value = wrap(bank[editIndex].rootOffset + delta, 12);
    else if (id === 'bassMode') {
      const options = perPad ? ['auto', 'root', 'low'] : ['root', 'low'];
      const current = perPad ? (overrides[editIndex]?.bassMode || bank[editIndex].bassMode || 'auto') : settings.bassMode;
      value = options[clamp(options.indexOf(current) + delta, 0, options.length - 1)];
    }
    else if (id === 'chordType') value = CHORD_TYPES[clamp(CHORD_TYPES.indexOf(editing.chordType || 'AUTO') + delta, 0, CHORD_TYPES.length - 1)];
    else if (id === 'extensionName') {
      const current = PAD_EXTENSIONS.indexOf(editing.extensionName || 'AUTO');
      const options = chordType(bank[editIndex]) === 'DIM' ? PAD_EXTENSIONS : PAD_EXTENSIONS.filter(e => e !== 'DIM7');
      value = options[clamp(Math.max(0, options.indexOf(PAD_EXTENSIONS[current])) + delta, 0, options.length - 1)];
    } else if (id === 'padInversion') {
      const chord=bank[editIndex],limit=chord.intervals.length-1;
      const current=chord.lockInversion?clamp(chord.inversion,-limit,limit):null;
      // AUTO sits between downward inversions and manual ROOT, reachable
      // in either direction without depending on a hardware Shift gesture.
      const options=[...Array.from({length:limit},(_,i)=>i-limit),null,...Array.from({length:limit+1},(_,i)=>i)];
      value=modifiers.shift?null:options[clamp(options.indexOf(current)+delta,0,options.length-1)];
    } else if (id === 'key') value = wrap(settings.key + delta, 12);
    else if (id === 'scaleId') value = SCALES[wrap(SCALES.findIndex(s => s.id === settings.scaleId) + delta, SCALES.length)].id;
    else if (id === 'extension') value = EXTENSION_ORDER[clamp(EXTENSION_ORDER.indexOf(editing.extension) + delta, 0, EXTENSION_ORDER.length - 1)];
    else if (id === 'melodyMode') value = MELODY_MODES[clamp(MELODY_MODES.indexOf(settings.melodyMode) + delta, 0, 2)];
    else if (id === 'melodyFollow') value = delta > 0 ? 'nearest' : 'pad';
    else if (id === 'arpClock') value = delta > 0 ? 'free' : 'sync';
    else if (id.endsWith('Sustain')) value = sustainModes[clamp(sustainModes.indexOf(settings[id])+delta,0,2)];
    else if (id === 'bassVelocityMode') value = delta > 0 ? 'fixed' : 'pad';
    else if (id === 'divisi') value=delta>0;
    else if (/^ensemble[0-7]$/.test(id)) value=clamp(settings.ensembleChannels[Number(id.slice(-1))]+delta,0,15);
    else if (['voiceLead', 'melodyAdapt', 'melodyAftertouch', 'melodyRetrigger', 'autoSustain', 'bassEnabled', 'bassGesture', 'arpEnabled', 'arpHold', 'lockInversion'].includes(id)) value = delta > 0;
    else if (['route', 'previewRoute', 'melodyRoute', 'bassRoute', 'arpRoute'].includes(id)) value = ROUTES[wrap(ROUTES.indexOf(settings[id]) + delta, ROUTES.length)];
    else {
      const ranges = { color: [0, 2], inversion: [0, 3], spread: [0, 2], octave: [-3, 3],
        melodyOctave: [-3, 3], bassOctave: [BASS_OCTAVE_MIN, BASS_OCTAVE_MAX],
        bassVelocity: [1, 127], stepVelocity: [1, 127], channel: [0, 15], melodyChannel: [0, 15], bassChannel: [0, 15],
        arpBpm: [30, 300], arpRate: [0, 4], arpDirection: [0, 4], arpRange: [1, 4], arpGate: [10, 100], arpSwing: [0, 50], arpVelocity: [1, 127], arpChannel: [0, 15],
        strumDirection:[0,3],strumTiming:[0,100],strumVelocity:[0,100],strumMs: [0, 100, 5], rate: [0, 4], gate: [10, 100, 5] };
      const range = ranges[id];
      if (!range) return;
      value = clamp(editing[id] + delta * (range[2] || 1), range[0], range[1]);
    }
    if (perPad) {
      const patch = { ...overrides[editIndex] };
      if (id === 'padInversion') {
        patch.lockInversion = value !== null;
        if (value === null) delete patch.inversion; else patch.inversion = value;
      } else {
        patch[id] = value;
        if (id === 'extensionName') delete patch.extension;
        if (id === 'chordType' && value !== 'DIM' && patch.extensionName === 'DIM7') patch.extensionName = '7';
      }
      overrides[editIndex] = normalizeOverride(patch);
    } else if (/^ensemble[0-7]$/.test(id)) settings.ensembleChannels=settings.ensembleChannels.map((ch,i)=>i===Number(id.slice(-1))?value:ch);
    else settings[id] = value;
    if(id === 'chordSustain')settings.autoSustain=value==='hold'; // legacy sequencer gate compatibility
    if (id === 'previewRoute') settings.route = settings.previewRoute;
    if (!same(before, settings) || beforeOverride !== JSON.stringify(overrides)) {
      if (id === 'bassGesture' || id === 'bassEnabled') endGesture();
      if (id.endsWith('Sustain')) {
        const part=id.replace('Sustain','');pedal(part,false);
        for(const [owner,voice] of [...voices]) if(partName(voice.kind)===part && voice.sustained)stop(owner);
        if(value==='pedal' && [...voices.values()].some(v=>partName(v.kind)===part))pedal(part,true);
      }
      if (id === 'melodyAftertouch') { melodyPressure.fill(0); flushPressure(); }
      else if (id.startsWith('strum')) { /* New attacks only; never restart held notes. */ }
      else if (id.startsWith('arp')) { config(); syncArp(); }
      else if (/^ensemble[0-7]$/.test(id) || ['divisi', 'route', 'previewRoute', 'melodyRoute', 'bassRoute', 'channel', 'melodyChannel', 'bassChannel'].includes(id)) {
        clearLive(); send({ op: 'panic' }); config(); syncSlots();
      } else if (id === 'rate' || id === 'gate') config();
      else if (id === 'stepVelocity') syncSlots();
      else {
        if (before.octave !== settings.octave) lastVoicing = lastVoicing.map(n => n + (settings.octave - before.octave) * 12);
        config();
        refreshHarmony(settings.melodyOctave - before.melodyOctave,
          before.melodyMode !== settings.melodyMode || before.melodyAdapt !== settings.melodyAdapt ||
          (active.kind !== 'slot' && (before.key !== settings.key || (settings.melodyMode === 'scale' && before.scaleId !== settings.scaleId))));
      }
      markSave();
    }
    focused = index;
    const cell = cells()[index];
    describe(id==='padInversion'?`INV ${cell.value} | Shift:AUTO`:id === 'route' && !cell.id ? 'Sequence uses C.OUT' : `${cell.fullLabel}: ${cell.fullValue}`);
    controlDetail = true;
  }
  function shift(held) {
    if(parked && held)return;
    const next=!!held && !!extraPages[pages[page]] && editIndex<0 && stepEdit<0 && !ideasView;
    if(next===extraHeld)return;
    extraHeld=next;touch=-1;focused=-1;detailTicks=0;controlDetail=false;dirty=true;
    repaint();
  }
  function changePage(delta = 1) {
    if(extraHeld)return; // Holding an extra layer never moves its parent tab.
    if (!Math.trunc(delta)) return;
    if (editIndex >= 0 || stepEdit>=0) return; // Contextual editors remain until release.
    ledsDirty = true;
    if (ideasView) { ideasView=false; setIdeas(false); focused=-1; touch=-1; describe('PLAY'); return; }
    const nextPage = wrap(page + Math.trunc(delta), pages.length);
    if (nextPage !== page) setIdeas(false);
    page = nextPage; focused = -1; touch = -1;
    describe(currentPage());
  }
  function octave(delta) {
    const next = clamp(settings.octave + delta, -3, 3);
    if (next !== settings.octave) {
      lastVoicing = lastVoicing.map(n => n + (next - settings.octave) * 12);
      settings.octave = next; refreshHarmony(); markSave();
    }
    describe(`Chord octave ${settings.octave}`);
  }
  function poll(next) {
    if(publicBuild) next={...next,running:false,armed:false,event:-1,slot:-1,loop_sounding:false,bass_sounding:false};
    if (!next || next.v !== 1) return;
    const changedStep = next.running && (next.slot !== dsp.slot || next.cycle !== dsp.cycle || !dsp.running);
    const event=Number.isInteger(next.event)?next.event:next.slot;
    const oldEvent=Number.isInteger(dsp.event)?dsp.event:dsp.slot;
    const changedHarmony=next.running&&(event!==oldEvent||!dsp.running||(Number.isInteger(next.es)?next.es!==dsp.es:changedStep&&next.slot===runtimeChords[event]?.cell));
    if (!recordArmed && ((changedHarmony && progression.some(Boolean)) || (dsp.running && !next.running))) { clearSustained(); syncArp(); }
    if (!same(dsp, next)) { dirty = true; ledsDirty = true; }
    dsp = { ...next }; armed = Boolean(next.armed);
    if (!recordsChords() && changedHarmony && runtimeChords[event]) {
      const entry=runtimeChords[event];activate(entry.event,'slot',entry.cell,entry.event.snapshot.notes);active.eventId=event;
    }
  }
  function ledModel() {
    const values = Array.from({ length: 32 }, (_, i) => ({ note: 68 + i, role: 'off' }));
    CHORD_PADS.forEach((note, i) => { values[note - 68].role = voices.has(i) || bassGesture.inspect().held.includes(i) || (recordArmed && settings.recordPart==='bass' && bassRecordOwner===i) ? 'held'
      : ideasEnabled ? !ideas[i] ? 'off' : ideas[i].outside ? 'color' : 'chord'
      : editIndex === i ? 'selected' : overrides[i] ? 'stored' : bank[i].source === 'diatonic' ? 'chord' : 'color'; });
    MODIFIER_PADS.forEach((note, i) => {
      values[note - 68].role = i === 6 && borrowLocked ? 'borrowLocked' : heldModifiers.includes(i) ? 'held' : 'color';
    });
    values[STOP_PAD - 68].role = stopHeld ? 'stopHeld' : 'stop';
    const harmony = melodyContext();
    const pitches = melodyNotes(active.chord, harmony);
    const root = wrap(harmony.key + active.chord.rootOffset, 12);
    const chordPcs = new Set(active.chord.intervals.map(n => wrap(n + root, 12)));
    const scalePcs = new Set(adaptiveScaleIntervals(active.chord, harmony).map(n => wrap(n + harmony.key, 12)));
    MELODY_PADS.forEach((note, i) => {
      // Note ownership (including HOLD) must never obscure harmonic meaning.
      values[note - 68].role = !Number.isInteger(pitches[i]) ? 'off'
        : pitches[i] % 12 === root ? 'root'
        : chordPcs.has(pitches[i] % 12) ? 'chordTone'
        : scalePcs.has(pitches[i] % 12) ? 'scaleTone' : 'chromatic';
    });
    const stepLane=stepPart();
    for (let i = 0; i < STEP_COUNT; i++) {
      const event=stepLane==='bass'?bassProgression[i]:progression[i];
      values.push({note:16+i,role:publicBuild||stepLane==='melody'?'off':dsp.running&&dsp.slot===i?'held':event?(selectedSlot===i?'selected':'stored'):'off'});
    }
    values.push({ note: 52, button: true, role: publicBuild ? 'off' : capture ? 'on' : 'dim' });
    values.push({ note:86,button:true,role:recordArmed?'record':'off' });
    values.push({ note: 85, button: true, role: dsp.running ? 'chord' : armed ? 'dim' : 'off' });
    return values;
  }
  function model() {
    const notes = [...voices.values()].flatMap(voice => voice.notes);
    const event=Number.isInteger(dsp.event)?dsp.event:dsp.slot;
    if (dsp.loop_sounding && runtimeChords[event]) notes.push(...runtimeChords[event].event.snapshot.notes);
    if(dsp.bass_sounding) {
      if(settings.bassPlayback==='clip' && runtimeBass[dsp.be])notes.push(runtimeBass[dsp.be].event.note);
      else if(settings.bassPlayback!=='clip' && runtimeChords[event]?.event.snapshot.bass>=0)notes.push(runtimeChords[event].event.snapshot.bass);
    }
    const sounding = [...new Set(notes)].sort((a, b) => a - b);
    const harmony = context();
    const scale = SCALES.find(s => s.id === melodyContext().scaleId) || SCALES[0];
    const pageName = currentPage();
    const defaultDetail = stepEdit>=0 ? 'Release step: back' : editIndex >= 0 ? 'Shift+pad: exit EDIT'
      : pageName === 'CHORDS' ? publicBuild ? 'ALL | Shift+pad: edit' : 'Shift: STRUM / +pad'
      : pageName === 'STRUM' ? 'Release Shift: back'
      : ['M.EXTRA','B.EXTRA'].includes(pageName) ? 'Release Shift: back'
      : pageName === 'ENSEMBL' ? new Set(settings.ensembleChannels).size<8 ? 'Shared channels' : 'V1 low -> V8 high'
      : pageName === 'IDEAS' ? ideasEnabled ? ideaSelected >= 0 ? active.ideaReason || ideas[ideaSelected]?.reason : settings.ideasMode==='to'?'TO '+chordName(ideasTarget(),settings):'FROM ' + chordName(ideasSource, settings) : 'Turn IDEAS on to try'
      : pageName === 'MELODY' ? `${noteName(harmony.key)} ${scale.short} | ${settings.melodyMode === 'scale' && settings.melodyAdapt ? 'ADAPT' : 'MELODY'}`
      : pageName === 'BASS' ? publicBuild?'GEST: hold + pad':recordArmed?'REC '+settings.recordPart.toUpperCase()+' | BASS steps':'BASS steps | hold: edit'
      : pageName === 'SEQ' ? `${(seqPart==='bass'?bassProgression:progression).filter(Boolean).length}/16 saved | ${recordArmed?(dsp.running?'REC':'REC WAIT'):dsp.running ? 'PLAY' : armed ? 'ARMED' : 'OFF'}`
      : pageName === 'MIDI' ? sharedPedalChannel() ? 'CC64: shared channel' : publicBuild ? 'Routes and channels' : 'Shift: ensemble'
      : ['ARP','A.CLOCK'].includes(pageName) ? settings.arpClock === 'free' ? `FREE ${settings.arpBpm} BPM | pad` : 'SYNC | Move Play'
      : degreeName(active.chord, context());
    const editing = editIndex >= 0;
    const map = !editing && (pageName === 'PLAY' || (pageName === 'IDEAS' && ideasEnabled))
      ? { selected: pageName === 'IDEAS' ? ideaSelected : active.kind === 'bank' && voices.has(active.index) ? active.index : -1,
          items:Array.from({length:8},(_,i)=>inputPreview(i)) } : null;
    const mods = modifierState();
    const mapMode = [mods.borrow ? borrowLocked ? 'BORROW LOCK' : 'BORROW' : '',mods.ii?'II':mods.dom?'DOM':mods.sub?'SUB':'',mods.flip?'M/m':'',mods.sus?'SUS'+mods.sus:''].filter(Boolean).join(' ');
    return {
      pageName: stepEdit>=0?`${seqPart==='bass'?'B':'C'}.STP${stepEdit+1}`:editing ? `EDIT ${editIndex + 1}` : publicBuild&&pageName==='CHORDS'?'CHORD':currentPage(), pageIndex: editing || stepEdit>=0 || ideasView ? 0 : page, pageCount: editing || stepEdit>=0 || ideasView ? 1 : pages.length,
      borrowLocked,
      extraLayer: extraHeld && !!extraPages[pages[page]] && !editing && stepEdit<0,
      chordLabel: stepEdit>=0 ? seqPart==='bass'?bassNoteName(editedEvent()?.note??0):harmonyLabel(editedEvent(),editedEvent()?.snapshot.notes,true)
        : editing ? harmonyLabel(bank[editIndex], undefined, true) : harmonyLabel(active.chord, active.notes), degreeLabel: degreeName(active.chord, context()),
      transport: dsp.running ? 'PLAY' : armed ? 'WAIT' : 'OFF',
      cells: cells(), focused, detail: pageName === 'PLAY' && !editing
        // Derive from the active harmony, not a timed attack message: a bass
        // selector changes the slash label without attacking another chord.
        ? stopHeld ? 'STOP - all notes off'
          : controlDetail && (detailTicks > 0 || touch >= 0) ? detail
          : mapMode || `${harmonyLabel(active.chord, active.notes)} | ${degreeName(active.chord, context())}`
        : detailTicks > 0 || touch >= 0 ? detail : defaultDetail,
      ...(map ? {chordMap:map,...(pageName==='IDEAS'?{ideaView:map}:{})} : {}),
      ...(currentPage() === 'THEORY' ? { theory: { notes: sounding, root: wrap(context().key + active.chord.rootOffset, 12),
        degree: degreeName(active.chord, context()), source: active.chord.source } } : {}),
    };
  }
  function repaint(force = false) {
    if (force) { dirty = true; ledsDirty = true; io.forceLeds?.(); }
    if (parked) return;
    if (dirty) { io.render?.(model()); dirty = false; }
    if (ledsDirty) { io.leds?.(ledModel()); ledsDirty = false; }
  }
  function tick(nextDsp, isParked = false) {
    if(recordLimit){setRecord(false);recordLimit=false;describe('REC stopped: 8 per step');}
    if(recordArmed){const clock=readClock();commitTake(recorder.observe(clock.beat,clock.ready));commitBassTake(bassRecorder.observe(clock.beat,clock.ready));}
    if (isParked !== parked) {
      parked = isParked;
      if (parked) {extraHeld=false;touch=-1;focused=-1;setRecord(false);clearLive(); setIdeas(false); stopHeld = false; save(); }
      else { dirty = true; ledsDirty = true; io.forceLeds?.(); }
    }
    if (nextDsp) poll(nextDsp);
    flushPressure();
    if (saveTicks > 0 && --saveTicks === 0) save();
    if (touch < 0 && detailTicks > 0 && --detailTicks === 0) { focused = -1; dirty = true; }
    repaint();
  }
  function panic() {
    clearLive(); ideaSelected = -1; setArm(false); send({ op: 'kill' }); focused = -1; touch = -1; describe('STOP - all notes off');
  }
  function unload() {
    shift(false);setRecord(false);
    clearLive(); armed = false; send({ op: 'arm', enabled: 0 }); send({ op: 'panic' });
    borrowLocked = false; setIdeas(false);
    for (let attempt = 0; attempt < 3 && dirtySave; attempt++) save();
  }
  function init() {
    send({op:'cleargrid'});config(); syncSlots(); send({ op: 'arm', enabled: 0 });
    if (loaded.imported) describe('Previous settings read');
    else if (loaded.warnings.length) describe('Settings recovery');
    else if (!moveAvailable) describe('Move route unavailable');
    else describe(`${PRODUCT_NAME}${publicBuild?'':' Lab'} ${PRODUCT_VERSION}`);
    repaint();
  }
  function resume() {
    extraHeld=false;touch=-1;focused=-1;detailTicks=0;controlDetail=false;
    config(); syncSlots(); send({ op: 'arm', enabled: armed ? 1 : 0 });
    dirty = true; ledsDirty = true; repaint();
  }
  return { init, resume, pad, pressure, step, knob, focus, shift, changePage, octave, tick, repaint, panic, unload, selectEdit, resetEdit, keepVariation,
    menu: () => {
      changePage(1);
    },
    capture: () => setCapture(!capture),record:()=>setRecord(!recordArmed),undo:()=>{if(!publicBuild)undo();}, arm: setArm, play: () => setArm(true),
    inspect: () => ({ settings: { ...settings }, progression: progression.map(normalizeStep), bassProgression:bassProgression.map(normalizeBassStep),seqPart,stepEdit, active: { ...active },
      overrides: overrides.map(normalizeOverride), editIndex, borrowLocked, bank, loopNotes, loopBass,
      bassGesture: { ...bassGesture.inspect(), bass: gestureBass },
      ideasEnabled, ideas: ideas.map(entry => ({ ...entry, chord: normalizeChord(entry.chord) })), ideasSource, ideaSelected,
      modifiers: modifierState(), page, armed, capture,recordArmed,canUndo:!!undoTake, parked, dirtySave, voices: [...voices.entries()], model: model() }) };
}
