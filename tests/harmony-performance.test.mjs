import test from 'node:test';
import assert from 'node:assert/strict';
import {MOD_ACTIONS,resolveModifiers,EXTENSION_PROFILES} from '../src/harmony-controls.mjs';
import {applyModifiers,buildChordBank,chordName,chordNotes,voiceLeadNotes,SCALES} from '../src/theory.mjs';
import {normalizeChord,normalizeOverride,encodeDocument} from '../src/settings.mjs';
import {generateIdeas,generateIdeasTo} from '../src/ideas.mjs';
import {createPilot,CHORD_PADS as C} from '../src/pilot.mjs';
const chord=()=>buildChordBank()[0];
const modified=(...actions)=>applyModifiers(chord(),resolveModifiers(actions));

test('remaining modifiers create explicit colours and functional targets without mutating the source',()=>{
  for(const [action,name,notes] of [
    ['add6','C6',[0,4,7,9]],['sixNine','C6/9',[0,4,7,9,14]],
    ['flat9','C(b9)',[0,4,7,13]],['sharp9','C(#9)',[0,4,7,15]],
    ['sharp11','C(#11)',[0,4,7,18]],['flat13','C(b13)',[0,4,7,20]],
    ['dimTo','Bdim7',[0,3,6,9]],['commonDim','Cdim7',[0,3,6,9]],
    ['backdoor','Bb7',[0,4,7,10]],['minorIV','Fm7',[0,3,7,10]],
    ['shell','C(no5)',[0,4]],
  ]) {
    const raw=chord(),before=structuredClone(raw),result=applyModifiers(raw,resolveModifiers([action]));
    assert.equal(chordName(result),name);assert.deepEqual(result.intervals,notes);assert.deepEqual(raw,before);
    assert.equal(normalizeChord(result).source,result.source);
    assert.deepEqual(normalizeOverride({variant:resolveModifiers([action])}).variant,resolveModifiers([action]));
  }
  assert.equal(modified('borrow','dimTo').targetOffset,0);
  assert.deepEqual(modified('borrow','dimTo').targetIntervals,[0,3,7]);
  assert.equal(modified('dom','backdoor').rootOffset,10);
  assert.equal(modified('backdoor','dom').rootOffset,7);
});
test('tensions replace their upper natural counterparts; structural sus and thirds survive',()=>{
  const c={...chord(),intervals:[0,4,7,10,14,17,21]};
  assert.deepEqual(applyModifiers(c,resolveModifiers(['flat9','sharp11','flat13'])).intervals,[0,4,7,10,13,18,20]);
  assert.deepEqual(modified('flat9','add9').intervals,[0,4,7,14]);
  assert.deepEqual(modified('add9','sharp9').intervals,[0,4,7,15]);
  assert.deepEqual(modified('sus2','flat9').intervals,[0,2,7,13]);
  assert.deepEqual(modified('flat7','shell').intervals,[0,4,10]);
  assert.deepEqual(modified('sus4','shell').intervals,[0,5]);
  assert.equal(modified('root').lockInversion,true);
  const cInv={...chord(),inversion:2};
  assert.deepEqual(voiceLeadNotes(applyModifiers(cInv,{root:true}),{voiceLead:true},[55,60,64]),[48,52,55]);
});
test('new approach variants and root lock persist as per-pad edits',()=>{
  for(const id of MOD_ACTIONS.map(a=>a.id).slice(12)) {
    const variant=resolveModifiers([id]);
    const normalized=normalizeOverride({variant});
    assert.deepEqual(applyModifiers(chord(),normalized.variant),applyModifiers(chord(),variant));
  }
});
test('SAFE stays populated under every extension profile; scale labels describe actual pitches',()=>{
  for(const profile of EXTENSION_PROFILES)for(const scale of SCALES)for(const color of ['IN','MIX','OUT']) {
    const input={extensionProfile:profile.id,scaleId:scale.id};
    const rows=generateIdeas(buildChordBank(input)[0],input,{color});
    assert.equal(rows.length,8,`${profile.id} ${scale.id} ${color}`);
    for(const row of rows) {
      if(color==='IN'){assert.equal(row.outside,false);assert.ok(row.chord.intervals.length<=4);}
      if(row.reason.includes('IN SCALE'))assert.equal(row.outside,false);
    }
  }
});
test('TO offers iv-bVII and leading diminished paths while preserving II V TARGET order',()=>{
  const rows=generateIdeasTo(chord(),chord(),{}, {color:'MIX'});
  assert.deepEqual(rows.slice(0,3).map(r=>r.family),['ii','dom','target']);
  for(const family of ['minorIV','backdoor','dimTo'])assert.ok(rows.some(r=>r.family===family));
  assert.equal(chordName(rows.find(r=>r.family==='backdoor').chord),'Bb7');
  assert.ok(!generateIdeasTo(chord(),chord(),{},{color:'IN'}).some(r=>['backdoor','dimTo'].includes(r.family)));
});
function setup(settings={}) {
  const commands=[];let saved=encodeDocument({bassEnabled:true,bassGesture:true,...settings},[]),clock={beat:0,ready:false};
  const p=createPilot({clock:()=>clock,read:()=>saved,write:(k,v)=>{saved=v;return true;},send:c=>{commands.push(c);return true;}});p.init();
  const smart=d=>{if(p.inspect().model.pageName!=='B.EXTRA'){p.track(1);p.browse(1);}p.knob(3,d);};
  return {p,commands,smart,saved:()=>saved,time:beat=>clock={beat,ready:true}};
}
const bass=p=>p.inspect().voices.find(([id,v])=>v.kind==='bass')?.[1];
test('Smart Bass is an explicit bass-only choice, releases do not reselect harmony',()=>{
  const h=setup();h.p.pad(C[0],true);const before=structuredClone(h.p.inspect().active.notes),n=h.commands.length;
  h.smart(1);assert.equal(bass(h.p).notes[0]%12,4);assert.deepEqual(h.p.inspect().active.notes,before);
  assert.ok(h.commands.slice(n).filter(c=>c.op==='on').every(c=>c.owner===40));
  h.smart(1);assert.equal(bass(h.p).notes[0]%12,7);
  h.smart(-2);assert.equal(bass(h.p).notes[0]%12,0);
  const at=h.commands.length;h.p.pad(C[0],false);
  assert.ok(!h.commands.slice(at).some(c=>c.op==='on'));assert.equal(h.p.inspect().voices.length,0);
  h.smart(1);assert.equal(h.p.inspect().voices.length,0);
  h.p.back();h.p.pad(C[2],true);assert.equal(bass(h.p).notes[0]%12,4);
  h.p.panic();assert.equal(h.p.inspect().voices.length,0);
});
test('Smart Bass preserves HOLD ownership and cleans PEDAL before changing note',()=>{
  for(const sustain of ['off','hold','pedal']) {
    const h=setup({chordSustain:sustain,bassSustain:sustain});
    h.p.pad(C[0],true);h.smart(1);assert.equal(bass(h.p).notes[0]%12,4);
    h.p.pad(C[0],false);
    const before=h.commands.length;
    h.smart(1);
    if(sustain==='hold'){assert.equal(bass(h.p).notes[0]%12,7);assert.equal(bass(h.p).sustained,true);}
    else assert.ok(!h.commands.slice(before).some(c=>c.op==='on'));
    h.p.unload();assert.equal(h.p.inspect().voices.length,0);
    const reload=setup(JSON.parse(h.saved()).settings);assert.equal(reload.p.inspect().voices.length,0);
  }
});
test('expanded LEAD handles dense profile voices without drifting or overriding explicit locks',()=>{
  for(const profile of EXTENSION_PROFILES) {
    const settings={extensionProfile:profile.id,voiceLead:true},bank=buildChordBank(settings);
    let previous=chordNotes(bank[0],settings);
    for(let pass=0;pass<10;pass++)for(const c of bank) {
      const next=voiceLeadNotes(c,settings,previous);
      assert.ok(next.every(n=>n>=0&&n<=127));assert.ok(next[0]>=36&&next[0]<=60);
      assert.equal(next.length,chordNotes(c,settings).length);
      const locked={...c,inversion:-1,lockInversion:true};
      assert.deepEqual(voiceLeadNotes(locked,settings,previous),chordNotes(locked,settings));
      previous=next;
    }
  }
});
test('Smart Bass records independent pitches and remains compatible with Bass Gesture',()=>{
  const h=setup();h.p.record();h.time(0);h.p.pad(C[0],true,93);
  h.time(1);h.smart(1);h.p.back();
  h.time(2);h.p.pad(C[4],true,80);assert.equal(bass(h.p).notes[0]%12,7);
  h.time(3);const start=h.commands.length;h.p.pad(C[0],false);h.p.pad(C[4],false);
  assert.ok(!h.commands.slice(start).some(c=>c.op==='on'));
  const s=h.p.inspect();assert.equal(s.progression.filter(Boolean).length,1);
  assert.deepEqual(s.bassProgression.filter(Boolean).map(e=>e.note%12),[0,4,7]);
  assert.equal(s.voices.length,0);
});
