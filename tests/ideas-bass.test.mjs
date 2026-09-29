import test from 'node:test';
import assert from 'node:assert/strict';
import { createPilot, PAGES, CHORD_PADS as C, MELODY_PADS as M, LIVE_BASS_OWNER as B, STOP_PAD } from '../src/pilot.mjs';
import { generateIdeas, ideasContext } from '../src/ideas.mjs';
import { buildChordBank, buildPadChord, chordNotes, chordName, bassNotes, applyModifiers, SCALES } from '../src/theory.mjs';
import { STATE_PATH, MODULE_DIR, normalizeSettings, encodeDocument, decodeDocument, normalizeChord } from '../src/settings.mjs';

function setup(settings = {}, files = new Map([[STATE_PATH, encodeDocument(settings, [])]])) {
  const commands = [], frames = [], leds = [];
  const pilot = createPilot({ read: p => files.get(p), write: (p,t) => {files.set(p,t); return true;}, send: c => commands.push(c),
    render: m => frames.push(m), leds: m => leds.push(m) });
  pilot.init();
  const page = name => pilot.changePage(PAGES.indexOf(name) - pilot.inspect().page);
  const turn = (id, delta) => { const index = pilot.inspect().model.cells.findIndex(c => c.id === id); assert.ok(index>=0,id); pilot.knob(index,delta); };
  const play = i => { pilot.pad(C[i],true); pilot.pad(C[i],false); return pilot.inspect().active.chord; };
  const start = () => {page('IDEAS'); turn('ideasEnabled',1);};
  return {pilot,commands,frames,leds,files,page,turn,play,start};
}
const notes = p => new Map(p.inspect().voices);
const sig = c => c.rootOffset + ':' + [...new Set(c.intervals.map(n=>n%12))].sort((a,b)=>a-b).join(',');

test('fresh module defaults are close, lead off and sixteen empty steps, without reading Chord Finder', () => {
  const old = JSON.stringify({ spread:2, progression:[{tonicOffset:0,quality:'major'},{tonicOffset:5,quality:'major'}] });
  const {pilot,commands,leds} = setup({},new Map([['/data/UserData/schwung/modules/tools/chord-finder/settings.json',old]]));
  const state=pilot.inspect();
  assert.equal(state.settings.spread,0); assert.equal(state.settings.voiceLead,false);
  assert.equal(state.settings.bassMode,'root'); assert.equal(state.ideasEnabled,false);
  assert.ok(state.progression.every(c=>c===null));
  assert.equal(state.progression.length,16);
  assert.ok(commands.filter(c=>c.op==='slot').every(c=>c.notes.length===0 && c.bass===-1));
  assert.ok(leds[0].filter(l=>l.note>=16 && l.note<=31).every(l=>l.role==='off'));
  assert.ok(!state.model.cells.some(c=>c.id==='inversion'));
});

test('v5 upgrades preserve explicit lead, spread, personal steps and local voicings; new state is separate', () => {
  const oldPath='/data/UserData/schwung/modules/tools/chord-pilot/pilot-state-v5.json';
  const old=JSON.stringify({format:'chord-pilot',schemaVersion:5,settings:{spread:2,voiceLead:true,melodyRetrigger:false},
    progression:buildChordBank().slice(0,2),overrides:[{inversion:1,lockInversion:true}]});
  const {pilot,files,page}=setup({},new Map([[oldPath,old]])); pilot.tick();
  const state=pilot.inspect();
  assert.equal(state.settings.spread,2); assert.equal(state.settings.voiceLead,true);
  assert.equal(state.progression.filter(Boolean).length,2); assert.equal(state.bank[0].inversion,1);
  assert.equal(state.settings.melodyRetrigger,true); page('MELODY');
  assert.ok(!pilot.inspect().model.cells.some(c=>c.id==='melodyRetrigger'));
  assert.equal(files.get(oldPath),old); assert.equal(JSON.parse(files.get(STATE_PATH)).schemaVersion,7);
});

test('NEXT produces eight distinct valid candidates for every scale, color and borrow context', () => {
  for (const scale of SCALES) for (const key of [0,2,11]) for (const borrow of [false,true]) for (const color of ['IN','MIX','OUT']) {
    const settings={scaleId:scale.id,key,extension:1}; const bank=buildChordBank(settings);
    const before=JSON.stringify(bank), ideas=generateIdeas(bank[0],settings,{color,borrow,bank});
    assert.equal(ideas.length,8,scale.id+' '+color+' '+borrow);
    assert.equal(new Set(ideas.map(i=>sig(i.chord))).size,8);
    assert.equal(JSON.stringify(bank),before);
    const context=ideasContext(settings,borrow), pitches=SCALES.find(s=>s.id===context.scaleId).intervals;
    for (const idea of ideas) {
      assert.ok(normalizeChord(idea.chord)); assert.ok(idea.reason);
      assert.ok(chordNotes(idea.chord,settings).every(n=>n>=0 && n<=127));
      if(color==='IN') assert.ok(idea.chord.intervals.every(n=>pitches.includes((n+idea.chord.rootOffset)%12)));
    }
    if(color==='MIX') {assert.ok(ideas.slice(0,4).every(i=>!i.outside));assert.ok(ideas.slice(4).every(i=>i.outside));}
    assert.deepEqual(generateIdeas(bank[0],settings,{color,borrow,bank}),ideas);
  }
});

