import test from 'node:test';
import assert from 'node:assert/strict';
import {generateIdeasTo} from '../src/ideas.mjs';
import {buildChordBank,applyModifiers,chordType,chordName,SCALES} from '../src/theory.mjs';
import {createPilot,PAGES,CHORD_PADS as C,STOP_PAD} from '../src/pilot.mjs';
import {encodeDocument,decodeDocument,normalizeSettings} from '../src/settings.mjs';
const sig=c=>c.rootOffset+':'+[...new Set(c.intervals.map(n=>n%12))].sort((a,b)=>a-b).join(',');
test('TO has eight distinct deterministic choices for every scale, style, target and borrowed context',()=>{
  for(const scale of SCALES)for(const borrow of [false,true])for(const color of ['IN','MIX','OUT']) {
    const settings={key:11,scaleId:scale.id},bank=buildChordBank(settings);
    for(const raw of bank) {
      const target=applyModifiers(raw,{borrow},settings), before=JSON.stringify({target,bank});
      const options={borrow,color,bank};const rows=generateIdeasTo(bank[0],target,settings,options);
      assert.equal(rows.length,8,`${scale.id} ${color} ${chordName(target)}`);
      assert.equal(new Set(rows.map(r=>sig(r.chord))).size,8);
      assert.equal(JSON.stringify({target,bank}),before);
      assert.deepEqual(generateIdeasTo(bank[0],target,settings,options),rows);
      const tonal=['MAJ','MIN'].includes(chordType(target));
      assert.equal(sig(rows[tonal?2:0].chord),sig(target));
      if(tonal) {
        assert.equal(sig(rows[0].chord),sig(applyModifiers(target,{ii:true},settings)));
        assert.equal(sig(rows[1].chord),sig(applyModifiers(target,{dom:true},settings)));
      } else assert.ok(!rows.some(r=>['ii','dom','sub'].includes(r.family)));
    }
  }
});
function setup(text=encodeDocument({chordSustain:'hold',melodySustain:'hold',bassEnabled:true},[])) {
  const commands=[];let saved=text;
  const p=createPilot({read:()=>saved,write:(path,value)=>{saved=value;return true;},send:c=>commands.push(c)});p.init();
  const page=name=>p.changePage(PAGES.indexOf(name)-p.inspect().page);
  const turn=(id,d)=>p.knob(p.inspect().model.cells.findIndex(c=>c.id===id),d);
  return {p,commands,page,turn,saved:()=>saved};
}
test('TO target and mode changes are silent, preserve held snapshots, use map resolver and save settings',()=>{
  const h=setup();h.p.pad(C[5],true);h.p.pad(72,true);h.page('IDEAS');h.turn('ideasEnabled',1);
  const voices=structuredClone(h.p.inspect().voices),n=h.commands.length;
  h.turn('ideasMode',1);h.turn('ideasColor',1);
  assert.equal(h.commands.length,n);assert.deepEqual(h.p.inspect().voices,voices);
  assert.equal(chordName(h.p.inspect().ideas[2].chord),'Am');
  const map=h.p.inspect().model.chordMap.items;
  for(let i=0;i<8;i++)assert.equal(sig(map[i].chord),sig(h.p.inspect().ideas[i].chord));
  h.p.pad(C[5],false);h.p.pad(C[2],true);
  assert.equal(chordName(h.p.inspect().active.chord),'Am');
  h.p.step(0,true,{shift:true});const snapshot=structuredClone(h.p.inspect().progression[0]);
  h.p.pad(C[2],false);h.p.pad(C[1],true);h.p.pad(C[1],false);
  const newTarget=sig(h.p.inspect().active.chord),sent=h.commands.length;
  h.turn('ideasNew',1);assert.equal(h.commands.length,sent);
  assert.equal(sig(h.p.inspect().ideas.find(r=>r.family==='target').chord),newTarget);
  assert.deepEqual(h.p.inspect().progression[0],snapshot);
  h.p.pad(STOP_PAD,true);assert.equal(h.p.inspect().voices.length,0);
  h.p.unload();const restored=setup(h.saved());
  assert.equal(restored.p.inspect().settings.ideasMode,'to');assert.equal(restored.p.inspect().ideasEnabled,false);
  assert.deepEqual(restored.p.inspect().progression[0],snapshot);
});
test('TO uses per-pad edits and BORROW exactly once and leaving IDEAS restores the ordinary bank',()=>{
  const text=encodeDocument({ideasMode:'to',ideasTarget:0},[],[{chordType:'MIN',extensionName:'MAJ7',rootOffset:2}]);
  const h=setup(text);const expected=h.p.inspect().bank[0];
  assert.equal(chordType(expected),'MIN');assert.equal(expected.rootOffset,2);assert.ok(expected.intervals.includes(11));
  h.page('IDEAS');h.turn('ideasEnabled',1);
  assert.equal(sig(h.p.inspect().ideas[2].chord),sig(expected));
  h.p.pad(94,true,100,{shift:true});h.p.pad(94,false);
  const targetIndex=h.p.inspect().ideas.findIndex(r=>r.family==='target');
  // Lock changes the suggestion context, never the captured literal target.
  assert.equal(sig(h.p.inspect().ideas[targetIndex].chord),sig(expected));
  h.p.pad(C[targetIndex],true);
  assert.equal(sig(h.p.inspect().active.chord),sig(h.p.inspect().ideas[targetIndex].chord));
  h.page('CHORDS');assert.equal(h.p.inspect().ideasEnabled,false);
  h.p.pad(C[targetIndex],false);h.p.pad(C[1],true);
  assert.equal(h.p.inspect().active.kind,'bank');
});
test('old projects default to NEXT and target 1; malformed target values are bounded',()=>{
  const old=decodeDocument(JSON.parse(encodeDocument({},[])));
  assert.equal(old.settings.ideasMode,'next');assert.equal(old.settings.ideasTarget,0);
  for(const value of [-100,100,NaN,'no',null]) {
    const s=normalizeSettings({ideasMode:'oops',ideasTarget:value});
    assert.equal(s.ideasMode,'next');assert.ok(Number.isInteger(s.ideasTarget)&&s.ideasTarget>=0&&s.ideasTarget<8);
  }
});
test('enabling TO captures the actual borrowed played chord, not its original pad or a second borrow',()=>{
  const h=setup(encodeDocument({ideasMode:'to',ideasTarget:7},[]));
  h.p.pad(94,true,100,{shift:true});h.p.pad(94,false);
  h.p.pad(C[3],true);h.p.pad(C[3],false);
  assert.equal(chordName(h.p.inspect().active.chord),'Fm');
  h.page('IDEAS');const n=h.commands.length;h.turn('ideasEnabled',1);
  assert.equal(h.commands.length,n);
  assert.equal(chordName(h.p.inspect().ideas[2].chord),'Fm');
  assert.ok(!h.p.inspect().model.cells.some(c=>c.id==='ideasTarget'));
});
