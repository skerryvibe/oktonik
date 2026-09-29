import test from 'node:test';
import assert from 'node:assert/strict';
import { createPilot, PAGES, CHORD_PADS as C, MELODY_PADS as M, STEP_OWNER_START as S, LIVE_BASS_OWNER as B } from '../src/pilot.mjs';
import { createProjectPilot, parseProject, projectStatePath, ACTIVE_SET_PATH } from '../src/project.mjs';
import { STATE_PATH, encodeDocument, decodeDocument, normalizeStep } from '../src/settings.mjs';
import { melodyNotes, adaptiveScaleIntervals } from '../src/theory.mjs';

function setup(settings = {}, project = false, initialId = 'set-A') {
  const files = new Map([[STATE_PATH, encodeDocument(settings, [])]]), commands = [], leds = [], frames = [];
  if (project && initialId) files.set(ACTIVE_SET_PATH, initialId + '\nSong');
  let time = 0, fail = false;
  const pilot = (project ? createProjectPilot : createPilot)({
    read: p => files.get(p), write: (p,t) => { if (fail) return false; files.set(p,t); return true; },
    now: () => time, ensureDir: () => true, send: c => commands.push(c), leds: l => leds.push(l), render: m => frames.push(m),
  });
  pilot.init();
  const page = name => pilot.changePage(PAGES.indexOf(name) - pilot.inspect().page);
  const turn = (id,n) => { if(id==='key') page('CHORDS'); const i = pilot.inspect().model.cells.findIndex(c => c.id === id); assert.ok(i >= 0, id); pilot.knob(i,n); };
  const advance = (ms = 600, dsp, parked) => { time += ms; pilot.tick(dsp, parked); };
  return { pilot,files,commands,leds,frames,page,turn,advance, fail: value => {fail=value;} };
}

test('all 16 steps save, preview, capture, clear and persist without owner collisions', () => {
  const {pilot,files,commands}=setup({bassEnabled:true,autoSustain:true,melodyOctave:-1});
  for (let i=0;i<16;i++) {
    pilot.pad(C[i%8],true); pilot.pad(C[i%8],false); pilot.step(i,true,{shift:true}); pilot.step(i,false);
  }
  assert.equal(pilot.inspect().progression.filter(Boolean).length,16);
  for (let i=0;i<16;i++) {
    pilot.step(i,true);
    assert.deepEqual(new Map(pilot.inspect().voices).get(S+i).notes,pilot.inspect().progression[i].snapshot.notes);
    pilot.pad(M[15],true); assert.ok(new Map(pilot.inspect().voices).has(23));
    assert.ok(new Map(pilot.inspect().voices).has(B));
    pilot.pad(M[15],false); pilot.step(i,false);
  }
  assert.equal(S+15,39); assert.equal(B,40);
  pilot.unload(); assert.equal(decodeDocument(JSON.parse(files.get(STATE_PATH))).progression.filter(Boolean).length,16);
  for (const invalid of [-1,16,1.5,NaN]) { const n=commands.length;pilot.step(invalid,true);assert.equal(commands.length,n); }
  pilot.step(15,true,{delete:true}); assert.equal(pilot.inspect().progression[15],null);
  pilot.capture(); pilot.pad(C[1],true); pilot.pad(C[1],false);
  assert.ok(pilot.inspect().progression[15]); assert.equal(pilot.inspect().capture,false);
});

