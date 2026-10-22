import {
  Black, BrightGreen, Purple, RoyalBlue, VividYellow, White, LightGrey, WhiteLedBright, WhiteLedDim,
  MidiCC, MidiNoteOff, MidiNoteOn,
  MoveBack, MoveCapture, MoveDelete, MoveDown, MoveLoop, MoveMainButton, MoveMainKnob,
  MoveMenu, MoveKnob1, MoveKnob8, MovePads, MovePlay, MoveShift, MoveUp, MoveLeft, MoveRight,
  MoveStep1, MoveStep16, MoveSample, MoveUndo, MoveCopy, BrightRed,
} from '/data/UserData/schwung/shared/constants.mjs';
import { decodeDelta, shouldFilterMessage, setButtonLED, setLED } from '/data/UserData/schwung/shared/input_filter.mjs';
import { announce } from '/data/UserData/schwung/shared/screen_reader.mjs';
import { renderScreen } from './display.mjs';
import { createProjectPilot } from './project.mjs';
import { BUILD_PROFILE, featuresFor } from './profile.mjs';
const uiFeatures=featuresFor(BUILD_PROFILE);
// Move's transport Record (CC86). Not every Schwung constants file exports it.
const MOVE_RECORD = 86;
import { MELODY_PADS, CHORD_PADS } from './pilot.mjs';

// One DSP read per tick: commands invalidate it, so later reads stay fresh.
let tickClock = null;
function sendCommand(command) {
  tickClock = null;
  const payload = JSON.stringify(command);
  if (typeof host_module_set_param_blocking === 'function') {
    return host_module_set_param_blocking('command', payload, 50) === true;
  }
  if (typeof host_module_set_param === 'function') {
    host_module_set_param('command', payload);
    return true;
  }
  return false;
}

// Schwung 1.7+ bulk set: up to 32 key/value pairs in one audio frame, in order.
const BULK_COMMANDS = 32;
const record = text => `${text.length}\n${text}`;
function sendCommands(commands) {
  const bulk = globalThis.host_module_set_params;
  if (typeof bulk !== 'function') return commands.map(sendCommand).every(Boolean);
  tickClock = null;
  let ok = true;
  for (let i = 0; i < commands.length; i += BULK_COMMANDS) {
    const chunk = commands.slice(i, i + BULK_COMMANDS);
    const blob = `${chunk.length * 2}\n` + chunk.map(c => record('command') + record(JSON.stringify(c))).join('');
    if (bulk(blob) !== true) ok = false;
  }
  return ok;
}
function readBulk(keys) {
  const bulk = globalThis.host_module_get_params;
  if (typeof bulk !== 'function') return null;
  const raw = bulk(`${keys.length}\n` + keys.map(record).join(''));
  if (typeof raw !== 'string') return null;
  const values = [];
  let at = raw.indexOf('\n');
  if (at < 0 || Number(raw.slice(0, at)) !== keys.length) return null;
  at++;
  for (let i = 0; i < keys.length; i++) {
    const nl = raw.indexOf('\n', at), length = Number(raw.slice(at, nl));
    if (nl < 0 || !Number.isInteger(length)) return null;
    values.push(raw.slice(nl + 1, nl + 1 + length)); at = nl + 1 + length;
  }
  return values;
}
function parse(raw) { try { return raw ? JSON.parse(raw) : null; } catch (_) { return null; } }
function readClock() {
  if (tickClock) return tickClock;
  try { return JSON.parse(host_module_get_param('clock')); } catch (_) { return null; }
}

function readHostFile(path) {
  return typeof host_read_file === 'function' ? host_read_file(path) : null;
}

function writeHostFile(path, text) {
  return typeof host_write_file === 'function' && host_write_file(path, text) === true;
}