test('generation responds to the played chord and prioritizes an explicit secondary-dominant target', () => {
  const bank=buildChordBank(), dom=applyModifiers(bank[1],{dom:true});
  const c=generateIdeas(bank[0]), a7=generateIdeas(dom);
  assert.notDeepEqual(c,a7);
  assert.equal(a7[0].chord.rootOffset,2);
});

test('IDEAS bank is opt-in and stable; NEW and COLOR do not alter sounding snapshots or user chords', () => {
  const {pilot,commands,page,turn,start}=setup({autoSustain:true,bassEnabled:true});
  const original=structuredClone(pilot.inspect().bank);
  page('IDEAS'); assert.equal(pilot.inspect().ideasEnabled,false);
  pilot.pad(C[0],true); pilot.pad(C[0],false);
  const count=commands.length; start(); assert.equal(commands.length,count);
  const candidates=structuredClone(pilot.inspect().ideas);
  pilot.pad(C[0],true); pilot.pad(M[1],true);
  const sounding=structuredClone(pilot.inspect().voices), active=structuredClone(pilot.inspect().active), before=commands.length;
  turn('ideasNew',1);
  assert.deepEqual(pilot.inspect().voices,sounding); assert.deepEqual(pilot.inspect().active,active);
  assert.equal(commands.length,before); assert.notDeepEqual(pilot.inspect().ideas,candidates);
  turn('ideasColor',1); assert.deepEqual(pilot.inspect().voices,sounding); assert.equal(commands.length,before);
  pilot.pad(C[0],false);
  assert.equal(notes(pilot).get(0).sustained,true);
  assert.deepEqual(pilot.inspect().bank,original); assert.ok(pilot.inspect().overrides.every(x=>x===null));
});

test('ideas reuse chord strum, bass, melody, routing, capture and step storage without mutating the regular pads', () => {
  const {pilot,commands,start,play,files}=setup({bassEnabled:true,bassMode:'low',voiceLead:true,previewRoute:'external',channel:2,
    melodyRoute:'schwung',melodyChannel:3,bassRoute:'move',bassChannel:4,strumMs:10,autoSustain:true});
  start(); pilot.capture(); pilot.pad(M[1],true); const chord=play(4);
  assert.equal(pilot.inspect().active.kind,'idea');
  assert.deepEqual(normalizeChord(pilot.inspect().progression[0]),normalizeChord(chord));
  assert.ok(commands.some(c=>c.op==='on' && c.owner===4 && c.route===1 && c.channel===2 && c.strum_ms===10));
  assert.ok(commands.some(c=>c.op==='on' && c.owner===B && c.route===0 && c.channel===4));
  const tone=notes(pilot).get(9).notes[0]%12;
  assert.ok(chord.intervals.some(n=>(n+chord.rootOffset)%12===tone));
  pilot.step(1,true,{shift:true}); assert.deepEqual(normalizeChord(pilot.inspect().progression[1]),normalizeChord(chord));
  pilot.pad(C[2],true,100,{shift:true}); assert.equal(pilot.inspect().editIndex,-1);
  assert.ok(pilot.inspect().overrides.every(x=>x===null));
  pilot.unload(); const restored=setup({},files).pilot;
  assert.equal(restored.inspect().ideasEnabled,false); assert.deepEqual(normalizeChord(restored.inspect().progression[1]),normalizeChord(chord));
});

test('leaving IDEAS restores regular pad mapping without killing held ideas; later parameter edits use their snapshot', () => {
  const {pilot,commands,start,page,turn}=setup({bassEnabled:true}); start();
  pilot.pad(C[5],true); const chord=structuredClone(pilot.inspect().active.chord), before=commands.length;
  page('BASS'); assert.equal(pilot.inspect().ideasEnabled,false); assert.equal(commands.length,before);
  turn('bassMode',1);
  assert.deepEqual(notes(pilot).get(5).chord,chord);
  assert.equal(notes(pilot).get(B).notes[0]%12,notes(pilot).get(5).notes[0]%12);
  pilot.pad(C[5],false); assert.equal(pilot.inspect().voices.length,0);
  pilot.pad(C[0],true); assert.equal(pilot.inspect().active.kind,'bank');
});

