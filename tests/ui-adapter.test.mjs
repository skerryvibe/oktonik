import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { STEP_OWNER_START, MELODY_OWNER_START, MELODY_PADS, CHORD_PADS, PAGES, MAIN_PAGES, LIVE_BASS_OWNER } from '../src/pilot.mjs';
import { renderScreen } from '../src/display.mjs';
import { createProjectPilot } from '../src/project.mjs';
import {featuresFor} from '../src/profile.mjs';

test('physical track/jog/Back navigate locally before asking the host to park',()=>{
 const h=host();let parked=0;h.context.host_suspend_overtake=()=>parked++;
 h.context.onMidiMessageInternal([176,43,127]);
 h.cc('MoveMainKnob',1);assert.equal(h.pilot.inspect().model.pageName,'STRUM');
 h.cc('MoveShift',127);h.cc('MoveMainKnob',1);h.cc('MoveShift',0);
 assert.equal(h.pilot.inspect().model.pageName,'EXPR');
 h.cc('MoveBack',127);assert.equal(h.pilot.inspect().model.pageName,'PLAY');assert.equal(parked,0);
 h.cc('MoveBack',127);assert.equal(parked,1);
 h.cc('MoveMenu',127);h.cc('MoveBack',127);assert.equal(parked,1);
});
test('physical Back exits pad editors locally and Shift modifier opens FUNC instead of latching',()=>{
 const h=host();let parked=0;h.context.host_suspend_overtake=()=>parked++;
 h.cc('MoveShift',127);h.down(68);h.up(68);h.cc('MoveShift',0);h.cc('MoveBack',127);
 assert.equal(h.pilot.inspect().editIndex,-1);assert.equal(parked,0);
 h.cc('MoveShift',127);h.down(94);h.cc('MoveKnob1',1);h.up(94);h.cc('MoveShift',0);
 assert.equal(h.pilot.inspect().modifierEditIndex,6);assert.equal(h.pilot.inspect().borrowLocked,false);
 assert.equal(h.pilot.inspect().settings.modifierAssignments[6],'add7');
 h.cc('MoveBack',127);assert.equal(h.pilot.inspect().modifierEditIndex,-1);assert.equal(parked,0);
 h.cc('MoveBack',127);assert.equal(parked,1);
});
test('physical jog/encoders edit profiles and modifiers right after PLAY, then PLAY previews the result',()=>{
 const h=host();
 h.cc('MoveMainKnob',1);assert.equal(h.pilot.inspect().model.pageName,'EXT PROF');
 h.context.onMidiMessageInternal([176,74,5]);assert.equal(h.pilot.inspect().settings.extensionProfile,'soul');
 h.cc('MoveMainKnob',1);assert.equal(h.pilot.inspect().model.pageName,'MOD PADS');
 h.cc('MoveKnob8',4);assert.equal(h.pilot.inspect().settings.modifierAssignments[3],'add7');
 h.cc('MoveBack',127);h.down(87);
 assert.equal(h.pilot.inspect().model.chordMap.items[0].label,'Cmaj13');
 h.down(68);assert.equal(h.pilot.inspect().model.chordLabel,'Cmaj13');h.up(87);h.up(68);
 assert.equal(h.pilot.inspect().voices.length,0);
});
test('both profiles own Play; Shift Play stays local',()=>{
 const h=host();let ready=false;const packets=[];
 h.context.host_module_get_param=key=>key==='clock'?JSON.stringify({ready,beat:0,bpm:120}):null;
 h.context.move_midi_inject_to_move=p=>{packets.push([...p]);return true;};
 h.cc('MovePlay',127);h.cc('MovePlay',0);assert.deepEqual(packets,[[11,176,85,127,11,176,85,0]]);
 ready=true;h.cc('MovePlay',127);assert.equal(packets.length,2);assert.equal(h.pilot.inspect().armed,false);
 h.cc('MoveShift',127);h.cc('MovePlay',127);h.cc('MoveShift',0);assert.equal(packets.length,2);
 const pub=host('public');let count=0;pub.context.move_midi_inject_to_move=()=>{count++;return true;};pub.cc('MovePlay',127);assert.equal(count,1);
});