const draw = {
  clear: () => clear_screen(),
  text: (x, y, value, color = 1) => print(x, y, value, color),
  line: (x1, y1, x2, y2, color = 1) => {
    if (x1 === x2) fill_rect(x1, y1, 1, y2 - y1 + 1, color);
    else if (y1 === y2) fill_rect(x1, y1, x2 - x1 + 1, 1, color);
  },
  rect: (x, y, width, height, color = 1) => draw_rect(x, y, width, height, color),
  fill: (x, y, width, height, color = 1) => fill_rect(x, y, width, height, color),
};

const roleColor = {
  off: Black,
  stop: RoyalBlue,
  stopHeld: White,
  borrowLocked: RoyalBlue,
  chord: White,
  chordTone: RoyalBlue,
  scaleTone: White,
  chromatic: LightGrey,
  root: Purple,
  color: VividYellow,
  held: BrightGreen,
  stored: RoyalBlue,
  selected: VividYellow,
  on: WhiteLedBright,
  dim: WhiteLedDim,
  record:BrightRed,
  tail: LightGrey,
  lit: White,
  icon: White,
  metroOn: RoyalBlue,
  metroRec: BrightRed,
};

// Schwung drops LED packets beyond roughly 60 per frame, and a full repaint
// (pads, steps, step icons, buttons) is about 80. Send only changes, at most
// LED_BUDGET per tick; the rest follow on the next ticks.
const LED_BUDGET = 24;
const ledSent = new Map(), ledQueue = new Map();
function paintLeds(updates, force = false) {
  if (force) ledSent.clear();
  for (const update of updates || []) {
    // BACK is owned by the chain editor while co-run is active.
    if(update.button && update.note===MoveBack && chainState())continue;
    const held=uiFeatures.includes('buttonLights') && update.button &&
      ((update.note===MoveShift&&shiftHeld)||(update.note===MoveDelete&&deleteHeld)||
       (update.note===MoveCopy&&copyHeld)||(update.note===88&&muteHeld));
    const color = roleColor[held?'on':update.role] ?? Black;
    const key = (update.button ? 'b' : 'n') + update.note;
    if (ledSent.get(key) === color) { ledQueue.delete(key); continue; }
    ledQueue.set(key, { update, color });
  }
  flushLeds();
}
function flushLeds() {
  if (!ledQueue.size) return;
  let sent = 0;
  // Buttons first: they are few and show modes (REC, Shift, Mute) at once.
  const order = [...ledQueue].sort((a, b) => (b[1].update.button ? 1 : 0) - (a[1].update.button ? 1 : 0));
  for (const [key, { update, color }] of order) {
    if (sent++ >= LED_BUDGET) break;
    if (update.button) setButtonLED(update.note, color, true);
    else setLED(update.note, color, true);
    ledSent.set(key, color); ledQueue.delete(key);
  }
}

function hostSupportsMove() {
  // Newer Schwung hosts expose the dedicated active-injection callback. On
  // older hosts with no overtake-input probe, the DSP callback is still the
  // authoritative route and should remain enabled by default.
  if (typeof shadow_overtake_move_inject_active === 'function') return true;
  if (typeof shadow_inbound_pad_midi_active !== 'function') return true;
  try {
    const version = typeof host_read_file === 'function'
      ? String(host_read_file('/data/UserData/schwung/host/version.txt') || '').trim()
      : '';
    const match = version.match(/^v?(\d+)\.(\d+)\.(\d+)/);
    return Boolean(match && Number(match[1]) === 0 && Number(match[2]) < 12);
  } catch (_error) {
    return false;
  }
}

let shiftHeld = false;
let muteHeld = false;
let deleteHeld = false;
let copyHeld = false;
let pilot;
let forceLedPaint = true;
let chainVisit = false;
let chainNotice = 0;
let chainAttempt = 0;
let chainTraceTicks = 0;
// Lab-only, bounded markers. No file writes, MIDI, state dumps or pressure logs.
// Uses Schwung's existing debug flag; logging failure must not affect playing.
function traceChain(stage) {
  if (BUILD_PROFILE !== 'lab') return;
  try {
    if (typeof unified_log === 'function') unified_log('oktonik-corun', `lab.47 attempt=${chainAttempt} ${stage}`);
  } catch (_) { /* Best-effort diagnostics, never part of note ownership. */ }
}

