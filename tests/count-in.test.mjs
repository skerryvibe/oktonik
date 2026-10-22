import test from 'node:test';
import assert from 'node:assert/strict';
import {createPilot,CHORD_PADS as C,MELODY_PADS as M} from '../src/pilot.mjs';
import {encodeDocument,STATE_PATH,normalizeSettings} from '../src/settings.mjs';
import {renderScreen} from '../src/display.mjs';
function setup(){let text=encodeDocument({countIn:true,bassEnabled:true},[]),clock={beat:0,ready:false,count_state:0};const commands=[];
 const io={read:k=>k===STATE_PATH?text:null,write:(k,v)=>{text=v;return true;},send:c=>{commands.push(c);if(c.op==='countin')clock={...clock,count_state:c.enabled?1:0};return true;},clock:()=>clock};
 const p=createPilot(io);p.init();return {p,commands,io,time:(beat,state=2,step=0,ready=true)=>clock={beat,ready,count_state:state,count_step:step,count_end:4}};}
test('managed Play counts while Move is stopped, sends exactly one Play, then records against Move beat zero',()=>{
 let c={beat:0,ready:false,bpm:120,count_state:0,count_end:4,count_free:0},sent=0;
 const p=createPilot({managedTransport:true,now:()=>0,read:()=>encodeDocument({countIn:true},[]),clock:()=>c,
 send:cmd=>{if(cmd.op==='countin'){c.count_state=cmd.enabled?1:0;c.count_free=cmd.clock||0;}return true;},transport:()=>{sent++;return true;}});
 p.init();p.recordContext();p.play();assert.equal(sent,0);assert.equal(c.count_free,1);
 c.count_state=2;p.tick();assert.equal(sent,0);
 c.count_state=3;p.tick();p.tick();assert.equal(sent,1);assert.equal(p.inspect().recordArmed,true);
 c.ready=true;c.beat=0;p.tick();assert.equal(p.inspect().model.recordCount,null);
 p.pad(C[0],true);c.beat=.5;p.pad(C[0],false);assert.equal(p.inspect().progression[0].performance.start,0);
 p.play();assert.equal(sent,2);assert.equal(p.inspect().recordArmed,false);
});
test('managed count cancellation never starts Move; missing native injection fails closed',()=>{
 let c={beat:0,ready:false,bpm:120,count_state:0,count_end:4,count_free:0},sent=0;
 const p=createPilot({managedTransport:true,read:()=>encodeDocument({countIn:true},[]),clock:()=>c,
 send:cmd=>{if(cmd.op==='countin'){c.count_state=cmd.enabled?1:0;c.count_free=cmd.clock||0;}return true;},transport:()=>{sent++;return false;}});
 p.init();p.recordContext();p.play();p.play();assert.equal(sent,0);assert.equal(p.inspect().recordArmed,false);
 p.recordContext();p.play();c.count_state=3;p.tick();assert.equal(sent,1);assert.equal(p.inspect().recordArmed,false);
});
test('unexpected native playback during free count cancels recording without toggling Move',()=>{
 let c={beat:0,ready:false,bpm:120,count_state:0,count_end:4,count_free:0},sent=0;
 const p=createPilot({managedTransport:true,read:()=>encodeDocument({countIn:true},[]),clock:()=>c,
 send:cmd=>{if(cmd.op==='countin'){c.count_state=cmd.enabled?1:0;c.count_free=cmd.clock||0;}return true;},transport:()=>{sent++;return true;}});
 p.init();p.recordContext();p.play();c.count_state=2;c.ready=true;c.beat=4;p.tick();
 assert.equal(sent,0);assert.equal(p.inspect().recordArmed,false);assert.ok(!p.inspect().progression.some(Boolean));
});
test('count-in gates every recording lane while allowing live notes, then starts empty clips at step one',()=>{
 const h=setup(),{p}=h;p.recordContext();assert.equal(p.inspect().recordArmed,true);p.tick();assert.equal(p.inspect().model.recordCount,'COUNT WAIT');
 h.time(0);p.pad(C[0],true);p.pad(M[0],true);h.time(.5);p.pad(C[0],false);p.pad(M[0],false);
 assert.ok(!p.inspect().progression.some(Boolean));assert.ok(!p.inspect().bassProgression.some(Boolean));assert.ok(!p.inspect().melodyProgression.some(Boolean));
 h.time(3,2,3);p.tick();assert.equal(p.inspect().model.recordCount,'COUNT 4/4');
 const labels=[];renderScreen({clear(){},line(){},rect(){},fill(){},text(x,y,t){labels.push(t);}},p.inspect().model);assert.ok(labels.includes('COUNT 4/4'));
 h.time(4,3);p.pad(C[0],true,89);p.pad(M[0],true,77);h.time(4.8,3);p.pad(C[0],false);p.pad(M[0],false);
 assert.ok(p.inspect().progression[0]);assert.ok(p.inspect().bassProgression[0]);assert.ok(p.inspect().melodyProgression[0]);
 assert.deepEqual(p.inspect().clipOrigins,{chord:4,bass:4,melody:4});assert.equal(p.inspect().model.recordCount,null);
 assert.equal(h.commands.filter(c=>c.op==='clipend').length,3);
});
test('the downbeat is recordable even if the audio status trails the host beat by one block',()=>{
 const h=setup(),{p}=h;p.recordContext();h.time(4,2,3);p.pad(C[0],true);h.time(4.5,3);p.pad(C[0],false);
 assert.ok(p.inspect().progression[0]);
});
test('count-in accepts a slightly early downbeat attack but not ordinary last-count playing',()=>{
 const h=setup(),{p}=h;p.recordContext();h.time(3.7,2,3);p.pad(C[0],true);p.pad(C[0],false);
 assert.ok(!p.inspect().progression.some(Boolean));
 h.time(3.94,2,3);p.pad(C[1],true);p.pad(M[0],true);h.time(4.5,3);p.pad(C[1],false);p.pad(M[0],false);
 assert.equal(p.inspect().progression[0].performance.start,0);
 assert.equal(p.inspect().bassProgression[0].performance.start,0);
 assert.equal(p.inspect().melodyProgression[0].performance.start,0);
});
test('existing chord clips keep their origin and content during in-count and cancel',()=>{
 const h=setup(),{p}=h;p.pad(C[0],true);p.step(0,true,{shift:true});p.step(0,false);p.pad(C[0],false);
 const saved=structuredClone(p.inspect().progression);p.recordContext();h.time(2,2,2);p.tick();h.time(2,4,2,false);p.tick();
 assert.equal(p.inspect().recordArmed,false);assert.deepEqual(p.inspect().progression,saved);
 p.recordContext();h.time(4,3);p.tick();assert.equal(p.inspect().clipOrigins.chord,0);assert.deepEqual(p.inspect().progression,saved);
 assert.ok(!h.commands.some(c=>c.op==='clipend'&&c.index===0));
});
test('COUNT is optional, persists, and the sample button cancels the waiting count',()=>{
 assert.equal(normalizeSettings({}).countIn,false);const h=setup(),{p}=h;
 p.menu();assert.equal(p.inspect().model.cells[4].id,'countIn');p.knob(4,-1);p.back();p.recordContext();
 assert.ok(!h.commands.some(c=>c.op==='countin'&&c.enabled));p.recordContext();p.menu();p.knob(4,1);p.back();p.recordContext();p.recordContext();
 assert.equal(p.inspect().recordArmed,false);assert.equal(h.commands.findLast(c=>c.op==='countin').enabled,0);
 p.unload();const again=createPilot(h.io);assert.equal(again.inspect().settings.countIn,true);
});
test('a stopped count-in keeps a chord struck on the downbeat or a sixteenth early, before Move starts',()=>{
 for(const [state,pos] of [[3,0],[2,3.85]]){
  let c={beat:0,ready:false,bpm:120,count_state:0,count_end:4,count_free:0,count_pos:0},sent=0;
  const p=createPilot({managedTransport:true,now:()=>0,read:()=>encodeDocument({countIn:true,bassEnabled:false},[]),clock:()=>c,
   send:cmd=>{if(cmd.op==='countin'){c.count_state=cmd.enabled?1:0;c.count_free=cmd.clock||0;}return true;},transport:()=>{sent++;return true;}});
  p.init();p.recordContext();p.play();c.count_state=2;c.count_pos=1;p.tick();
  c.count_state=state;c.count_pos=pos;p.pad(C[0],true);p.tick();
  c.count_state=3;p.tick();assert.equal(sent,1);
  c.ready=true;c.beat=.02;p.tick();c.beat=.5;p.tick();p.pad(C[0],false);
  const e=p.inspect().progression[0];assert.ok(e,`state ${state}`);assert.equal(e.performance.start,0);assert.ok(e.performance.duration>=.4);
 }
});
test('an attack early in the last count beat is still not recorded',()=>{
 let c={beat:0,ready:false,bpm:120,count_state:0,count_end:4,count_free:0,count_pos:0};
 const p=createPilot({managedTransport:true,now:()=>0,read:()=>encodeDocument({countIn:true,bassEnabled:false},[]),clock:()=>c,
  send:cmd=>{if(cmd.op==='countin'){c.count_state=cmd.enabled?1:0;c.count_free=cmd.clock||0;}return true;},transport:()=>true});
 p.init();p.recordContext();p.play();c.count_state=2;c.count_pos=3.4;p.pad(C[0],true);p.pad(C[0],false);
 c.count_state=3;p.tick();c.ready=true;c.beat=.5;p.tick();assert.ok(!p.inspect().progression.some(Boolean));
});
