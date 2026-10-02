import {
  Black, BrightGreen, Purple, RoyalBlue, VividYellow, White, LightGrey, WhiteLedBright, WhiteLedDim,
  MidiCC, MidiNoteOff, MidiNoteOn,
  MoveBack, MoveCapture, MoveDelete, MoveDown, MoveLoop, MoveMainButton, MoveMainKnob,
  MoveMenu, MoveKnob1, MoveKnob8, MovePads, MovePlay, MoveShift, MoveUp,
  MoveStep1, MoveStep16, MoveRec, MoveUndo, BrightRed,
} from '/data/UserData/schwung/shared/constants.mjs';
import { decodeDelta, shouldFilterMessage, setButtonLED, setLED } from '/data/UserData/schwung/shared/input_filter.mjs';
import { announce } from '/data/UserData/schwung/shared/screen_reader.mjs';
import { renderScreen } from './display.mjs';
import { createProjectPilot } from './project.mjs';
import { BUILD_PROFILE } from './profile.mjs';
import { MELODY_PADS } from './pilot.mjs';

function sendCommand(command) {
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
};

function paintLeds(updates, force = false) {
  for (const update of updates || []) {
    const color = roleColor[update.role] ?? Black;
    if (update.button) setButtonLED(update.note, color, force);
    else setLED(update.note, color, force);
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
let deleteHeld = false;
let pilot;
let forceLedPaint = true;
let chainVisit = false;
let chainNotice = 0;

// Surface sharing belongs to the Move adapter, never to the harmonic engine.
function chainState() {
  if (typeof shadow_corun_state !== 'function') return null;
  try { return shadow_corun_state(); } catch (_) { return null; }
}
function openChain(slot) {
  pilot.shift(false);
  const g = globalThis;
  const groups = ['CORUN_GRP_OLED', 'CORUN_GRP_KNOBS', 'CORUN_GRP_JOG', 'CORUN_GRP_TOUCH', 'CORUN_GRP_BACK'];
  if (typeof g.shadow_corun_begin_cede !== 'function' || typeof g.shadow_corun_state !== 'function' ||
      typeof g.shadow_corun_end !== 'function' || typeof g.CORUN_TARGET_CHAIN_EDIT !== 'number' ||
      typeof g.CORUN_F_OWN_BACK !== 'number' ||
      groups.some(key => typeof g[key] !== 'number')) {
    chainNotice = 180; announce('Chain view needs newer Schwung'); return;
  }
  try {
    // Let the peer pop its view stack; only the peer knows when it is at root.
    g.shadow_corun_begin_cede(g.CORUN_TARGET_CHAIN_EDIT, slot, groups.reduce((mask,key)=>mask|g[key],0), g.CORUN_F_OWN_BACK);
    const state = chainState();
    if (!state || state.target !== g.CORUN_TARGET_CHAIN_EDIT || state.id !== slot) throw new Error('Chain view unavailable');
    chainVisit = true; chainNotice = 0;
    // Touch release may now belong to the editor. Clear our old touch focus.
    for (let i=0;i<8;i++) pilot.focus(i,false);
  } catch (_) { chainNotice = 180; announce('Cannot open chain view'); }
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
  shiftHeld = false; deleteHeld = false; forceLedPaint = true;
  const moveAvailable = hostSupportsMove();
  pilot = createProjectPilot({
    clock:()=>{try{return JSON.parse(host_module_get_param('clock'));}catch(_){return null;}},
    read: readHostFile,
    write: writeHostFile,
    ensureDir: path => typeof host_ensure_dir !== 'function' || host_ensure_dir(path) === true,
    projectChanged: () => { shiftHeld = false; deleteHeld = false; },
    send: sendCommand,
    announce,
    moveAvailable,
    render: model => { if (!chainState()) renderScreen(draw, model); },
    leds: updates => { paintLeds(updates, forceLedPaint); forceLedPaint = false; },
    forceLeds: () => { forceLedPaint = true; },
  });
  pilot.init();
};

globalThis.tick = function tick() {
  if (!pilot) return;
  reconcileChain();
  if (globalThis.overtakeParked) { shiftHeld = false; deleteHeld = false; }
  pilot.tick(dspState(), Boolean(globalThis.overtakeParked));
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
  if (type === MidiCC && note >= 40 && note <= 43) {
    // Schwung's physical order: CC43 is Track 1, CC40 is Track 4.
    if (value > 0 && shiftHeld) openChain(43-note);
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
    return;
  }
  // Poly pressure must be handled before Schwung's generic noise filter.
  // Translate physical pads to logical melody inputs; the DSP owns pitches.
  if (type === 0xA0) {
    pilot.pressure(MELODY_PADS.indexOf(note), value);
    return;
  }
  if (shouldFilterMessage(data)) return;

  if (pressed || released) {
    if (MovePads.includes(note)) {
      pilot.pad(note, pressed, value || 100, { shift: shiftHeld, delete: deleteHeld });
      return;
    }
    if (note >= MoveStep1 && note <= MoveStep16) {
      pilot.step(note - MoveStep1, pressed, { shift: shiftHeld, delete: deleteHeld }, value || 100);
      return;
    }
  }
  if (type !== MidiCC) return;
  if (note === MoveDelete) { deleteHeld = value > 0; return; }
  if (value <= 0 && note !== MoveMainKnob) return;
  if (note === MoveCapture && value > 0) { pilot.capture(); return; }
  if (note === MoveRec && value > 0) { pilot.record(); return; }
  if (note === MoveUndo && value > 0) { pilot.undo(); return; }
  if (note === MoveLoop && value > 0) { pilot.arm(!pilot.inspect().armed); return; }
  if (note === MovePlay && value > 0) {
    if (shiftHeld) pilot.arm(false);
    else pilot.play();
    return;
  }
  if (note === MoveBack || note === MoveMenu) {
    if (value > 0 && note === MoveBack) pilot.shift(false);
    if (value > 0 && note === MoveMenu) pilot.menu();
    return;
  }
  if (note === MoveMainButton && value > 0) { pilot.changePage(1); return; }
  if (note === MoveMainKnob) {
    const delta = decodeDelta(value);
    if (delta) pilot.changePage(delta > 0 ? 1 : -1);
    return;
  }
  if (note === MoveUp && value > 0) { pilot.octave(1); return; }
  if (note === MoveDown && value > 0) { pilot.octave(-1); return; }
  if (note >= MoveKnob1 && note <= MoveKnob8) {
    const delta = decodeDelta(value);
    if (delta) pilot.knob(note - MoveKnob1, delta, { shift: shiftHeld });
  }
};

globalThis.onMidiMessageExternal = function onMidiMessageExternal(_data) {};

globalThis.onResume = function onResume() {
  if (!pilot) return;
  shiftHeld = false; deleteHeld = false; forceLedPaint = true;
  pilot.resume();
};

globalThis.onUnload = function onUnload() {
  if (chainVisit && typeof shadow_corun_end === 'function') shadow_corun_end();
  chainVisit = false;
  if (pilot) pilot.unload();
};