test('physical Left/Right select 16-step pages without changing clip RATE or step owners',()=>{
 const h=host();h.pilot.changePage(PAGES.indexOf('SEQ'));h.pilot.knob(2,1);
 h.cc('MoveRight',127);h.down(16);h.up(16);
 assert.ok(h.commands.some(c=>c.op==='slot' && c.index===16 && c.at===160000 && c.notes.length));
 h.cc('MoveLeft',127);h.down(16);h.up(16);
 assert.ok(h.commands.some(c=>c.op==='cliplength' && c.index===0 && c.duration===32));
});
function host(profile='lab',extra={}) {
  let pilot;
  const commands = [], labels = [], ledCalls = [];
  // Exercise the production adapter with host-provided constants and IO.
  const constants = { MidiCC: 176, MidiNoteOn: 144, MidiNoteOff: 128,
    MoveShift: 49, MoveDelete: 119, MoveCopy:60, MoveCapture: 52, MoveLoop: 58, MoveRec:86, MoveSample:118, MoveUndo:56, BrightRed:1,
    MovePlay: 85, MoveBack: 51, MoveMenu: 50, MoveMainButton: 3,
    MoveMainKnob: 14, MoveUp: 55, MoveDown: 54, MoveLeft:62, MoveRight:63, MoveKnob1: 71, MoveKnob2: 72, MoveKnob8: 78,
    MoveStep1: 16, MoveStep16: 31, MovePads: Array.from({ length: 32 }, (_, i) => 68 + i) };
  const context = { ...constants, featuresFor, MELODY_PADS, CHORD_PADS, BUILD_PROFILE: profile, Black: 0, BrightGreen: 1, Purple: 2, RoyalBlue: 3,
    VividYellow: 4, White: 5, LightGrey: 6, WhiteLedBright: 127, WhiteLedDim: 20,
    decodeDelta: n => n < 64 ? n : n - 128, shouldFilterMessage: () => false,
    setLED: (...args) => ledCalls.push(args), setButtonLED: (...args) => ledCalls.push(args),
    announce: () => {}, clear_screen: () => {}, fill_rect: () => {}, draw_rect: () => {},
    print: (_x, _y, text) => labels.push(text), renderScreen,
    host_read_file: () => null, host_write_file: () => true, host_ensure_dir: () => true,
    host_module_set_param_blocking: (_key, json) => { commands.push(JSON.parse(json)); return true; },
    host_module_get_param: () => null,
    createProjectPilot: options => { pilot = createProjectPilot({...options,profile}); return pilot; }, ...extra };
  const source = readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?from '[^']+';\n/gm, '');
  vm.runInNewContext(source, context);
  context.init();
  const send = (type, key, value) => context.onMidiMessageInternal([type, key, value]);
  return { context, pilot, commands, labels, ledCalls,
    cc: (key, value) => send(176, constants[key], value),
    down: note => send(144, note, 100), up: note => send(128, note, 0) };
}
test('physical Copy/Delete/Undo edit clips without launching pads, including Copy release reset',()=>{
 const h=host();h.down(68);h.down(16);h.up(16);h.up(68);
 h.cc('MoveMenu',127);h.cc('MoveCopy',127);h.down(92);h.up(92);h.down(93);h.up(93);h.cc('MoveCopy',0);
 assert.ok(h.pilot.inspect().clips.parts.chord.clips[1].events[0]);
 assert.equal(h.pilot.inspect().clips.parts.chord.selected,'clip-1');
 h.cc('MoveDelete',127);h.down(93);h.up(93);h.cc('MoveDelete',0);
 assert.equal(h.pilot.inspect().clips.parts.chord.clips[1].events[0],null);
 h.cc('MoveUndo',127);assert.ok(h.pilot.inspect().clips.parts.chord.clips[1].events[0]);
 h.down(16);assert.ok(!h.pilot.inspect().model.chordMap);assert.equal(h.pilot.inspect().model.cells[0].label,'ROOT');h.up(16);
 h.cc('MoveCopy',127);h.down(93);h.up(93);h.cc('MoveCopy',0);
 h.cc('MoveCopy',127);h.down(94);h.up(94);h.cc('MoveCopy',0);
 assert.equal(h.pilot.inspect().clips.parts.chord.clips.length,2);
});

