import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeClips,selectedClip,resizeClip} from '../src/clips.mjs';
import {compileLane,insertTake} from '../src/timeline.mjs';
import {createChordRecorder} from '../src/recording.mjs';
import {normalizeStep,normalizeBassStep,decodeDocument,encodeDocument,STATE_PATH} from '../src/settings.mjs';
import {createPilot,CHORD_PADS as C,MELODY_PADS as M,PAGES} from '../src/pilot.mjs';
const normalizers={chord:normalizeStep,bass:normalizeBassStep,melody:normalizeBassStep};
test('clip timing migrates legacy defaults and survives copy and project reload',()=>{
 const d=decodeDocument(JSON.parse(encodeDocument({rate:4,quantize:35},[])));
 for(const part of ['chord','bass','melody']){assert.equal(selectedClip(d.clips,part).rate,4);assert.equal(selectedClip(d.clips,part).quantize,35);}
 selectedClip(d.clips,'bass').rate=0;selectedClip(d.clips,'melody').quantize=70;
 const again=decodeDocument(JSON.parse(encodeDocument(d.settings,d.progression,d.overrides,d.bassProgression,d.melodyProgression,d.clips)));
 assert.equal(selectedClip(again.clips,'bass').rate,0);assert.equal(selectedClip(again.clips,'chord').rate,4);assert.equal(selectedClip(again.clips,'melody').quantize,70);
});
test('Shift clip selects editing without launch; timing and events remain isolated',()=>{
 const h=setup(),press=(n,m={})=>{h.p.pad(n,true,100,m);h.p.pad(n,false);};
 press(C[0]);h.p.step(0,true,{shift:true});h.p.step(0,false);const original=h.p.inspect().progression[0];
 h.p.menu();press(92,{copy:true});press(93,{copy:true});h.p.copyHeld(false);
 h.p.arm(true);press(93,{shift:true});assert.equal(h.p.inspect().clips.parts.chord.selected,'clip-1');assert.deepEqual(h.p.inspect().pendingClips,{});
 assert.match(h.p.inspect().model.chordLabel,/2/);
 h.p.knob(0,1);h.p.knob(1,-1);h.p.knob(2,-30);
 let clips=h.p.inspect().clips.parts.chord.clips;assert.equal(clips[1].length,32);assert.equal(clips[1].rate,1);assert.equal(clips[1].quantize,70);assert.equal(clips[0].rate,2);
 h.p.recordContext();assert.equal(h.p.inspect().recordArmed,false);
 h.p.step(0,true);h.p.knob(1,1);h.p.knob(1,-1);h.p.step(0,false);assert.deepEqual(h.p.inspect().progression[0],original);
 h.p.track(0);assert.match(h.p.inspect().model.chordLabel,/1/);h.p.knob(1,1);assert.equal(h.p.inspect().clips.parts.chord.clips[0].rate,2);
 h.p.arm(false);press(93);h.p.recordContext();h.time(1);h.p.pad(C[1],true);h.time(1.5);h.p.pad(C[1],false);h.p.recordContext();
 assert.ok(h.p.inspect().progression[2]);h.p.unload();
 const restored=decodeDocument(JSON.parse(h.files.get(STATE_PATH)));assert.equal(selectedClip(restored.clips,'chord').rate,1);assert.equal(selectedClip(restored.clips,'chord').quantize,70);
});
test('clip copy overwrites independently, delete is undoable and neither launches a clip',()=>{
 const h=setup();h.p.pad(C[0],true);h.p.step(0,true,{shift:true});h.p.step(0,false);h.p.pad(C[0],false);
 const original=h.p.inspect().progression[0];h.p.menu();
 const press=(n,m)=>{h.p.pad(n,true,100,m);h.p.pad(n,false);};
 press(92,{copy:true});press(93,{copy:true});h.p.copyHeld(false);
 let bank=h.p.inspect().clips.parts.chord;
 assert.equal(bank.selected,'clip-1');assert.deepEqual(bank.clips[1].events[0],original);
 press(92,{delete:true});assert.equal(h.p.inspect().progression[0],null);
 assert.deepEqual(h.p.inspect().clips.parts.chord.clips[1].events[0],original);
 h.p.undo();assert.deepEqual(h.p.inspect().progression[0],original);
 press(92,{copy:true});press(84,{copy:true});h.p.copyHeld(false);
 assert.equal(h.p.inspect().bassProgression[0],null);
 press(92,{copy:true});press(93,{copy:true});h.p.copyHeld(false);h.p.undo();
 assert.deepEqual(h.p.inspect().clips.parts.chord.clips[1].events[0],original);
 h.p.unload();assert.deepEqual(decodeDocument(JSON.parse(h.files.get(STATE_PATH))).progression[0],original);
});
test('clip track steps follow active lane, permit held-step editing, and wait for queued launch',()=>{
 let leds=[],beat=0;const p=createPilot({leds:v=>leds=v,clock:()=>({beat,ready:true}),send:()=>true,write:()=>true});p.init();
 p.pad(C[0],true);p.step(2,true,{shift:true});p.step(2,false);p.pad(C[0],false);p.menu();p.repaint();
 assert.notEqual(leds.find(c=>c.note===18).role,'off');
 p.track(2);p.repaint();assert.equal(leds.find(c=>c.note===18).role,'off');
 p.track(0);p.step(2,true);assert.equal(p.inspect().stepEdit,2);p.knob(3,-1);p.step(2,false);
 assert.equal(p.inspect().model.pageName,'CLIPS');
 p.arm(true);beat=1;p.tick();p.pad(93,true);p.pad(93,false);p.repaint();
 assert.ok(p.inspect().progression[2]);assert.notEqual(leds.find(c=>c.note===18).role,'off');
 beat=4;p.tick();assert.equal(p.inspect().progression[2],null);assert.equal(leds.find(c=>c.note===18).role,'off');
});
test('clip rows address all 24 places, empty LEDs stay off and absent IDs never queue',()=>{
 let leds=[];const commands=[];
 const p=createPilot({leds:v=>leds=v,send:c=>{commands.push(c);return true;},write:()=>true});p.init();p.menu();p.repaint();
 assert.ok(p.inspect().model.clipGrid.every(r=>r.items.every(c=>!c.pending&&!c.data)));
 assert.ok(leds.filter(c=>!c.button&&c.note>=76).every(c=>c.role==='off'));
 for(const [r,start] of [92,84,76].entries())for(let i=0;i<8;i++){
   p.pad(start+i,true);p.pad(start+i,false);
   assert.equal(p.inspect().clips.parts[['chord','bass','melody'][r]].selected,'clip-'+(i+1));
 }
 p.repaint();assert.ok(leds.filter(c=>!c.button&&c.note>=76).every(c=>c.role==='off'));
 assert.ok(!commands.some(c=>c.op==='on'));
 const n=commands.length;p.pad(75,true);p.pad(75,false);assert.ok(commands.slice(n).some(c=>c.op==='kill'));
 p.back();p.pad(C[0],true);assert.ok(commands.some(c=>c.op==='on'));
});
test('only a real populated queued clip is yellow and clip row four does not trigger STOP',()=>{
 let leds=[],beat=0;const commands=[];
 const p=createPilot({leds:v=>leds=v,clock:()=>({ready:true,beat}),send:c=>{commands.push(c);return true;},write:()=>true});p.init();
 p.pad(C[0],true);p.step(0,true,{shift:true});p.step(0,false);p.pad(C[0],false);
 p.menu();p.pad(95,true);p.pad(95,false);assert.equal(p.inspect().clips.parts.chord.selected,'clip-4');
 p.arm(true);beat=1;p.tick();p.pad(92,true);p.pad(92,false);p.repaint();
 assert.equal(leds.find(c=>c.note===92).role,'selected');
 assert.equal(leds.filter(c=>c.role==='selected').length,1);
 assert.equal(p.inspect().model.clipGrid[0].items.filter(c=>c.pending).length,1);
});
test('long clips preserve tails and independent lengths through project roundtrip',()=>{
 const d=decodeDocument({});
 const c=selectedClip(d.clips,'melody');assert.ok(resizeClip(c,64));
 c.events[63]=normalizeBassStep({note:80,steps:1,performance:{start:63.2,duration:.5}});
 const restored=decodeDocument(JSON.parse(encodeDocument(d.settings,d.progression,d.overrides,d.bassProgression,d.melodyProgression,d.clips)));
 assert.equal(restored.melodyProgression.length,64);assert.equal(restored.melodyProgression[63].note,80);
 assert.equal(restored.progression.length,16);assert.equal(restored.bassProgression.length,16);
 assert.equal(resizeClip(c,32),true);assert.equal(c.tail[63].note,80);assert.equal(c.events.length,32);
 const short=decodeDocument(JSON.parse(encodeDocument(d.settings,d.progression,d.overrides,d.bassProgression,d.melodyProgression,d.clips)));
 const again=selectedClip(short.clips,'melody');assert.ok(resizeClip(again,64));assert.equal(again.events[63].note,80);
 c.events[31]={note:72,steps:2};assert.ok(resizeClip(c,16));assert.ok(resizeClip(c,32));assert.equal(c.events[31].steps,2);
 assert.equal(compileLane(c.events,0,100,true)[31].len,10000);assert.equal(c.events[31].steps,2);
 assert.ok(resizeClip(c,64));assert.equal(compileLane(c.events,0)[31].len,20000);assert.equal(c.events[63].note,80);
});
test('long event compiler keeps original timing and limits density without dropping accepted attacks',()=>{
 const lane=Array(64).fill(null),r=createChordRecorder({preserveTiming:true}),visited=new Map();
 r.start(0,63.75,2,72,91,64);const t=r.release(0,64.25);
 assert.equal(t.index,63);assert.equal(t.performance.start,63.75);
 assert.ok(insertTake(lane,t,{note:72,steps:1,performance:t.performance},visited));
 assert.equal(compileLane(lane,0)[63].at,637500);assert.equal(compileLane(lane,100)[63].at,0);
 lane[20]={note:80,steps:2};assert.deepEqual(compileLane(lane,0)[20],{cell:20,event:lane[20],at:200000,len:20000});
 const dense={length:16,events:Array.from({length:16},()=>({note:60,more:Array(7).fill({note:62})}))};
 const before=JSON.stringify(dense);assert.equal(resizeClip(dense,64),false);assert.equal(JSON.stringify(dense),before);
});
test('long clip pages edit absolute steps, keep physical note owners, and record beyond step 16',()=>{
 const h=setup();h.p.changePage(PAGES.indexOf('SEQ'));h.p.knob(2,1);h.p.knob(2,1);
 assert.equal(h.p.inspect().progression.length,64);assert.equal(h.p.inspect().settings.rate,2);
 h.p.pageSteps(1);h.p.step(0,true,{shift:true});h.p.step(0,false);
 assert.ok(h.p.inspect().progression[16]);assert.equal(h.p.inspect().progression[0],null);
 h.p.step(0,true);assert.equal(h.p.inspect().stepEdit,16);
 h.p.pageSteps(1);assert.equal(h.p.inspect().stepPages.chord,1);
 h.p.step(0,false);assert.equal(h.p.inspect().stepEdit,-1);assert.equal(h.p.inspect().voices.length,0);
 h.p.pageSteps(1);h.p.pageSteps(1);h.p.step(15,true,{shift:true});h.p.step(15,false);
 assert.ok(h.p.inspect().progression[63]);h.p.knob(2,-1);assert.equal(h.p.inspect().progression.length,32);
 h.p.knob(2,1);assert.ok(h.p.inspect().progression[63]);
 h.time(40);h.p.recordContext();h.p.pad(C[1],true);h.time(41);h.p.pad(C[1],false);h.p.recordContext();
 assert.ok(h.p.inspect().progression[40]);h.p.undo();assert.equal(h.p.inspect().progression[40],null);
 h.p.unload();const d=decodeDocument(JSON.parse(h.files.get(STATE_PATH)));assert.equal(d.progression.length,64);assert.ok(d.progression[63]);
});
test('old lanes become independent selected clip-1 containers, with nonselected clips preserved',()=>{
 const old=JSON.parse(encodeDocument({},[],[],[{note:36}], [{note:72}]));
 const decoded=decodeDocument(old);
 assert.equal(selectedClip(decoded.clips,'bass').events[0].note,36);
 assert.equal(selectedClip(decoded.clips,'melody').events[0].note,72);
 decoded.clips.parts.melody.clips.push({id:'second',length:16,events:[{note:75}]});
 decoded.clips.parts.melody.selected='second';
 const raw=JSON.parse(encodeDocument(decoded.settings,decoded.progression,decoded.overrides,decoded.bassProgression,decoded.melodyProgression,decoded.clips));
 const again=decodeDocument(raw);assert.equal(again.melodyProgression[0].note,75);
 assert.equal(again.clips.parts.melody.clips[0].events[0].note,72);
 const clean=normalizeClips({version:1,parts:{bass:{selected:'missing',clips:[{id:'../bad'}, {id:'ok',events:[{note:999}]}]}}},{},normalizers);
 assert.equal(clean.parts.bass.selected,'ok');assert.equal(selectedClip(clean,'bass').events[0],null);
});
function setup() {
 let beat=0;const files=new Map([[STATE_PATH,encodeDocument({bassEnabled:true,bassVelocityMode:'pad'},[])]]);
 const p=createPilot({read:k=>files.get(k),write:(k,v)=>{files.set(k,v);return true;},clock:()=>({beat,ready:true}),send:()=>true});p.init();
 return {p,files,time:b=>beat=b};
}
test('PLAY ALL records three independent lanes, stays locked across tracks and undoes all together',()=>{
 const h=setup();h.p.recordContext();assert.equal(h.p.inspect().model.recordTarget,'all');
 h.p.pad(C[0],true,80);h.p.pad(M[0],true,90);h.p.track(2);
 assert.equal(h.p.inspect().model.pageName,'MELODY');assert.equal(h.p.inspect().model.recordTarget,'all');
 h.time(1);h.p.pad(M[0],false);h.time(2);h.p.pad(C[0],false);h.p.recordContext();
 let state=h.p.inspect();assert.ok(state.progression[0]);assert.ok(state.bassProgression[0]);assert.ok(state.melodyProgression[0]);
 assert.deepEqual(selectedClip(state.clips,'chord').events,state.progression);
 h.p.unload();const saved=decodeDocument(JSON.parse(h.files.get(STATE_PATH)));assert.ok(saved.melodyProgression[0]);assert.ok(saved.clips);
 h.p.undo();state=h.p.inspect();assert.ok([...state.progression,...state.bassProgression,...state.melodyProgression].every(v=>!v));
});
test('context chooses target only when arming, SEQ chooses ALL, track 4 is reserved',()=>{
 const h=setup();
 for(const [track,target] of [[0,'all'],[1,'bass'],[2,'melody']]) { // Track 1 follows C.REC (ALL)
  h.p.back();h.p.track(track);h.p.recordContext();assert.equal(h.p.inspect().model.recordTarget,target);
  h.p.track((track+1)%3);assert.equal(h.p.inspect().model.recordTarget,target);h.p.recordContext();
 }
 h.p.changePage(PAGES.indexOf('SEQ')-h.p.inspect().page);h.p.recordContext();assert.equal(h.p.inspect().model.recordTarget,'all');
 const before=h.p.inspect().page;h.p.track(3);assert.equal(h.p.inspect().page,before);
});
test('clip view creates/selects per part, restores old content, saves all clips and consumes pad releases',()=>{
 const h=setup();h.p.pad(C[0],true);h.p.step(0,true,{shift:true});h.p.step(0,false);h.p.pad(C[0],false);
 const original=h.p.inspect().progression;h.p.menu();assert.equal(h.p.inspect().model.pageName,'CLIPS');
 h.p.pad(93,true);assert.equal(h.p.inspect().clips.parts.chord.selected,'clip-2');
 assert.ok(h.p.inspect().progression.every(v=>!v));h.p.back();h.p.pad(93,false);assert.equal(h.p.inspect().voices.length,0);
 h.p.menu();h.p.pad(92,true);h.p.pad(92,false);assert.deepEqual(h.p.inspect().progression,original);
 h.p.track(2);assert.equal(h.p.inspect().model.pageName,'CLIPS');assert.equal(h.p.inspect().clipPart,'melody');
 h.p.pad(78,true);h.p.pad(78,false);h.p.back();h.p.unload();
 const state=decodeDocument(JSON.parse(h.files.get(STATE_PATH)));assert.equal(state.clips.parts.chord.clips.length,2);
 assert.equal(state.clips.parts.melody.selected,'clip-3');assert.equal(state.clips.parts.bass.clips.length,1);
});
test('queued clips launch at next bar, record at clip-local time, and recording/STOP cancel pending changes',()=>{
 const h=setup();h.p.arm(true);h.time(1);h.p.tick();h.p.menu();h.p.track(2);h.p.pad(77,true);h.p.pad(77,false);
 assert.equal(h.p.inspect().pendingClips.melody.beat,4);assert.equal(h.p.inspect().clips.parts.melody.selected,'clip-1');
 h.time(3.99);h.p.tick();assert.equal(h.p.inspect().clips.parts.melody.selected,'clip-1');
 h.time(4);h.p.tick();assert.equal(h.p.inspect().clips.parts.melody.selected,'clip-2');assert.equal(h.p.inspect().clipOrigins.melody,4);
 h.p.recordContext();assert.equal(h.p.inspect().model.recordTarget,'melody');h.p.pad(M[0],true);h.time(5);h.p.pad(M[0],false);h.p.recordContext();
 assert.ok(h.p.inspect().melodyProgression[0]);assert.equal(h.p.inspect().melodyProgression[0].performance.start,0);
 h.p.menu();h.p.pad(76,true);h.p.pad(76,false);h.p.recordContext();assert.deepEqual(h.p.inspect().pendingClips,{});
 h.p.menu();assert.equal(h.p.inspect().clipView,false);h.p.recordContext();h.p.menu();h.p.pad(76,true);h.p.pad(76,false);
 h.p.panic();h.time(8);h.p.tick();assert.equal(h.p.inspect().clips.parts.melody.selected,'clip-2');
});
test('clip upload retries failed slot writes before unmuting the new lane',()=>{
 const commands=[];let reject=false;
 const p=createPilot({send:c=>{commands.push(c);if(reject && c.op==='slot'){reject=false;return false;}return true;},write:()=>true});p.init();
 p.pad(C[0],true);p.step(0,true,{shift:true});p.step(0,false);p.pad(C[0],false);p.menu();reject=true;const start=commands.length;
 p.pad(93,true);assert.ok(!commands.slice(start).some(c=>c.op==='clipend'));
 p.tick();assert.ok(commands.slice(start).some(c=>c.op==='clipend'));assert.equal(p.inspect().clips.parts.chord.selected,'clip-2');
});
