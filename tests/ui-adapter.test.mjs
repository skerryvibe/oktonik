import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { STEP_OWNER_START, MELODY_OWNER_START, MELODY_PADS, PAGES, LIVE_BASS_OWNER } from '../src/pilot.mjs';
import { renderScreen } from '../src/display.mjs';
import { createProjectPilot } from '../src/project.mjs';

function host(profile='lab') {
  let pilot;
  const commands = [], labels = [], ledCalls = [];
  // Exercise the production adapter with host-provided constants and IO.
  const constants = { MidiCC: 176, MidiNoteOn: 144, MidiNoteOff: 128,
    MoveShift: 49, MoveDelete: 119, MoveCapture: 52, MoveLoop: 58, MoveRec:86, MoveUndo:56, BrightRed:1,
    MovePlay: 85, MoveBack: 51, MoveMenu: 50, MoveMainButton: 3,
    MoveMainKnob: 14, MoveUp: 55, MoveDown: 54, MoveKnob1: 71, MoveKnob2: 72, MoveKnob8: 78,
    MoveStep1: 16, MoveStep16: 31, MovePads: Array.from({ length: 32 }, (_, i) => 68 + i) };
  const context = { ...constants, Black: 0, BrightGreen: 1, Purple: 2, RoyalBlue: 3,
    VividYellow: 4, White: 5, LightGrey: 6, WhiteLedBright: 127, WhiteLedDim: 20,
    decodeDelta: n => n < 64 ? n : n - 128, shouldFilterMessage: () => false,
    setLED: (...args) => ledCalls.push(args), setButtonLED: (...args) => ledCalls.push(args),
    announce: () => {}, clear_screen: () => {}, fill_rect: () => {}, draw_rect: () => {},
    print: (_x, _y, text) => labels.push(text), renderScreen,
    host_read_file: () => null, host_write_file: () => true, host_ensure_dir: () => true,
    host_module_set_param_blocking: (_key, json) => { commands.push(JSON.parse(json)); return true; },
    host_module_get_param: () => null,
    createProjectPilot: options => { pilot = createProjectPilot({...options,profile}); return pilot; } };
  const source = readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?from '[^']+';\n/gm, '');
  vm.runInNewContext(source, context);
  context.init();
  const send = (type, key, value) => context.onMidiMessageInternal([type, key, value]);
  return { context, pilot, commands, labels, ledCalls,
    cc: (key, value) => send(176, constants[key], value),
    down: note => send(144, note, 100), up: note => send(128, note, 0) };
}

test('Public adapter Menu navigates pages and transport/steps do not activate hidden engines',()=>{
  const h=host('public');h.cc('MoveMenu',127);
  assert.equal(h.pilot.inspect().model.pageName,'CHORD');
  h.cc('MoveMenu',0);h.cc('MoveMenu',127);
  assert.equal(h.pilot.inspect().model.pageName,'MELODY');
  h.commands.length=0;
  for(const key of ['MoveRec','MoveCapture','MoveLoop','MovePlay','MoveUndo'])h.cc(key,127);
  h.down(16);h.up(16);
  assert.ok(!h.commands.some(c=>['on','slot','bassslot','record'].includes(c.op)||c.op==='arm'&&c.enabled));
  h.down(68);h.up(68);assert.ok(h.commands.some(c=>c.op==='on'));
});

test('physical two-pad bass gesture and ARP knobs reach independent engine commands', () => {
  const h=host();
  h.pilot.changePage(PAGES.indexOf('BASS'));
  h.cc('MoveKnob1',1); // BASS on
  h.context.onMidiMessageInternal([176,75,1]); // Knob 5 GEST on
  h.down(71);h.down(70);
  assert.equal(new Map(h.pilot.inspect().voices).get(LIVE_BASS_OWNER).notes[0],40);
  assert.equal(h.pilot.inspect().model.chordLabel,'F/E');
  h.up(71);assert.equal(h.pilot.inspect().active.index,3);h.up(70);
  h.down(70);assert.equal(h.pilot.inspect().active.index,2);h.up(70);
  h.pilot.changePage(PAGES.indexOf('ARP')-h.pilot.inspect().page);
  h.cc('MoveKnob1',1);h.cc('MoveKnob8',1);
  assert.equal(h.commands.findLast(c=>c.op==='arp').enabled,1);
  assert.equal(h.commands.findLast(c=>c.op==='arp').hold,1);
  h.down(68);h.up(68);h.down(95);
  assert.equal(h.commands.at(-1).op,'kill');
});

test('transport Record uses CC86 and fresh DSP clock reads, separate from Loop and Capture',()=>{
  const h=host();let beat=0;
  h.context.host_module_get_param=key=>key==='clock'?JSON.stringify({beat,ready:true}):null;
  h.cc('MoveRec',127);assert.equal(h.pilot.inspect().recordArmed,true);
  h.down(68);beat=3;h.up(68);
  assert.deepEqual(h.pilot.inspect().progression[0].timing,{steps:3,velocity:100});
  assert.equal(h.pilot.inspect().capture,false);
  assert.ok(h.ledCalls.length);
  h.cc('MoveRec',127);assert.equal(h.pilot.inspect().recordArmed,false);
  assert.ok(h.commands.some(c=>c.op==='record'&&c.enabled===1));
});