test('physical chord pressure reaches CC expression through project and Move adapters',()=>{
  const h=host();h.cc('MoveShift',127);h.cc('MoveMainKnob',1);
  assert.equal(h.pilot.inspect().model.pageName,'EXPR');h.cc('MoveKnob1',2);h.cc('MoveShift',0);
  h.down(68);assert.equal(h.commands.findLast(c=>c.op==='on'&&c.owner===0).cc,1);
  h.context.onMidiMessageInternal([160,68,127]);h.context.tick();
  assert.equal(h.commands.findLast(c=>c.op==='express').amount,110);
  h.up(68);const from=h.commands.length;h.context.onMidiMessageInternal([160,68,127]);h.context.tick();
  assert.ok(h.commands.slice(from).every(c=>c.op!=='express'));
});
test('physical knob 7 is STRUM normally; the STRUM extra page no longer changes DIV',()=>{
  const h=host();
  for(const page of ['PLAY','CHORDS']) {
    h.pilot.changePage(PAGES.indexOf(page)-h.pilot.inspect().page);
    const before=h.pilot.inspect().settings.strumMs;
    h.context.onMidiMessageInternal([176,77,1]);
    assert.equal(h.pilot.inspect().settings.strumMs,before+5);
    assert.equal(h.pilot.inspect().settings.divisi,false);
    h.cc('MoveShift',127);h.context.onMidiMessageInternal([176,77,1]);
    assert.equal(h.pilot.inspect().settings.divisi,false);
    assert.equal(h.pilot.inspect().settings.strumMs,before+5);
    h.context.onMidiMessageInternal([176,77,127]);h.cc('MoveShift',0);
    assert.equal(h.pilot.inspect().settings.divisi,false);
    assert.equal(h.pilot.inspect().model.pageName,page);
  }
});
test('physical Shift extras return to their parent; Back and chain entry dismiss them without notes',()=>{
  const h=host();h.commands.length=0;
  h.cc('MoveShift',127);assert.equal(h.pilot.inspect().model.pageName,'STRUM');
  h.cc('MoveKnob1',1);assert.equal(h.pilot.inspect().settings.strumMs,5);
  assert.equal(h.pilot.inspect().settings.key,0);
  h.cc('MoveMainKnob',1);assert.equal(h.pilot.inspect().page,0);
  h.cc('MoveShift',0);assert.equal(h.pilot.inspect().model.pageName,'PLAY');
  h.pilot.changePage(PAGES.indexOf('MIDI'));h.cc('MoveShift',127);
  assert.equal(h.pilot.inspect().model.pageName,'ENSEMBL');h.cc('MoveKnob1',1);
  assert.equal(h.pilot.inspect().settings.ensembleChannels[0],1);
  h.cc('MoveBack',127);assert.equal(h.pilot.inspect().model.pageName,'MIDI');
  h.cc('MoveShift',0);h.cc('MoveShift',127);const c=withChain(h);
  h.context.onMidiMessageInternal([176,43,127]);assert.equal(c.calls.length,1);
  assert.equal(h.pilot.inspect().model.extraLayer,false);h.cc('MoveShift',0);
  c.close();h.context.tick();assert.equal(h.pilot.inspect().model.pageName,'MIDI');
  assert.ok(!h.commands.some(c=>c.op==='on'));
});

test('physical EDIT inversion turns downward and Shift+INV restores AUTO without opening extras',()=>{
  const h=host();h.cc('MoveShift',127);h.down(68);h.up(68);h.cc('MoveShift',0);
  assert.equal(h.pilot.inspect().model.pageName,'EDIT 1');
  h.context.onMidiMessageInternal([176,74,127]); // knob 4, -1
  assert.equal(h.pilot.inspect().model.cells[3].value,'-1');
  assert.equal(h.pilot.inspect().bank[0].lockInversion,true);
  assert.ok(h.pilot.inspect().model.detail.length<=21);
  for(const [delta,label] of [[1,'AUTO'],[1,'ROOT'],[127,'AUTO'],[127,'-1']]) {
    h.context.onMidiMessageInternal([176,74,delta]);
    assert.equal(h.pilot.inspect().model.cells[3].value,label);
    assert.equal(h.pilot.inspect().bank[0].lockInversion,label!=='AUTO');
  }
  h.cc('MoveShift',127);h.context.onMidiMessageInternal([176,74,1]);h.cc('MoveShift',0);
  assert.equal(h.pilot.inspect().model.cells[3].value,'AUTO');
  assert.equal(h.pilot.inspect().model.pageName,'EDIT 1');
  assert.equal(h.pilot.inspect().settings.key,0);
});

function withChain(h) {
  let state=null;
  const calls=[];
  Object.assign(h.context,{
    CORUN_TARGET_CHAIN_EDIT:1,CORUN_GRP_OLED:1,CORUN_GRP_KNOBS:2,CORUN_GRP_JOG:4,CORUN_GRP_TOUCH:8,
    CORUN_GRP_BACK:16,CORUN_F_OWN_BACK:32,
    shadow_corun_state:()=>state,
    shadow_corun_begin_cede:(target,id,mask,flags)=>{calls.push({target,id,mask,flags});state={target,id};},
    shadow_corun_end:()=>{state=null;},
  });
  return {calls,close:()=>{state=null;}};
}

