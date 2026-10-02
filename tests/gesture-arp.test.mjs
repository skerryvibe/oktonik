import test from 'node:test';
import {navigate} from './navigate.mjs';
import assert from 'node:assert/strict';
import { createPilot, CHORD_PADS as C, PAGES, LIVE_BASS_OWNER as B, STOP_PAD } from '../src/pilot.mjs';
import { encodeDocument, STATE_PATH, normalizeSettings } from '../src/settings.mjs';
import { createProjectPilot, ACTIVE_SET_PATH } from '../src/project.mjs';

function setup(settings = {}) {
  const files = new Map([[STATE_PATH, encodeDocument({ bassEnabled: true, bassGesture: true, ...settings }, [])]]);
  const commands = [];
  const pilot = createPilot({ read: p => files.get(p), write: (p,s) => { files.set(p,s); return true; }, send: c => commands.push(c) });
  pilot.init();
  const page = name => { pilot.selectEdit(-1); navigate(pilot,name); };
  const turn = (id, delta) => { const i = pilot.inspect().model.cells.findIndex(c => c.id === id); assert.ok(i >= 0, id); pilot.knob(i, delta); };
  const down = i => pilot.pad(C[i], true), up = i => pilot.pad(C[i], false);
  const bass = () => new Map(pilot.inspect().voices).get(B)?.notes[0];
  return { pilot, commands, files, down, up, bass, page, turn };
}

test('F plus Em produces F/E without another chord or arpeggio source; release preserves E', () => {
  const h = setup({ arpEnabled: true }); h.down(3);
  const notes = [...h.pilot.inspect().active.notes], before = h.commands.length;
  h.down(2); assert.equal(h.bass(), 40);
  assert.deepEqual(h.pilot.inspect().active.notes, notes);
  assert.equal(h.pilot.inspect().model.chordLabel, 'F/E');
  assert.ok(!h.commands.slice(before).some(c => c.op === 'arpsrc' || c.op === 'on' && c.owner !== B));
  h.up(2); assert.equal(h.bass(), 40); h.up(3);
  assert.equal(h.pilot.inspect().voices.length, 0);
});

test('anchor release never promotes a bass selector; a fresh press is required even with SUST', () => {
  for (const autoSustain of [false,true]) {
    const h = setup({autoSustain}); h.down(3); h.down(2); h.up(3);
    assert.equal(h.pilot.inspect().active.index,3); assert.equal(h.pilot.inspect().active.kind,'bank');
    assert.equal(h.bass(),40);
    assert.ok(!new Map(h.pilot.inspect().voices).has(2));
    h.down(2);assert.equal(h.pilot.inspect().active.index,3);
    h.up(2);
    assert.equal(h.pilot.inspect().voices.length, autoSustain ? 2 : 0);
    h.down(2);assert.equal(h.pilot.inspect().active.index,2);h.up(2);
    h.pilot.panic(); assert.equal(h.pilot.inspect().voices.length,0);
  }
});

test('multiple bass targets use last-press priority; steps capture the transient bass only', () => {
  const h = setup(); h.down(0); h.down(6); assert.equal(h.bass(),35);
  h.down(5); assert.equal(h.bass(),33); h.up(5); assert.equal(h.bass(),33);
  h.pilot.step(15,true,{shift:true}); assert.equal(h.pilot.inspect().progression[15].snapshot.bass,33);
  assert.equal(h.pilot.inspect().overrides[0],null);
  h.up(6); assert.equal(h.bass(),33); h.up(0);
  h.pilot.step(15,true); assert.equal(h.bass(),33);
  assert.equal(h.pilot.inspect().model.chordLabel,'C/A');
});

test('v2 A/B/C: re-pressing the released anchor chooses bass only until the final release', () => {
  const h=setup({autoSustain:true});h.down(0);h.down(2);h.up(0);
  assert.equal(h.bass(),40);assert.equal(h.pilot.inspect().active.index,0);
  h.down(0);assert.equal(h.bass()%12,0);h.up(2);
  for(const i of [4,6]) {h.down(i);h.up(i);}
  h.up(0);assert.equal(h.pilot.inspect().voices.length,2);
  assert.equal(h.commands.filter(c=>c.op==='on'&&c.owner===0).length,1);
  h.down(2);assert.equal(h.pilot.inspect().active.index,2);
});

