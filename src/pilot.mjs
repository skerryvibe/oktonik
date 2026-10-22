import { SCALES, EXTENSIONS, EXTENSION_ORDER, buildPadChord, buildPadBank, CHORD_TYPES, PAD_EXTENSIONS, chordType, chordNotes, melodyNotes, chordName, noteName, degreeName,
  applyModifiers, voiceLeadNotes, nearestMelodyNote, bassNotes, explicitBassNote, adaptiveScaleIntervals, soloScaleIntervals, melodyHarmony, MELODY_MODES, BASS_OCTAVE_MIN, BASS_OCTAVE_MAX } from './theory.mjs';
import { normalizeChord, normalizeStep, normalizeBassStep, freezeStep, normalizeOverride, readSettings, encodeDocument, STATE_PATH, STEP_COUNT, ROUTES, RATE_NAMES } from './settings.mjs';
import { generateIdeas, generateIdeasTo, generateIdeasAlt, ideasContext, IDEA_COLORS, ideaStyle } from './ideas.mjs';
import { createBassGesture, nearestBassPitch } from './bass-gesture.mjs';
import { smartBassChoices } from './smart-bass.mjs';
import { createChordRecorder, STEP_BEATS } from './recording.mjs';
import { createCaptureHistory,retimeCapture,trimCapture } from './capture.mjs';
import {compileLane,cellEvents,insertTake} from './timeline.mjs';
import {normalizeClips,selectedClip,ensureClip,resizeClip,CLIP_PARTS} from './clips.mjs';
import {BUILD_PROFILE, PRODUCT_NAME, PRODUCT_VERSION, PUBLIC_PAGES, featuresFor} from './profile.mjs';
import {MOD_ACTIONS,DEFAULT_MODIFIERS,modifierLabel,resolveModifiers,EXTENSION_PROFILES,PROFILE_EXTENSIONS,profileDegrees} from './harmony-controls.mjs';

export const CHORD_PADS = Object.freeze([68, 69, 70, 71, 76, 77, 78, 79]);
export const MELODY_PADS = Object.freeze([72, 73, 74, 75, 80, 81, 82, 83, 88, 89, 90, 91, 96, 97, 98, 99]);
export const MODIFIER_PADS = Object.freeze([84, 85, 86, 87, 92, 93, 94]);
export const STOP_PAD = 95;
export const CLIP_ROWS = Object.freeze([92,84,76]); // top to bottom: chord, bass, melody
export const CLIP_STOP_PAD = 75; // bottom-right, only in CLIPS
export const PAGES = Object.freeze(['PLAY', 'CHORDS', 'IDEAS', 'MELODY', 'BASS', 'ARP', 'SEQ', 'MIDI', 'THEORY']);
export const EXTRA_PAGES = Object.freeze({PLAY:'STRUM',CHORDS:'STRUM',MELODY:'M.EXTRA',BASS:'B.EXTRA',ARP:'A.CLOCK',MIDI:'ENSEMBL'});
// EXT PROF and MOD PADS are views over PLAY: the pads keep playing chords.
export const MAIN_VIEWS = Object.freeze(['EXT PROF','MOD PADS']);
export const MAIN_PAGES = Object.freeze(['PLAY',...MAIN_VIEWS,'IDEAS','ARP','MIDI']);
export const TRACK_PAGES = Object.freeze([['CHORDS','STRUM','EXPR','ENSEMBL'],['BASS','B.EXTRA'],['MELODY','M.EXTRA']]);
export const MELODY_OWNER_START = 8;
export const STEP_OWNER_START = 24;
export const LIVE_BASS_OWNER = STEP_OWNER_START + STEP_COUNT;
const wrap = (n, length) => ((n % length) + length) % length;
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const routeLabels = ['MOVE', 'USB', 'BOTH', 'SCHW'];
const SCALE_CELLS = Object.freeze({major:'MAJOR',natural_minor:'MINOR',harmonic_minor:'HMIN',melodic_minor:'MMIN',dorian:'DOR',
  phrygian:'PHRYG',lydian:'LYD',mixolydian:'MIXO',aeolian:'AEOL',locrian:'LOCR',major_pentatonic:'MAJPN',minor_pentatonic:'MINPN'});
const routeFull = ['Move', 'USB output', 'Move + USB', 'Schwung chain'];
const bassNoteName = note => noteName(note) + (Math.floor(note / 12) - 1);
function stepInversion(event) {
  if(Number.isInteger(event.snapshot?.inversion))return event.snapshot.inversion;
  const root=wrap(event.snapshot.key+event.rootOffset,12),bass=wrap(event.snapshot.notes[0]-root,12);
  const tones=[...new Set(event.intervals.map(n=>wrap(n,12)))].sort((a,b)=>a-b);
  const index=tones.indexOf(bass);
  if(index<0)return 0;
  return wrap(event.inversion??0,tones.length)===index?event.inversion??0:index;
}