test('M + tracks mutes each part in play, clips and co-run without selecting tracks',()=>{
  for(const view of ['play','clips','chain']) {
    const h=host();if(view==='clips')h.cc('MoveMenu',127);if(view==='chain')withChain(h);
    for(let i=0;i<3;i++) {
      h.context.onMidiMessageInternal([176,88,127]);
      h.context.onMidiMessageInternal([176,43-i,127]);
      h.context.onMidiMessageInternal([176,43-i,0]);
      h.context.onMidiMessageInternal([176,88,0]);
      assert.equal(h.pilot.inspect().mutedParts[i],true);
      assert.ok(h.commands.some(c=>c.op==='mute'&&c.index===i&&c.enabled===1));
      assert.ok(h.pilot.inspect().model.detail.startsWith('MUTE'));
      assert.ok(h.ledCalls.some(c=>c[0]===43-i&&c[1]===0));
    }
  }
});

test('melody mute releases held notes, suppresses new notes and unmute waits for a new attack',()=>{
  const h=host();h.down(72);h.pilot.mute(2);
  assert.ok(h.commands.some(c=>c.op==='off'&&c.owner===8));
  h.down(73);const at=h.commands.length;h.pilot.mute(2);h.context.tick();
  assert.ok(!h.commands.slice(at).some(c=>c.op==='on'));
  h.up(72);h.up(73);h.down(72);
  assert.ok(h.commands.slice(at).some(c=>c.op==='on'&&c.owner===8));h.up(72);
});

test('mute errors do not change state; Public supports mute; note 88 is still melody',()=>{
  const h=host();h.context.host_module_set_param_blocking=()=>false;
  h.pilot.mute(0);assert.equal(h.pilot.inspect().mutedParts[0],false);
  const pub=host('public');pub.pilot.mute(0);assert.ok(pub.commands.some(c=>c.op==='mute'&&c.enabled));
  const other=host();other.down(88);assert.ok(other.commands.some(c=>c.op==='on'&&c.owner>=8));other.up(88);
});

test('Lab co-run diagnostics bracket entry and only the first three ticks without musical changes',()=>{
  const h=host(),c=withChain(h),logs=[];
  h.context.unified_log=(source,text)=>{assert.equal(source,'oktonik-corun');logs.push(text);};
  h.down(68);h.down(72);h.commands.length=0;
  h.cc('MoveShift',127);h.context.onMidiMessageInternal([176,43,127]);h.cc('MoveShift',0);
  assert.equal(c.calls.length,1);assert.equal(h.commands.length,0);
  const stages=logs.map(s=>s.replace('lab.47 attempt=1 ',''));
  assert.deepEqual(stages.slice(0,5),['open slot=0 shift-before','shift-after','cede-before','cede-after state-before','state-after match=true']);
  assert.equal(stages.at(-1),'open-return');
  for(let i=0;i<8;i++)assert.ok(stages.indexOf(`focus-${i}-before`)<stages.indexOf(`focus-${i}-after`));
  for(let i=0;i<3;i++)h.context.tick();
  assert.equal(logs.filter(s=>s.includes('tick-before')).length,3);
  const count=logs.length;for(let i=0;i<20;i++)h.context.tick();
  assert.equal(logs.length,count);
  h.up(68);h.up(72);assert.equal(h.pilot.inspect().voices.length,0);
});

test('co-run logging is absent in Public and logger failures do not interrupt Lab',()=>{
  for(const profile of ['lab','public']) {
    const h=host(profile),c=withChain(h);let attempts=0;
    h.context.unified_log=()=>{attempts++;throw new Error('logger unavailable');};
    h.down(68);h.cc('MoveShift',127);h.context.onMidiMessageInternal([176,43,127]);h.cc('MoveShift',0);
    h.context.tick();h.up(68);
    assert.equal(c.calls.length,1);assert.equal(h.pilot.inspect().voices.length,0);
    assert.equal(attempts>0,profile==='lab');
  }
});

test('Lab co-run diagnostics identify rejected entry without leaking exception contents',()=>{
  const h=host();withChain(h);const logs=[];
  h.context.unified_log=(_source,text)=>logs.push(text);
  h.context.shadow_corun_begin_cede=()=>{throw new Error('private host detail');};
  h.cc('MoveShift',127);h.context.onMidiMessageInternal([176,43,127]);h.cc('MoveShift',0);
  assert.ok(logs.some(s=>s.endsWith('cede-before')));
  assert.ok(logs.some(s=>s.endsWith('open-error')));
  assert.ok(!logs.some(s=>s.includes('private host detail')||s.endsWith('open-return')));
  h.down(68);h.up(68);assert.equal(h.pilot.inspect().voices.length,0);
});