test('physical SEQ knob 8 chooses bass-only recording and Record preserves chord cells',()=>{
  const h=host();let beat=0;
  h.context.host_module_get_param=key=>key==='clock'?JSON.stringify({beat,ready:true}):null;
  h.cc('MoveShift',127);h.down(16);h.up(16);h.cc('MoveShift',0);
  const before=h.pilot.inspect().progression;
  h.pilot.changePage(PAGES.indexOf('BASS'));h.cc('MoveKnob1',1);
  h.pilot.changePage(PAGES.indexOf('SEQ')-h.pilot.inspect().page);h.cc('MoveKnob8',2);
  assert.equal(h.pilot.inspect().settings.recordPart,'bass');
  h.cc('MoveRec',127);h.down(70);beat=2;h.up(70);h.cc('MoveRec',127);
  assert.deepEqual(h.pilot.inspect().progression,before);
  assert.equal(h.pilot.inspect().bassProgression[0].note%12,4);
  assert.equal(h.pilot.inspect().bassProgression[0].steps,2);
  assert.ok(h.commands.some(c=>c.op==='record'&&c.enabled&&c.record_part===2));
  h.context.tick();assert.ok(h.labels.includes('R.PRT'));
  h.cc('MoveUndo',127);h.cc('MoveUndo',0);
  assert.deepEqual(h.pilot.inspect().progression,before);
  assert.ok(h.pilot.inspect().bassProgression.every(event=>event===null));
  assert.equal(h.pilot.inspect().armed,false);
});

test('physical Shift selects editing; Delete release cannot leave the erase modifier latched', () => {
  const h = host();
  h.cc('MoveShift', 127); h.down(69); h.up(69); h.cc('MoveShift', 0);
  assert.equal(h.pilot.inspect().editIndex, 1);
  h.cc('MoveKnob1', 1); // transpose the chosen chord; the global key stays fixed
  assert.equal(h.pilot.inspect().editIndex, 1);
  assert.equal(h.pilot.inspect().bank[1].rootOffset, 3);
  assert.equal(h.pilot.inspect().settings.key, 0);
  h.down(68); h.up(68);
  h.cc('MoveShift', 127); h.down(16); h.up(16); h.cc('MoveShift', 0);
  assert.ok(h.pilot.inspect().progression[0]);
  h.cc('MoveDelete', 127); h.cc('MoveDelete', 0);
  h.down(16);
  assert.ok(h.pilot.inspect().progression[0]);
  assert.ok(h.commands.some(c => c.op === 'on' && c.owner === STEP_OWNER_START));
  h.up(16);
});

test('note 85 modifies harmony without triggering Play CC 85; labels have no numbers', () => {
  const h = host();
  h.cc('MoveMainKnob',PAGES.indexOf('CHORDS'));
  h.down(68); h.down(85);
  assert.equal(h.pilot.inspect().modifiers.flip, true);
  assert.equal(h.pilot.inspect().armed, false);
  h.up(85); h.up(68);
  h.context.tick();
  assert.ok(h.labels.includes('KEY') && h.labels.includes('SCALE'));
  assert.ok(!h.labels.includes('1KEY'));
});

test('physical steps 9 through 16 reach their own saved slots and MIDI TEST knob stays inert', () => {
  const h=host();h.down(68);h.up(68);
  for(let note=24;note<=31;note++) {
    h.cc('MoveShift',127);h.down(note);h.up(note);h.cc('MoveShift',0);
    assert.ok(h.pilot.inspect().progression[note-16]);
    h.down(note);h.up(note);
    assert.ok(h.commands.some(c=>c.op==='on'&&c.owner===STEP_OWNER_START+note-16));
  }
  for(let i=0;i<PAGES.indexOf('MIDI');i++)h.cc('MoveMenu',127);
  const before=h.commands.length;h.cc('MoveKnob8',1);
  assert.ok(h.commands.length>before);
  assert.ok(!h.commands.slice(before).some(c=>c.op==='arptest'||c.op==='on'));
  h.context.tick();assert.ok(h.labels.includes('A.OUT')&&h.labels.includes('A.CH'));
});

test('physical melody LEDs use purple root, blue chord, white scale and grey chromatic even in HOLD', () => {
  const h=host();h.down(68);h.up(68);
  for(let i=0;i<PAGES.indexOf('MELODY');i++)h.cc('MoveMenu',127);
  h.cc('MoveKnob1',2); // CHROM
  h.pilot.changePage(PAGES.indexOf('CHORDS')-h.pilot.inspect().page);h.cc('MoveKnob8',1); // SUST HOLD
  h.context.tick();
  const color=note=>h.ledCalls.findLast(l=>l[0]===note)?.[1];
  assert.equal(color(72),2); // C purple
  assert.equal(color(73),6); // C# grey
  assert.equal(color(74),5); // D white
  assert.equal(color(80),3); // E blue
  h.down(74);h.up(74);h.context.tick();assert.equal(color(74),5);
});