// All physical gestures enter here; the Schwung adapter only supplies IO.
export function createPilot(io = {}) {
  const publicBuild = (io.profile ?? BUILD_PROFILE) === 'public';
  const features = featuresFor(io.profile ?? BUILD_PROFILE);
  const hasClips = features.includes('clips');
  const hasRecording = features.includes('recording');
  const hasCapture = features.includes('capture');
  const trackPages = publicBuild ? [['CHORDS'],['BASS'],['MELODY']] : TRACK_PAGES;
  const mainPages = publicBuild ? ['PLAY',...MAIN_VIEWS,'MIDI'] : MAIN_PAGES;
  const mainPage = () => MAIN_VIEWS.includes(quickView) ? quickView : pages[page];
  const pages = publicBuild ? PUBLIC_PAGES : PAGES;
  let ideasView = false;
  let extraHeld = false;
  let expressionView = false;
  let trackView = -1, trackPage = 0, modifierEditIndex = -1;
  const extraPages = publicBuild ? {} : EXTRA_PAGES;
  const currentPage = () => modifierEditIndex>=0 ? 'MOD EDIT' : quickView ? quickView : ideasView ? 'IDEAS' : trackView>=0 && editIndex<0 && stepEdit<0 ? trackPages[trackView][trackPage] : extraHeld && editIndex<0 && stepEdit<0 ? expressionView && ['PLAY','CHORDS'].includes(pages[page]) ? 'EXPR' : extraPages[pages[page]] || pages[page] : pages[page];
  // Every host command waits for an audio frame. Idempotent DSP state is
  // skipped when unchanged; bulk uploads leave in one host round trip.
  const stateCache = new Map();
  let batch = null;
  function send(command) {
    if (command.op === 'clipend') stateCache.delete('cliplength' + command.index);
    if (batch) { batch.push(command); return true; }
    return io.send?.(command);
  }
  function sendState(command) {
    const key = command.op + (command.index ?? ''), json = JSON.stringify(command);
    if (stateCache.get(key) === json) return true;
    const result = send(command);
    if (result !== false) stateCache.set(key, json);
    return result;
  }
  function flushBatch(commands) {
    if (io.sendBatch) return io.sendBatch(commands) !== false;
    let ok = true;
    for (const command of commands) if (io.send?.(command) === false) ok = false;
    return ok;
  }
  // Only for uploads whose callers read slotWriteFailed, never a send() result.
  function batched(fn) {
    if (batch) return fn();
    batch = [];
    try { return fn(); }
    finally {
      const queued = batch; batch = null;
      // Unknown partial delivery: forget what the DSP holds and resend later.
      if (queued.length && !flushBatch(queued)) { stateCache.clear(); slotCache.clear(); slotWriteFailed = true; }
    }
  }
  const mutedParts = [false,false,false]; // Session performance state, not saved.
  const silencedOwners = new Set();
  const loaded = readSettings(io.read || (() => null));
  let settings = loaded.settings;
  // Runtime restrictions must not overwrite the dormant Lab configuration.
  // Public has no TRACK control: held melody always moves to the nearest chord tone.
  const dormant = publicBuild ? Object.fromEntries(['arpEnabled','melodyFollow'].map(k=>[k,settings[k]])) : {};
  if (publicBuild) Object.assign(settings,{arpEnabled:false,melodyFollow:'nearest'});
  // New projects start unquantized; saved and legacy clips keep their amount.
  const clips=loaded.clips??normalizeClips(null,{chord:loaded.progression,bass:loaded.bassProgression,melody:loaded.melodyProgression},
    {chord:normalizeStep,bass:normalizeBassStep,melody:normalizeBassStep},{quantize:0});
  let progression = selectedClip(clips,'chord').events;
  let bassProgression=selectedClip(clips,'bass').events;
  let melodyProgression=selectedClip(clips,'melody').events;
  let clipView=false,clipPart='chord',lastClipBeat=null,captureReview=null,capturePreview=null;
  const lastPlayed={bass:null,melody:null};
  const clipFocus={chord:null,bass:null,melody:null};
  const editingClip=(part=clipPart)=>clips.parts[part].clips.find(c=>c.id===clipFocus[part])||selectedClip(clips,part);
  const partRate=part=>selectedClip(clips,part).rate??settings.rate;
  // Each clip keeps its own playback quantize (0 = off); recordings keep their timing.
  const partQuantize=part=>selectedClip(clips,part).quantize??0;
  let clipTransfer=null,slotWriteFailed=false;
  let clipCopy=null,stepCopy=null,loopHeld=false,shiftDown=false,quickView=null,lastStrum=30;
  const lengthSteps=new Set(); // steps pressed to set a held step's length
  const clone=value=>JSON.parse(JSON.stringify(value));
  function editClip(index,erase=false) {
    if(recordArmed||clipTransfer){describe('Finish REC / transfer first');return;}
    const part=clipPart,bank=clips.parts[part],existing=bank.clips[index];
    if(erase && !existing?.events.some(Boolean)&&!existing?.tail?.some(Boolean)){describe('Clip empty');return;}
    if(!erase && (!clipCopy || clipCopy.part!==part)){describe('Copy within the same part');return;}
    const before=clone(bank),active=existing?.id===bank.selected;
    const laneIndex=CLIP_PARTS.indexOf(part);
    if(active && send({op:'clipbegin',index:laneIndex})===false){describe('Clip edit failed');return;}
    const clip=ensureClip(clips,part,index);
    if(erase){clip.events.fill(null);delete clip.tail;delete clip.extent;}
    else {clip.length=clipCopy.clip.length;clip.rate=clipCopy.clip.rate;clip.quantize=clipCopy.clip.quantize;clip.events=clone(clipCopy.clip.events);if(clipCopy.clip.tail)clip.tail=clone(clipCopy.clip.tail);else delete clip.tail;if(clipCopy.clip.extent)clip.extent=clipCopy.clip.extent;else delete clip.extent;}
    delete pendingClips[part];
    progression=selectedClip(clips,'chord').events;bassProgression=selectedClip(clips,'bass').events;melodyProgression=selectedClip(clips,'melody').events;
    stepPages[part]=Math.min(stepPages[part],selectedClip(clips,part).length/16-1);
    if(active){clipTransfer={index:laneIndex,origin:clipOrigins[part]};finishClipTransfer();}
    undoTake={clipEdit:{part,bank:before}};markSave();dirty=true;ledsDirty=true;
    describe((erase?'Deleted ':'Pasted ')+part+' '+(index+1));
  }
  const pendingClips={},clipOrigins={chord:0,bass:0,melody:0};
  let startOffset=0;
  const stepPages={chord:0,bass:0,melody:0},heldSteps=Array(16).fill(null);
  function pageSteps(delta,modifiers={}) {
    if(!hasClips||parked)return;
    // Move: hold a step and press Left/Right to nudge it; Shift is fine.
    if(stepEdit>=0&&heldSteps.includes(stepEdit)){editStep('eventNudge',Math.sign(delta)*(modifiers.shift?1:10));return;}
    if(stepEdit>=0||heldSteps.some(n=>n!==null))return;
    const part=stepPart(),length=(clipView?editingClip(part):selectedClip(clips,part)).length;
    stepPages[part]=clamp(stepPages[part]+Math.sign(delta),0,length/16-1);
    describe(`Steps ${stepPages[part]*16+1}-${(stepPages[part]+1)*16}/${length}`);controlDetail=true;dirty=true;ledsDirty=true;
  }
  const clipPadDown=new Set();
  function launchClip(part,id,origin=0) {
    if(clipTransfer){describe('Clip transfer in progress');return;}
    const clip=clips.parts[part].clips.find(c=>c.id===id);if(!clip)return;
    const index=CLIP_PARTS.indexOf(part);
    if(send({op:'clipbegin',index})===false){describe('Clip switch failed');return;}
    clips.parts[part].selected=id;clipOrigins[part]=origin;
    stepPages[part]=0;
    progression=selectedClip(clips,'chord').events;bassProgression=selectedClip(clips,'bass').events;melodyProgression=selectedClip(clips,'melody').events;
    undoTake=null;stepEdit=-1;selectedSlot=-1;clipTransfer={index,origin};finishClipTransfer();dirty=true;ledsDirty=true;
  }
  function finishClipTransfer() {
    if(!clipTransfer)return;
    syncSlots();if(slotWriteFailed)return;
    if(send({op:'clipend',...clipTransfer,duration:selectedClip(clips,CLIP_PARTS[clipTransfer.index]).length})===false)return;
    clipTransfer=null;markSave();
  }
  function chooseClip(index) {
    if(recordArmed||clipTransfer){describe(recordArmed?'Stop REC to change clip':'Clip transfer in progress');return;}
    const clip=ensureClip(clips,clipPart,index);if(!clip)return;markSave();
    if(clip.id===clips.parts[clipPart].selected){delete pendingClips[clipPart];describe('Pending cancelled');ledsDirty=true;return;}
    const clock=readClock();
    if(armed && clock.ready) {
      pendingClips[clipPart]={id:clip.id,beat:(Math.floor(clock.beat/4)+1)*4};
      describe('Queued: next bar');
    } else {launchClip(clipPart,clip.id);describe('Clip '+(index+1));}
    dirty=true;ledsDirty=true;
  }
  function closeClips(){stopCapturePreview();captureReview=null;clipCopy=null;clipView=false;stepEdit=-1;dirty=true;ledsDirty=true;repaint();}
  function updateClipQueue() {
    const clock=readClock();
    finishClipTransfer();
    if(!clock.ready || (lastClipBeat!==null && clock.beat<lastClipBeat)) {
      for(const part of CLIP_PARTS){delete pendingClips[part];clipOrigins[part]=armed&&startOffset?-startOffset:0;}
      if(lastClipBeat!==null){dirty=true;ledsDirty=true;}
    } else for(const part of CLIP_PARTS) {
      const pending=pendingClips[part];
      if(pending && clock.beat>=pending.beat && !clipTransfer){launchClip(part,pending.id,pending.beat);delete pendingClips[part];}
    }
    lastClipBeat=clock.ready?clock.beat:null;
  }
  const lane=()=>clipView?editingClip().events:seqPart==='melody'?melodyProgression:seqPart==='bass'?bassProgression:progression;
  let seqPart='chord', stepEdit=-1, stepEditExtension='AUTO',stepEvent=0;
  let stepSaved=[],stepExtensions=[];
  let runtimeChords=[],runtimeBass=[];
  const slotCache=new Map(),chordVisited=new Map(),bassVisited=new Map();
  let recordLimit=false;
  function editedEvent(){return cellEvents(lane()[stepEdit])[stepEvent];}
  const overrides = loaded.overrides;
  let editIndex = -1, lastVoicing = [];
  let editReturnPage = 0;
  let stopHeld = false, borrowLocked = false, mainHeld=false;
  const modifierDown=new Set();
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
    if(enabled && mutedParts[CLIP_PARTS.indexOf(part)])return;
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
    return buildPadBank(settings, overrides);
  }
  function modifierState() {
    return resolveModifiers(heldModifiers.map(i=>settings.modifierAssignments[i]),borrowLocked);
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
  const chordHeld=Array(8).fill(false), chordExpr=Array(LIVE_BASS_OWNER+1).fill(null);
  let bassExpressionPad=-1;
  function expressionInput(owner,value) {
    const e=chordExpr[owner];
    if(!e || !voices.has(owner))return;
    e.value=e.mode==='poly'?value:Math.round(e.base+(e.max-e.base)*value/127);
    // CC answers at once, but at most once per owner per tick; later changes
    // wait for tick's flush. Pressure can outpace the shared host channel.
    if(e.mode!=='poly' && !e.tickSent)flushChordExpression(owner);
  }
  function expressionRelease(owner) {
    const e=chordExpr[owner];
    if(e?.mode==='poly') {e.value=0;e.sent=-1;flushChordExpression(owner);}
  }
  function chordPressure(index,value) {
    if(publicBuild || parked || !Number.isInteger(index) || index<0 || index>7 || !chordHeld[index] ||
       !Number.isInteger(value) || value<0 || value>127)return;
    expressionInput(index,value);
    if(index===bassExpressionPad)expressionInput(LIVE_BASS_OWNER,value);
  }
  function flushChordExpression(only=-1) {
    if(publicBuild || parked)return;
    chordExpr.forEach((e,owner)=>{
      if(!e || (only>=0 && owner!==only))return;
      if(only<0)e.tickSent=false;
      if(!voices.has(owner) || silencedOwners.has(owner))return;
      if(e.value===e.sent)return;
      const command=e.mode==='poly'?{op:'pressure',owner,pressure:e.value}:{op:'express',owner,amount:e.value};
      if(send(command)!==false){e.sent=e.value;if(only>=0)e.tickSent=true;}
    });
  }
  function pressure(index, value) {
    if(settings.bassPads){
      if(!publicBuild&&!parked&&bassOnlyHeld.has(index+8)&&bassExpressionPad===index+8&&Number.isInteger(value)&&value>=0&&value<=127)expressionInput(LIVE_BASS_OWNER,value);
      return;
    }
    if (parked || !Number.isInteger(index) ||
        index < 0 || index >= melodyHeld.length || !melodyHeld[index] ||
        !Number.isInteger(value) || value < 0 || value > 127) return;
    if(!publicBuild){expressionInput(index+MELODY_OWNER_START,value);return;}
    if(!settings.melodyAftertouch)return;
    melodyPressure[index] = value;
  }
  function flushPressure() {
    if (parked || !publicBuild) return;
    melodyPressure.forEach((value,index) => {
      if (!voices.has(index + MELODY_OWNER_START) || value === sentPressure[index]) return;
      if (send({op:'pressure',owner:index + MELODY_OWNER_START,pressure:value}) !== false)
        sentPressure[index] = value;
    });
  }
  let page = 0, focused = -1, touch = -1, detail = '', detailTicks = 0, controlDetail = false;
  let selectedSlot = -1, capture = false;
  const history=createCaptureHistory();
  const captureTime=()=>{const clock=readClock();return history.time((io.now||Date.now)(),clock.bpm,clock);};
  let recordArmed=false;
  let countPending=false,countLabel='',countStep=-1,countEmpty=[],recordStartBeat=null,countTransportSent=null;
  let takeBefore=null, undoTake=null;
  function beginTakeUndo() {
    takeBefore={chords:['all','both','chord'].includes(settings.recordPart)?progression.map(normalizeStep):null,
      bass:['all','both','bass'].includes(settings.recordPart)&&settings.bassEnabled?bassProgression.map(normalizeBassStep):null,
      melody:['all','melody'].includes(settings.recordPart)?melodyProgression.map(normalizeBassStep):null,changed:false};
  }
  function undo() {
    if(parked)return;
    stopCapturePreview();
    captureReview=null;
    setRecord(false);
    if(!undoTake){describe('No recording to undo');return;}
    setArm(false);clearLive();
    if(undoTake.captureBanks){
      for(const part of CLIP_PARTS){clips.parts[part]=clone(undoTake.captureBanks[part]);clipFocus[part]=null;stepPages[part]=0;}
      progression=selectedClip(clips,'chord').events;bassProgression=selectedClip(clips,'bass').events;melodyProgression=selectedClip(clips,'melody').events;
      undoTake=null;syncSlots();markSave();dirty=true;ledsDirty=true;describe('Capture undone; stopped');return;
    }
    if(undoTake.clipEdit) {
      const {part,bank}=undoTake.clipEdit;clips.parts[part]=clone(bank);
      progression=selectedClip(clips,'chord').events;bassProgression=selectedClip(clips,'bass').events;melodyProgression=selectedClip(clips,'melody').events;
      stepPages[part]=Math.min(stepPages[part],selectedClip(clips,part).length/16-1);
      undoTake=null;syncSlots();markSave();dirty=true;ledsDirty=true;describe('Clip edit undone; stopped');return;
    }
    if(undoTake.chords)undoTake.chords.forEach((event,i)=>progression[i]=normalizeStep(event));
    if(undoTake.bass)undoTake.bass.forEach((event,i)=>bassProgression[i]=normalizeBassStep(event));
    if(undoTake.melody)undoTake.melody.forEach((event,i)=>melodyProgression[i]=normalizeBassStep(event));
    undoTake=null;config();syncSlots();markSave();ledsDirty=true;dirty=true;
    describe('Recording undone; stopped');
  }
  function stepPart() {
    if(clipView)return clipPart;
    const name=pages[page];
    return name==='BASS'?'bass':name==='MELODY'?'melody':name==='SEQ'?seqPart:'chord';
  }
  let bassRecordOwner=-1;
  const bassOnlyHeld=new Set();
  const recordsChords=()=>recordArmed && ['all','both','chord'].includes(settings.recordPart);
  const recordsBass=()=>recordArmed && ['all','both','bass'].includes(settings.recordPart);
  const melodyRecorders=Array.from({length:16},()=>createChordRecorder({preserveTiming:true}));
  const melodyVisited=new Map();
  function commitMelodyTake(take) {
    if(!take)return;
    const event=normalizeBassStep({note:take.payload,...take.timing,performance:take.performance});
    if(!insertTake(melodyProgression,take,event,melodyVisited)){recordLimit=true;return;}
    if(takeBefore)takeBefore.changed=true;
    syncSlots();markSave();ledsDirty=true;dirty=true;
  }
  const recorder=createChordRecorder({preserveTiming:true});
  const bassRecorder=createChordRecorder({preserveTiming:true});
  function readClock(part){try{const c=io.clock?.()||{beat:-1,ready:false};return part?{...c,beat:Math.max(0,c.beat-clipOrigins[part])}:c;}catch(_){return {beat:-1,ready:false};}}
  function recordClock(part,attack=false) {
    if(countPending) {
      const c=readClock();
      // A stopped count starts Move only after its last click. Notes on the
      // downbeat, or up to a sixteenth early, land on beat one meanwhile.
      const downbeat={...c,beat:0,ready:true};
      if(c.count_free && c.count_state===2 && c.count_pos>=4-.25 && !c.ready)return downbeat;
      if(c.count_free && c.ready && c.count_state!==3){
        setRecord(false);describe('Move started during count');return {...c,ready:false};
      }
      if(c.count_free && c.count_state===3){
        if(countTransportSent===null){
          if(c.ready || io.transport?.()!==true){setRecord(false);describe('Count start failed');return {...c,ready:false};}
          countTransportSent=(io.now||Date.now)();
        }
        if(!c.ready){
          if((io.now||Date.now)()-countTransportSent>3000){setRecord(false);describe('No Move clock after count');return {...c,ready:false};}
          return downbeat;
        }
      }
      const end=c.count_free?0:c.count_end;
      const grace=attack?.25:0;
      if((c.count_state===3 || c.count_state===2 && c.beat>=c.count_end-grace) && c.ready && Number.isInteger(c.count_end) && c.count_end>=0) {
        // Empty takes begin at step one; existing clips keep their current phase.
        for(const p of countEmpty) {
          if(c.count_free&&startOffset)continue; // Keep the explicitly selected page on a stopped count-in.
          if(send({op:'clipend',index:CLIP_PARTS.indexOf(p),origin:end,duration:selectedClip(clips,p).length})===false){
            setRecord(false);describe('Count-in sync failed');return {...readClock(part),ready:false};
          }
          clipOrigins[p]=end;
        }
        recordStartBeat=end;countPending=false;countLabel='';dirty=true;ledsDirty=true;describe('REC '+settings.recordPart.toUpperCase());
      } else if(c.count_state===0 || c.count_state===4 || (c.count_state===3 && !c.ready)) {
        setRecord(false);describe('Count-in cancelled');return {...readClock(part),ready:false};
      } else {
        const label=c.count_state===2?`COUNT ${c.count_step+1}/4`:c.count_state===1?'COUNT WAIT':'COUNT: DSP unavailable';
        if(label!==countLabel){countLabel=label;countStep=c.count_step??-1;dirty=true;ledsDirty=true;}
        return {...readClock(part),ready:false};
      }
    }
    const c=readClock(part);
    if(recordStartBeat!==null && c.beat>=recordStartBeat-clipOrigins[part])recordStartBeat=null;
    return recordStartBeat===null?c:{...c,beat:Math.max(c.beat,recordStartBeat-clipOrigins[part])};
  }
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
    syncSlots();markSave();ledsDirty=true;dirty=true;
  }
  function recordBass(owner) {
    if(!recordsBass())return;
    const clock=recordClock('bass',true);commitBassTake(bassRecorder.observe(clock.beat,clock.ready));
    const voice=voices.get(LIVE_BASS_OWNER);
    if(clock.ready && voice?.notes.length)commitBassTake(bassRecorder.start(owner,clock.beat,partRate('bass'),voice.notes[0],voice.velocity,bassProgression.length));
  }
  function finishRecording(){const clock=readClock('chord'),b=readClock('bass'),m=readClock('melody');commitTake(recorder.observe(clock.beat,clock.ready));commitTake(recorder.stop(clock.ready?clock.beat:undefined));
    commitBassTake(bassRecorder.observe(b.beat,b.ready));commitBassTake(bassRecorder.stop(b.ready?b.beat:undefined));
    melodyRecorders.forEach(r=>{commitMelodyTake(r.observe(m.beat,m.ready));commitMelodyTake(r.stop(m.ready?m.beat:undefined));});}
  function setRecord(enabled) {
    if(enabled)stopCapturePreview();
    if (!hasRecording && enabled) return;
    if(Boolean(enabled)===recordArmed)return;
    recordStartBeat=null;
    countTransportSent=null;
    if(enabled && clipTransfer){describe('Wait for clip transfer');return;}
    if(enabled)for(const part of CLIP_PARTS)delete pendingClips[part];
    if(enabled && settings.recordPart==='bass' && !settings.bassEnabled){describe('Enable BASS before REC');return;}
    if(!enabled){countPending=false;countLabel='';send({op:'countin',enabled:0});finishRecording();if(takeBefore?.changed)undoTake=takeBefore;takeBefore=null;}
    else {beginTakeUndo();chordVisited.clear();bassVisited.clear();melodyVisited.clear();recordLimit=false;}
    clearLive();bassRecordOwner=-1;
    recordArmed=Boolean(enabled);send({op:'record',enabled:+recordArmed,record_part:Math.max(0,['both','chord','bass'].indexOf(settings.recordPart)),overdub:1});
    if(recordArmed)stepEdit=-1;
    history.clear();
    // As on Move, recording into a running sequence punches in at once;
    // the count-in only precedes a start from stop.
    const running=recordArmed&&readClock().ready;
    if(recordArmed)setArm(true);
    if(recordArmed && settings.countIn && !running) {
      countEmpty=CLIP_PARTS.filter(p=>(settings.recordPart==='all'||settings.recordPart==='both'&&p!=='melody'||settings.recordPart===p)&&!selectedClip(clips,p).events.some(Boolean));
      countPending=true;countLabel='COUNT WAIT';countStep=-1;
      if(send({op:'countin',enabled:1})===false){setRecord(false);describe('Count-in start failed');return;}
    }
    describe(recordArmed?running?`REC ${settings.recordPart.toUpperCase()}`:`REC ${settings.recordPart.toUpperCase()}: Move Play`:'REC off');ledsDirty=true;
  }
  function recordAttack(owner,chord,notes,velocity) {
    if(!recordsChords())return;
    const clock=recordClock('chord',true);commitTake(recorder.observe(clock.beat,clock.ready));
    if(!clock.ready){describe('REC waiting for clock');return;}
    const payload=freezeStep(chord,settings,notes);
    commitTake(recorder.start(owner,clock.beat,partRate('chord'),payload,velocity,progression.length));
  }
  function recordRelease(owner){const clock=readClock('chord'),b=readClock('bass');commitTake(recorder.observe(clock.beat,clock.ready));commitTake(recorder.release(owner,clock.ready?clock.beat:undefined));
    commitBassTake(bassRecorder.observe(b.beat,b.ready));commitBassTake(bassRecorder.release(owner,b.ready?b.beat:undefined));}
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
      : settings.ideasMode === 'alt' ? generateIdeasAlt(ideasSource,settings,options)
      : generateIdeas(ideasSource, settings, options);
    ideaSelected = -1; dirty = true; ledsDirty = true;
    describe(settings.ideasMode==='to'?'TO '+chordName(ideasTarget(),settings):(settings.ideasMode==='alt'?'ALT ':'Ideas from ') + chordName(ideasSource, settings));
  }
  function setIdeas(enabled) {
    if(enabled && !features.includes('ideas'))return;
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
    return { ...variant, borrow: !borrowLocked && variant.borrow===true };
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
  // A notice that also shows on PLAY, whose footer otherwise names the key.
  function notice(text) { describe(text); controlDetail = true; }
  function markSave() { dirtySave = true; saveTicks = 30; }
  function save() {
    if (!dirtySave) return true;
    const result = io.write?.(STATE_PATH, encodeDocument({...settings,...dormant}, progression, overrides, bassProgression, melodyProgression,clips)) === true;
    if (result) { dirtySave = false; saveTicks = -1; }
    else { saveTicks = 90; describe('Save pending'); }
    return result;
  }
  // A bass clip with notes plays itself; an empty one follows the chord clip.
  const bassFromClip = () => bassProgression.some(Boolean);
  function config() { batched(sendConfig); }
  function sendConfig() {
    sendState({ op: 'config', channel: settings.channel, route: ROUTES.indexOf(settings.route), divisi: !publicBuild && settings.divisi ? (settings.ensembleSmooth?2:1) : 0,
      ...(!publicBuild?{channels:[...settings.ensembleChannels]}:{}),
      rate: settings.rate, gate: settings.autoSustain ? 100 : settings.gate, move_available: moveAvailable ? 1 : 0,
      legato: settings.voiceLead ? 1 : 0, bass_route: ROUTES.indexOf(settings.bassRoute),
      bass_channel: settings.bassChannel, bass_clip:+(settings.bassEnabled && bassFromClip()) });
    if(hasClips)sendState({op:'melodyconfig',route:ROUTES.indexOf(settings.melodyRoute),channel:settings.melodyChannel});
    sendState({ op: 'arp', enabled: +settings.arpEnabled, rate: settings.arpRate,
      direction: settings.arpDirection, range: settings.arpRange, gate: settings.arpGate,
      swing: settings.arpSwing, hold: +settings.arpHold, velocity: settings.arpVelocity,
      route: ROUTES.indexOf(settings.arpRoute), channel: settings.arpChannel,
      clock: settings.arpClock === 'free' ? 1 : 0, bpm: settings.arpBpm });
  }
  function syncArp() {
    const harmony = [...voices.values()].filter(v => !v.audition && ['bank', 'slot', 'idea'].includes(v.kind));
    const selected = harmony.find(v => v.kind === active.kind && v.index === active.index) || harmony[harmony.length - 1];
    const notes = selected?.notes || [];
    const key = JSON.stringify(notes);
    if (key !== arpSource) { arpSource = key; send({ op: 'arpsrc', notes }); }
  }
  function sendSlot(command) {
    const key=command.op+command.index,json=JSON.stringify(command);
    if(slotCache.get(key)===json)return;
    if(!command.notes.length && command.index>=16 && !slotCache.has(key))return;
    if(send(command)!==false)slotCache.set(key,json);else slotWriteFailed=true;
  }
  function strumCommand(s) {
    return {strum_ms:s?.strumMs??0,strum_dir:s?.strumDirection??0,strum_time:s?.strumTiming??0,strum_vel:s?.strumVelocity??0};
  }
  function syncSlots() { batched(() => { sendConfig(); uploadSlots(); }); }
  function uploadSlots() {
    slotWriteFailed=false;
    if (!hasClips) return;
    for(const part of CLIP_PARTS)if(sendState({op:'cliplength',index:CLIP_PARTS.indexOf(part),duration:selectedClip(clips,part).length,rate:partRate(part)})===false)slotWriteFailed=true;
    loopNotes.length=progression.length;loopBass.length=progression.length;
    progression.forEach((chord, i) => {
      loopNotes[i] = chord ? [...chord.snapshot.notes] : [];
      loopBass[i] = settings.bassEnabled && chord?.snapshot.bass >= 0 ? [chord.snapshot.bass] : [];
    });
    const shortened=p=>selectedClip(clips,p).extent>selectedClip(clips,p).length;
    runtimeChords=compileLane(progression,partQuantize('chord'),settings.autoSustain?100:settings.gate,shortened('chord'));runtimeBass=compileLane(bassProgression,partQuantize('bass'),100,shortened('bass'));
    runtimeChords.forEach((entry,index)=>{
      const chord=entry?.event;
      sendSlot({op:'slot',index,notes:chord?.snapshot.notes||[],bass:settings.bassEnabled?(chord?.snapshot.bass??-1):-1,
        duration:chord?.timing?.steps??0,velocity:chord?.timing?.velocity??settings.stepVelocity,
        ...strumCommand(chord?.snapshot),legato:chord?.snapshot.voiceLead?1:0,
        ...(entry?.at!==undefined?{at:entry.at,len:entry.len}:{})});
    });
    runtimeBass.forEach((entry,index)=>sendSlot({op:'bassslot',index,notes:entry?[entry.event.note]:[],duration:entry?.event.steps??1,velocity:entry?.event.velocity??100,
      ...(entry?.at!==undefined?{at:entry.at,len:entry.len}:{})}));
    compileLane(melodyProgression,partQuantize('melody'),100,shortened('melody')).forEach((entry,index)=>sendSlot({op:'melodyslot',index,notes:entry?[entry.event.note]:[],duration:entry?.event.steps??1,velocity:entry?.event.velocity??100,
      ...(entry?.at!==undefined?{at:entry.at,len:entry.len}:{})}));
  }
  function stop(owner) {
    silencedOwners.delete(owner);
    if(hasCapture)history.stop(owner,captureTime());
    chordExpr[owner]=null;
    if (owner >= MELODY_OWNER_START && owner < MELODY_OWNER_START + melodyHeld.length)
      sentPressure[owner - MELODY_OWNER_START] = 0;
    if (voices.has(owner)) { send({ op: 'off', owner }); voices.delete(owner); dirty = true; ledsDirty = true; }
  }
  function release(owner) {
    if(silencedOwners.has(owner)){stop(owner);return;}
    const voice = voices.get(owner);
    if(voice?.audition){stop(owner);return;}
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
    if(settings.bassPads){pedal('chord',false);pedal('melody',false);}else pedalsOff();
    gestureVelocity = null;
    // Release the previous pedal period, including released melody notes.
    // Physically held melody pads will be revoiced by activate().
    for (const [owner, voice] of [...voices]) if (!(settings.bassPads&&voice.kind==='bass') && (voice.sustained || (voice.kind !== 'melody' && settings[partName(voice.kind)+'Sustain'] !== 'off'))) stop(owner);
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
    const part=partName(meta.kind),mode=settings[part+'Expression'];
    if(attack)silencedOwners.delete(owner);
    if(mutedParts[CLIP_PARTS.indexOf(part)])silencedOwners.add(owner);
    const expressive=!publicBuild && ['bank','idea','melody','bass'].includes(meta.kind) && mode && mode!=='off';
    if(expressive && (!chordExpr[owner] || attack || (part==='bass' && chordExpr[owner].source!==bassExpressionPad))) {
      const prefix=part==='chord'?'expression':part+'Expression';
      const min=settings[prefix+'Min'],max=settings[prefix+'Max'];
      const base=Math.round(min+(max-min)*clamp(velocity,1,127)/127);
      chordExpr[owner]={mode,base,max,source:part==='bass'?bassExpressionPad:owner,value:mode==='poly'?0:base,sent:-1};
    }
    const cc=expressive && mode.startsWith('cc')?Number(mode.slice(2)):0;
    if (!silencedOwners.has(owner) && !meta.audition && settings[partName(meta.kind)+'Sustain'] === 'pedal') pedal(partName(meta.kind),true);
    if(!silencedOwners.has(owner))send({ op: 'on', owner, notes, velocity: clamp(Math.round(velocity), 1, 127),
      ...partOutput(meta.kind), retrigger: attack && settings.melodyRetrigger ? 1 : 0,
      ...(cc?{cc,amount:chordExpr[owner].value}:{}),
      ...(!publicBuild && settings.divisi && partName(meta.kind)==='chord'?{divisi:settings.ensembleSmooth?2:1,channels:[...settings.ensembleChannels]}:{}),
      ...strumCommand(meta.kind === 'slot' ? meta.chord.snapshot : ['bank','idea'].includes(meta.kind) ? settings : null),
      ...(['bank', 'slot', 'idea'].includes(meta.kind) ? { legato: (meta.chord.snapshot?.voiceLead ?? settings.voiceLead) ? 1 : 0 } : {}) });
    voices.set(owner, { ...meta, sustained: false, notes: [...notes], velocity });
    if(hasCapture && !recordArmed && !parked && !meta.audition && ['bank','idea','bass','melody'].includes(meta.kind))
      history.start(owner,part,part==='chord'?freezeStep(meta.chord,settings,notes):{note:notes[0]},clamp(Math.round(velocity),1,127),captureTime());
    if(!meta.audition && ['bass','melody'].includes(meta.kind))lastPlayed[meta.kind]={note:notes[0],velocity};
    if(expressive)chordExpr[owner].sent=-1;
    if (meta.kind === 'melody') sentPressure[meta.index] = 0;
    dirty = true; ledsDirty = true;
  }
  function revoiceMelody(octaveShift = 0, reset = false) {
    // A held note keeps sounding through a chord change in every mode:
    // re-striking it on an adapted pitch rarely sounds right. The next press
    // of the pad plays the new chord's note.
    if (!octaveShift && !reset) { ledsDirty = true; dirty = true; return; }
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
    if(settings.bassPads){if(!settings.bassEnabled){stop(LIVE_BASS_OWNER);pedal('bass',false);}return;}
    if((recordArmed && settings.recordPart==='bass') || bassOnlyHeld.size)return;
    if(recordsChords() && settings.recordPart==='chord'){stop(LIVE_BASS_OWNER);pedal('bass',false);return;}
    const harmony = [...voices.values()].filter(v => !v.audition && ['bank', 'slot', 'idea'].includes(v.kind));
    const selected = harmony.find(v => v.kind === active.kind && v.index === active.index) || harmony[harmony.length - 1];
    if (!settings.bassEnabled) { stop(LIVE_BASS_OWNER); pedal('bass',false); return; }
    if (!selected || (selected.sustained && settings.bassSustain !== 'hold')) { release(LIVE_BASS_OWNER); return; }
    if(trackView===1){
      // Selecting the bass page must not lose the release/HOLD ownership of
      // a bass that was started with a chord on PLAY.
      if(selected.sustained)release(LIVE_BASS_OWNER);
      return;
    }
    const snap = selected.chord.snapshot;
    const notes = gestureBass !== null ? [gestureBass] : snap ? snap.bass >= 0 ? [snap.bass] : [] : bassNotes(selected.chord, settings, selected.notes);
    if (!notes.length) { stop(LIVE_BASS_OWNER); return; }
    const velocity = gestureVelocity ?? selected.velocity;
    if (!same(voices.get(LIVE_BASS_OWNER)?.notes, notes) || voices.get(LIVE_BASS_OWNER)?.velocity !== velocity) {
      if(settings.bassSustain==='pedal' && voices.has(LIVE_BASS_OWNER)) {stop(LIVE_BASS_OWNER);pedal('bass',false);}
      play(LIVE_BASS_OWNER, notes, velocity, { kind: 'bass', chord: selected.chord, audition:!!selected.audition });
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
    silencedOwners.clear();
    clipCopy=null;
    heldSteps.fill(null);
    stepEdit=-1;bassRecordOwner=-1;bassOnlyHeld.clear();
    pedalsOff(); gestureVelocity = null;
    bassGesture.reset(); gestureBass = null;
    arpSource = '[]'; send({ op: 'arpsrc', notes: [], enabled: 0 });
    for (const owner of [...voices.keys()]) stop(owner);
    melodyHeld.fill(0); melodyPressure.fill(0); sentPressure.fill(0);
    chordHeld.fill(false);chordExpr.fill(null);bassExpressionPad=-1;
    heldModifiers.length = 0; modifierDown.clear();mainHeld=false;modifierEditIndex=-1;
    if (active.kind === 'bank') { active.variant = {}; active.chord = bank[active.index]; active.notes = chordNotes(active.chord, settings); }
    lastVoicing = []; ledsDirty = true;
  }
  function storeSlot(index, chord, notes = active.notes, target = progression) {
    undoTake=null;
    const {performance,more,...manual}=chord||{};
    target[index] = freezeStep(chord?manual:null, settings, chord ? notes || voiced(chord) : []);
    if (target[index] && gestureBass !== null) {
      target[index].snapshot.bass = gestureBass;
      target[index].bassMode = 'note';
      target[index].bassOffset = gestureBass - (48 + context(chord).key + chord.rootOffset + chord.register * 12);
    }
    selectedSlot = index; syncSlots(); markSave(); dirty = true; ledsDirty = true;
  }
  function captureRecent() {
    if(!hasCapture||parked)return;
    if(recordArmed||clipTransfer||stepEdit>=0){describe('Finish REC / edit first');return;}
    const at=captureTime();
    if(at===null){describe('Capture needs Move tempo');return;}
    const take=history.snapshot(at);
    if(!take || !Object.keys(take.lanes||{}).length){describe(take?.error||'Nothing recent to capture');return;}
    const targets={};
    for(const part of Object.keys(take.lanes)){
      const bank=clips.parts[part];
      // Do not alter even an empty active clip while it may be playing.
      let index=bank.clips.findIndex(c=>c.id!==bank.selected&&!c.events.some(Boolean)&&!c.tail?.some(Boolean));
      if(index<0)index=bank.clips.length;
      if(index>=8){describe('No free '+part+' clip');return;}
      targets[part]=index;
    }
    undoTake={captureBanks:clone(clips.parts)};
    for(const [part,index] of Object.entries(targets)){
      const clip=ensureClip(clips,part,index);
      Object.assign(clip,{length:take.length,rate:0,quantize:0,events:take.lanes[part]});
      delete clip.extent;delete clip.tail;
      clipFocus[part]=clip.id;stepPages[part]=0;
    }
    clearLive();history.clear();clipPart=Object.keys(targets)[0];clipView=true;editIndex=-1;
    captureReview=!take.aligned&&!readClock().ready?{take:clone(take),targets,bpm:take.suggestion?.bpm??take.bpm,expected:clone(Object.fromEntries(Object.entries(targets).map(([p,i])=>[p,clips.parts[p].clips[i]])))}:null;
    if(captureReview){captureReview.start=0;captureReview.end=Math.max(...Object.values(take.lanes).flatMap(l=>l.flatMap(cell=>cellEvents(cell).map(e=>e.performance.start+e.performance.duration))));captureReview.limit=take.length;captureReview.bars=0;}
    if(captureReview){captureReview.preview=true;startCapturePreview();}
    markSave();dirty=true;ledsDirty=true;
    describe('Captured '+Object.entries(targets).map(([p,i])=>p[0].toUpperCase()+(i+1)).join(' '));
  }
  function stopCapturePreview(){
    const preview=capturePreview;capturePreview=null;
    if(preview)for(const owner of preview.owners.keys())stop(owner);
  }
  function captureAttacks(){
    const r=captureReview;if(!r)return [];
    const times=Object.values(r.take.lanes).flatMap(l=>l.flatMap(c=>cellEvents(c).map(e=>e.performance.start))).sort((a,b)=>a-b),result=[];
    for(const n of times)if(!result.length||(n-result[result.length-1])*15/r.take.bpm>.05)result.push(n);
    return result;
  }
  function startCapturePreview(){
    stopCapturePreview();const r=captureReview;if(!r?.preview||readClock().ready)return;
    const trimmed=trimCapture(r.take,r.start,r.end);if(trimmed.error)return;
    const queue=[];let id=0;
    for(const [part,lane] of Object.entries(trimmed.lanes))for(const c of lane)for(const e of cellEvents(c)){
      const token=id++,start=e.performance.start*15000/r.take.bpm,end=(e.performance.start+e.performance.duration)*15000/r.take.bpm;
      queue.push({at:start,on:true,part,e,id:token},{at:end,on:false,id:token});
    }
    queue.sort((a,b)=>a.at-b.at||Number(a.on)-Number(b.on));
    capturePreview={queue,index:0,origin:(io.now||Date.now)(),length:(r.end-r.start)*15000/r.take.bpm,owners:new Map()};
    tickCapturePreview();
  }
  function tickCapturePreview(){
    const p=capturePreview;if(!p)return;
    if(readClock().ready||parked){stopCapturePreview();return;}
    const now=(io.now||Date.now)(),elapsed=now-p.origin;
    if(elapsed>=p.length){
      for(const owner of p.owners.keys())stop(owner);p.owners.clear();p.index=0;p.origin=now;
    }
    const position=now-p.origin;
    while(p.index<p.queue.length&&p.queue[p.index].at<=position){
      const item=p.queue[p.index++];
      if(!item.on){for(const [owner,id] of p.owners)if(id===item.id){stop(owner);p.owners.delete(owner);}continue;}
      // Skip missed attacks after a stalled UI rather than burst stale notes.
      if(position-item.at>100)continue;
      let owner=item.part==='chord'?0:item.part==='bass'?LIVE_BASS_OWNER:Array.from({length:16},(_,i)=>8+i).find(n=>!p.owners.has(n));
      if(owner===undefined)continue;
      if(p.owners.has(owner))stop(owner);
      const e=item.e;
      play(owner,item.part==='chord'?e.snapshot.notes:[e.note],e.timing?.velocity??e.velocity??100,
        item.part==='chord'?{kind:'slot',chord:e,audition:true}:{kind:item.part,index:owner-8,audition:true});
      p.owners.set(owner,item.id);
    }
  }
  function setArm(enabled,fromPage=false) {
    if (!hasClips && enabled) return;
    if(enabled){syncSlots();if(slotWriteFailed){describe('Sequence upload failed');return;}}
    if(!enabled&&recordArmed)setRecord(false);
    armed = Boolean(enabled);
    if(fromPage&&enabled)startOffset=stepPages[stepPart()]*16*STEP_BEATS[partRate(stepPart())];
    if(!enabled)startOffset=0;
    if(fromPage&&enabled)for(const part of CLIP_PARTS)clipOrigins[part]=startOffset?-startOffset:0;
    send({ op: 'arm', enabled: armed ? 1 : 0, ...(enabled&&(fromPage||startOffset)?{origin:startOffset}:{}) });
    if (!armed) {
      for(const part of CLIP_PARTS){delete pendingClips[part];clipOrigins[part]=0;}
      if (dsp.running) clearSustained();
      dsp = { ...dsp, armed: false, running: false, slot: -1, sounding: false, loop_sounding: false, bass_sounding: false };
    }
    describe(armed ? 'SEQ armed: Move Play' : 'SEQ off'); ledsDirty = true;
  }
  function transportPlay() {
    stopCapturePreview();if(captureReview)captureReview.preview=false;
    if(!hasClips||!io.managedTransport){setArm(true);return;}
    const c=readClock();
    if(countPending&&c.count_free){const started=c.ready||countTransportSent!==null;setRecord(false);if(started)io.transport?.();describe('Count cancelled');return;}
    if(c.ready){setArm(false);if(io.transport?.()!==true)describe('Move Play unavailable');return;}
    setArm(true,true);
    if(recordArmed&&settings.countIn){
      if(!(c.bpm>=30&&c.bpm<=300)){setRecord(false);describe('Count needs Move tempo');return;}
      countTransportSent=null;
      if(send({op:'countin',enabled:1,clock:1})===false){setRecord(false);describe('Count start failed');}
    }else if(io.transport?.()!==true){setArm(false);describe('Move Play unavailable');}
  }
  function selectEdit(index) {
    modifierEditIndex=-1;
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
    if (pressed && settings.fullVelocity) velocity = 127;
    if(captureReview&&clipView&&pressed){if(note===STOP_PAD)panic();else describe('Confirm Capture or Back first');return;}
    if(!pressed && clipPadDown.delete(note))return;
    if(clipView) {
      if(pressed){
        clipPadDown.add(note);
        if(note===CLIP_STOP_PAD){panic();return;}
        const row=CLIP_ROWS.findIndex(start=>note>=start && note<start+8);
        if(row>=0){
          clipPart=CLIP_PARTS[row];stepEdit=-1;const index=note-CLIP_ROWS[row];
          if(modifiers.delete)editClip(index,true);
          else if(modifiers.copy){
            if(clipCopy)editClip(index);
            else {const c=clips.parts[clipPart].clips[index];
              if(c?.events.some(Boolean)||c?.tail?.some(Boolean)){clipCopy={part:clipPart,clip:clone(c)};describe('Copy: choose destination');}
              else describe('Source clip empty');}
          } else if(modifiers.shift) {
            if(recordArmed){describe('Finish REC before selecting');return;}
            const c=ensureClip(clips,clipPart,index);clipFocus[clipPart]=c.id;stepPages[clipPart]=0;markSave();describe('Edit '+clipPart+' '+(index+1));
          } else {clipFocus[clipPart]=null;chooseClip(index);}
          dirty=true;ledsDirty=true;
        }
      }
      return;
    }
    if (note === STOP_PAD) {
      if (pressed && !stopHeld) panic();
      stopHeld = pressed; ledsDirty = true; dirty = true;
      return;
    }
    const modifier = MODIFIER_PADS.indexOf(note);
    if (modifier >= 0) {
      if(pressed && modifierDown.has(modifier))return;
      if(pressed)modifierDown.add(modifier);else modifierDown.delete(modifier);
      if(pressed && modifiers.shift && features.includes('editableModifiers')){
        if(editIndex>=0)selectEdit(-1);
        stepEdit=-1;extraHeld=false;
        modifierEditIndex=modifierEditIndex===modifier?-1:modifier;
        const at=heldModifiers.indexOf(modifier);if(at>=0)heldModifiers.splice(at,1);
        focused=-1;touch=-1;ledsDirty=true;
        describe(modifierEditIndex>=0?'Edit modifier '+(modifier+1):'Modifier edit closed');return;
      }
      if (settings.modifierAssignments[modifier] === 'borrow') {
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
      const names = [...new Set(heldModifiers.map(i=>settings.modifierAssignments[i]))].filter(a=>a!=='off'&&a!=='borrow').map(modifierLabel);
      if (modifierState().borrow) names.push(borrowLocked ? 'BORROW locked' : 'BORROW');
      describe(names.length ? 'Next: ' + names.join(' ') : 'Next: saved harmony');
      return;
    }
    const chordIndex = CHORD_PADS.indexOf(note);
    if (chordIndex >= 0) {
      chordHeld[chordIndex]=pressed && !modifiers.shift;
      if(pressed && !modifiers.shift)bassExpressionPad=chordIndex;
      if(!pressed) {
        expressionRelease(chordIndex);
        if(chordIndex===bassExpressionPad)expressionRelease(LIVE_BASS_OWNER);
      }
      // Bass-only overdub uses root selectors, not harmony anchors. Releases
      // never choose another pitch; only the last pressed owner can end it.
      if((!pressed && bassOnlyHeld.has(chordIndex)) || (pressed && !modifiers.shift && hasRecording && ((!settings.bassPads&&trackView===1) || (recordArmed && settings.recordPart==='bass')))) {
        if(!pressed) {
          bassOnlyHeld.delete(chordIndex);
          recordRelease(chordIndex);
          if(bassRecordOwner===chordIndex){release(LIVE_BASS_OWNER);bassRecordOwner=-1;}
          return;
        }
        bassOnlyHeld.add(chordIndex);
        if(!settings.bassEnabled){describe('Enable BASS to play');return;}
        const chord=chordForInput(chordIndex);
        if(!chord)return;
        const notes=bassNotes({...chord,bassMode:'root'},settings,chordNotes(chord,settings));
        if(!notes.length)return;
        stop(LIVE_BASS_OWNER);pedal('bass',false);
        play(LIVE_BASS_OWNER,notes,velocity,{kind:'bass',chord});bassRecordOwner=chordIndex;
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
      if (settings.bassGesture && settings.bassEnabled && !settings.bassPads) {
        const action = bassGesture.press(chordIndex);
        if (action.type === 'none') return;
        if (action.type === 'bass') {
          silencedOwners.delete(LIVE_BASS_OWNER);
          gestureVelocity = velocity;
          gestureBass = nearestBassPitch(settings.key + chord.rootOffset,
            gestureBass ?? voices.get(LIVE_BASS_OWNER)?.notes[0] ?? 36);
          syncLiveBass(); recordBass(bassGesture.inspect().anchor); dirty = true; ledsDirty = true; return;
        }
      }
      gestureBass = null; // A new harmony attack ends the previous sustained slash choice.
      const notes = voiced(chord);
      beginHarmony();
      if(!settings.bassPads)silencedOwners.delete(LIVE_BASS_OWNER);
      silencedOwners.delete(chordIndex);
      play(chordIndex, notes, velocity, { kind, index: chordIndex, chord, variant });
      activate(chord, kind, chordIndex, notes, variant);
      recordAttack(chordIndex,chord,notes,velocity);
      if (ideasEnabled) {
        ideaSelected = chordIndex;
        active.ideaReason = Object.values(variant).some(Boolean) ? degreeName(chord, ideasContext(settings, borrowLocked)) : ideas[chordIndex].reason;
      }
      syncLiveBass();
      if(!settings.bassPads)recordBass(chordIndex);
      describe(ideasEnabled ? active.ideaReason : chordName(chord, settings) + ' ' + degreeName(chord, settings));
      return;
    }
    const melodyIndex = MELODY_PADS.indexOf(note);
    if (melodyIndex >= 0) {
      if(settings.bassPads){
        const id=8+melodyIndex;
        if(!pressed){bassOnlyHeld.delete(id);recordRelease(id);if(bassRecordOwner===id){expressionRelease(LIVE_BASS_OWNER);release(LIVE_BASS_OWNER);bassRecordOwner=-1;}return;}
        if(!settings.bassEnabled){describe('Enable BASS to play');return;}
        const pitch=bassPadPitches()[melodyIndex];
        if(!Number.isInteger(pitch)){describe('Note outside MIDI');return;}
        bassOnlyHeld.add(id);bassExpressionPad=id;
        stop(LIVE_BASS_OWNER);pedal('bass',false);
        play(LIVE_BASS_OWNER,[pitch],velocity,{kind:'bass',chord:active.chord},true);
        bassRecordOwner=id;recordBass(id);describe('Bass '+bassNoteName(pitch));return;
      }
      const pitch = melodyNotes(active.chord, melodyContext())[melodyIndex];
      if (pressed && !Number.isInteger(pitch)) { describe('Note outside MIDI'); return; }
      melodyHeld[melodyIndex] = pressed ? clamp(velocity, 1, 127) : 0;
      melodyPressure[melodyIndex] = 0;
      if (pressed) {
        play(melodyIndex + MELODY_OWNER_START, [pitch], velocity, { kind: 'melody', index: melodyIndex }, true);
      } else { expressionRelease(melodyIndex + MELODY_OWNER_START); flushPressure(); release(melodyIndex + MELODY_OWNER_START); }
      if(recordArmed && ['all','melody'].includes(settings.recordPart)) {
        const clock=recordClock('melody',pressed),r=melodyRecorders[melodyIndex];
        commitMelodyTake(r.observe(clock.beat,clock.ready));
        if(pressed && clock.ready)commitMelodyTake(r.start(melodyIndex,clock.beat,partRate('melody'),pitch,velocity,melodyProgression.length));
        else if(!pressed)commitMelodyTake(r.release(melodyIndex,clock.ready?clock.beat:undefined));
      }
    }
  }
  function bassPadPitches(){
    return melodyNotes(active.chord,{...melodyContext(),melodyOctave:0}).map(n=>{
      const pitch=n===null?null:n+12*(settings.bassOctave-1);
      return pitch!==null&&pitch>=0&&pitch<=127?pitch:null;
    });
  }
  function endGesture() {
    const state = bassGesture.inspect();
    if (state.active) { stop(state.anchor); stop(LIVE_BASS_OWNER); }
    bassGesture.reset(); gestureBass = null;
  }
  function step(index, pressed, modifiers = {}) {
    if (!hasClips) return;
    if (parked || !Number.isInteger(index) || index < 0 || index >= STEP_COUNT) return;
    if(modifierEditIndex>=0&&pressed){describe('Back before step edit');return;}
    if(captureReview&&clipView&&pressed){describe('Confirm Capture or Back first');return;}
    const physical=index;
    if(!pressed && lengthSteps.delete(physical))return;
    if(pressed && loopHeld){lengthSteps.add(physical);setLoopLength(physical);return;}
    // Move: hold a step and press a later one to set the held step's length.
    // A held chord pad instead places that chord on every step pressed.
    const placing=[...voices.values()].some(v=>['bank','idea'].includes(v.kind)&&!v.sustained);
    if(pressed && stepEdit>=0 && !placing && heldSteps.some((n,i)=>n===stepEdit&&i!==physical) && !modifiers.delete && !modifiers.copy && !modifiers.shift) {
      lengthSteps.add(physical);
      const end=physical+stepPages[stepPart()]*16;
      if(end<=stepEdit){notice('LEN: press a later step');return;}
      editStep('eventLength',end-stepEdit+1-eventSteps(editedEvent()));return;
    }
    if (!pressed) { if(stepEdit===heldSteps[physical]){stepEdit=-1;focused=-1;touch=-1;dirty=true;} heldSteps[physical]=null;
      const owner=STEP_OWNER_START+physical;if(voices.get(owner)?.audition)stop(owner);else release(owner);syncLiveBass(); return; }
    index+=stepPages[stepPart()]*16;heldSteps[physical]=index;
    // No step audition may leak a live chord into bass-only recording.
    if(recordArmed){describe('Finish REC before editing');return;}
    stepEdit=-1;stepEvent=0;
    const part=stepPart();
    seqPart=part;
    if(modifiers.copy){copyStep(part,index);return;}
    if(part==='melody'||part==='bass') {
      selectedSlot=index;ledsDirty=true;dirty=true;
      const target=lane(),owner=STEP_OWNER_START+physical;
      if(modifiers.delete){stop(owner);undoTake=null;target[index]=null;syncSlots();markSave();describe('Step cleared');return;}
      // A held note on the right-hand pads overwrites, as a held chord pad does.
      const playing=part==='melody'?melodyHeld.some(Boolean)&&!settings.bassPads:bassOnlyHeld.size>0;
      if(modifiers.shift || playing || !target[index]) {
        const played=lastPlayed[part];if(!played){describe('Play a '+part+' note first');return;}
        const fresh=!modifiers.shift&&!target[index];
        undoTake=null;target[index]=normalizeBassStep({...played,steps:1});
        if(fresh)stepEdit=index;
        syncSlots();markSave();notice('Saved '+part+' '+(index+1));return;
      }
      const event=target[index];
      if(event){stepEdit=index;play(owner,[event.note],event.velocity,{kind:part,index:physical,audition:true},true);describe(part+' step '+(index+1));}
      else describe(part+' '+(index+1)+' empty');
      return;
    }
    if (modifiers.delete) {
      stop(STEP_OWNER_START + physical); storeSlot(index, null,[],lane()); syncLiveBass(); describe(`Cleared step ${index + 1}`); return;
    }
    // A held chord pad writes itself to the step, empty or not (Move: hold a
    // pad, press steps). A new step stays held for its length gesture.
    const held = [...voices.values()].filter(v=>['bank','idea'].includes(v.kind)&&!v.sustained).pop();
    const fresh=!modifiers.shift&&!lane()[index];
    if(held&&!modifiers.shift){storeSlot(index,held.chord,held.notes,lane());if(fresh)holdNewStep(index);notice(`Saved step ${index+1}`);return;}
    if (modifiers.shift || !lane()[index]) {
      storeSlot(index, active.chord,active.notes,lane());if(fresh)holdNewStep(index);notice(`Saved step ${index + 1}`); return;
    }
    selectedSlot = index; ledsDirty = true; dirty = true;
    const chord=lane()[index];
    if (!chord) { describe(`Step ${index + 1} empty`); return; }
    {stepEdit=index;stepSaved=cellEvents(chord).map(e=>normalizeStep(e,true));stepExtensions=[];stepEditExtension='AUTO';focused=-1;describe(`Chord step ${index+1}`);}
    const notes = voiced(chord);
    play(STEP_OWNER_START + physical, notes, chord.timing?.velocity??settings.stepVelocity, { kind: 'slot', index, chord, audition:true });
    activate(chord, 'slot', index, notes);
    syncLiveBass();
    describe(`Step ${index + 1} ${chordName(active.chord, context())}`);
  }
  function holdNewStep(index){stepEdit=index;stepSaved=cellEvents(lane()[index]).map(e=>normalizeStep(e,true));stepExtensions=[];stepEditExtension='AUTO';focused=-1;}
  const eventSteps=event=>event?.timing?.steps??event?.steps??1;
  // Gestures reuse the step editor's knob so limits, sync and feedback agree.
  function editStep(id,delta,modifiers={}) {
    const index=cells().findIndex(c=>c.id===id);
    if(index<0||!delta){if(index>=0){focused=index;const cell=cells()[index];describe(`${cell.fullLabel}: ${cell.fullValue}`);}return;}
    knob(index,delta,modifiers);
  }
  function copyStep(part,index) {
    const target=lane();
    if(!stepCopy){
      if(!target[index]){notice('Step '+(index+1)+' empty');return;}
      stepCopy={part,index,cell:clone(target[index])};notice('Copied '+(index+1)+': pick step');return;
    }
    if(stepCopy.part!==part){notice('Copy within one part');return;}
    // Recorded timing is absolute within the clip: move it with the step.
    const offset=index-stepCopy.index;
    const events=cellEvents(clone(stepCopy.cell)).map(({more,...e})=>e.performance?{...e,performance:{...e.performance,start:e.performance.start+offset}}:e);
    if(events.some(e=>e.performance&&(e.performance.start<0||e.performance.start>=target.length))){notice('Step outside clip');return;}
    target[index]={...events[0],...(events.length>1?{more:events.slice(1)}:{})};
    undoTake=null;
    selectedSlot=index;syncSlots();markSave();dirty=true;ledsDirty=true;notice('Pasted step '+(index+1));
  }
  function setClipLength(length) {
    const part=clipView?clipPart:stepPart(),clip=clipView?editingClip():selectedClip(clips,part);
    if(recordArmed||clipTransfer||(armed&&readClock().ready&&clip.id===clips.parts[part].selected)){notice('Stop SEQ before resize');return;}
    if(!resizeClip(clip,length)){notice('Length blocked by events');return;}
    stepPages[part]=Math.min(stepPages[part],length/16-1);undoTake=null;syncSlots();markSave();dirty=true;ledsDirty=true;notice('LEN '+length+' steps');
  }
  // Move: hold Loop and press a step; each step is one 16-step bar.
  function setLoopLength(physical) {
    if(!hasClips)return;
    setClipLength(physical===0?16:physical===1?32:64);
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
    if(modifierEditIndex>=0)return [
      field('modifier'+modifierEditIndex,'FUNC',modifierLabel(settings.modifierAssignments[modifierEditIndex]),'Modifier '+(modifierEditIndex+1)),
      ...Array.from({length:7},blank)];
    if(clipView&&captureReview){const r=captureReview,seconds=n=>(n*15/r.take.bpm).toFixed(2)+'s';return [
      field('captureStart','START',seconds(r.start),'Start / beat one'),field('captureEnd','END',seconds(r.end),'Phrase end'),
      field('captureBars','BARS',r.bars||'AUTO','Phrase bars'),field('captureListen','LISTEN',r.preview?'ON':'OFF','Preview original performance'),blank(),
      field('captureBpm',r.take.suggestion?'BPM?':'BPM',Math.round(r.bpm),'Capture tempo'),
      field('captureFactor','HALF/2X','TURN','Left: half; right: double'),field('captureApply','USE','TURN','Confirm capture range')];}
    if(stepEdit>=0) {
      const event=editedEvent(),count=cellEvents(lane()[stepEdit]).length;
      const selector=count>1?field('eventSelect','EVENT',`${stepEvent+1}/${count}`,'Event in step'):blank();
      const nudge=field('eventNudge','NUDGE',Math.round((event?.performance?.nudge??0)*100)+'%','Timing offset (% step)');
      if(event)return seqPart!=='chord' ? [
        field('eventNote','NOTE',bassNoteName(event.note),seqPart==='melody'?'Melody pitch':'Bass pitch'),
        field('eventLength','LEN',event.steps,'Length (steps)'),field('eventVelocity','VEL',event.velocity,'Velocity'),
        nudge,blank(),blank(),blank(),selector] : [
        field('eventRoot','ROOT',noteName(event.snapshot.key+event.rootOffset),'Chord root'),
        field('eventExtension','EXT',stepEditExtension==='AUTO'?'SAVED':stepEditExtension,'Change extension'),
        field('eventLength','LEN',event.timing?.steps??1,'Length (steps)'),
        field('eventVelocity','VEL',event.timing?.velocity??settings.stepVelocity,'Velocity'),
        field('eventInvert','INV',stepInversion(event)===0?'ROOT':(stepInversion(event)>0?'+':'')+stepInversion(event),'Invert (Shift: octave)'),
        field('eventStrum','STRUM',event.snapshot.strumMs??0,'Step strum',`${event.snapshot.strumMs??0}ms`),
        nudge,selector];
    }
    const quantizeClip=(clipView?editingClip():selectedClip(clips,stepPart())).quantize??0;
    const quantizeCell=field('clipQuantize','QNT',quantizeClip?quantizeClip+'%':'OFF','Clip QNT',quantizeClip?quantizeClip+'%':'Off');
    const countCell=field('countIn','COUNT',settings.countIn?'1 BAR':'OFF','Count-in',settings.countIn?'1 bar':'Off');
    const metroCell=field('metronome','METRO',settings.metronome.toUpperCase(),'Metro',{off:'Off',on:'While playing',rec:'Recording only'}[settings.metronome]);
    if(clipView) {
      const c=editingClip();return [field('clipLength','LEN',c.length,'Clip length'),
        field('clipRate','RATE',RATE_NAMES[c.rate??2],'Clip rate'),quantizeCell,
        field('stepPage','PAGE',`${stepPages[clipPart]+1}/${c.length/16}`,'Step page'),countCell,
        ...(captureReview?[field('captureBpm',captureReview.take.suggestion?'BPM?':'BPM',Math.round(captureReview.bpm),captureReview.take.suggestion?'Suggested BPM':'No clear pulse: Move BPM'),
          field('captureFactor','HALF/2X','TURN','Left: half; right: double'),field('captureApply','USE BPM','TURN','Confirm clip tempo')]:[metroCell,blank(),blank()])];
    }
    const mode = settings.melodyMode;
    // Bass pads stay switchable back to melody even while BASS is off.
    const rightPads={...field('bassPads','R.PAD',settings.bassPads?'BASS':'MEL','Right-hand pads',settings.bassPads?'Bass':'Melody',
      settings.bassEnabled||settings.bassPads?'':'Enable BASS first'),disabledValue:settings.bassPads?'BASS':'MEL'};
    const layout = {
      // APPR colours the II/V/SUB modifiers, so it takes the STOP pad's cell.
      'MOD PADS': () => [4,5,6,-1,0,1,2,3].map(i=>i<0?field('approachMode','APPR',settings.approachMode==='profile'?'PROF':'BASIC','II/V/SUB colour',settings.approachMode.toUpperCase()):
        field('modifier'+i,i>=4?'UP '+(i-3):'LOW '+(i+1),({borrow:'BORRW',flip:'M/m',commonDim:'CTDIM'}[settings.modifierAssignments[i]]||modifierLabel(settings.modifierAssignments[i])),
          'Modifier '+(i+1),modifierLabel(settings.modifierAssignments[i]))),
      'EXT PROF': () => [4,5,6,-1,0,1,2,3].map(i=>{
        if(i<0)return field('extensionProfile','PROF',({global:'GLOB',custom:'CUST'}[settings.extensionProfile]||EXTENSION_PROFILES.find(p=>p.id===settings.extensionProfile).label),'Profile',EXTENSION_PROFILES.find(p=>p.id===settings.extensionProfile).label);
        const degree=i%SCALES.find(s=>s.id===settings.scaleId).intervals.length,ext=profileDegrees(settings)[degree];
        const label=chordName(bank[i],settings),value=typeof ext==='string'?ext:ext<0?'GLOB':EXTENSIONS[ext];
        const fixed=overrides[i]?.customChord||overrides[i]?.extensionName||Number.isInteger(overrides[i]?.extension);
        return {...field('degreeExt'+degree,label,fixed?'PAD':value,'Pad '+(i+1)+': '+label,value,fixed?'Reset pad edit to use profile':''),...(fixed?{disabledValue:'PAD'}:{})};
      }),
      CHORDS: () => [
        field('key', 'KEY', noteName(settings.key), 'Key'),
        field('scaleId', 'SCALE', SCALE_CELLS[scale.id]??scale.short, 'Scale', scale.name.replace(/^(Maj|Min)or (Pent)atonic$/,'$1 $2atonic')),
        field('extension', 'EXT', settings.extensionProfile==='global'?EXTENSIONS[settings.extension]:settings.extensionProfile==='custom'?'CUST':EXTENSION_PROFILES.find(p=>p.id===settings.extensionProfile).label, 'Extension',
          settings.extensionProfile==='global'?EXTENSIONS[settings.extension]:'Profile active; turn for global EXT'),
        field('octave', 'OCT', settings.octave, 'Chord octave'),
        field('spread', 'SPRD', ['CLOSE', 'OPEN', 'WIDE'][settings.spread], 'Spread'),
        field('voiceLead', 'LEAD', settings.voiceLead ? settings.leadRegister==='free' ? 'FREE' : 'CNTR' : 'OFF', 'Voice leading'),
        field('strumMs','STRUM',settings.strumMs,'Strum',settings.strumMs+'ms'),
        field('chordSustain', 'SUST', settings.chordSustain.toUpperCase(), 'Chord sustain'),
      ],
      STRUM: () => [
        field('strumMs','GAP',settings.strumMs,'Note spacing',settings.strumMs+'ms'),
        field('strumDirection','DIR',['UP','DOWN','ALT','RAND'][settings.strumDirection],'Strum direction'),
        field('strumTiming','TIME',settings.strumTiming+'%','Timing variation'),
        field('strumVelocity','VEL',settings.strumVelocity+'%','Velocity var.'),
        field('strumOn','STRUM',settings.strumMs?'ON':'OFF','Strum',settings.strumMs?settings.strumMs+'ms':'Off'),
      ],
      EXPR: () => [
        field('chordExpression','AT',settings.chordExpression.toUpperCase(),'Chord AT'),
        field('expressionMin','MIN',settings.expressionMin,'Min CC value'),
        field('expressionMax','MAX',settings.expressionMax,'Max CC value'),
        field('leadRegister','REG',settings.leadRegister==='center'?'CNTR':'FREE','LEAD register','OCT anchors CENTER'),
        field('ensembleSmooth','VOICE',settings.ensembleSmooth?'SMTH':'RANK','Voices',settings.ensembleSmooth?'Stable':'Pitch rank'),blank(),
        field('divisi','DIV',settings.divisi?'NOTE':'OFF','Divisi',settings.divisi?'ENS channels':'Off'),
      ],
      IDEAS: () => [
        field('ideasEnabled', 'IDEAS', ideasEnabled ? 'ON' : 'OFF', 'Ideas'),
        field('ideasColor', 'STYLE', ideaStyle(settings.ideasColor), 'Ideas style'),
        field('ideasNew', 'NEW', 'TURN', 'New ideas', 'From played chord', ideasEnabled ? '' : 'Turn IDEAS on first'),
        field('ideasMode','MODE',settings.ideasMode.toUpperCase(),'Ideas mode'),
        field('approachMode','APPR',settings.approachMode==='profile'?'PROF':'BASIC','II/V/SUB colour',settings.approachMode.toUpperCase()),
      ],
      MELODY: () => [
        field('melodyMode', 'MODE', ['CHORD', 'SCALE', 'CHROM','PENTA','BLUES'][MELODY_MODES.indexOf(mode)], 'Melody mode'),
        field('melodyOctave', 'M.OCT', settings.melodyOctave, 'Melody octave'),
        ['pentatonic','blues'].includes(mode)
          ? field('melodySoloType','TYPE',settings.melodySoloType.toUpperCase(),'Solo palette')
          : field('melodyAdapt', 'ADAPT', settings.melodyAdapt ? settings.melodyAdaptTarget?'TARGET':'CHORD' : 'OFF', 'Adaptive scale', settings.melodyAdapt ? settings.melodyAdaptTarget?'TARGET':'CHORD' : 'OFF', mode === 'scale' ? '' : 'ADAPT: use SCALE mode'),
        blank(),
        blank(),
        publicBuild ? field('melodyAftertouch','AT',settings.melodyAftertouch?'POLY':'OFF','Melody AT') : field('melodyExpression','AT',settings.melodyExpression.toUpperCase(),'Melody AT'),
        rightPads,
        field('melodySustain','SUST',settings.melodySustain.toUpperCase(),'Melody sustain'),
      ],
      BASS: () => [
        field('bassEnabled', 'BASS', settings.bassEnabled ? 'ON' : 'OFF', 'Automatic bass'),
        field('bassOctave', 'B.OCT', settings.bassOctave, 'Bass octave'),
        field('bassMode', 'B.NTE', settings.bassMode.toUpperCase(), 'Bass note'),
        field('bassGesture', 'GEST', settings.bassGesture ? 'ON' : 'OFF', 'Bass gesture'),
        blank(),
        publicBuild ? blank() : field('bassExpression','AT',settings.bassExpression.toUpperCase(),'Bass expression'),
        rightPads,
        field('bassSustain','SUST',settings.bassSustain.toUpperCase(),'Bass sustain'),
      ],
      'M.EXTRA': () => [
        field('melodyFollow','TRACK',settings.melodyFollow==='nearest'?'NEAR':'PAD','Hold',settings.melodyFollow==='nearest'?'Nearest tone':'Pad position',mode==='chord'?'':'TRACK: use CHORD mode'),
        blank(),
        publicBuild ? blank() : field('melodyExpressionMin','MIN',settings.melodyExpressionMin,'Min CC value'),
        publicBuild ? blank() : field('melodyExpressionMax','MAX',settings.melodyExpressionMax,'Max CC value'),
      ],
      'B.EXTRA': () => [
        publicBuild ? blank() : field('smartBass','SMART',voices.has(LIVE_BASS_OWNER)?bassNoteName(voices.get(LIVE_BASS_OWNER).notes[0]):'--','Smart Bass','Chord tones'),
        blank(),
        publicBuild ? blank() : field('bassExpressionMin','MIN',settings.bassExpressionMin,'Min CC value'),
        publicBuild ? blank() : field('bassExpressionMax','MAX',settings.bassExpressionMax,'Max CC value'),
      ],
      SEQ: () => [
        field('arm', 'RUN', dsp.running ? 'PLAY' : armed ? 'ARMED' : 'OFF', 'Loop'),
        field('clipRate', 'RATE', RATE_NAMES[partRate(seqPart)], 'Clip rate'),
        field('clipLength','LEN',lane().length,'Clip length (steps)'),
        field('seqPart', 'PART', seqPart==='melody'?'MEL':seqPart.toUpperCase(), 'Step editing part'),
        field('stepPage','PAGE',`${stepPages[seqPart]+1}/${lane().length/16}`,'Step page'),
        quantizeCell,
        countCell,metroCell,
      ],
      SETUP: () => [
        field('quantizeAmount','QNT',settings.quantize+'%','QNT for Shift+16',settings.quantize+'%'),countCell,metroCell,
        field('metroVolume','M.VOL',settings.metroVolume+'%','Metro volume'),
        field('chordRecord','C.REC',{chord:'CHORD',both:'C+B',all:'ALL'}[settings.chordRecord],'T1 REC',{chord:'Chords',both:'Chord+bass',all:'All parts'}[settings.chordRecord]),
      ],
      SCALE: () => {const chords=layout.CHORDS(),melody=layout.MELODY();return [chords[0],chords[1],melody[0],melody[2],chords[3],melody[1]];},
      ARP: () => [
        field('arpEnabled', 'ARP', settings.arpEnabled ? 'ON' : 'OFF', 'Arpeggiator'),
        field('arpRate', 'RATE', RATE_NAMES[settings.arpRate], 'Arp rate'),
        field('arpDirection', 'DIR', ['UP', 'DOWN', 'UP/DN', 'RAND', 'CHORD'][settings.arpDirection], 'Arp direction'),
        field('arpRange', 'RANGE', settings.arpRange, 'Arp octave range', settings.arpRange, settings.arpDirection === 4 ? 'CHORD uses source voicing' : ''),
        field('arpGate', 'GATE', settings.arpGate + '%', 'Arp gate'),
        field('arpSwing', 'SWING', settings.arpSwing + '%', 'Arp swing'),
        field('arpVelocity', 'VEL', settings.arpVelocity, 'Arp velocity'),
        field('arpHold', 'HOLD', settings.arpHold ? 'ON' : 'OFF', 'Arp hold'),
      ],
      'A.CLOCK': () => [
        field('arpClock', 'CLOCK', settings.arpClock.toUpperCase(), 'Arp clock'),
        field('arpBpm', 'BPM', settings.arpBpm, 'Free tempo', settings.arpBpm + ' BPM', settings.arpClock === 'free' ? '' : 'BPM: use FREE clock'),
      ],
      MIDI: () => [
        field('previewRoute', 'C.OUT', routeLabels[ROUTES.indexOf(settings.previewRoute)], 'Chord output', routeFull[ROUTES.indexOf(settings.previewRoute)]),
        field('channel', 'C.CH', settings.channel + 1, 'Chord channel',settings.channel+1,!publicBuild&&settings.divisi?'DIV: Shift+MIDI':''),
        field('melodyRoute', 'M.OUT', routeLabels[ROUTES.indexOf(settings.melodyRoute)], 'Melody output', routeFull[ROUTES.indexOf(settings.melodyRoute)]),
        field('melodyChannel', 'M.CH', settings.melodyChannel + 1, 'Melody channel'),
        field('bassRoute', 'B.OUT', routeLabels[ROUTES.indexOf(settings.bassRoute)], 'Bass output', routeFull[ROUTES.indexOf(settings.bassRoute)]),
        field('bassChannel', 'B.CH', settings.bassChannel + 1, 'Bass channel'),
        publicBuild ? blank() : field('arpRoute', 'A.OUT', routeLabels[ROUTES.indexOf(settings.arpRoute)], 'Arp output'),
        publicBuild ? blank() : field('arpChannel', 'A.CH', settings.arpChannel + 1, 'Arp channel'),
      ],
      ENSEMBL: () => settings.ensembleChannels.map((ch,i)=>field(`ensemble${i}`,`V${i+1}.CH`,ch+1,`Voice ${i+1} channel`,ch+1)),
    };
    // Build only the visible row: the Move UI thread is slow and this runs per repaint.
    const rowFor = name => {
      const row = layout[name]?.();
      if(row && features.includes('trackNavigation')) {
        if(name==='CHORDS')[row[1],row[3]]=[row[3],row[1]];
        if(name==='MELODY'||name==='BASS')row[1].label='OCT';
        // Shared physical homes, set in the rows: AT knob 6, R.PAD knob 7, SUST knob 8.
      }
      return row;
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
    const row = rowFor(currentPage() === 'PLAY' ? 'CHORDS' : currentPage());
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
  // A forced control lets Shift + step shortcuts reuse a knob's full logic.
  function knob(index, delta, modifiers = {}, forced = null) {
    if (parked || !delta || (!forced && (index < 0 || index > 7))) return;
    const control = forced ?? cells()[index];
    if (!control?.id) return;
    if (control.disabled) { focused = -1; describe(control.hint); return; }
    delta = clamp(Math.trunc(delta), -63, 63);
    const id = control.id;
    if(/^modifier[0-6]$/.test(id)) {
      if(modifierDown.size && !(modifierDown.size===1 && modifierDown.has(modifierEditIndex))){describe('Release modifier pads first');return;}
      const i=Number(id.slice(-1)),old=settings.modifierAssignments[i];
      const next=MOD_ACTIONS[clamp(MOD_ACTIONS.findIndex(a=>a.id===old)+delta,0,MOD_ACTIONS.length-1)].id;
      if(next!==old){
        settings.modifierAssignments=[...settings.modifierAssignments];settings.modifierAssignments[i]=next;
        if(old==='borrow'){borrowLocked=false;if(ideasEnabled)newIdeas(ideasSource);}
        markSave();ledsDirty=true;
      }
      focused=index;describe('Pad '+(i+1)+': '+modifierLabel(next));controlDetail=true;return;
    }
    if(id==='extensionProfile'||/^degreeExt[0-6]$/.test(id)) {
      if(id==='extensionProfile'){settings.extensionProfile=EXTENSION_PROFILES[clamp(EXTENSION_PROFILES.findIndex(p=>p.id===settings.extensionProfile)+delta,0,EXTENSION_PROFILES.length-1)].id;settings.extensionProfileRevision=3;}
      else {
        const i=Number(id.slice(-1)),degrees=profileDegrees(settings);
        degrees[i]=PROFILE_EXTENSIONS[clamp(PROFILE_EXTENSIONS.indexOf(degrees[i])+delta,0,PROFILE_EXTENSIONS.length-1)];
        settings.customExtensions=degrees;settings.extensionProfile='custom';
      }
      // These are recipes for the next attack. Keep held notes and recorded
      // snapshots intact, including melody/bass ownership and ARP's source.
      bank=buildBank();markSave();ledsDirty=true;focused=index;
      describe(id==='extensionProfile'?'Profile: '+EXTENSION_PROFILES.find(p=>p.id===settings.extensionProfile).label:'Custom: '+cells()[index].fullValue);
      controlDetail=true;return;
    }
    if(id.startsWith('capture')&&captureReview){
      if(readClock().ready||recordArmed||clipTransfer){describe('Stop transport for tempo');return;}
      if(id==='captureListen'){captureReview.preview=delta>0;startCapturePreview();dirty=true;return;}
      if(['captureStart','captureEnd','captureBars'].includes(id)){
        const r=captureReview,increment=r.take.bpm/300; // 50 ms in source step units
        if(id==='captureStart'){
          if(modifiers.shift)r.start=clamp(r.start+delta*increment,0,r.end-increment);
          else {const starts=captureAttacks().filter(n=>n<r.end);if(starts.length){let i=starts.findIndex(n=>n>=r.start-1e-6);if(i<0)i=starts.length-1;r.start=starts[clamp(i+delta,0,starts.length-1)];}}
        }
        if(id==='captureEnd')r.end=clamp(r.end+delta*increment,r.start+increment,r.limit);
        if(id==='captureBars')r.bars=[0,1,2,4][clamp([0,1,2,4].indexOf(r.bars)+Math.sign(delta),0,3)];
        if(r.bars)r.bpm=r.bars*16*r.take.bpm/(r.end-r.start);
        startCapturePreview();dirty=true;describe(r.bars?'BPM from range + bars':'START selects attacks; Shift: fine');return;
      }
      if(id==='captureBpm'||id==='captureFactor'){
        captureReview.bars=0;
        captureReview.bpm=clamp(Math.round(id==='captureBpm'?captureReview.bpm+delta:captureReview.bpm*(delta>0?2:.5)),30,300);
        dirty=true;describe('Try '+captureReview.bpm+' BPM; USE to confirm');return;
      }
      if(id==='captureApply'){
        const r=captureReview;
        if(Object.entries(r.targets).some(([p,i])=>{const c=clips.parts[p].clips[i];return !same(c,r.expected[p])||c?.id===clips.parts[p].selected||pendingClips[p];})){
          stopCapturePreview();
          captureReview=null;dirty=true;describe('Clip changed; tempo cancelled');return;
        }
        if(r.bpm<30||r.bpm>300){describe('Tempo outside 30-300');return;}
        const trimmed=trimCapture(r.take,r.start,r.end);
        if(trimmed.error){describe(trimmed.error);return;}
        const take=retimeCapture(trimmed,r.bpm/r.take.bpm);
        if(take.error){describe(take.error);return;}
        stopCapturePreview();
        if(r.bars)take.length=r.bars*16;
        for(const [p,i] of Object.entries(r.targets))Object.assign(clips.parts[p].clips[i],{length:take.length,events:Array.from({length:take.length},(_,n)=>take.lanes[p]?.[n]??null)});
        captureReview=null;markSave();dirty=true;ledsDirty=true;describe('Set Move to '+r.bpm+' BPM');return;
      }
    }
    if(id==='strumOn') {
      if(delta>0&&!settings.strumMs)settings.strumMs=lastStrum;
      if(delta<0&&settings.strumMs){lastStrum=settings.strumMs;settings.strumMs=0;}
      markSave();ledsDirty=true;focused=index;notice(settings.strumMs?`STRUM ON ${settings.strumMs}ms`:'STRUM OFF');return;
    }
    if(id==='metroVolume') {
      settings.metroVolume=clamp(settings.metroVolume+10*delta,10,120);syncMetronome();markSave();focused=index;notice('Metro volume: '+settings.metroVolume+'%');return;
    }
    if(id==='chordRecord') {
      const modes=['chord','both','all'];settings.chordRecord=modes[clamp(modes.indexOf(settings.chordRecord)+Math.sign(delta),0,2)];
      markSave();focused=index;notice('T1 REC: '+cells()[index].fullValue);return;
    }
    if(id==='metronome') {
      const modes=['off','on','rec'];settings.metronome=modes[clamp(modes.indexOf(settings.metronome)+Math.sign(delta),0,2)];
      syncMetronome();markSave();focused=index;notice('Metro: '+cells()[index].fullValue);return;
    }
    if(id==='countIn') {
      if(recordArmed){describe('Stop REC to change count-in');return;}
      settings.countIn=delta>0;markSave();focused=index;notice('Count-in: '+(settings.countIn?'1 bar':'Off'));return;
    }
    if(id==='quantizeAmount') {
      settings.quantize=clamp(settings.quantize+delta,1,100);markSave();focused=index;notice(`Shift+16 QNT: ${settings.quantize}%`);return;
    }
    if(id==='clipQuantize') {
      const c=clipView?editingClip():selectedClip(clips,stepPart());c.quantize=clamp((c.quantize??0)+delta,0,100);
      syncSlots();markSave();ledsDirty=true;focused=index;notice('Clip QNT: '+(c.quantize?c.quantize+'%':'OFF'));return;
    }
    if(id==='clipRate') {
      const part=clipView?clipPart:seqPart,c=clipView?editingClip():selectedClip(clips,part),active=c.id===clips.parts[part].selected;
      if(recordArmed||clipTransfer||(active&&armed&&readClock().ready)){describe('Stop SEQ to edit active clip');return;}
      c.rate=clamp((c.rate??2)+delta,0,4);
      syncSlots();markSave();dirty=true;ledsDirty=true;
      describe('RATE '+RATE_NAMES[c.rate]);return;
    }
    if(id==='stepPage'){pageSteps(delta);return;}
    if(id==='clipLength') {
      const clip=clipView?editingClip():selectedClip(clips,stepPart());
      setClipLength([16,32,64][clamp([16,32,64].indexOf(clip.length)+Math.sign(delta),0,2)]);return;
    }
    if(id==='quantize') {
      if(recordArmed)setRecord(false);
      settings.quantize=clamp(settings.quantize+delta,0,100);syncSlots();markSave();describe('Quantize: '+settings.quantize+'%');return;
    }
    if(id==='eventSelect') {
      stepEvent=clamp(stepEvent+delta,0,cellEvents(lane()[stepEdit]).length-1);
      stepEditExtension=stepExtensions[stepEvent]??'AUTO';describe('Event '+(stepEvent+1));return;
    }
    if(id==='recordPart') {
      const next=['all','both','chord','bass','melody'][clamp(['all','both','chord','bass','melody'].indexOf(settings.recordPart)+delta,0,4)];
      if(next!==settings.recordPart){setRecord(false);settings.recordPart=next;markSave();}
      describe('Record part: '+next.toUpperCase());return;
    }
    if(id==='seqPart'){seqPart=['chord','bass','melody'][clamp(['chord','bass','melody'].indexOf(seqPart)+delta,0,2)];focused=-1;ledsDirty=true;describe('Steps: '+seqPart);return;}
    if(stepEdit>=0 && id.startsWith('event')) {
      undoTake=null;
      const event=editedEvent();
      if(id==='eventNudge') {
        event.performance ??= {start:stepEdit,duration:seqPart!=='chord'?event.steps:event.timing?.steps??1};
        event.performance.nudge=clamp(Math.round((event.performance.nudge??0)*100)+delta,-99,99)/100;
      } else if(seqPart!=='chord') {
        if(id==='eventNote') {
          const previous=event.note;event.note=clamp(event.note+delta*(modifiers.shift?12:1),0,127);
          const physical=heldSteps.indexOf(stepEdit),owner=STEP_OWNER_START+physical;
          if(previous!==event.note && physical>=0 && voices.get(owner)?.audition){
            stop(owner);play(owner,[event.note],event.velocity,{kind:seqPart,index:physical,audition:true},true);
          }
        }
        if(id==='eventLength'){event.steps=clamp(event.steps+delta,1,lane().length);if(event.performance)event.performance.duration=event.steps;}
        if(id==='eventVelocity')event.velocity=clamp(event.velocity+delta,1,127);
      } else if(id==='eventLength'||id==='eventVelocity') {
        event.timing={steps:event.timing?.steps??1,velocity:event.timing?.velocity??settings.stepVelocity};
        const key=id==='eventLength'?'steps':'velocity';event.timing[key]=clamp(event.timing[key]+delta,1,key==='steps'?lane().length:127);
        if(key==='steps'&&event.performance)event.performance.duration=event.timing.steps;
      } else if(id==='eventRoot') {
        const shift=clamp(delta,-Math.min(...event.snapshot.notes),127-Math.max(...event.snapshot.notes));
        event.rootOffset=wrap(event.rootOffset+shift,12);event.snapshot.notes=event.snapshot.notes.map(n=>n+shift);
        if(event.snapshot.bass>=0)event.snapshot.bass=clamp(event.snapshot.bass+shift,0,127);
      } else if(id==='eventStrum') {
        event.snapshot.strumMs=clamp((event.snapshot.strumMs??0)+delta*5,0,100);
      } else if(id==='eventInvert' && !modifiers.shift) {
        const notes=[...event.snapshot.notes].sort((a,b)=>a-b);
        let inversion=stepInversion(event);
        for(let n=0;n<Math.min(8,Math.abs(delta));n++) {
          if(delta>0){const next=notes[0]+12;if(next>127)break;notes.shift();notes.push(next);}
          else {const next=notes[notes.length-1]-12;if(next<0)break;notes.pop();notes.unshift(next);}
          inversion+=Math.sign(delta);notes.sort((a,b)=>a-b);
        }
        event.snapshot.notes=notes;event.snapshot.inversion=inversion;
      } else if(id==='eventOctave' || (id==='eventInvert' && modifiers.shift)) {
        const offset=12*clamp(delta,-10,10),notes=event.snapshot.notes.map(n=>n+offset);
        if(notes.every(n=>n>=0&&n<=127))event.snapshot.notes=notes;
      } else if(id==='eventExtension') {
        const current=PAD_EXTENSIONS.indexOf(stepEditExtension);
        stepEditExtension=PAD_EXTENSIONS[clamp(Math.max(0,current)+delta,0,PAD_EXTENSIONS.length-1)];
        stepExtensions[stepEvent]=stepEditExtension;
        const saved=stepSaved[stepEvent]??normalizeStep(event,true);
        if(stepEditExtension==='AUTO') {
          const restored=normalizeStep({...saved,snapshot:{...saved.snapshot,strumMs:event.snapshot.strumMs},timing:event.timing,performance:event.performance,more:event.more});
          if(stepEvent)lane()[stepEdit].more[stepEvent-1]=restored;else lane()[stepEdit]=restored;
        } else {
        const chord=buildPadChord({...settings,key:event.snapshot.key,scaleId:event.snapshot.scaleId},0,{customChord:event,extensionName:stepEditExtension});
        // Preserve the saved register, not today's global chord octave.
        const base={...settings,key:event.snapshot.key,octave:0,voiceLead:false};
        const notes=chordNotes(chord,base),offset=12*Math.round((event.snapshot.notes[0]-notes[0])/12);
        const shifted=notes.map(n=>n+offset);
        if(shifted.every(n=>n>=0&&n<=127)){
          const edited=normalizeStep({...chord,timing:event.timing,performance:event.performance,snapshot:{...event.snapshot,notes:shifted},more:event.more});
          if(stepEvent)lane()[stepEdit].more[stepEvent-1]=edited;else lane()[stepEdit]=edited;
        }
        }
      }
      syncSlots();markSave();focused=index;const cell=cells()[index];describe(`${cell.fullLabel}: ${cell.fullValue}`);return;
    }
    if(id==='record'){setRecord(delta>0);return;}
    if(id==='rate'&&recordArmed){setRecord(false);}
    if(id==='bassEnabled'&&recordArmed){setRecord(false);}
    if (id === 'ideasEnabled') { setIdeas(delta > 0); return; }
    if(id==='approachMode'||id==='leadRegister'){
      settings[id]=id==='approachMode'?(delta>0?'profile':'basic'):(delta>0?'center':'free');
      if(id==='approachMode'&&ideasEnabled)newIdeas(ideasSource);
      markSave();focused=index;ledsDirty=true;describe((id==='approachMode'?'Approach: ':'LEAD register: ')+settings[id].toUpperCase());return;
    }
    if(id==='bassPads'){
      if(chordHeld.some(Boolean)||melodyHeld.some(Boolean)||bassOnlyHeld.size){describe('Release pads before switching');return;}
      if(recordArmed){describe('Stop recording before switching');return;}
      settings.bassPads=delta>0;
      for(const [owner,v] of [...voices])if(v.kind==='melody'||v.kind==='bass')stop(owner);
      pedal('bass',false);pedal('melody',false);gestureBass=null;
      markSave();focused=index;ledsDirty=true;describe('Right pads: '+(settings.bassPads?'BASS':'MELODY'));return;
    }
    if(id==='smartBass') {
      if(settings.bassPads){describe('Use right pads for bass');return;}
      const bass=voices.get(LIVE_BASS_OWNER);
      const harmony=[...voices.values()].find(v=>!v.audition&&['bank','idea'].includes(v.kind)&&v.index===active.index&&v.kind===active.kind);
      if(!settings.bassEnabled || !bass || !harmony || bass.pedaled) {describe('Hold chord + bass');return;}
      const anchor=bassNotes({...harmony.chord,bassMode:'root'},settings)[0];
      const options=smartBassChoices(harmony.chord,settings,{previous:bass.notes[0],min:Math.max(0,anchor-12),max:Math.min(127,anchor+12)});
      if(!options.length)return;
      const current=options.findIndex(c=>c.pitchClass===bass.notes[0]%12);
      const next=options[clamp((current<0?0:current)+delta,0,options.length-1)];
      if(next.note===bass.notes[0])return;
      gestureBass=next.note;
      if(settings.bassSustain==='pedal'){stop(LIVE_BASS_OWNER);pedal('bass',false);}
      play(LIVE_BASS_OWNER,[next.note],bass.velocity,{kind:'bass',chord:harmony.chord});
      if(bass.sustained)release(LIVE_BASS_OWNER);
      recordBass(bassGesture.inspect().anchor??active.index);
      focused=index;describe('Smart Bass '+bassNoteName(next.note));return;
    }
    if (id === 'ideasNew') { newIdeas(active.chord,true); return; }
    if(id==='ideasMode') {
      const modes=['next','to','alt'];
      const value=modes[clamp(modes.indexOf(settings.ideasMode)+(delta>0?1:-1),0,2)];
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
    if (id === 'capture') { if(delta>0)captureRecent(); return; }
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
    else if (id === 'extension') {value = EXTENSION_ORDER[clamp(EXTENSION_ORDER.indexOf(editing.extension) + delta, 0, EXTENSION_ORDER.length - 1)];if(!perPad)settings.extensionProfile='global';}
    else if (id === 'melodyMode') value = MELODY_MODES[clamp(MELODY_MODES.indexOf(settings.melodyMode) + delta, 0, 4)];
    else if (id === 'melodySoloType') value = ['auto','major','minor'][clamp(['auto','major','minor'].indexOf(settings.melodySoloType)+Math.sign(delta),0,2)];
    else if (id === 'melodyAdapt') {
      const level=clamp((settings.melodyAdapt?settings.melodyAdaptTarget?2:1:0)+Math.sign(delta),0,2);
      value=level>0;settings.melodyAdaptTarget=level===2;
    }
    else if (id === 'melodyFollow') value = delta > 0 ? 'nearest' : 'pad';
    else if (id === 'arpClock') value = delta > 0 ? 'free' : 'sync';
    else if (id.endsWith('Sustain')) value = sustainModes[clamp(sustainModes.indexOf(settings[id])+delta,0,2)];
    else if (['chordExpression','bassExpression','melodyExpression'].includes(id)) value=['off','poly','cc1','cc11'][clamp(['off','poly','cc1','cc11'].indexOf(settings[id])+delta,0,3)];
    else if (/^(bass|melody)ExpressionMin$/.test(id)) value=clamp(settings[id]+delta,0,settings[id.replace('Min','Max')]);
    else if (/^(bass|melody)ExpressionMax$/.test(id)) value=clamp(settings[id]+delta,settings[id.replace('Max','Min')],127);
    else if (id === 'expressionMin') value=clamp(settings.expressionMin+delta,0,settings.expressionMax);
    else if (id === 'expressionMax') value=clamp(settings.expressionMax+delta,settings.expressionMin,127);
    else if (id === 'divisi') value=delta>0;
    else if (/^ensemble[0-7]$/.test(id)) value=clamp(settings.ensembleChannels[Number(id.slice(-1))]+delta,0,15);
    else if (id === 'voiceLead') {
      // LEAD OFF / CNTR / FREE: the register only matters while leading.
      const modes=['off','center','free'],next=modes[clamp(modes.indexOf(settings.voiceLead?settings.leadRegister:'off')+Math.sign(delta),0,2)];
      if(next!=='off')settings.leadRegister=next;
      value=next!=='off';
    }
    else if (['ensembleSmooth', 'melodyAdapt', 'melodyAftertouch', 'melodyRetrigger', 'autoSustain', 'bassEnabled', 'bassGesture', 'arpEnabled', 'arpHold', 'lockInversion'].includes(id)) value = delta > 0;
    else if (['route', 'previewRoute', 'melodyRoute', 'bassRoute', 'arpRoute'].includes(id)) value = ROUTES[wrap(ROUTES.indexOf(settings[id]) + delta, ROUTES.length)];
    else {
      const ranges = { color: [0, 2], inversion: [0, 3], spread: [0, 2], octave: [-3, 3],
        melodyOctave: [-3, 3], bassOctave: [BASS_OCTAVE_MIN, BASS_OCTAVE_MAX],
        stepVelocity: [1, 127], channel: [0, 15], melodyChannel: [0, 15], bassChannel: [0, 15],
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
      else if (/^(bass|melody)Expression(Min|Max)?$/.test(id) || /^ensemble[0-7]$/.test(id) || ['chordExpression','expressionMin','expressionMax','ensembleSmooth', 'divisi', 'route', 'previewRoute', 'melodyRoute', 'bassRoute', 'channel', 'melodyChannel', 'bassChannel'].includes(id)) {
        clearLive(); send({ op: 'panic' }); config(); syncSlots();
      } else if (id === 'rate' || id === 'gate') config();
      else if (id === 'stepVelocity') syncSlots();
      else {
        if (before.octave !== settings.octave) lastVoicing = lastVoicing.map(n => n + (settings.octave - before.octave) * 12);
        config();
        refreshHarmony(settings.melodyOctave - before.melodyOctave,
          before.melodyMode !== settings.melodyMode || before.melodyAdapt !== settings.melodyAdapt || before.melodySoloType !== settings.melodySoloType || before.melodyAdaptTarget !== settings.melodyAdaptTarget ||
          (active.kind !== 'slot' && (before.key !== settings.key || (settings.melodyMode === 'scale' && before.scaleId !== settings.scaleId))));
      }
      markSave();
    }
    if (forced) return;
    focused = index;
    const cell = cells()[index];
    describe(id==='padInversion'?`INV ${cell.value} | Shift:AUTO`:id === 'route' && !cell.id ? 'Sequence uses C.OUT' : `${cell.fullLabel}: ${cell.fullValue}`);
    controlDetail = true;
  }
  function shift(held) {
    if(shiftDown!==(!!held&&!parked)){shiftDown=!!held&&!parked;ledsDirty=true;}
    if(parked && held)return;
    if(trackView>=0)return; // Shift remains a pad/step modifier in track views.
    const next=!!held && !!extraPages[pages[page]] && editIndex<0 && stepEdit<0 && modifierEditIndex<0 && !ideasView;
    if(next===extraHeld)return;
    extraHeld=next;expressionView=false;touch=-1;focused=-1;detailTicks=0;controlDetail=false;dirty=true;
    repaint();
  }
  function changePage(delta = 1) {
    if(clipView)return;
    if(extraHeld) {
      if(['PLAY','CHORDS'].includes(pages[page]) && Math.trunc(delta)) {
        expressionView=!expressionView;touch=-1;focused=-1;detailTicks=0;dirty=true;repaint();
      }
      return; // Extra-page browsing never moves its parent tab.
    }
    if (!Math.trunc(delta)) return;
    if (editIndex >= 0 || stepEdit>=0 || modifierEditIndex>=0) return; // Contextual editors stay until explicitly closed.
    trackView=-1;trackPage=0;quickView=null;
    ledsDirty = true;
    if (ideasView) { ideasView=false; setIdeas(false); focused=-1; touch=-1; describe('PLAY'); return; }
    const nextPage = wrap(page + Math.trunc(delta), pages.length);
    if (nextPage !== page) setIdeas(false);
    page = nextPage; focused = -1; touch = -1;
    describe(currentPage());
  }
  // Hardware browsing is contextual; changePage remains direct registry navigation.
  function browse(delta=1) {
    if(extraHeld){changePage(delta);return;}
    if(clipView || editIndex>=0 || stepEdit>=0 || modifierEditIndex>=0 || !Math.trunc(delta))return;
    const here=mainPage();
    quickView=null;
    if(trackView>=0)trackPage=wrap(trackPage+Math.trunc(delta),trackPages[trackView].length);
    else {
      const i=mainPages.indexOf(here),next=mainPages[wrap((i<0?0:i)+Math.trunc(delta),mainPages.length)];
      if(MAIN_VIEWS.includes(next)){page=pages.indexOf('PLAY');quickView=next;}
      else page=pages.indexOf(next);
      ideasView=false;setIdeas(false);
    }
    focused=-1;touch=-1;controlDetail=false;ledsDirty=true;describe(currentPage());
  }
  function mainButton(pressed=true) {
    if(!pressed){mainHeld=false;return;}
    if(mainHeld||parked)return;
    mainHeld=true;
    if(features.includes('editableModifiers') && modifierEditIndex<0 && [...modifierDown].some(i=>settings.modifierAssignments[i]==='borrow')){
      borrowLocked=!borrowLocked;
      for(let i=heldModifiers.length-1;i>=0;i--)if(settings.modifierAssignments[heldModifiers[i]]==='borrow')heldModifiers.splice(i,1);
      if(ideasEnabled)newIdeas(ideasSource);
      ledsDirty=true;describe(borrowLocked?'BORROW locked':'BORROW off: next chord');return;
    }
    browse(1);
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
    if(!hasClips) next={...next,running:false,armed:false,event:-1,slot:-1,loop_sounding:false,bass_sounding:false};
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
    if(clipView) {
      const values=Array.from({length:32},(_,i)=>({note:68+i,role:'off'}));
      CLIP_PARTS.forEach((part,row)=>{
        const bank=clips.parts[part],pending=pendingClips[part];
        bank.clips.forEach((c,i)=>{values[CLIP_ROWS[row]+i-68].role=!c.events.some(Boolean)?'off':
          pending && c.id===pending.id?'selected':c.id===bank.selected?'held':'stored';});
      });
      values[CLIP_STOP_PAD-68].role='stop';
      appendStepLeds(values);return values;
    }
    const values = Array.from({ length: 32 }, (_, i) => ({ note: 68 + i, role: 'off' }));
    CHORD_PADS.forEach((note, i) => { values[note - 68].role = voices.has(i) || bassGesture.inspect().held.includes(i) || bassOnlyHeld.has(i) ? 'held'
      : ideasEnabled ? !ideas[i] ? 'off' : ideas[i].outside ? 'color' : 'chord'
      : editIndex === i ? 'selected' : overrides[i] ? 'stored' : bank[i].source === 'diatonic' ? 'chord' : 'color'; });
    MODIFIER_PADS.forEach((note, i) => {
      values[note - 68].role = i===modifierEditIndex?'selected':settings.modifierAssignments[i]==='off'?'off':settings.modifierAssignments[i]==='borrow' && borrowLocked ? 'borrowLocked' : heldModifiers.includes(i) ? 'held' : 'color';
    });
    values[STOP_PAD - 68].role = stopHeld ? 'stopHeld' : 'stop';
    const harmony = melodyContext();
    const pitches = settings.bassPads?bassPadPitches():melodyNotes(active.chord, harmony);
    const root = wrap(harmony.key + active.chord.rootOffset, 12);
    const chordPcs = new Set(active.chord.intervals.map(n => wrap(n + root, 12)));
    const scalePcs = new Set((['pentatonic','blues'].includes(settings.melodyMode)?soloScaleIntervals(harmony):adaptiveScaleIntervals(active.chord, harmony)).map(n => wrap(n + harmony.key, 12)));
    MELODY_PADS.forEach((note, i) => {
      // Note ownership (including HOLD) must never obscure harmonic meaning.
      values[note - 68].role = !Number.isInteger(pitches[i]) ? 'off'
        : pitches[i] % 12 === root ? 'root'
        : chordPcs.has(pitches[i] % 12) ? 'chordTone'
        : scalePcs.has(pitches[i] % 12) ? 'scaleTone' : 'chromatic';
    });
    appendStepLeds(values);
    values.push({ note: 52, button: true, role: publicBuild ? 'off' : capture ? 'on' : 'dim' });
    values.push({ note:118,button:true,role:recordArmed?countPending&&countStep%2!==0?'dim':'record':hasRecording?'dim':'off' });
    values.push({ note: 85, button: true, role: dsp.running ? 'chord' : armed ? 'dim' : 'off' });
    return values;
  }
  function appendStepLeds(values) {
    stepLeds(values);
    // The printed icons under the steps (CC 16-31) mark Shift shortcuts, as on Move.
    for(let i=0;i<STEP_COUNT;i++)values.push({note:16+i,button:true,role:shiftDown&&shiftStepAvailable(SHIFT_STEPS[i])?'icon':'off'});
  }
  function stepLeds(values) {
    if(features.includes('buttonLights')) {
      const part=stepPart(),clip=clipView?editingClip(part):selectedClip(clips,part);
      const buttons={51:'dim',49:'dim',50:clipView?'on':'dim',88:mutedParts.some(Boolean)?'on':'dim',
        56:undoTake?'dim':'off',119:clipView||clip.events.some(Boolean)?'dim':'off',60:clipView?'dim':'off',
        62:stepEdit>=0||stepPages[part]>0?'dim':'off',63:stepEdit>=0||stepPages[part]<clip.length/16-1?'dim':'off',
        58:loopHeld?'on':'dim',
        55:settings.octave<3?'dim':'off',54:settings.octave>-3?'dim':'off'};
      if(clipView)buttons[118]=recordArmed?'record':'dim';
      for(const [note,role] of Object.entries(buttons))values.push({note:Number(note),button:true,role});
    }
    if(features.includes('trackNavigation'))for(let i=0;i<3;i++)values.push({note:43-i,button:true,role:mutedParts[i]?'off':(clipView?clipPart===CLIP_PARTS[i]:trackView===i)?'on':'dim'});
    const stepLane=stepPart(),stepClock=readClock(stepLane);
    const displayed=clipView?editingClip(stepLane):selectedClip(clips,stepLane);
    const isPlaying=displayed.id===clips.parts[stepLane].selected;
    const playhead=stepClock.ready?Math.floor(stepClock.beat/STEP_BEATS[partRate(stepLane)])%selectedClip(clips,stepLane).length:dsp.slot;
    // While Shift is held the step shows its setting: dark off, lit on, METRO blue/red.
    if(shiftDown){
      for(let i=0;i<STEP_COUNT;i++){const action=SHIFT_STEPS[i];
        values.push({note:16+i,role:!shiftStepAvailable(action)||!shiftStepOn(action)?'off'
          :action==='metro'?settings.metronome==='rec'?'metroRec':'metroOn':'lit'});}
      return;
    }
    if(loopHeld&&hasClips){
      for(let i=0;i<STEP_COUNT;i++)values.push({note:16+i,role:i<displayed.length/16?'selected':i<4?'tail':'off'});
      return;
    }
    // Steps a note still sounds through are lit faintly, as on Move.
    const tail=new Set();
    displayed.events.forEach((cell,position)=>cellEvents(cell).forEach(e=>{
      const end=position+Math.ceil(e.performance?.duration??eventSteps(e));
      for(let n=position+1;n<Math.min(end,displayed.length);n++)tail.add(n);
    }));
    for (let i = 0; i < STEP_COUNT; i++) {
      const position=i+stepPages[stepLane]*16,event=displayed.events[position];
      values.push({note:16+i,role:!hasClips?'off':isPlaying&&dsp.running&&playhead===position?'held':event?(selectedSlot===position?'selected':'stored'):tail.has(position)?'tail':'off'});
    }
  }
  function keyFunction() {
    const harmony=context(),scale=SCALES.find(s=>s.id===harmony.scaleId)||SCALES[0],degree=degreeName(active.chord,harmony);
    const full=`${noteName(harmony.key)} ${scale.name} | ${degree}`;
    return full.length<=21?full:`${noteName(harmony.key)} ${scale.short} | ${degree}`;
  }
  function buildModel() {
    if(clipView&&captureReview)return {pageName:'CAPTURE',pageIndex:0,pageCount:1,chordLabel:'REVIEW',cells:cells(),focused,
      detail:detailTicks>0||touch>=0?detail:'Back: keep original clips'};
    if(clipView && stepEdit<0) {
      const c=editingClip(),number=clips.parts[clipPart].clips.indexOf(c)+1;
      return {pageName:'CLIPS',pageIndex:0,pageCount:1,chordLabel:clipPart.toUpperCase()+' '+number,cells:cells(),focused,
        clipGrid:CLIP_PARTS.map(part=>{const bank=clips.parts[part],pending=pendingClips[part];return {
          part,items:Array.from({length:8},(_,i)=>{const c=bank.clips[i];return {
            data:!!c?.events.some(Boolean),selected:!!c && c.id===bank.selected,
            editing:!!c && part===clipPart && c.id===editingClip().id,
            pending:!!c && !!pending && c.id===pending.id};})};}),
        detail:detailTicks>0||touch>=0?detail:`CNT ${settings.countIn?'1 BAR':'OFF'} | METRO ${settings.metronome.toUpperCase()}`,recordTarget:recordArmed?settings.recordPart:null};
    }
    const notes = [...voices.values()].flatMap(voice => voice.notes);
    const event=Number.isInteger(dsp.event)?dsp.event:dsp.slot;
    if (dsp.loop_sounding && runtimeChords[event]) notes.push(...runtimeChords[event].event.snapshot.notes);
    if(dsp.bass_sounding) {
      if(bassFromClip() && runtimeBass[dsp.be])notes.push(runtimeBass[dsp.be].event.note);
      else if(!bassFromClip() && runtimeChords[event]?.event.snapshot.bass>=0)notes.push(runtimeChords[event].event.snapshot.bass);
    }
    const sounding = [...new Set(notes)].sort((a, b) => a - b);
    const harmony = context();
    const scale = SCALES.find(s => s.id === melodyContext().scaleId) || SCALES[0];
    const pageName = currentPage();
    const defaultDetail = stepEdit>=0 ? 'Release step: back' : editIndex >= 0 ? 'Shift+pad: exit EDIT'
      : modifierEditIndex>=0 ? 'Knob 1: FUNC | Back'
      : ['SCALE','SETUP','STRUM'].includes(pageName) && quickView ? 'Back: close'
      : pageName === 'MOD PADS' ? 'Layout matches pads'
      : pageName === 'EXT PROF' ? 'Degree edit -> CUSTOM'
      : pageName === 'CHORDS' ? trackView>=0?'Jog: more | Shift+pad':'Shift+pad: edit chord'
      : pageName === 'STRUM' ? trackView>=0?'Jog:more | Back:PLAY':'Release Shift: back'
      : ['M.EXTRA','B.EXTRA','EXPR'].includes(pageName) ? trackView>=0?'Jog:more | Back:PLAY':'Release Shift: back'
      : pageName === 'ENSEMBL' ? new Set(settings.ensembleChannels).size<8 ? 'Shared channels' : settings.ensembleSmooth ? 'Stable voice channels' : 'V1 low -> V8 high'
      : pageName === 'IDEAS' ? ideasEnabled ? ideaSelected >= 0 ? active.ideaReason || ideas[ideaSelected]?.reason : settings.ideasMode==='to'?'TO '+chordName(ideasTarget(),settings):'FROM ' + chordName(ideasSource, settings) : 'Turn IDEAS on to try'
      : pageName === 'MELODY' ? `${noteName(harmony.key)} ${scale.short} | ${settings.melodyMode === 'scale' && settings.melodyAdapt ? 'ADAPT' : 'MELODY'}`
      : pageName === 'BASS' ? recordArmed?'REC '+settings.recordPart.toUpperCase()+' | BASS steps':settings.bassPads?'Left: chord | Right: bass':trackView===1?'BASS only: pad roots':'Hold step: edit bass'
      : pageName === 'SEQ' ? `${lane().filter(Boolean).length}/${lane().length} | ${recordArmed?(dsp.running?'REC':'REC WAIT'):dsp.running ? 'PLAY' : armed ? 'ARMED' : 'OFF'}${settings.countIn?' | CNT':''}`
      : pageName === 'MIDI' ? sharedPedalChannel() ? 'CC64: shared channel' : publicBuild ? 'Routes and channels' : 'Shift: ensemble'
      : ['ARP','A.CLOCK'].includes(pageName) ? settings.arpClock === 'free' ? `FREE ${settings.arpBpm} BPM | pad` : 'SYNC | Move Play'
      : degreeName(active.chord, context());
    const editing = editIndex >= 0;
    const map = !editing && stepEdit<0 && (pageName === 'PLAY' || (pageName === 'IDEAS' && ideasEnabled))
      ? { selected: pageName === 'IDEAS' ? ideaSelected : active.kind === 'bank' && voices.has(active.index) ? active.index : -1,
          items:Array.from({length:8},(_,i)=>inputPreview(i)) } : null;
    const mods = modifierState();
    const mapMode = [mods.borrow ? borrowLocked ? 'BORROW LOCK' : 'BORROW' : '',mods.ii?'II':mods.dom?'DOM':mods.sub?'SUB':'',mods.flip?'M/m':'',mods.sus?'SUS'+mods.sus:'',mods.seventh?modifierLabel(mods.seventh):'',mods.add9?'ADD9':''].filter(Boolean).join(' ');
    return {
      pageName: stepEdit>=0?`${seqPart==='melody'?'M':seqPart==='bass'?'B':'C'}.STP${stepEdit+1}`:editing ? `EDIT ${editIndex + 1}` : publicBuild&&pageName==='CHORDS'?'CHORD':currentPage(), pageIndex: editing || stepEdit>=0 || ideasView ? 0 : page, pageCount: editing || stepEdit>=0 || ideasView ? 1 : pages.length,
      borrowLocked,
      ...(modifierEditIndex>=0?{pageName:'MOD '+(modifierEditIndex+1),pageIndex:0,pageCount:1}:trackView>=0 && !editing && stepEdit<0 ? {pageIndex:trackPage,pageCount:trackPages[trackView].length} : !editing && stepEdit<0 && !ideasView ? {pageIndex:Math.max(0,mainPages.indexOf(mainPage())),pageCount:mainPages.length} : {}),
      extraLayer: extraHeld && !!extraPages[pages[page]] && !editing && stepEdit<0,
      chordLabel: stepEdit>=0 ? seqPart!=='chord'?bassNoteName(editedEvent()?.note??0):harmonyLabel(editedEvent(),editedEvent()?.snapshot.notes,true)
        : editing ? harmonyLabel(bank[editIndex], undefined, true) : harmonyLabel(active.chord, active.notes), degreeLabel: degreeName(active.chord, context()),
      transport: dsp.running ? 'PLAY' : armed ? 'WAIT' : 'OFF',
      recordTarget:recordArmed?settings.recordPart:null,recordCount:countPending?countLabel:null,
      cells: cells(), focused, detail: pageName === 'PLAY' && !editing && stepEdit<0
        // The header names the chord; the footer gives its key and function.
        ? stopHeld ? 'STOP - all notes off'
          : controlDetail && (detailTicks > 0 || touch >= 0) ? detail
          : mapMode || keyFunction()
        : detailTicks > 0 || touch >= 0 ? detail : defaultDetail,
      ...(map ? {chordMap:map,...(pageName==='IDEAS'?{ideaView:map}:{})} : {}),
      ...(currentPage() === 'THEORY' ? { theory: { notes: sounding, root: wrap(context().key + active.chord.rootOffset, 12),
        degree: degreeName(active.chord, context()), source: active.chord.source } } : {}),
    };
  }
  function model() {
    const view=buildModel();
    const muted=mutedParts.map((yes,i)=>yes?['C','B','M'][i]:'').filter(Boolean).join('/');
    return muted?{...view,detail:`MUTE ${muted} | ${view.detail||''}`} : view;
  }
  function repaint(force = false) {
    if (force) { dirty = true; ledsDirty = true; io.forceLeds?.(); }
    if (parked) return;
    // The chain editor owns the screen during co-run; it repaints us on return.
    if (dirty) { if (io.screenAvailable?.() !== false) io.render?.(model()); dirty = false; }
    if (ledsDirty) { io.leds?.(ledModel()); ledsDirty = false; }
  }
  // The DSP clicks on Move's beat; ON while Move plays, REC once a take records.
  function syncMetronome() {
    if(!hasClips)return;
    // REC stays enabled through the count-in so the first downbeat after it clicks.
    sendState({op:'metro',enabled:+(settings.metronome==='on'||(settings.metronome==='rec'&&recordArmed)),velocity:settings.metroVolume});
  }
  function tick(nextDsp, isParked = false) {
    if(isParked)stopCapturePreview();else tickCapturePreview();
    if(recordLimit){setRecord(false);recordLimit=false;describe('REC: event limit');}
    if(recordArmed){const clock=recordClock('chord'),b=recordClock('bass'),m=recordClock('melody');commitTake(recorder.observe(clock.beat,clock.ready));commitBassTake(bassRecorder.observe(b.beat,b.ready));melodyRecorders.forEach(r=>commitMelodyTake(r.observe(m.beat,m.ready)));}
    if (isParked !== parked) {
      parked = isParked;
      if (parked) {loopHeld=false;lengthSteps.clear();stepCopy=null;captureReview=null;clipView=false;clipPadDown.clear();for(const part of CLIP_PARTS)delete pendingClips[part];extraHeld=false;touch=-1;focused=-1;setRecord(false);clearLive();history.clear(); setIdeas(false); stopHeld = false; save(); }
      else { dirty = true; ledsDirty = true; io.forceLeds?.(); }
    }
    if (nextDsp) poll(nextDsp);
    if(!parked&&hasClips)updateClipQueue();
    flushPressure();
    flushChordExpression();
    syncMetronome(); // cached: sends only when ON/REC state changes
    if (saveTicks > 0 && --saveTicks === 0) save();
    if (touch < 0 && detailTicks > 0 && --detailTicks === 0) { focused = -1; dirty = true; }
    repaint();
  }
  function panic() {
    stopCapturePreview();if(captureReview)captureReview.preview=false;
    clipTransfer=null;
    clearLive(); ideaSelected = -1; setArm(false); send({ op: 'kill' }); focused = -1; touch = -1; describe('STOP - all notes off');
  }
  // Shift + step shortcuts follow Move's own layout where one exists (step
  // numbers): 3 workflow, 6 metronome, 7 groove, 8 pad layout, 9 scale,
  // 14 new clip, 16 quantize. Step 13 stays Schwung's tool menu. Keys are
  // zero-based step indices.
  const SHIFT_STEPS=Object.freeze({1:'midi',2:'setup',4:'tempo',5:'metro',6:'strum',7:'rightPads',8:'scale',9:'fullVelocity',10:'arp',13:'newClip',14:'double',15:'quantize'});
  function shiftStepOn(action) {
    return action==='metro'?settings.metronome!=='off':action==='strum'?settings.strumMs>0:action==='rightPads'?settings.bassPads
      :action==='fullVelocity'?settings.fullVelocity:action==='arp'?settings.arpEnabled:action==='scale'?quickView==='SCALE':action==='setup'?quickView==='SETUP'
      :action==='midi'?!clipView&&!quickView&&trackView<0&&pages[page]==='MIDI'
      :action==='quantize'?quantizeTargets().every(c=>(c.quantize??0)>0):false;
  }
  // PLAY quantizes every part's active clip; a track, SEQ or CLIPS only its own.
  function quantizeTargets() {
    if(clipView)return [editingClip()];
    if(trackView>=0)return [selectedClip(clips,CLIP_PARTS[trackView])];
    if(pages[page]==='SEQ')return [selectedClip(clips,seqPart)];
    return CLIP_PARTS.map(p=>selectedClip(clips,p));
  }
  function shiftStepAvailable(action) {
    return !!action && (action!=='arp'||!publicBuild) && (hasClips||!['setup','newClip','double','quantize','metro'].includes(action));
  }
  function shiftStep(index) {
    if(parked||!Number.isInteger(index)||index<0||index>=STEP_COUNT)return;
    lengthSteps.add(index); // its release is not a step release
    const action=SHIFT_STEPS[index];
    if(!shiftStepAvailable(action))return;
    if(modifierEditIndex>=0||editIndex>=0||stepEdit>=0||captureReview){notice('Close editor first');return;}
    if(action==='midi'){
      if(clipView)closeClips();quickView=null;trackView=-1;trackPage=0;ideasView=false;setIdeas(false);
      page=pages.indexOf('MIDI');focused=-1;touch=-1;ledsDirty=true;notice('MIDI: routes+channels');return;
    }
    if(action==='setup'){
      if(clipView)closeClips();
      quickView=quickView==='SETUP'?null:'SETUP';focused=-1;touch=-1;ledsDirty=true;dirty=true;notice(quickView?'SETUP: Back closes':currentPage());return;
    }
    if(action==='tempo'){
      if(publicBuild||clipView){notice('Tempo: set in Move');return;}
      // OKTONIK follows Move's tempo; ARP's free clock is its only own tempo.
      quickView=null;trackView=-1;page=pages.indexOf('ARP');extraHeld=shiftDown;focused=-1;ledsDirty=true;notice('FREE tempo: A.CLOCK');return;
    }
    if(action==='metro'){
      const modes=['off','on','rec'];settings.metronome=modes[(modes.indexOf(settings.metronome)+1)%3];
      syncMetronome();markSave();ledsDirty=true;notice('METRO: '+settings.metronome.toUpperCase());return;
    }
    // Opens/closes the STRUM menu; knob 5 there turns strum on and off.
    if(action==='strum'){
      if(clipView)closeClips();
      quickView=quickView==='STRUM'?null:'STRUM';focused=-1;touch=-1;ledsDirty=true;dirty=true;
      notice(quickView?(settings.strumMs?`STRUM ${settings.strumMs}ms`:'STRUM OFF: knob 5'):currentPage());return;
    }
    if(action==='rightPads'){
      if(!settings.bassEnabled&&!settings.bassPads){notice('Enable BASS first');return;}
      knob(-1,settings.bassPads?-1:1,{},{id:'bassPads'});controlDetail=true;return;
    }
    if(action==='scale'){
      if(clipView)closeClips();
      quickView=quickView==='SCALE'?null:'SCALE';focused=-1;touch=-1;ledsDirty=true;dirty=true;notice(quickView?'SCALE: Back closes':currentPage());return;
    }
    if(action==='fullVelocity'){
      settings.fullVelocity=!settings.fullVelocity;markSave();ledsDirty=true;notice('FULL VEL '+(settings.fullVelocity?'ON':'OFF'));return;
    }
    if(action==='arp'){
      knob(-1,settings.arpEnabled?-1:1,{},{id:'arpEnabled'});ledsDirty=true;notice('ARP '+(settings.arpEnabled?'ON':'OFF'));return;
    }
    const part=clipView?clipPart:stepPart(),clip=clipView?editingClip():selectedClip(clips,part);
    if(action==='newClip'){
      const bank=clips.parts[part],empty=Array.from({length:8},(_,i)=>i).find(i=>!bank.clips[i]||(!bank.clips[i].events.some(Boolean)&&!bank.clips[i].tail?.some(Boolean)&&bank.clips[i].id!==bank.selected));
      if(empty===undefined){notice('No empty clip');return;}
      const viewPart=clipPart;clipPart=part;chooseClip(empty);if(!clipView)clipPart=viewPart;
      if(!recordArmed&&!clipTransfer)notice(`${part.toUpperCase()} clip ${empty+1}`);return;
    }
    const busy=recordArmed||clipTransfer||(armed&&readClock().ready&&clip.id===clips.parts[part].selected);
    if(action==='double'){
      if(busy){notice('Stop SEQ to double');return;}
      if(clip.length>=64){notice('Max 64 steps');return;}
      const length=clip.length,before=clone(clips.parts[part]),copy=clone(clip.events);
      // The DSP holds one slot per step plus every extra attack, 128 in all.
      const extras=copy.reduce((n,c)=>n+(c?.more?.length||0),0);
      if(length*2+extras*2>128||!resizeClip(clip,length*2)){notice('Too many events');return;}
      const shifted=cell=>{if(!cell)return null;const events=cellEvents(cell).map(({more,...e})=>e.performance?{...e,performance:{...e.performance,start:e.performance.start+length}}:e);
        return {...events[0],...(events.length>1?{more:events.slice(1)}:{})};};
      copy.forEach((cell,i)=>{clip.events[length+i]=shifted(cell);});
      if(clip.tail){for(let i=length;i<length*2;i++)clip.tail[i]=null;if(!clip.tail.some(Boolean))delete clip.tail;}
      undoTake={clipEdit:{part,bank:before}};syncSlots();markSave();dirty=true;ledsDirty=true;notice(`Doubled: ${clip.length} steps`);return;
    }
    if(action==='quantize'){
      // All of them quantized: switch off; otherwise apply the SETUP amount to each.
      const targets=quantizeTargets(),on=targets.every(c=>(c.quantize??0)>0);
      for(const c of targets)c.quantize=on?0:settings.quantize;
      syncSlots();markSave();ledsDirty=true;dirty=true;
      notice((on?'QNT OFF':'QNT '+settings.quantize+'%')+(targets.length>1?' all clips':''));return;
    }
  }
  function openClips() {
    if(!hasClips){changePage(1);return;}
    if(parked)return;
    quickView=null;
    if(clipView){closeClips();return;}
    if(editIndex>=0||stepEdit>=0||modifierEditIndex>=0){describe('Close editor for clips');return;}
    if(recordArmed){describe('Stop REC to open clips');return;}
    clearLive();extraHeld=false;ideasView=false;setIdeas(false);editIndex=-1;stepEdit=-1;
    clipPart=({BASS:'bass',MELODY:'melody'})[pages[page]]||'chord';clipView=true;detailTicks=0;dirty=true;ledsDirty=true;repaint();
  }
  function unload() {
    stopCapturePreview();
    clipTransfer=null;
    shift(false);setRecord(false);
    clearLive(); armed = false; send({ op: 'arm', enabled: 0 }); send({ op: 'panic' });
    borrowLocked = false; setIdeas(false);
    for (let attempt = 0; attempt < 3 && dirtySave; attempt++) save();
  }
  function init() {
    stateCache.clear();
    batched(()=>{
      if(features.includes('partMute'))for(let i=0;i<3;i++)send({op:'mute',index:i,enabled:0});
      send({op:'cleargrid'});config(); syncSlots(); syncMetronome(); send({ op: 'arm', enabled: 0 });
    });
    if (loaded.imported) describe('Previous settings read');
    else if (loaded.warnings.length) describe('Settings recovery');
    else if (!moveAvailable) describe('Move route unavailable');
    else describe(`${PRODUCT_NAME}${publicBuild?'':' Lab'} ${PRODUCT_VERSION}`);
    repaint();
  }
  function resume() {
    parked=false;loopHeld=false;lengthSteps.clear();stepCopy=null;
    extraHeld=false;touch=-1;focused=-1;detailTicks=0;controlDetail=false;
    stateCache.clear();
    batched(()=>{config(); syncSlots(); syncMetronome(); send({ op: 'arm', enabled: armed ? 1 : 0 });});
    dirty = true; ledsDirty = true; repaint();
  }
  return { init, resume, pad, pressure, chordPressure, step, knob, focus, shift, changePage, browse, mainButton, pageSteps, octave, tick, repaint, panic, unload, selectEdit, resetEdit, keepVariation,
    mute(index) {
      if(!features.includes('partMute')||parked||!Number.isInteger(index)||index<0||index>2)return;
      const enabled=!mutedParts[index],part=CLIP_PARTS[index];
      if(send({op:'mute',index,enabled:+enabled})===false){describe('Mute failed');return;}
      mutedParts[index]=enabled;
      if(enabled){pedal(part,false);for(const [owner,v] of [...voices])if(partName(v.kind)===part){stop(owner);silencedOwners.add(owner);}}
      controlDetail=true;describe(part.toUpperCase()+(enabled?' MUTED':' ON'));controlDetail=true;
      dirty=true;ledsDirty=true;repaint();
    },
    copyHeld(held){if(!held){clipCopy=null;stepCopy=null;}},
    // Move-style Loop: while held, steps 1/2/4 choose the clip length in bars.
    loop(held){
      if(parked&&held)return;loopHeld=!!held&&hasClips;ledsDirty=true;
      if(loopHeld){const c=clipView?editingClip():selectedClip(clips,stepPart());notice(`LEN ${c.length}: steps 1-4`);}
      repaint();
    },
    // OKTONIK records with Sample; Move's own Record would arm Move instead.
    nativeRecord(){if(parked||!hasRecording)return;notice('REC: use Sample button');},
    track(index) {
      if(!features.includes('trackNavigation') || parked || !Number.isInteger(index) || index<0 || index>2)return;
      modifierEditIndex=-1;extraHeld=false;ideasView=false;setIdeas(false);editIndex=-1;stepEdit=-1;focused=-1;touch=-1;
      if(clipView){clipPart=CLIP_PARTS[index];clipFocus[clipPart]=null;stepPages[clipPart]=0;dirty=true;ledsDirty=true;detailTicks=0;repaint();return;}
      // Pressing the open Track again returns to PLAY, like Back.
      if(trackView===index&&!quickView){trackView=-1;trackPage=0;page=pages.indexOf('PLAY');controlDetail=false;dirty=true;ledsDirty=true;describe('PLAY');repaint();return;}
      trackView=index;trackPage=0;detailTicks=0;controlDetail=false;quickView=null;
      seqPart=['chord','bass','melody'][index];page=pages.indexOf(['CHORDS','BASS','MELODY'][index]);dirty=true;ledsDirty=true;repaint();
    },
    recordContext() {
      if(!hasRecording || parked)return;
      if(!recordArmed && clipView && editingClip().id!==clips.parts[clipPart].selected){describe('Launch edited clip before REC');return;}
      if(!recordArmed) {
        // PLAY records every part; Track 1 follows SETUP C.REC; Tracks 2/3 their own part.
        settings.recordPart=clipView?clipPart:({CHORDS:settings.chordRecord,BASS:'bass',MELODY:'melody'})[pages[page]]||'all';
        if(clipView){page=pages.indexOf({chord:'CHORDS',bass:'BASS',melody:'MELODY'}[clipPart]);trackView=CLIP_PARTS.indexOf(clipPart);trackPage=0;closeClips();}
      }
      setRecord(!recordArmed);
    },
    menu: openClips,
    shiftStep,
    back:()=>{
      if(modifierEditIndex>=0){modifierEditIndex=-1;extraHeld=false;focused=-1;touch=-1;controlDetail=false;ledsDirty=true;describe(currentPage());return true;}
      if(editIndex>=0){selectEdit(-1);return true;}
      if(quickView){quickView=null;focused=-1;touch=-1;ledsDirty=true;describe(currentPage());return true;}
      if(clipView){closeClips();return true;}
      if(stepEdit>=0)return true;
      if(trackView>=0){trackView=-1;trackPage=0;page=pages.indexOf('PLAY');extraHeld=false;focused=-1;touch=-1;controlDetail=false;ledsDirty=true;describe('PLAY');return true;}
      if(extraHeld){shift(false);return true;}
      return false;
    },
    capture: captureRecent,record:()=>setRecord(!recordArmed),undo:()=>{if(hasClips)undo();}, arm: setArm, play: transportPlay,
    inspect: () => ({ mutedParts:[...mutedParts],settings: { ...settings }, progression: progression.map(normalizeStep), bassProgression:bassProgression.map(normalizeBassStep),melodyProgression:melodyProgression.map(normalizeBassStep),seqPart,stepEdit, active: { ...active },
      overrides: overrides.map(normalizeOverride), editIndex, modifierEditIndex, borrowLocked, bank, loopNotes, loopBass,
      bassGesture: { ...bassGesture.inspect(), bass: gestureBass },
      ideasEnabled, ideas: ideas.map(entry => ({ ...entry, chord: normalizeChord(entry.chord) })), ideasSource, ideaSelected,
      modifiers: modifierState(), page, armed, capture,recordArmed,canUndo:!!undoTake,stepPages:{...stepPages},clipView,clipPart,pendingClips:JSON.parse(JSON.stringify(pendingClips)),clipOrigins:{...clipOrigins},clips:JSON.parse(JSON.stringify(clips)), parked, dirtySave, voices: [...voices.entries()], model: model() }) };
}
