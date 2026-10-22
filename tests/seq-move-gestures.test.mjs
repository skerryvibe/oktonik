import test from 'node:test';
import assert from 'node:assert/strict';
import {createPilot,CHORD_PADS as C,STEP_OWNER_START as S} from '../src/pilot.mjs';
import {encodeDocument,STATE_PATH} from '../src/settings.mjs';

function setup(profile='lab',settings={},bass=[],ready=false) {
  let text=encodeDocument(settings,[],[],bass,[]),clock={beat:0,ready,count_state:0};const commands=[];
  const io={profile,read:k=>k===STATE_PATH?text:null,write:(_k,v)=>{text=v;return true;},clock:()=>clock,
    send:c=>{commands.push(c);if(c.op==='countin')clock={...clock,count_state:c.enabled?1:0};return true;}};
  const p=createPilot(io);p.init();
  return {p,commands,io,saved:()=>JSON.parse(text),setClock:next=>clock={...clock,...next}};
}
const stored=h=>{h.p.pad(C[0],true);h.p.pad(C[0],false);h.p.step(2,true);h.p.step(2,false);};

for(const profile of ['public','lab']) {
  test(`${profile}: hold step + Left/Right nudges it; Shift is fine; pages stay put`,()=>{
    const h=setup(profile);stored(h);h.p.step(2,true);
    h.p.pageSteps(1);h.p.pageSteps(1);assert.equal(h.p.inspect().progression[2].performance.nudge,.2);
    h.p.pageSteps(-1,{shift:true});assert.equal(h.p.inspect().progression[2].performance.nudge,.19);
    assert.match(h.p.inspect().model.detail,/19%/);assert.equal(h.p.inspect().stepPages.chord,0);
    h.p.step(2,false);h.p.pageSteps(1);assert.equal(h.p.inspect().progression[2].performance.nudge,.19);
  });
  test(`${profile}: hold step + later step sets length without previewing the second step`,()=>{
    const h=setup(profile);stored(h);h.p.step(2,true);const n=h.commands.length;
    h.p.step(5,true);assert.equal(h.p.inspect().progression[2].timing.steps,4);
    assert.ok(!h.commands.slice(n).some(c=>c.op==='on'));assert.equal(h.p.inspect().progression[5],null);
    h.p.step(5,false);assert.ok(h.p.inspect().voices.some(([o])=>o===S+2));
    h.p.step(0,true);assert.match(h.p.inspect().model.detail,/later step/);h.p.step(0,false);
    assert.equal(h.p.inspect().progression[2].timing.steps,4);assert.equal(h.p.inspect().progression[0],null);
    h.p.step(2,false);
  });
  test(`${profile}: Copy + step, then another step, copies with its timing`,()=>{
    const h=setup(profile);stored(h);h.p.step(2,true);h.p.pageSteps(1);h.p.step(2,false);
    h.p.step(2,true,{copy:true});h.p.step(2,false);h.p.step(9,true,{copy:true});h.p.step(9,false);
    const copy=h.p.inspect().progression[9];
    assert.deepEqual(copy.snapshot,h.p.inspect().progression[2].snapshot);
    assert.equal(copy.performance.start,9);assert.equal(copy.performance.nudge,.1);
    h.p.copyHeld(false);h.p.step(4,true,{copy:true});assert.match(h.p.inspect().model.detail,/empty/);
  });
  test(`${profile}: hold Loop + step sets clip length in 16-step bars`,()=>{
    const h=setup(profile);h.p.loop(true);h.p.step(1,true);h.p.step(1,false);
    assert.equal(h.p.inspect().clips.parts.chord.clips[0].length,32);
    h.p.step(3,true);h.p.step(3,false);assert.equal(h.p.inspect().clips.parts.chord.clips[0].length,64);
    h.p.step(0,true);h.p.step(0,false);h.p.loop(false);assert.equal(h.p.inspect().clips.parts.chord.clips[0].length,16);
    assert.equal(h.p.inspect().armed,false);assert.ok(!h.p.inspect().progression.some(Boolean));
  });
  test(`${profile}: REC into a running sequence punches in without a count-in`,()=>{
    const h=setup(profile,{countIn:true},[],true);h.p.recordContext();
    assert.equal(h.p.inspect().recordArmed,true);assert.ok(!h.commands.some(c=>c.op==='countin'&&c.enabled));
    assert.equal(h.p.inspect().model.recordCount,null);
    h.p.pad(C[0],true);h.setClock({beat:1});h.p.pad(C[0],false);assert.ok(h.p.inspect().progression[0]);
    h.p.recordContext();h.setClock({ready:false});h.p.recordContext();
    assert.ok(h.commands.some(c=>c.op==='countin'&&c.enabled));
  });
  test(`${profile}: METRO OFF/ON/REC persists and clicks only when wanted`,()=>{
    const h=setup(profile);h.p.menu();const cell=h.p.inspect().model.cells.findIndex(c=>c.id==='metronome');
    assert.ok(cell>=0);assert.equal(h.p.inspect().model.cells[cell].value,'OFF');
    const metro=()=>h.commands.findLast(c=>c.op==='metro')?.enabled;
    assert.equal(metro(),0);h.p.knob(cell,1);assert.equal(metro(),1);
    h.p.knob(cell,1);assert.equal(h.p.inspect().settings.metronome,'rec');h.p.tick();assert.equal(metro(),0);
    assert.match(h.p.inspect().model.detail,/Recording only/);h.p.back();
    h.p.record();h.p.tick();assert.equal(metro(),1);h.p.record();h.p.tick();assert.equal(metro(),0);
    const n=h.commands.length;h.p.tick();h.p.tick();assert.ok(!h.commands.slice(n).some(c=>c.op==='metro'));
    h.p.unload();assert.equal(h.saved().settings.metronome,'rec');
  });
}
test('Lab SEQ page shows COUNT and METRO; footer marks count-in',()=>{
  const h=setup('lab',{countIn:true});h.p.changePage(6);for(let i=0;i<70;i++)h.p.tick();
  assert.deepEqual(h.p.inspect().model.cells.slice(6).map(c=>c.id),['countIn','metronome']);
  assert.match(h.p.inspect().model.detail,/\| CNT$/);
});
test('R.PAD explains that BASS must be on, but bass pads can always be switched back',()=>{
  const h=setup('public',{bassEnabled:false});h.p.track(2);const cell=h.p.inspect().model.cells[6];
  assert.equal(cell.id,'bassPads');assert.equal(cell.value,'MEL');assert.equal(cell.disabled,true);assert.equal(cell.disabledValue,'MEL');
  h.p.knob(6,1);assert.equal(h.p.inspect().settings.bassPads,false);assert.equal(h.p.inspect().model.detail,'Enable BASS first');
  const on=setup('public',{bassPads:true});on.p.track(2);on.p.knob(6,-1);assert.equal(on.p.inspect().settings.bassPads,false);
});
test('step LEDs light the steps a long note sounds through',()=>{
  const leds=[];const p=createPilot({profile:'lab',leds:u=>leds.splice(0,leds.length,...u)});p.init();
  p.pad(C[0],true);p.pad(C[0],false);p.step(2,true);p.step(5,true);p.step(5,false);p.step(2,false);p.repaint(true);
  const role=i=>leds.find(l=>l.note===16+i&&!l.button).role;
  assert.deepEqual([1,2,3,4,5,6].map(role),['off','selected','tail','tail','tail','off']);
});