// Surface sharing belongs to the Move adapter, never to the harmonic engine.
function chainState() {
  if (typeof shadow_corun_state !== 'function') return null;
  try { return shadow_corun_state(); } catch (_) { return null; }
}
function openChain(slot) {
  chainAttempt++;
  chainTraceTicks = BUILD_PROFILE === 'lab' ? 3 : 0;
  traceChain(`open slot=${slot} shift-before`);
  pilot.shift(false);
  traceChain('shift-after');
  const g = globalThis;
  const groups = ['CORUN_GRP_OLED', 'CORUN_GRP_KNOBS', 'CORUN_GRP_JOG', 'CORUN_GRP_TOUCH', 'CORUN_GRP_BACK'];
  if (typeof g.shadow_corun_begin_cede !== 'function' || typeof g.shadow_corun_state !== 'function' ||
      typeof g.shadow_corun_end !== 'function' || typeof g.CORUN_TARGET_CHAIN_EDIT !== 'number' ||
      typeof g.CORUN_F_OWN_BACK !== 'number' ||
      groups.some(key => typeof g[key] !== 'number')) {
    traceChain('api-unavailable');
    chainNotice = 180; announce('Chain view needs newer Schwung'); return;
  }
  try {
    // Let the peer pop its view stack; only the peer knows when it is at root.
    traceChain('cede-before');
    g.shadow_corun_begin_cede(g.CORUN_TARGET_CHAIN_EDIT, slot, groups.reduce((mask,key)=>mask|g[key],0), g.CORUN_F_OWN_BACK);
    traceChain('cede-after state-before');
    const state = chainState();
    traceChain(`state-after match=${!!state && state.target === g.CORUN_TARGET_CHAIN_EDIT && state.id === slot}`);
    if (!state || state.target !== g.CORUN_TARGET_CHAIN_EDIT || state.id !== slot) throw new Error('Chain view unavailable');
    chainVisit = true; chainNotice = 0;
    // Touch release may now belong to the editor. Clear our old touch focus.
    for (let i=0;i<8;i++) {
      traceChain(`focus-${i}-before`);
      pilot.focus(i,false);
      traceChain(`focus-${i}-after`);
    }
    traceChain('open-return');
  } catch (_) { traceChain('open-error'); chainNotice = 180; announce('Cannot open chain view'); }
}
function reconcileChain() {
  const state = chainState();
  if (chainVisit && !state) {
    chainVisit = false; forceLedPaint = true;
    pilot.repaint(true); // no DSP reconfiguration: keep notes and clock untouched
  }
  return state;
}

function dspState() {
  const both = readBulk(['state', 'clock']);
  if (both) { tickClock = parse(both[1]); return parse(both[0]); }
  if (typeof host_module_get_param !== 'function') return null;
  try {
    const raw = host_module_get_param('state');
    const state = raw ? JSON.parse(raw) : null;
    return state;
  } catch (_error) {
    return null;
  }
}

function onKnobTouch(note, pressed) {
  if (note >= 0 && note < 8) pilot.focus(note, pressed);
}

