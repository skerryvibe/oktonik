import test from 'node:test';
import assert from 'node:assert/strict';
import {createPilot,PAGES,CHORD_PADS as C,LIVE_BASS_OWNER as B,STOP_PAD} from '../src/pilot.mjs';
import {STATE_PATH,encodeDocument,normalizeSettings} from '../src/settings.mjs';
function setup(settings) {
  const commands=[],files=new Map(settings?[[STATE_PATH,encodeDocument(settings,[])]]:[]);
  const p=createPilot({read:k=>files.get(k),write:(k,v)=>{files.set(k,v);return true;},send:c=>commands.push(c)});p.init();
  return {p,commands,files,voices:()=>new Map(p.inspect().voices)};
}
test('legacy defaults retain fixed bass and all three old HOLD choices; fresh projects use PAD',()=>{
  const s=normalizeSettings({autoSustain:true,bassVelocity:73});
  assert.deepEqual([s.chordSustain,s.melodySustain,s.bassSustain,s.bassVelocityMode],['hold','hold','hold','fixed']);
  assert.equal(setup().p.inspect().settings.bassVelocityMode,'pad');
});
test('all 27 sustain combinations release each part independently and STOP clears pedals',()=>{
  for(const chordSustain of ['off','hold','pedal'])for(const bassSustain of ['off','hold','pedal'])for(const melodySustain of ['off','hold','pedal']){
    const h=setup({chordSustain,bassSustain,melodySustain,bassEnabled:true,bassGesture:true,bassChannel:2,melodyChannel:3});
    h.p.pad(C[0],true,91);h.p.pad(72,true,65);h.p.pad(C[2],true,43);
    const before=h.commands.length;
    h.p.pad(72,false);h.p.pad(C[0],false);h.p.pad(C[2],false);
    assert.ok(!h.commands.slice(before).some(c=>c.op==='on'));
    for(const [owner,mode]of [[0,chordSustain],[B,bassSustain],[8,melodySustain]]) {
      assert.equal(h.voices().has(owner),mode!=='off');
      if(mode==='pedal')assert.ok(h.commands.slice(before).some(c=>c.op==='off'&&c.owner===owner));
    }
    h.p.pad(C[3],true,110);
    assert.equal(h.p.inspect().active.index,3);assert.equal(h.voices().get(B).notes[0],41);
    h.p.pad(STOP_PAD,true);assert.equal(h.voices().size,0);
    for(const part of [0,1,2]) {
      const msgs=h.commands.filter(c=>c.op==='pedal'&&c.owner===part);
      if(msgs.length)assert.equal(msgs.at(-1).enabled,0);
    }
  }
});
test('PAD bass uses chord attack then bass-gesture attack; new chord resets velocity',()=>{
  const h=setup({bassEnabled:true,bassGesture:true,bassVelocityMode:'pad',chordSustain:'hold',bassSustain:'hold'});
  h.p.pad(C[0],true,95);assert.equal(h.voices().get(B).velocity,95);
  h.p.pad(C[2],true,38);assert.equal(h.voices().get(B).velocity,38);
  h.p.pad(C[0],false);h.p.pad(C[2],false);assert.equal(h.voices().get(B).velocity,38);
  h.p.pad(C[3],true,117);assert.equal(h.voices().get(B).velocity,117);
});
test('pedal settings persist and overlapping BOTH route warns on MIDI page',()=>{
  const h=setup({chordSustain:'pedal',previewRoute:'both',melodyRoute:'external',melodyChannel:0});
  h.p.changePage(PAGES.indexOf('MIDI'));for(let i=0;i<70;i++)h.p.tick();
  assert.match(h.p.inspect().model.detail,/shared channel/);
  h.p.unload();const p=createPilot({read:k=>h.files.get(k)});p.init();
  assert.equal(p.inspect().settings.chordSustain,'pedal');
});