for(const profile of ['lab','public'])test(`${profile} physical aftertouch works in co-run and maps only melody pads`,()=>{
  const h=host(profile);withChain(h);
  h.pilot.changePage(profile==='public'?2:PAGES.indexOf('MELODY'));
  h.context.onMidiMessageInternal([176,76,1]);
  h.down(72);
  h.cc('MoveShift',127);h.context.onMidiMessageInternal([176,42,127]);h.cc('MoveShift',0);
  h.context.shouldFilterMessage=()=>true;
  for(const note of [72,68,16,0])h.context.onMidiMessageInternal([0xa3,note,95]);
  h.context.tick();
  assert.deepEqual(h.commands.filter(c=>c.op==='pressure'),[{op:'pressure',owner:8,pressure:95}]);
  h.context.overtakeParked=true;h.context.tick();const n=h.commands.length;
  h.context.onMidiMessageInternal([0xa0,72,100]);h.context.tick();
  assert.equal(h.commands.slice(n).filter(c=>c.op==='pressure').length,0);
});

test('Lab and Public Shift+Track address all four chains',()=>{
  for(const profile of ['lab','public']){
    const h=host(profile),c=withChain(h);
    h.context.onMidiMessageInternal([176,42,127]);assert.equal(c.calls.length,0);
    h.cc('MoveShift',127);
    for(let slot=0;slot<4;slot++)h.context.onMidiMessageInternal([176,43-slot,127]);
    assert.deepEqual(c.calls,[0,1,2,3].map(id=>({target:1,id,mask:31,flags:32})));
  }
});

for(const profile of ['lab','public'])test(`${profile} co-run keeps notes, isolates controls and redraws after Back`,()=>{
  const h=host(profile),c=withChain(h);h.down(68);h.down(72);
  const settings=JSON.stringify(h.pilot.inspect().settings);
  h.commands.length=0;h.cc('MoveShift',127);h.context.onMidiMessageInternal([176,42,127]);h.cc('MoveShift',0);
  assert.equal(h.commands.length,0);
  h.cc('MoveKnob1',1);h.cc('MoveMainKnob',1);h.cc('MoveMainButton',127);h.down(0);h.up(0);
  assert.equal(JSON.stringify(h.pilot.inspect().settings),settings);assert.equal(h.pilot.inspect().page,0);
  h.labels.length=0;h.down(73);h.context.tick();assert.equal(h.labels.length,0);
  assert.ok(h.commands.some(c=>c.op==='on'&&c.owner===MELODY_OWNER_START+1));
  // Framework consumes Back itself on device; poll must detect its exit.
  const count=h.commands.length;
  c.close();h.context.tick();assert.ok(h.labels.length>0);assert.equal(h.commands.length,count);
  assert.ok(!h.commands.some(c=>c.op==='off'));
  h.up(68);h.up(72);h.up(73);assert.equal(h.pilot.inspect().voices.length,0);
});

test('bass gesture releases and STOP remain musical-owner safe inside chain view',()=>{
  const h=host();withChain(h);
  h.pilot.changePage(PAGES.indexOf('BASS'));h.cc('MoveKnob1',1);
  h.context.onMidiMessageInternal([176,75,1]);
  h.down(71);
  h.cc('MoveShift',127);h.context.onMidiMessageInternal([176,42,127]);h.cc('MoveShift',0);
  h.down(70);assert.equal(h.pilot.inspect().model.chordLabel,'F/E');
  h.commands.length=0;h.up(71);
  assert.ok(!h.commands.some(c=>c.op==='on'));assert.equal(h.pilot.inspect().active.index,3);
  h.down(95);assert.equal(h.commands.at(-1).op,'kill');assert.equal(h.pilot.inspect().voices.length,0);
  h.up(70);h.up(95);h.cc('MoveBack',127);
  assert.equal(h.pilot.inspect().page,PAGES.indexOf('BASS'));
});

for(const profile of ['lab','public'])test(`${profile} co-run handles Back, unload and missing host support safely`,()=>{
  const h=host(profile),c=withChain(h);
  const enter=()=>{h.cc('MoveShift',127);h.context.onMidiMessageInternal([176,43,127]);h.cc('MoveShift',0);};
  enter();h.cc('MoveBack',127);h.cc('MoveBack',0);
  assert.notEqual(h.context.shadow_corun_state(),null); // peer owns navigation, not tool
  c.close();h.context.tick();assert.equal(h.context.shadow_corun_state(),null);
  enter();h.context.onUnload();assert.equal(h.context.shadow_corun_state(),null);
  for(const failed of [false,true]){
    const a=host(profile);if(failed){withChain(a);a.context.shadow_corun_begin_cede=()=>{throw new Error('no');};}
    a.cc('MoveShift',127);a.context.onMidiMessageInternal([176,42,127]);a.cc('MoveShift',0);
    a.context.tick();assert.ok(a.labels.includes('Chain view unavailable'));
    a.down(68);assert.ok(a.commands.some(c=>c.op==='on'));
  }
});

