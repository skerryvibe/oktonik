import test from 'node:test';
import assert from 'node:assert/strict';
import {createPilot,CHORD_PADS as C,MELODY_PADS as M,PAGES} from '../src/pilot.mjs';
import {encodeDocument,STATE_PATH,normalizeSettings} from '../src/settings.mjs';

// Shift + step N is shiftStep(N - 1).
function setup(profile='lab',settings={}) {
  // A current project: clips saved by this version (unquantized), not a legacy document.
  const fresh=createPilot({});fresh.init();
  let text=encodeDocument(settings,[],[],[],[],fresh.inspect().clips);const commands=[];const leds=[];
  const p=createPilot({profile,read:k=>k===STATE_PATH?text:null,write:(_k,v)=>{text=v;return true;},
    clock:()=>({beat:0,ready:false}),send:c=>{commands.push(c);return true;},leds:u=>leds.splice(0,leds.length,...u)});
  p.init();
  return {p,commands,leds,saved:()=>JSON.parse(text),detail:()=>p.inspect().model.detail};
}

test('new projects start with BASS and bass gesture on and quantize off',()=>{
  const s=normalizeSettings({});assert.equal(s.bassEnabled,true);assert.equal(s.bassGesture,true);
  assert.equal(s.quantize,100);
  const fresh=createPilot({});fresh.init();assert.ok(Object.values(fresh.inspect().clips.parts).every(b=>b.clips[0].quantize===0));assert.equal(s.metroVolume,100);assert.equal(s.chordRecord,'all');
  assert.equal(normalizeSettings({bassEnabled:false,bassGesture:false}).bassEnabled,false);
});
for(const profile of ['public','lab']) {
  test(`${profile}: Shift + step 6 cycles METRO, 10 full velocity`,()=>{
    const h=setup(profile);
    h.p.shiftStep(5);assert.equal(h.p.inspect().settings.metronome,'on');assert.equal(h.detail(),'METRO: ON');
    assert.deepEqual(h.commands.findLast(c=>c.op==='metro'),{op:'metro',enabled:1,velocity:100});
    h.p.shiftStep(5);h.p.shiftStep(5);assert.equal(h.p.inspect().settings.metronome,'off');
    h.p.shiftStep(9);h.p.pad(C[0],true,40);assert.equal(h.commands.findLast(c=>c.op==='on'&&c.owner===0).velocity,127);h.p.pad(C[0],false);
    h.p.unload();assert.equal(h.saved().settings.fullVelocity,true);
  });
  test(`${profile}: Shift + step 7 only opens/closes the STRUM menu; knob 5 turns strum on/off`,()=>{
    const h=setup(profile);h.p.shiftStep(6);assert.equal(h.p.inspect().settings.strumMs,0);
    const m=h.p.inspect().model;assert.equal(m.pageName,'STRUM');
    assert.deepEqual(m.cells.slice(0,5).map(c=>c.id),['strumMs','strumDirection','strumTiming','strumVelocity','strumOn']);
    h.p.knob(4,1);assert.equal(h.p.inspect().settings.strumMs,30);
    h.p.knob(1,1);assert.equal(h.p.inspect().settings.strumDirection,1);
    h.p.pad(C[0],true);const on=h.commands.findLast(c=>c.op==='on'&&c.owner===0);assert.equal(on.strum_dir,1);h.p.pad(C[0],false);
    h.p.knob(0,2);const gap=h.p.inspect().settings.strumMs;
    h.p.shiftStep(6);assert.equal(h.p.inspect().settings.strumMs,gap);assert.notEqual(h.p.inspect().model.pageName,'STRUM');
    h.p.shiftStep(6);h.p.knob(4,-1);assert.equal(h.p.inspect().settings.strumMs,0);h.p.knob(4,1);assert.equal(h.p.inspect().settings.strumMs,gap);
  });
  test(`${profile}: Shift + step 8 switches right pads only when BASS is on`,()=>{
    const h=setup(profile,{bassEnabled:false});h.p.shiftStep(7);assert.equal(h.detail(),'Enable BASS first');assert.equal(h.p.inspect().settings.bassPads,false);
    const on=setup(profile);on.p.shiftStep(7);assert.equal(on.p.inspect().settings.bassPads,true);
    on.p.shiftStep(7);assert.equal(on.p.inspect().settings.bassPads,false);
  });
  test(`${profile}: Shift + step 9 opens SCALE; knobs edit key/scale/melody; Back closes`,()=>{
    const h=setup(profile);h.p.shiftStep(8);const m=h.p.inspect().model;
    assert.equal(m.pageName,'SCALE');assert.deepEqual(m.cells.slice(0,4).map(c=>c.id),['key','scaleId','melodyMode','melodyAdapt']);
    h.p.knob(0,2);assert.equal(h.p.inspect().settings.key,2);
    assert.equal(h.p.back(),true);assert.notEqual(h.p.inspect().model.pageName,'SCALE');
    h.p.shiftStep(8);h.p.shiftStep(8);assert.notEqual(h.p.inspect().model.pageName,'SCALE');
  });
  test(`${profile}: Shift + step 3 opens SETUP with QNT amount, COUNT, METRO, volume and Track 1 REC`,()=>{
    const h=setup(profile);h.p.shiftStep(2);const m=h.p.inspect().model;assert.equal(m.pageName,'SETUP');
    assert.deepEqual(m.cells.slice(0,5).map(c=>c.id),['quantizeAmount','countIn','metronome','metroVolume','chordRecord']);
    h.p.knob(0,-30);assert.equal(h.p.inspect().settings.quantize,70);
    h.p.knob(3,-2);assert.equal(h.p.inspect().settings.metroVolume,80);assert.equal(h.commands.findLast(c=>c.op==='metro').velocity,80);
    h.p.knob(4,-1);assert.equal(h.p.inspect().settings.chordRecord,'both');
    h.p.back();h.p.track(0);h.p.recordContext();assert.equal(h.p.inspect().settings.recordPart,'both');h.p.recordContext();
    h.p.track(1);h.p.recordContext();assert.equal(h.p.inspect().settings.recordPart,'bass');
  });
  test(`${profile}: Shift + step 2 opens MIDI; step 13 is left to Schwung`,()=>{
    const h=setup(profile);h.p.shiftStep(1);assert.equal(h.p.inspect().model.pageName,'MIDI');
    const before=JSON.stringify(h.p.inspect().settings),n=h.commands.length;
    h.p.shiftStep(12);assert.equal(JSON.stringify(h.p.inspect().settings),before);assert.equal(h.commands.length,n);
  });
  test(`${profile}: Shift + step 16 applies the set quantize amount; 14 new clip, 15 double`,()=>{
    const h=setup(profile,{quantize:60});const q=p=>h.p.inspect().clips.parts[p].clips[0].quantize;
    h.p.pad(C[0],true);h.p.pad(C[0],false);h.p.step(2,true);h.p.step(2,false);
    h.p.shiftStep(15);assert.deepEqual(['chord','bass','melody'].map(q),[60,60,60]);assert.equal(h.detail(),'QNT 60% all clips');
    h.p.track(2);h.p.shiftStep(15);assert.equal(q('melody'),0);assert.equal(q('chord'),60);assert.equal(h.detail(),'QNT OFF');
    h.p.shiftStep(2);h.p.knob(0,-40);h.p.back();h.p.shiftStep(15);assert.equal(q('melody'),20);
    h.p.track(0);h.p.menu();assert.equal(h.p.inspect().model.cells[2].value,'60%');h.p.knob(2,5);assert.equal(q('chord'),65);h.p.back();
    h.p.shiftStep(15);assert.equal(q('chord'),0);assert.equal(h.detail(),'QNT OFF');h.p.back();
    h.p.shiftStep(14);const c=h.p.inspect().clips.parts.chord.clips[0];
    assert.equal(c.length,32);assert.equal(c.events[18].snapshot.notes.join(),c.events[2].snapshot.notes.join());
    assert.match(h.detail(),/Doubled: 32/);h.p.undo();assert.equal(h.p.inspect().clips.parts.chord.clips[0].length,16);
    h.p.shiftStep(13);assert.equal(h.p.inspect().clips.parts.chord.selected,'clip-2');assert.match(h.detail(),/CHORD clip 2/);
  });
  test(`${profile}: Shift lights the icons; steps show state (white on, METRO blue/red)`,()=>{
    const h=setup(profile);h.p.shift(true);h.p.repaint(true);
    const icon=step=>h.leds.find(l=>l.note===15+step&&l.button).role,role=step=>h.leds.find(l=>l.note===15+step&&!l.button).role;
    assert.equal(icon(6),'icon');assert.equal(icon(13),'off');assert.equal(icon(1),'off');assert.equal(icon(11),profile==='lab'?'icon':'off');
    assert.equal(role(6),'off');assert.equal(role(7),'off');assert.equal(role(16),'off');
    h.p.shiftStep(5);h.p.repaint(true);assert.equal(role(6),'metroOn');h.p.shiftStep(5);h.p.repaint(true);assert.equal(role(6),'metroRec');
    h.p.shiftStep(6);h.p.knob(4,1);h.p.shiftStep(15);h.p.repaint(true);assert.equal(role(7),'lit');assert.equal(role(16),'lit');
    const n=h.commands.length;h.p.step(5,false);assert.ok(!h.commands.slice(n).some(c=>c.op==='off'));
    h.p.shift(false);h.p.repaint(true);assert.equal(icon(6),'off');assert.equal(role(6),'off');
  });
}
test('Lab Shift + step 11 toggles ARP and step 5 reaches the free ARP tempo; Public explains tempo',()=>{
  const h=setup('lab');h.p.shiftStep(10);assert.equal(h.p.inspect().settings.arpEnabled,true);assert.equal(h.commands.findLast(c=>c.op==='arp').enabled,1);
  h.p.shiftStep(10);assert.equal(h.p.inspect().settings.arpEnabled,false);
  h.p.shift(true);h.p.shiftStep(4);assert.equal(h.p.inspect().model.pageName,'A.CLOCK');h.p.shift(false);assert.equal(PAGES[h.p.inspect().page],'ARP');
  const pub=setup('public');pub.p.shiftStep(10);assert.equal(pub.p.inspect().settings.arpEnabled,false);
  pub.p.shiftStep(4);assert.equal(pub.detail(),'Tempo: set in Move');
});
test('holding a chord pad or melody pad overwrites a filled step without auditioning it',()=>{
  for(const profile of ['public','lab']){
    const h=setup(profile,{bassGesture:false});h.p.pad(C[0],true);h.p.pad(C[0],false);h.p.step(0,true);h.p.step(0,false);
    h.p.pad(C[3],true);const n=h.commands.length;h.p.step(0,true);h.p.step(0,false);h.p.pad(C[3],false);
    assert.equal(h.p.inspect().progression[0].rootOffset,5);assert.ok(!h.commands.slice(n).some(c=>c.op==='on'));
    h.p.track(2);h.p.pad(M[0],true);h.p.pad(M[0],false);h.p.step(1,true);h.p.step(1,false);const first=h.p.inspect().melodyProgression[1].note;
    h.p.pad(M[4],true);h.p.step(1,true);h.p.step(1,false);h.p.pad(M[4],false);
    assert.notEqual(h.p.inspect().melodyProgression[1].note,first);
  }
});
test('doubling refuses a loop whose extra attacks would exceed the DSP event slots',()=>{
  const seed=setup('lab');seed.p.pad(C[0],true);seed.p.pad(C[0],false);seed.p.step(0,true);seed.p.step(0,false);
  const event=seed.p.inspect().progression[0],clips=seed.p.inspect().clips,clip=clips.parts.chord.clips[0];
  // 32 steps with two extra attacks each: 64 + 2*64 slots after doubling is over 128.
  clip.length=32;clip.events=Array.from({length:32},(_,i)=>({...event,performance:{start:i,duration:.2},
    more:[{...event,performance:{start:i+.3,duration:.2}},{...event,performance:{start:i+.6,duration:.2}}]}));
  let text=encodeDocument({},[],[],[],[],clips);
  const p=createPilot({profile:'lab',read:k=>k===STATE_PATH?text:null,write:(_k,v)=>{text=v;return true;},send:()=>true});p.init();
  assert.equal(p.inspect().clips.parts.chord.clips[0].length,32);
  p.shiftStep(14);assert.equal(p.inspect().model.detail,'Too many events');assert.equal(p.inspect().clips.parts.chord.clips[0].length,32);
});