function permutations(xs) {return xs.length ? xs.flatMap((x,i)=>permutations(xs.filter((_,j)=>j!==i)).map(t=>[x,...t])) : [[]];}

test('SUST and ARP HOLD combine with gesture: final release sustains, next press starts new harmony',()=>{
  for(const arpHold of [false,true]) for(const arpClock of ['sync','free']) {
    const h=setup({autoSustain:true,arpEnabled:true,arpHold,arpClock});
    h.down(0);h.down(2);const before=h.commands.length;h.up(0);h.up(2);
    assert.equal(h.pilot.inspect().bassGesture.active,false);
    assert.equal(h.pilot.inspect().model.chordLabel,'C/E');
    assert.equal(h.bass(),40);
    assert.ok(h.pilot.inspect().voices.every(([,v])=>v.sustained));
    assert.ok(!h.commands.slice(before).some(c=>c.op==='on'||c.op==='arpsrc'));
    h.pilot.step(0,true,{shift:true});
    assert.equal(h.pilot.inspect().progression[0].snapshot.bass,40);
    h.down(3);
    assert.equal(h.pilot.inspect().active.index,3);assert.equal(h.bass(),41);
    assert.equal(h.pilot.inspect().model.chordLabel,'F');
    assert.ok(!new Map(h.pilot.inspect().voices).has(0));
    h.up(3);h.page('CHORDS');h.turn('chordSustain',-1);
    h.page('BASS');h.turn('bassSustain',-1);
    assert.equal(h.pilot.inspect().voices.length,0);
    assert.deepEqual(h.commands.findLast(c=>c.op==='arpsrc').notes,[]);
    h.pilot.panic();assert.equal(h.commands.findLast(c=>c.op==='arpsrc').enabled,0);
  }
});

test('CHORD arp direction persists, disables RANGE only in that mode and preserves its value',()=>{
  const h=setup({arpRange:3});h.page('ARP');h.turn('arpDirection',4);
  assert.equal(h.pilot.inspect().model.cells[2].value,'CHORD');
  assert.equal(h.pilot.inspect().model.cells[3].disabled,true);
  h.turn('arpRange',1);assert.equal(h.pilot.inspect().settings.arpRange,3);
  h.pilot.unload();const p=createPilot({read:k=>h.files.get(k)});p.init();
  assert.equal(p.inspect().settings.arpDirection,4);
  h.turn('arpDirection',-1);assert.equal(h.pilot.inspect().model.cells[3].disabled,false);
});
test('all 24 release orders preserve harmony and emit no note-ons, then release ownership', () => {
  for(const autoSustain of [false,true]) for(const order of permutations([0,2,4,6])) {
    const h=setup({autoSustain});[0,2,4,6].forEach(h.down);const start=h.commands.length;
    const pitch=h.bass();
    order.forEach((i,n)=>{h.up(i);assert.equal(h.pilot.inspect().active.index,0);
      if(n<3) assert.equal(h.bass(),pitch);});
    assert.ok(!h.commands.slice(start).some(c=>c.op==='on'));
    assert.equal(h.pilot.inspect().voices.length,autoSustain ? 2 : 0);
    assert.equal(h.pilot.inspect().bassGesture.active,false);
  }
});

test('C C/E C/G C/B C uses presses only, and ending or disabling the gesture releases its owner',()=>{
  const h=setup();h.down(0);
  for(const [pad,pc] of [[2,4],[4,7],[6,11]]){h.down(pad);assert.equal(h.bass()%12,pc);}
  h.up(0);h.down(0);assert.equal(h.bass()%12,0);
  assert.equal(h.commands.filter(c=>c.op==='on'&&c.owner===0).length,1);
  h.up(0);h.page('BASS');h.turn('bassGesture',-1);
  assert.equal(h.pilot.inspect().voices.length,0);
  [2,4,6].forEach(h.up);assert.equal(h.pilot.inspect().voices.length,0);
});

