import test from 'node:test';
import assert from 'node:assert/strict';
import {generateIdeasAlt,ideasContext} from '../src/ideas.mjs';
import {buildChordBank,SCALES,applyModifiers} from '../src/theory.mjs';
import {createPilot,PAGES,CHORD_PADS} from '../src/pilot.mjs';
import {encodeDocument,normalizeSettings} from '../src/settings.mjs';
const pc=n=>((n%12)+12)%12;
const tones=c=>[...new Set(c.intervals.map(n=>pc(n+c.rootOffset)))].sort((a,b)=>a-b);
const sig=c=>pc(c.rootOffset)+':'+tones(c).join(',');

test('ALT is bounded, deterministic, unique and preserves the original across scales and borrowed contexts',()=>{
  for(const scale of SCALES)for(const borrow of [false,true])for(const color of ['IN','MIX','OUT']) {
    const settings={key:7,scaleId:scale.id},bank=buildChordBank(settings);
    for(const raw of bank) {
      const anchor=applyModifiers(raw,{borrow},settings),before=JSON.stringify({anchor,bank});
      const options={borrow,color,bank},rows=generateIdeasAlt(anchor,settings,options);
      assert.ok(rows.length>=1&&rows.length<=8);
      assert.equal(sig(rows[0].chord),sig(anchor));assert.equal(rows[0].reason,'ORIGINAL');
      assert.equal(new Set(rows.map(r=>sig(r.chord))).size,rows.length);
      assert.deepEqual(generateIdeasAlt(anchor,settings,options),rows);
      assert.equal(JSON.stringify({anchor,bank}),before);
      if(color==='IN') {
        const allowed=new Set([...SCALES.find(s=>s.id===ideasContext(settings,borrow).scaleId).intervals,...tones(anchor)]);
        for(const row of rows.slice(1)){assert.equal(row.chord.rootOffset,anchor.rootOffset);assert.ok(tones(row.chord).every(n=>allowed.has(n)));assert.ok(row.chord.intervals.length<=4);}
      }
    }
  }
});
test('ALT dominant colours retain b7; COLOR never silently turns G7 into Gmaj7',()=>{
  const c={rootOffset:7,intervals:[0,4,7,10],degree:4};
  for(const row of generateIdeasAlt(c,{}, {color:'MIX'}))assert.ok(row.chord.intervals.includes(10));
  const wild=generateIdeasAlt(c,{}, {color:'OUT'});
  assert.ok(wild.some(r=>r.chord.intervals.includes(13)));
  assert.ok(!wild.some(r=>r.chord.snapshot));
});
test('ALT mode, STYLE and NEW are silent; original stays first and persisted mode roundtrips',()=>{
  const commands=[];let saved=encodeDocument({},[]);
  const p=createPilot({profile:'lab',read:()=>saved,write:(_path,s)=>{saved=s;return true;},send:c=>commands.push(c)});p.init();
  p.pad(CHORD_PADS[0],true);p.changePage(PAGES.indexOf('IDEAS'));
  const turn=(id,d)=>p.knob(p.inspect().model.cells.findIndex(c=>c.id===id),d);
  turn('ideasEnabled',1);const before=commands.length;
  turn('ideasMode',1);turn('ideasMode',1);assert.equal(p.inspect().settings.ideasMode,'alt');
  turn('ideasColor',1);assert.equal(commands.length,before);
  assert.equal(p.inspect().ideas[0].reason,'ORIGINAL');
  p.pad(CHORD_PADS[0],false);p.pad(CHORD_PADS[1],true);const n=commands.length;
  turn('ideasNew',1);assert.equal(commands.length,n);
  assert.equal(sig(p.inspect().ideas[0].chord),sig(p.inspect().active.chord));
  p.unload();assert.equal(normalizeSettings(JSON.parse(saved).settings).ideasMode,'alt');
  assert.equal(normalizeSettings({}).ideasMode,'next');
});