test('stored steps freeze actual voicing, key, bass, strum and lead through global edits and restart', () => {
  const {pilot,page,turn,files,commands}=setup({voiceLead:true,bassEnabled:true,bassMode:'low',strumMs:20});
  pilot.pad(C[0],true); pilot.pad(C[0],false); pilot.pad(C[3],true);
  const played=structuredClone(pilot.inspect().active.notes);
  pilot.step(15,true,{shift:true}); pilot.pad(C[3],false);
  const saved=structuredClone(pilot.inspect().progression[15]);
  assert.deepEqual(saved.snapshot.notes,played);
  page('CHORDS');turn('key',5);turn('scaleId',2);turn('extension',3);turn('spread',2);turn('voiceLead',-1);page('STRUM');turn('strumMs',10);
  page('CHORDS');turn('octave',2);page('BASS');turn('bassOctave',3);turn('bassMode',-1);
  assert.deepEqual(pilot.inspect().progression[15],saved);assert.deepEqual(pilot.inspect().loopNotes[15],played);
  page('PLAY'); // BASS now addresses the separate bass lane, not chord previews.
  pilot.step(15,true);
  assert.deepEqual(new Map(pilot.inspect().voices).get(S+15).notes,played);
  assert.deepEqual(new Map(pilot.inspect().voices).get(B).notes,[saved.snapshot.bass]);
  const on=commands.findLast(c=>c.op==='on' && c.owner===S+15);
  assert.equal(on.strum_ms,20);assert.equal(on.legato,1);
  assert.match(pilot.inspect().model.chordLabel,/^F/);
  // Even a held step ignores further global edits; melody follows its saved key.
  page('CHORDS');turn('key',1);turn('spread',-2);
  assert.deepEqual(new Map(pilot.inspect().voices).get(S+15).notes,played);
  pilot.pad(M[0],true);assert.equal(new Map(pilot.inspect().voices).get(8).notes[0]%12,5);
  pilot.step(14,true,{shift:true});assert.deepEqual(pilot.inspect().progression[14],saved);
  pilot.unload();
  const restored=createPilot({read:p=>files.get(p)});restored.init();restored.step(15,true);
  assert.deepEqual(restored.inspect().loopNotes[15],played);assert.deepEqual(restored.inspect().progression[15],saved);
});

test('S.VEL is bounded, persistent and controls preview and all loop slots without changing pitches', () => {
  const {pilot,page,turn,commands,files}=setup();pilot.step(0,true,{shift:true});pilot.step(15,true,{shift:true});
  const before=structuredClone(pilot.inspect().progression);
  page('SEQ');turn('stepVelocity',-63);turn('stepVelocity',-63);
  assert.equal(pilot.inspect().settings.stepVelocity,1);pilot.step(15,true,{},127);
  assert.equal(commands.findLast(c=>c.op==='on'&&c.owner===39).velocity,1);
  assert.equal(commands.findLast(c=>c.op==='slot'&&c.index===15).velocity,1);
  pilot.step(15,false);turn('stepVelocity',63);turn('stepVelocity',63);
  assert.equal(pilot.inspect().settings.stepVelocity,127);pilot.step(0,true,{},1);
  assert.equal(commands.findLast(c=>c.op==='on'&&c.owner===S).velocity,127);
  assert.deepEqual(pilot.inspect().progression,before);
  pilot.unload();assert.equal(decodeDocument(JSON.parse(files.get(STATE_PATH))).settings.stepVelocity,127);
});

test('semantic melody colors agree across all modes, adaptive chords and HOLD press/release', () => {
  for (const mode of ['chord','scale','chromatic']) for (const adapt of [false,true]) {
    const {pilot,leds}=setup({melodyMode:mode,melodyAdapt:adapt,autoSustain:true});
    for (const modifier of [null,84,85,94]) {
      if(modifier)pilot.pad(modifier,true);pilot.pad(C[1],true);if(modifier)pilot.pad(modifier,false);
      const {active,settings}=pilot.inspect(), pitches=melodyNotes(active.chord,settings), root=active.chord.rootOffset;
      const pcs=active.chord.intervals.map(n=>(n+root)%12), scale=adaptiveScaleIntervals(active.chord,settings);
      pilot.repaint();const before=new Map(leds.at(-1).map(l=>[l.note,l.role]));
      M.forEach((pad,i)=>{
        const pc=pitches[i]%12;
        assert.equal(before.get(pad),pc===root?'root':pcs.includes(pc)?'chordTone':scale.includes(pc)?'scaleTone':'chromatic');
        pilot.pad(pad,true);pilot.repaint();assert.equal(leds.at(-1).find(l=>l.note===pad).role,before.get(pad));
        pilot.pad(pad,false);pilot.repaint();assert.equal(leds.at(-1).find(l=>l.note===pad).role,before.get(pad));
      });
      pilot.pad(C[1],false);
    }
  }
});