globalThis.init = function init() {
  muteHeld=false;
  shiftHeld = false; deleteHeld = false; copyHeld=false; forceLedPaint = true;
  const moveAvailable = hostSupportsMove();
  pilot = createProjectPilot({
    managedTransport: uiFeatures.includes('clips'),
    transport:()=>{try{return typeof move_midi_inject_to_move==='function' && move_midi_inject_to_move([0x0b,0xb0,MovePlay,127,0x0b,0xb0,MovePlay,0])===true;}catch(_){return false;}},
    clock: readClock,
    read: readHostFile,
    write: writeHostFile,
    ensureDir: path => typeof host_ensure_dir !== 'function' || host_ensure_dir(path) === true,
    projectChanged: () => { muteHeld=false;shiftHeld = false; deleteHeld = false; copyHeld=false; },
    send: sendCommand,
    sendBatch: sendCommands,
    announce,
    moveAvailable,
    screenAvailable: () => !chainState(),
    render: model => { if (!chainState()) renderScreen(draw, model); },
    leds: updates => { paintLeds(updates, forceLedPaint); forceLedPaint = false; },
    forceLeds: () => { forceLedPaint = true; },
  });
  pilot.init();
};

globalThis.tick = function tick() {
  if (!pilot) return;
  const tracing = chainTraceTicks > 0;
  if (tracing) { chainTraceTicks--; traceChain(`tick-before remaining=${chainTraceTicks}`); }
  reconcileChain();
  if (tracing) traceChain('reconcile-after dsp-before');
  if (globalThis.overtakeParked) { muteHeld=false;shiftHeld = false; deleteHeld = false; copyHeld=false; }
  const state = dspState();
  if (tracing) traceChain('dsp-after pilot-before');
  pilot.tick(state, Boolean(globalThis.overtakeParked));
  if (!globalThis.overtakeParked) flushLeds();
  tickClock = null; // MIDI callbacks between ticks read a live clock
  if (tracing) traceChain('pilot-after tick-return');
  if (chainNotice > 0 && !globalThis.overtakeParked && !chainState()) {
    clear_screen(); print(2,12,'Chain view unavailable',1); print(2,28,'Update Schwung',1);
    if (--chainNotice === 0) pilot.repaint(true);
  }
};