test('diagnostic controls are removed and FREE clock settings persist',()=>{
  const h=setup();
  for(const page of PAGES){h.page(page);assert.ok(!h.pilot.inspect().model.cells.some(c=>['arpDiagnostics','arpTest'].includes(c.id)));}
  h.page('A.CLOCK');h.turn('arpClock',1);h.turn('arpBpm',17);
  assert.equal(h.commands.findLast(c=>c.op==='arp').clock,1);
  assert.equal(h.commands.findLast(c=>c.op==='arp').bpm,137);
  h.pilot.unload();const restored=createPilot({read:p=>h.files.get(p)});restored.init();
  assert.equal(restored.inspect().settings.arpClock,'free');
  assert.equal(restored.inspect().settings.arpBpm,137);
});

test('gesture is opt-in, requires bass, and modifiers and EDIT remain silent', () => {
  for (const settings of [{bassGesture:false},{bassEnabled:false}]) {
    const h=setup(settings);h.down(3);h.down(2);assert.equal(h.pilot.inspect().active.index,2);
  }
  const h=setup(); h.down(3); h.pilot.pad(84,true); const before=h.commands.length;
  h.pilot.pad(C[2],true,100,{shift:true}); assert.equal(h.commands.length,before);
  h.pilot.pad(C[2],false);assert.equal(h.bass(),41);
  h.down(2); // DOM of E = B, nearest F bass is B1 on tie.
  assert.equal(h.bass()%12,11);assert.equal(h.pilot.inspect().active.index,3);
  h.pilot.pad(STOP_PAD,true);h.up(3);h.up(2);h.pilot.pad(STOP_PAD,false);
  h.down(0);assert.equal(h.bass(),36);
});

test('ARP exposes eight controls and independent routing; settings survive reload', () => {
  const h=setup();h.page('ARP');
  assert.deepEqual(h.pilot.inspect().model.cells.map(c=>c.label),['ARP','RATE','DIR','RANGE','GATE','SWING','VEL','HOLD']);
  h.turn('arpEnabled',1);h.turn('arpRate',1);h.turn('arpDirection',2);h.turn('arpRange',2);
  h.turn('arpGate',-20);h.turn('arpSwing',25);h.turn('arpVelocity',-15);h.turn('arpHold',1);
  h.page('MIDI');h.turn('arpRoute',1);h.turn('arpChannel',3);
  assert.deepEqual(h.commands.findLast(c=>c.op==='arp'),{op:'arp',enabled:1,rate:1,direction:2,range:3,gate:50,swing:25,velocity:85,hold:1,route:1,channel:4,clock:0,bpm:120});
  h.down(0);assert.deepEqual(h.commands.findLast(c=>c.op==='arpsrc').notes,h.pilot.inspect().active.notes);
  h.up(0);assert.deepEqual(h.commands.findLast(c=>c.op==='arpsrc').notes,[]);
  h.pilot.unload();const restored=createPilot({read:p=>h.files.get(p)});restored.init();
  assert.deepEqual(restored.inspect().settings,h.pilot.inspect().settings);
  assert.equal(restored.inspect().voices.length,0);
});

test('ARP validation is bounded and project switching resets performance but preserves each set controls', () => {
  const s=normalizeSettings({arpRange:100,arpGate:-1,arpRate:100,arpDirection:100,arpSwing:200,arpVelocity:0,arpChannel:90,arpRoute:'invalid'});
  assert.deepEqual([s.arpRange,s.arpGate,s.arpRate,s.arpDirection,s.arpSwing,s.arpVelocity,s.arpChannel,s.arpRoute],[4,10,4,4,50,1,15,'move']);
  const files=new Map([[ACTIVE_SET_PATH,'A\nProject A']]),commands=[];let now=0;
  const p=createProjectPilot({now:()=>now,read:k=>files.get(k),write:(k,v)=>{files.set(k,v);return true;},send:c=>commands.push(c)});
  p.init();p.changePage(PAGES.indexOf('ARP'));p.knob(0,1);p.knob(7,1);p.pad(C[0],true);
  files.set(ACTIVE_SET_PATH,'B\nProject B');now+=1000;p.tick();
  assert.equal(p.inspect().settings.arpEnabled,false);assert.equal(p.inspect().voices.length,0);
  assert.ok(commands.some(c=>c.op==='panic'));
  files.set(ACTIVE_SET_PATH,'A\nProject A');now+=1000;p.tick();
  assert.equal(p.inspect().settings.arpEnabled,true);assert.equal(p.inspect().settings.arpHold,true);
  assert.equal(p.inspect().voices.length,0);
});