test('v6 legacy migration freezes only once and invalid snapshots cannot send invalid pitches', () => {
  const {pilot}=setup();pilot.step(0,true,{shift:true});const good=pilot.inspect().progression[0];
  for(const snapshot of [{...good.snapshot,notes:[128]},{...good.snapshot,notes:[]},{...good.snapshot,key:12},{...good.snapshot,bass:-2}])
    assert.equal(normalizeStep({...good,snapshot}),null);
  const v6={format:'chord-pilot',schemaVersion:6,settings:{voiceLead:true},progression:[{...good,snapshot:undefined}]};
  const loaded=decodeDocument(v6);assert.ok(loaded.progression[0].snapshot);
  const changed=decodeDocument(JSON.parse(encodeDocument({...loaded.settings,key:7,octave:2},loaded.progression)));
  assert.deepEqual(changed.progression,loaded.progression);assert.equal(changed.progression.length,16);
});

test('new sets start clean; returning, renaming and restarting restore only the matching UUID', () => {
  const h=setup({key:11,spread:2,voiceLead:true},true), {pilot,files}=h;
  const legacy=files.get(STATE_PATH);
  assert.equal(pilot.inspect().settings.key,0);assert.equal(pilot.inspect().settings.voiceLead,false);
  assert.equal(pilot.inspect().settings.melodyMode,'scale');
  assert.equal(pilot.inspect().settings.melodyOctave,-1);
  assert.equal(pilot.inspect().settings.melodyAdapt,true);
  h.turn('key',2);pilot.step(15,true,{shift:true});pilot.pad(68,true);pilot.arm(true);
  files.set(ACTIVE_SET_PATH,'set-B\nAnother');h.advance();
  assert.equal(pilot.inspect().project.id,'set-B');assert.equal(pilot.inspect().settings.key,0);
  assert.ok(pilot.inspect().progression.every(x=>!x));assert.equal(pilot.inspect().armed,false);assert.equal(pilot.inspect().voices.length,0);
  h.turn('key',7);files.set(ACTIVE_SET_PATH,'set-A\nRenamed');h.advance();
  assert.equal(pilot.inspect().settings.key,2);assert.ok(pilot.inspect().progression[15]);
  files.set(ACTIVE_SET_PATH,'set-A\nRenamed again');h.advance();assert.equal(pilot.inspect().settings.key,2);
  pilot.unload();assert.equal(files.get(STATE_PATH),legacy);
  assert.equal(decodeDocument(JSON.parse(files.get(projectStatePath('set-B')))).settings.key,7);
  const restored=createProjectPilot({read:p=>files.get(p),now:()=>0});restored.init();
  assert.equal(restored.inspect().settings.key,2);assert.ok(restored.inspect().progression[15]);
});

test('new melody defaults do not overwrite existing project choices or old decoder fallbacks', () => {
  const h=setup({},true);
  h.page('MELODY');h.turn('melodyMode',-1);h.turn('melodyOctave',2);
  h.turn('melodyMode',1);h.turn('melodyAdapt',-1);h.turn('melodyMode',-1);
  h.pilot.unload();
  const restored=createProjectPilot({read:p=>h.files.get(p),now:()=>0});restored.init();
  const s=restored.inspect().settings;
  assert.equal(s.melodyMode,'chord');assert.equal(s.melodyOctave,1);assert.equal(s.melodyAdapt,false);
  const old=decodeDocument({format:'chord-pilot',schemaVersion:1,settings:{octave:2},progression:[]}).settings;
  assert.equal(old.melodyMode,'chord');assert.equal(old.melodyOctave,2);assert.equal(old.melodyAdapt,false);
});