globalThis.onMidiMessageInternal = function onMidiMessageInternal(data) {
  if (!pilot || !data || data.length < 3) return;
  if (globalThis.overtakeParked) return;
  const type = data[0] & 0xF0;
  const note = data[1] | 0;
  const value = data[2] | 0;
  const pressed = type === MidiNoteOn && value > 0;
  const released = type === MidiNoteOff || (type === MidiNoteOn && value === 0);
  const chain = reconcileChain();
  // MoveMute = CC88; note 88 remains a melody pad. Keep Public unchanged.
  if(uiFeatures.includes('partMute') && type===MidiCC && note===88){muteHeld=value>0;pilot.repaint(true);return;}
  if(type===MidiCC && note===MoveMainButton && value===0)pilot.mainButton(false);
  if (type === MidiCC && note >= 40 && note <= 43) {
    // Schwung's physical order: CC43 is Track 1, CC40 is Track 4.
    if (value > 0 && muteHeld && uiFeatures.includes('partMute')) pilot.mute(43-note);
    else if (value > 0 && shiftHeld) openChain(43-note);
    else if(value>0 && !chain)pilot.track(43-note);
    return;
  }
  // Defensive filtering: older hosts may still forward ceded knob touches.
  if (chain && ((type === MidiCC && (note >= MoveKnob1 && note <= MoveKnob8 ||
      note === MoveMainKnob || note === MoveMainButton)) ||
      ((pressed || released) && note >= 0 && note < 8))) return;
  if (chain && type === MidiCC && note === MoveBack) {
    // A forwarded release/duplicate must not bypass the peer's navigation.
    return;
  }

  // Knob touch is a note message in the 0-7 range and is intentionally
  // handled before Schwung's noise filter.
  if ((pressed || released) && note >= 0 && note < 8) {
    onKnobTouch(note, pressed);
    return;
  }
  if (type === MidiCC && note === MoveShift) {
    shiftHeld = value > 0;
    pilot.shift(shiftHeld && !chain);
    if(uiFeatures.includes('buttonLights'))pilot.repaint(true);
    return;
  }
  // Poly pressure must be handled before Schwung's generic noise filter.
  // Translate physical pads to logical melody inputs; the DSP owns pitches.
  if (type === 0xA0) {
    pilot.pressure(MELODY_PADS.indexOf(note), value);
    pilot.chordPressure(CHORD_PADS.indexOf(note), value);
    return;
  }
  if (shouldFilterMessage(data)) return;

  if (pressed || released) {
    if (MovePads.includes(note)) {
      pilot.pad(note, pressed, value || 100, { shift: shiftHeld, delete: deleteHeld, copy:copyHeld });
      return;
    }
    if (note >= MoveStep1 && note <= MoveStep16) {
      // Shift + step is a settings shortcut, as on Move; held pad + step overwrites.
      if (pressed && shiftHeld && !chain) { pilot.shiftStep(note - MoveStep1); return; }
      pilot.step(note - MoveStep1, pressed, { delete: deleteHeld, copy: copyHeld }, value || 100);
      return;
    }
  }
  if (type !== MidiCC) return;
  if (note === MoveDelete) { deleteHeld = value > 0; if(uiFeatures.includes('buttonLights'))pilot.repaint(true); return; }
  if (note === MoveCopy) {copyHeld=value>0;pilot.copyHeld(copyHeld);if(uiFeatures.includes('buttonLights'))pilot.repaint(true);return;}
  if (note === MoveLoop) { pilot.loop(value > 0); return; }
  if (value <= 0 && note !== MoveMainKnob) return;
  if (note === MoveCapture && value > 0) { pilot.capture(); return; }
  if (note === MoveSample && value > 0) { pilot.recordContext(); return; }
  if (note === MOVE_RECORD && value > 0) { pilot.nativeRecord(); return; }
  if (note === MoveUndo && value > 0) { pilot.undo(); return; }
  if (note === MovePlay && value > 0) {
    if (shiftHeld) pilot.arm(false);
    else pilot.play();
    return;
  }
  if (note === MoveBack || note === MoveMenu) {
    if (value > 0 && note === MoveBack) {
      const handled=pilot.back();
      if(uiFeatures.includes('trackNavigation') && !handled && typeof host_suspend_overtake==='function')host_suspend_overtake();
    }
    if (value > 0 && note === MoveMenu) pilot.menu();
    return;
  }
  if (note === MoveMainButton && value > 0) { pilot.mainButton(true); return; }
  if (note === MoveMainKnob) {
    const delta = decodeDelta(value);
    if (delta) pilot.browse(delta > 0 ? 1 : -1);
    return;
  }
  if (note === MoveUp && value > 0) { pilot.octave(1); return; }
  if (note === MoveDown && value > 0) { pilot.octave(-1); return; }
  if (!chain && note === MoveLeft && value > 0) { pilot.pageSteps(-1, { shift: shiftHeld }); return; }
  if (!chain && note === MoveRight && value > 0) { pilot.pageSteps(1, { shift: shiftHeld }); return; }
  if (note >= MoveKnob1 && note <= MoveKnob8) {
    const delta = decodeDelta(value);
    if (delta) pilot.knob(note - MoveKnob1, delta, { shift: shiftHeld });
  }
};

globalThis.onMidiMessageExternal = function onMidiMessageExternal(_data) {};

globalThis.onResume = function onResume() {
  if (!pilot) return;
  traceChain(`resume-before parked=${!!globalThis.overtakeParked} chain=${!!chainState()}`);
  chainTraceTicks=BUILD_PROFILE==='lab'?3:0;
  muteHeld=false;
  shiftHeld = false; deleteHeld = false; copyHeld=false; forceLedPaint = true;
  pilot.resume();
  traceChain('resume-after');
};

globalThis.onUnload = function onUnload() {
  if (chainVisit && typeof shadow_corun_end === 'function') shadow_corun_end();
  chainVisit = false;
  if (pilot) pilot.unload();
};