test('physical Shift plus EDIT knob 8 changes explicit bass octave without another edit page', () => {
  const h=host();h.cc('MoveShift',127);h.down(68);h.up(68);h.cc('MoveShift',0);
  h.cc('MoveKnob8',14); // AUTO -> B2
  assert.equal(h.pilot.inspect().model.cells[7].value,'B2');
  h.cc('MoveShift',127);h.cc('MoveKnob8',127); // octave down
  assert.equal(h.pilot.inspect().model.cells[7].value,'B1');
  assert.equal(h.pilot.inspect().model.chordLabel,'C/B');
  assert.equal(h.pilot.inspect().overrides[0].bassOffset,-13);
  h.cc('MoveShift',0);h.cc('MoveKnob8',127); // pitch class down
  assert.equal(h.pilot.inspect().model.cells[7].value,'Bb1');
  assert.equal(h.pilot.inspect().model.pageCount,1);
  h.cc('MoveShift',127);h.down(68);h.up(68);h.cc('MoveShift',0);
  assert.equal(h.pilot.inspect().editIndex,-1);
});

test('parking and resume clear held modifiers and repaint cached LEDs', () => {
  const h = host();
  h.down(84); h.down(68);
  h.context.overtakeParked = true; h.context.tick();
  assert.equal(h.pilot.inspect().voices.length, 0);
  assert.equal(h.pilot.inspect().modifiers.dom, false);
  h.context.overtakeParked = false; h.context.onResume(); h.context.tick();
  assert.ok(h.ledCalls.slice(-50).some(call => call[2] === true));
});

test('the real adapter forwards every right-hand pad and keeps modifier gestures silent', () => {
  const h = host();
  h.down(68);
  MELODY_PADS.forEach(p => h.down(p));
  MELODY_PADS.forEach((_, i) => assert.ok(h.commands.some(c => c.op === 'on' && c.owner === MELODY_OWNER_START + i)));
  const length = h.commands.length;
  for (const modifier of [84,85,86,87,92,93,94]) { h.down(modifier); h.up(modifier); }
  assert.equal(h.commands.length, length);
  MELODY_PADS.forEach(p => h.up(p)); h.up(68);
  assert.equal(h.pilot.inspect().voices.length, 0);
});

test('top-row fourth STOP reaches the hard kill command through the real adapter', () => {
  const h = host();
  h.down(68); h.down(72); h.down(95); h.context.tick();
  assert.equal(h.pilot.inspect().voices.length, 0);
  assert.equal(h.commands.at(-1).op, 'kill');
  const count = h.commands.length;
  h.up(95); h.up(68); h.up(72);
  assert.equal(h.commands.length, count);
  assert.ok(h.ledCalls.some(call => call[0] === 95 && call[1] !== 0));
});

test('physical Shift + BORROW latches independently of release order and single-page EDIT still exits', () => {
  const h = host(), count = h.commands.length;
  h.cc('MoveShift', 127); h.down(94); h.cc('MoveShift', 0); h.up(94); h.context.tick();
  assert.equal(h.pilot.inspect().borrowLocked, true);
  assert.equal(h.commands.length, count);
  assert.ok(h.ledCalls.some(c => c[0] === 94 && c[1] === 3)); // Blue lock.
  assert.ok(h.labels.includes('B'));
  h.cc('MoveShift', 127); h.down(71); h.up(71); h.cc('MoveShift', 0);
  h.cc('MoveMainKnob', 1); h.cc('MoveMenu', 127); h.cc('MoveKnob8', 1);
  assert.equal(h.pilot.inspect().editIndex, 3);
  assert.equal(h.pilot.inspect().model.pageCount, 1);
  h.cc('MoveShift', 127); h.down(71); h.up(71); h.cc('MoveShift', 0);
  assert.equal(h.pilot.inspect().editIndex, -1);
  h.cc('MoveShift', 127); h.down(94); h.up(94); h.cc('MoveShift', 0);
  assert.equal(h.pilot.inspect().borrowLocked, false);
  assert.equal(h.pilot.inspect().modifiers.borrow, undefined);
});

test('real adapter enters IDEAS, plays and stores a suggestion, then returns to the original bank', () => {
  const h=host();
  for(let i=0;i<PAGES.indexOf('IDEAS');i++)h.cc('MoveMainKnob',1);
  assert.equal(h.pilot.inspect().model.pageName,'IDEAS');
  h.cc('MoveKnob1',1); assert.equal(h.pilot.inspect().ideasEnabled,true);
  h.down(76); h.up(76); assert.equal(h.pilot.inspect().active.kind,'idea');
  h.cc('MoveShift',127); h.down(16); h.up(16); h.cc('MoveShift',0);
  assert.ok(h.pilot.inspect().progression[0]);
  h.cc('MoveMainKnob',1); assert.equal(h.pilot.inspect().ideasEnabled,false);
  h.down(68); assert.equal(h.pilot.inspect().active.kind,'bank');
  assert.equal(h.pilot.inspect().active.chord.rootOffset,0);
});