test('temporary missing/pending set IDs stop playback and block edits; no file is written under a transient ID', () => {
  const h=setup({},true);h.turn('key',3);h.pilot.pad(68,true);
  for(const raw of ['','__pending-2-1\nPending','../escape\nBad']) {
    h.files.set(ACTIVE_SET_PATH,raw);h.advance();
    assert.equal(h.pilot.inspect().projectWaiting,true);assert.equal(h.pilot.inspect().voices.length,0);
    h.pilot.knob(0,1);h.pilot.pad(68,true);assert.equal(h.pilot.inspect().settings.key,3);assert.equal(h.pilot.inspect().voices.length,0);
  }
  h.files.set(ACTIVE_SET_PATH,'set-B\nNew');h.advance();assert.equal(h.pilot.inspect().settings.key,0);
  assert.ok([...h.files.keys()].every(p=>!p.includes('__pending')&&!p.includes('escape')));
  const initial=setup({},true,'__pending-1');assert.equal(initial.pilot.inspect().projectWaiting,true);
  initial.files.delete(ACTIVE_SET_PATH);initial.advance();assert.equal(initial.pilot.inspect().projectWaiting,true);
  initial.files.set(ACTIVE_SET_PATH,'real-set\nSong');initial.advance();assert.equal(initial.pilot.inspect().project.id,'real-set');
});

test('failed saves keep the old set path and pending state survives a round trip before retry succeeds', () => {
  const h=setup({},true);h.fail(true);h.turn('key',4);
  h.files.set(ACTIVE_SET_PATH,'set-B\nB');h.advance();assert.equal(h.pilot.inspect().pendingProjectSaves,1);
  h.turn('key',8);h.files.set(ACTIVE_SET_PATH,'set-A\nA');h.advance();assert.equal(h.pilot.inspect().settings.key,4);
  h.fail(false);h.advance();h.advance();h.pilot.unload();
  assert.equal(decodeDocument(JSON.parse(h.files.get(projectStatePath('set-A')))).settings.key,4);
  assert.equal(decodeDocument(JSON.parse(h.files.get(projectStatePath('set-B')))).settings.key,8);
});

test('old hosts explicitly fall back to global settings, and unsafe project paths are rejected', () => {
  const h=setup({key:9},true,null);assert.equal(h.pilot.inspect().project,null);assert.equal(h.pilot.inspect().settings.key,9);
  h.page('MIDI'); assert.equal(h.pilot.inspect().model.cells[7].id,'arpChannel');
  for(const raw of ['../x\nName','/root\nName','abc/def\nName','__pending-1\nName','id\n','x'.repeat(65)+'\nName']) assert.equal(parseProject(raw),null);
  assert.throws(()=>projectStatePath('../x'));
  assert.equal(parseProject('1234-ABC\nName').id,'1234-ABC');
});

test('parked project switching clears old loop slots and ignores a stale DSP poll on the switch tick', () => {
  const h=setup({},true);h.pilot.step(15,true,{shift:true});h.pilot.arm(true);h.pilot.tick(null,true);
  h.files.set(ACTIVE_SET_PATH,'set-B\nB');
  h.advance(600,{v:1,armed:true,running:true,slot:15,cycle:0},true);
  assert.equal(h.pilot.inspect().parked,true);assert.equal(h.pilot.inspect().armed,false);
  // Resume probes the ID before restoring any previous loop configuration.
  h.pilot.resume();h.pilot.tick({v:1,armed:false,running:false,slot:-1,cycle:-1},false);
  assert.equal(h.pilot.inspect().project.id,'set-B');assert.equal(h.pilot.inspect().armed,false);
  assert.ok(h.pilot.inspect().loopNotes.every(n=>n.length===0));
  h.files.set(ACTIVE_SET_PATH,'set-A\nA');h.advance();assert.ok(h.pilot.inspect().progression[15]);
  assert.equal(h.pilot.inspect().armed,false);
});