test('BORROW lock is applied once in IDEAS and II/DOM approach exactly the displayed target', () => {
  const {pilot,start,commands}=setup();
  pilot.pad(94,true,100,{shift:true}); pilot.pad(94,false); start();
  const target=structuredClone(pilot.inspect().ideas[0].chord);
  pilot.pad(C[0],true); assert.deepEqual(normalizeChord(pilot.inspect().active.chord),normalizeChord(target));
  pilot.pad(C[0],false); pilot.pad(92,true); pilot.pad(C[0],true);
  assert.equal(pilot.inspect().active.chord.targetOffset,target.rootOffset);
  pilot.pad(C[0],false); pilot.pad(92,false); pilot.pad(84,true); pilot.pad(C[0],true);
  assert.equal(pilot.inspect().active.chord.targetOffset,target.rootOffset);
  const count=commands.length, notesBefore=structuredClone(pilot.inspect().voices);
  pilot.pad(94,true,100,{shift:true}); pilot.pad(94,false);
  assert.equal(commands.length,count); assert.deepEqual(pilot.inspect().voices,notesBefore);
});

test('STOP and park clean up ideas voices; no stuck notes or armed progression survive', () => {
  for(const park of [false,true]) {
    const {pilot,start}=setup({autoSustain:true,bassEnabled:true}); start();
    pilot.pad(C[0],true); pilot.pad(M[0],true); pilot.step(0,true,{shift:true});pilot.arm(true);
    if(park) pilot.tick(undefined,true); else pilot.pad(STOP_PAD,true);
    assert.equal(pilot.inspect().voices.length,0);
    if(!park) assert.equal(pilot.inspect().armed,false);
    else assert.equal(pilot.inspect().ideasEnabled,false);
  }
});

test('LOW bass follows the actual lowest chord voice, with independent octave; ROOT ignores inversions', () => {
  const c=buildPadChord({},0,{inversion:1,lockInversion:true});
  assert.deepEqual(chordNotes(c),[52,55,60]);
  assert.deepEqual(bassNotes(c,{bassMode:'root',bassOctave:-1}),[36]);
  assert.deepEqual(bassNotes(c,{bassMode:'low',bassOctave:-1}),[40]);
  assert.deepEqual(bassNotes(c,{bassMode:'low',bassOctave:1}),[64]);
  assert.deepEqual(bassNotes(c,{bassMode:'low',bassOctave:-1,octave:2}),[40]);
  assert.deepEqual(bassNotes(c,{bassMode:'low',bassOctave:-5}),[]);
  assert.deepEqual(bassNotes({...c,bassMode:'root'},{bassMode:'low',bassOctave:-1}),[36]);
  assert.deepEqual(bassNotes({...c,bassMode:'low'},{bassMode:'root',bassOctave:-1}),[40]);
});

test('per-pad bass mode overrides global, AUTO inherits, and saved steps preserve the choice', () => {
  const {pilot,turn,page,files,play}=setup({bassEnabled:true,bassMode:'low',voiceLead:true,autoSustain:true});
  pilot.selectEdit(0); turn('padInversion',2); turn('bassMode',1); // First inversion, explicit ROOT.
  pilot.selectEdit(-1); play(0);
  assert.equal(notes(pilot).get(0).notes[0]%12,4); assert.equal(notes(pilot).get(B).notes[0]%12,0);
  pilot.step(0,true,{shift:true}); assert.equal(pilot.inspect().progression[0].bassMode,'root');
  pilot.selectEdit(0); turn('bassMode',-1); // AUTO follows global LOW immediately.
  assert.equal(notes(pilot).get(B).notes[0]%12,4);
  pilot.selectEdit(-1); page('BASS'); turn('bassMode',-1); assert.equal(notes(pilot).get(B).notes[0]%12,0);
  pilot.unload(); const restored=setup({},files).pilot;
  assert.equal(restored.inspect().overrides[0].bassMode,'auto');
  assert.equal(restored.inspect().progression[0].bassMode,'root');
});

test('global LOW follows voice-leading results in live chords and loop slots; per-pad ROOT remains root', () => {
  const {pilot,play}=setup({bassEnabled:true,bassMode:'low',voiceLead:true,autoSustain:true,bassOctave:-1});
  for(const index of [0,3,4,1]) {
    const c=play(index), actual=notes(pilot).get(index).notes;
    assert.deepEqual(notes(pilot).get(B).notes,[actual[0]-12]);
    pilot.step(index,true,{shift:true}); assert.ok(c);
  }
  const state=pilot.inspect();
  state.progression.forEach((c,i)=>{if(c) assert.deepEqual(state.loopBass[i],[state.loopNotes[i][0]-12]);});
});