test('Public adapter Menu opens clips; recording works but Capture stays hidden',()=>{
  const h=host('public');h.cc('MoveMenu',127);
  assert.equal(h.pilot.inspect().model.pageName,'CLIPS');
  h.cc('MoveMenu',0);h.cc('MoveMenu',127);
  assert.equal(h.pilot.inspect().model.pageName,'PLAY');
  h.commands.length=0;
  for(const key of ['MoveRec','MoveCapture'])h.cc(key,127);
  assert.equal(h.commands.length,0);
  h.cc('MoveSample',127);assert.equal(h.pilot.inspect().recordArmed,true);h.cc('MoveSample',127);
  h.down(16);h.up(16);
  assert.ok(h.commands.some(c=>c.op==='slot'));assert.equal(h.pilot.inspect().ideasEnabled,false);
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

test('Capture CC52 saves past live notes without arming; release does not capture twice',()=>{
 const h=host();h.context.host_module_get_param=key=>key==='clock'?JSON.stringify({beat:-1,ready:false,bpm:120}):null;
 h.down(68);h.up(68);h.cc('MoveCapture',127);h.cc('MoveCapture',0);
 assert.equal(h.pilot.inspect().recordArmed,false);assert.equal(h.pilot.inspect().clipView,true);
 assert.ok(h.pilot.inspect().clips.parts.chord.clips[1].events[0]);
 assert.equal(h.pilot.inspect().clips.parts.chord.clips.length,2);
 h.cc('MoveUndo',127);assert.equal(h.pilot.inspect().clips.parts.chord.clips.length,1);
});
test('Sample CC118 arms recording; transport Record CC86 does not',()=>{
  const h=host();let beat=0;
  h.context.host_module_get_param=key=>key==='clock'?JSON.stringify({beat,ready:true}):null;
  h.cc('MoveRec',127);assert.equal(h.pilot.inspect().recordArmed,false);
  h.cc('MoveSample',127);assert.equal(h.pilot.inspect().recordArmed,true);
  h.context.tick();assert.ok(h.ledCalls.some(args=>args[0]===118&&args[1]===1));
  h.cc('MoveSample',0);assert.equal(h.pilot.inspect().recordArmed,true);
  h.down(68);beat=3;h.up(68);
  assert.deepEqual(h.pilot.inspect().progression[0].timing,{steps:3,velocity:100});
  assert.equal(h.pilot.inspect().capture,false);
  assert.ok(h.ledCalls.length);
  h.cc('MoveSample',127);assert.equal(h.pilot.inspect().recordArmed,false);
  assert.ok(h.commands.some(c=>c.op==='record'&&c.enabled===1));
});

test('Lab Menu and Back toggle clips; tracks select part and pads create without live note-ons',()=>{
 const h=host();h.cc('MoveMenu',127);assert.equal(h.pilot.inspect().model.pageName,'CLIPS');
 h.context.onMidiMessageInternal([176,41,127]);assert.equal(h.pilot.inspect().clipPart,'melody');
 const n=h.commands.length;h.down(77);h.up(77);
 assert.equal(h.pilot.inspect().clips.parts.melody.selected,'clip-2');
 assert.ok(h.commands.slice(n).every(c=>c.op!=='on'));
 h.context.tick();assert.ok(h.labels.includes('CLIPS'));
 h.cc('MoveBack',127);assert.equal(h.pilot.inspect().clipView,false);
});
test('Sample records melody via real adapter and the melody step editor opens',()=>{
 const h=host();let beat=0;h.context.host_module_get_param=key=>key==='clock'?JSON.stringify({beat,ready:true}):null;
 h.context.onMidiMessageInternal([176,41,127]);h.cc('MoveSample',127);
 assert.equal(h.pilot.inspect().settings.recordPart,'melody');
 h.down(72);beat=1;h.up(72);h.cc('MoveSample',127);
 assert.ok(h.pilot.inspect().melodyProgression[0]);assert.ok(h.commands.some(c=>c.op==='melodyslot'&&c.notes.length));
 h.pilot.changePage(PAGES.indexOf('MELODY')-h.pilot.inspect().page);h.down(16);
 assert.equal(h.pilot.inspect().model.pageName,'M.STP1');h.up(16);
});
test('Track 2 selects bass-only recording and Sample preserves chord cells',()=>{
  const h=host();let beat=0;
  h.context.host_module_get_param=key=>key==='clock'?JSON.stringify({beat,ready:true}):null;
  h.down(16);h.up(16);
  const before=h.pilot.inspect().progression;
  h.pilot.changePage(PAGES.indexOf('BASS'));h.cc('MoveKnob1',1);
  h.context.onMidiMessageInternal([176,42,127]);h.cc('MoveSample',127);
  assert.equal(h.pilot.inspect().settings.recordPart,'bass');
  h.down(70);beat=2;h.up(70);h.cc('MoveSample',127);
  assert.deepEqual(h.pilot.inspect().progression,before);
  assert.equal(h.pilot.inspect().bassProgression[0].note%12,4);
  assert.equal(h.pilot.inspect().bassProgression[0].steps,2);
  assert.ok(h.commands.some(c=>c.op==='record'&&c.enabled&&c.record_part===2));
  h.context.tick();assert.ok(!h.pilot.inspect().recordArmed);
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
  h.down(16);h.up(16);
  assert.ok(h.pilot.inspect().progression[0]);
  h.cc('MoveDelete', 127); h.cc('MoveDelete', 0);
  h.down(16);
  assert.ok(h.pilot.inspect().progression[0]);
  assert.ok(h.commands.some(c => c.op === 'on' && c.owner === STEP_OWNER_START));
  h.up(16);
});

test('note 85 modifies harmony without triggering Play CC 85; labels have no numbers', () => {
  const h = host();
  h.context.onMidiMessageInternal([176,43,127]); // Track 1: chord controls
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
    h.down(note);h.up(note);
    assert.ok(h.pilot.inspect().progression[note-16]);
    h.down(note);h.up(note);
    assert.ok(h.commands.some(c=>c.op==='on'&&c.owner===STEP_OWNER_START+note-16));
  }
  for(let i=0;i<MAIN_PAGES.indexOf('MIDI');i++){h.cc('MoveMainButton',127);h.cc('MoveMainButton',0);}
  const before=h.commands.length;h.cc('MoveKnob8',1);
  assert.ok(h.commands.length>before);
  assert.ok(!h.commands.slice(before).some(c=>c.op==='arptest'||c.op==='on'));
  h.context.tick();assert.ok(h.labels.includes('A.OUT')&&h.labels.includes('A.CH'));
});

test('physical melody LEDs use purple root, blue chord, white scale and grey chromatic even in HOLD', () => {
  const h=host();h.down(68);h.up(68);
  h.context.onMidiMessageInternal([176,41,127]); // Track 3: melody controls
  h.cc('MoveKnob1',1); // SCALE -> CHROM
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

test('physical BORROW + jog latches independently of release order and single-page EDIT still exits', () => {
  const h = host(), count = h.commands.length;
  h.down(94);h.cc('MoveMainButton',127);h.up(94);h.cc('MoveMainButton',0);h.context.tick();
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
  h.down(94);h.cc('MoveMainButton',127);h.cc('MoveMainButton',0);h.up(94);
  assert.equal(h.pilot.inspect().borrowLocked, false);
  assert.equal(h.pilot.inspect().modifiers.borrow, undefined);
});

test('real adapter enters IDEAS, plays and stores a suggestion, then returns to the original bank', () => {
  const h=host();
  for(let i=0;i<MAIN_PAGES.indexOf('IDEAS');i++)h.cc('MoveMainKnob',1);
  assert.equal(h.pilot.inspect().model.pageName,'IDEAS');
  h.cc('MoveKnob1',1); assert.equal(h.pilot.inspect().ideasEnabled,true);
  h.down(76); h.up(76); assert.equal(h.pilot.inspect().active.kind,'idea');
  h.down(16);h.up(16);
  assert.ok(h.pilot.inspect().progression[0]);
  h.cc('MoveMainKnob',1); assert.equal(h.pilot.inspect().ideasEnabled,false);
  h.down(68); assert.equal(h.pilot.inspect().active.kind,'bank');
  assert.equal(h.pilot.inspect().active.chord.rootOffset,0);
});

// Schwung 1.7 bulk wire format: "<count>\n" then "<len>\n<bytes>" records.
function records(blob){
 const out=[];let at=blob.indexOf('\n')+1;const count=Number(blob.slice(0,at-1));
 for(let i=0;i<count;i++){const nl=blob.indexOf('\n',at),n=Number(blob.slice(at,nl));out.push(blob.slice(nl+1,nl+1+n));at=nl+1+n;}
 assert.equal(at,blob.length);return out;
}
for(const profile of ['lab','public']) {
 test(`${profile}: start uploads through Schwung bulk set in ordered chunks of 32`,()=>{
  const blobs=[];
  const h=host(profile,{host_module_set_params:blob=>{blobs.push(blob);return true;}});
  assert.ok(blobs.length>=1);assert.equal(h.commands.length,0,'no single round trips at start');
  const items=blobs.flatMap(records);
  for(let i=0;i<items.length;i+=2)assert.equal(items[i],'command');
  const ops=items.filter((_,i)=>i%2).map(j=>JSON.parse(j));
  assert.ok(blobs.every(b=>records(b).length<=64));
  assert.equal(ops[ops.length-1].op,'arm');assert.ok(ops.some(c=>c.op==='cleargrid'));
 });
 test(`${profile}: one bulk read per tick serves both state and clock`,()=>{
  let bulkReads=0,singles=0;
  const h=host(profile,{
   host_module_get_params:blob=>{bulkReads++;assert.deepEqual(records(blob),['state','clock']);
    const st=JSON.stringify({v:1,armed:false,running:false}),ck=JSON.stringify({beat:4,ready:true,bpm:120});
    return `2\n${st.length}\n${st}${ck.length}\n${ck}`;},
   host_module_get_param:key=>{singles++;throw new Error('single read '+key);}});
  bulkReads=0;singles=0; // start-up may probe once; ticks must not
  h.context.tick();h.context.tick();
  assert.equal(bulkReads,2);assert.equal(singles,0);
 });
}
test('co-run: no screen model is built while the chain editor owns the display',()=>{
 let corun=null;
 const h=host('lab',{shadow_corun_state:()=>corun,shadow_corun_end:()=>{corun=null;},
  shadow_corun_begin_cede:(target,id)=>{corun={target,id};},CORUN_TARGET_CHAIN_EDIT:1,CORUN_F_OWN_BACK:1,
  CORUN_GRP_OLED:1,CORUN_GRP_KNOBS:2,CORUN_GRP_JOG:4,CORUN_GRP_TOUCH:8,CORUN_GRP_BACK:16});
 h.cc('MoveShift',127);h.context.onMidiMessageInternal([176,43,127]);h.cc('MoveShift',0);
 assert.ok(corun,'chain view open');h.labels.length=0;
 h.cc('MoveUp',127);h.context.tick();
 assert.equal(h.labels.length,0);
 corun=null;h.context.tick();assert.ok(h.labels.length>0,'repaints on return');
});
test('physical Loop + step sets length, native Record hints Sample, Copy and arrows reach held steps',()=>{
  for(const profile of ['public','lab']){
    const h=host(profile);
    h.cc('MoveLoop',127);h.down(17);h.up(17);h.cc('MoveLoop',0);
    assert.equal(h.pilot.inspect().clips.parts.chord.clips[0].length,32);assert.equal(h.pilot.inspect().armed,false);
    h.cc('MoveRec',127);assert.equal(h.pilot.inspect().model.detail,'REC: use Sample button');assert.equal(h.pilot.inspect().recordArmed,false);
    h.down(68);h.up(68);h.down(16);h.up(16);
    h.down(16);h.cc('MoveRight',127);h.cc('MoveShift',127);h.cc('MoveRight',127);h.cc('MoveShift',0);h.up(16);
    assert.equal(h.pilot.inspect().progression[0].performance.nudge,.11);assert.equal(h.pilot.inspect().stepPages.chord,0);
    h.cc('MoveCopy',127);h.down(16);h.up(16);h.down(20);h.up(20);h.cc('MoveCopy',0);
    assert.equal(h.pilot.inspect().progression[4].performance.start,4);
  }
});
test('physical Shift + step runs shortcuts instead of storing; held pad + step overwrites',()=>{
  for(const profile of ['public','lab']){
    const h=host(profile);h.down(68);h.up(68);
    h.cc('MoveShift',127);h.down(21);h.up(21);h.cc('MoveShift',0);
    assert.equal(h.pilot.inspect().settings.metronome,'on');assert.ok(!h.pilot.inspect().progression.some(Boolean));
    h.down(16);h.up(16);h.down(71);h.down(16);h.up(16);h.up(71);
    assert.equal(h.pilot.inspect().progression[0].rootOffset,5);
  }
});
test('LED repaints stay under the host packet budget per tick and still complete',()=>{
  for(const profile of ['public','lab']){
    const h=host(profile);const perTick=[h.ledCalls.length];
    for(let i=0;i<8;i++){const n=h.ledCalls.length;h.context.tick();perTick.push(h.ledCalls.length-n);}
    assert.ok(perTick.every(n=>n<=24),perTick.join());
    const pads=new Set(h.ledCalls.filter(c=>c[0]>=68&&c[0]<=99).map(c=>c[0]));assert.equal(pads.size,32);
    const n=h.ledCalls.length;h.cc('MoveShift',127);h.context.tick();h.context.tick();h.context.tick();
    assert.ok(h.ledCalls.length>n);const m=h.ledCalls.length;h.context.tick();assert.equal(h.ledCalls.length,m);
  }
});
