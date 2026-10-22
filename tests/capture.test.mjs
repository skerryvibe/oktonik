import test from 'node:test';
import assert from 'node:assert/strict';
import {createCaptureHistory,suggestTempo,retimeCapture,trimCapture} from '../src/capture.mjs';
import {renderScreen} from '../src/display.mjs';
import {createPilot,CHORD_PADS as C,MELODY_PADS as M} from '../src/pilot.mjs';
import {encodeDocument,decodeDocument} from '../src/settings.mjs';
function setup(settings={}){
 let ms=0,bpm=120,saved,transport=null;const commands=[];
 const pilot=createPilot({now:()=>ms,clock:()=>({beat:transport??-1,ready:transport!==null,bpm}),read:()=>encodeDocument(settings,[]),write:(_,s)=>{saved=s;return true;},send:c=>commands.push(c)});
 pilot.init();return {pilot,commands,advance:n=>{ms+=n;if(transport!==null)transport+=n*bpm/60000;},transport:b=>transport=b,tempo:n=>bpm=n,saved:()=>decodeDocument(JSON.parse(saved))};
}
test('Tempo suggestion detects steady and lightly humanized playing, groups chord flams, and rejects sparse input',()=>{
 assert.equal(suggestTempo([0,.6,1.2,1.8,2.4],120).bpm,100);
 assert.ok(Math.abs(suggestTempo([0,.605,1.198,1.806,2.399],120).bpm-100)<=1);
 assert.equal(suggestTempo([0,.012,.023,.6,.612,1.2,1.212,1.8,1.812,2.4],120).bpm,100);
 assert.equal(suggestTempo([0,1,2],120),null);
 assert.equal(suggestTempo([0,.1,.2,.3],120),null);
});
test('Capture tempo is only a suggestion; confirmation rescales all clips, Undo removes the capture',()=>{
 const {pilot:p,advance}=setup({bassEnabled:true,chordSustain:'off',bassSustain:'off'});
 for(let i=0;i<5;i++){p.pad(C[i],true);advance(300);p.pad(C[i],false);if(i<4)advance(300);}
 p.capture();const before=p.inspect().clips;assert.equal(p.inspect().model.cells[5].value,'100');
 p.knob(6,1);assert.equal(p.inspect().model.cells[5].value,'200');p.knob(6,-1);
 assert.deepEqual(p.inspect().clips,before);
 p.knob(7,1);const after=p.inspect().clips;
 for(const part of ['chord','bass']){
  const lane=after.parts[part].clips[1].events;
  assert.equal(lane[4].performance.start,4);
  assert.equal(lane[0].performance.duration,2);
 }
 p.undo();assert.equal(p.inspect().clips.parts.chord.clips.length,1);
});
test('Capture refuses impossible bar/tempo combinations; retiming is atomic at length limits',()=>{
 const {pilot:p,advance}=setup();p.pad(C[0],true);advance(500);p.pad(C[0],false);p.capture();
 p.knob(2,10);const before=p.inspect().clips;p.knob(7,1);assert.deepEqual(p.inspect().clips,before);
 const take={lanes:{bass:[{note:36,steps:64,velocity:90,performance:{start:0,duration:64}}]}};
 assert.ok(retimeCapture(take,2).error);assert.equal(take.lanes.bass[0].steps,64);
});
test('Capture review renders START END BARS and derives tempo from a two-bar selection',()=>{
 const {pilot:p,advance}=setup({chordSustain:'off'});
 p.pad(C[0],true);advance(4000);p.pad(C[0],false);p.capture();
 assert.equal(p.inspect().model.pageName,'CAPTURE');
 const labels=[];renderScreen({clear(){},line(){},rect(){},fill(){},text(x,y,t){labels.push(t);}},p.inspect().model);
 assert.ok(labels.includes('START')&&labels.includes('END')&&labels.includes('BARS'));
 p.knob(2,1);p.knob(2,1);assert.equal(p.inspect().model.cells[5].value,'120');
 p.knob(7,1);assert.equal(p.inspect().model.pageName,'CLIPS');assert.equal(p.inspect().clips.parts.chord.clips[1].length,32);
 const trimmed=trimCapture({lanes:{bass:[{note:36,performance:{start:0,duration:8}}],melody:[{note:70,performance:{start:6,duration:1}}]}},2,4);
 assert.equal(trimmed.lanes.bass[0].performance.duration,2);assert.equal(trimmed.lanes.melody,undefined);
});
test('Pilot supplies host phase and Capture after stopping preserves a beat-two entrance',()=>{
 const {pilot:p,advance,transport}=setup({chordSustain:'off'});
 transport(9);p.pad(C[0],true);advance(1500);p.pad(C[0],false);
 transport(null);advance(5000);p.capture();
 const clip=p.inspect().clips.parts.chord.clips[1];
 assert.equal(clip.length,16);assert.equal(clip.events[0],null);
 assert.equal(clip.events[4].performance.start,4);assert.equal(clip.events[4].performance.duration,12);
});
test('A delayed Capture preserves the whole stopped phrase, but expires after 30 seconds',()=>{
 const h=createCaptureHistory();h.start(0,'bass',{note:36},100,h.time(0,120));
 h.stop(0,h.time(8000,120));
 const immediate=h.snapshot(h.time(8000,120));
 assert.equal(immediate.length,64);
 assert.deepEqual(h.snapshot(h.time(20000,120)),immediate);
 assert.equal(h.snapshot(h.time(38001,120)),null);
});
test('One silent bar separates free-play attempts; rests within a phrase remain',()=>{
 const h=createCaptureHistory();h.start(0,'bass',{note:36},100,h.time(0,120));h.stop(0,h.time(500,120));
 h.start(0,'bass',{note:38},100,h.time(1500,120));h.stop(0,h.time(2000,120));
 let take=h.snapshot(h.time(2200,120));assert.equal(take.lanes.bass[12].note,38);
 h.start(0,'bass',{note:40},100,h.time(4000,120));h.stop(0,h.time(4500,120));
 take=h.snapshot(h.time(5000,120));assert.equal(take.lanes.bass.filter(Boolean).length,1);assert.equal(take.lanes.bass[0].note,40);
});
test('Running capture preserves bar-relative rests across parts and after transport stops',()=>{
 const h=createCaptureHistory();
 const t=(ms,beat,ready=true)=>h.time(ms,120,{beat,ready});
 h.start(0,'chord',{snapshot:{notes:[60,64,67]}},90,t(0,9));
 h.start(1,'melody',{note:67},80,t(500,10));h.stop(1,t(1000,11));h.stop(0,t(1500,12));
 const take=h.snapshot(t(2000,13));assert.equal(take.aligned,true);assert.equal(take.length,16);
 assert.equal(take.lanes.chord[4].performance.start,4);assert.equal(take.lanes.melody[8].performance.start,8);
 assert.deepEqual(h.snapshot(t(3000,0,false)),take);
});
test('Aligned four-bar capture trims old notes without ghost onsets, and tolerates late release',()=>{
 const h=createCaptureHistory();const t=b=>h.time(b*500,120,{beat:b,ready:true});
 h.start(0,'bass',{note:30},90,t(1));h.stop(0,t(3));
 h.start(0,'bass',{note:36},90,t(4));h.stop(0,t(20.02));
 const take=h.snapshot(t(21));assert.equal(take.length,64);
 assert.equal(take.lanes.bass[0].note,36);assert.equal(take.lanes.bass.filter(Boolean).length,1);
 assert.equal(take.lanes.bass[0].performance.duration,64);
});
test('Transport seek discards incompatible material without creating a huge gap',()=>{
 const h=createCaptureHistory();h.start(0,'bass',{note:36},90,h.time(0,120,{beat:16,ready:true}));
 h.stop(0,h.time(500,120,{beat:17,ready:true}));
 h.time(1000,120,{beat:0,ready:true});assert.equal(h.snapshot(h.time(1500,120,{beat:1,ready:true})),null);
});
test('Capture while stopped creates synchronized independent clips without changing playback, and Undo restores all',()=>{
 const {pilot:p,advance,commands}=setup({bassEnabled:true,chordSustain:'off',bassSustain:'off',melodySustain:'off'});
 const before=p.inspect().clips;
 p.pad(C[0],true,90);advance(250);p.pad(M[0],true,80);advance(250);p.pad(M[0],false);advance(500);p.pad(C[0],false);
 const count=commands.length;p.capture();const s=p.inspect();
 assert.equal(s.clipView,true);assert.ok(!commands.slice(count).some(c=>c.op==='clipbegin'));
 assert.ok(s.voices.every(([,v])=>v.audition));
 for(const part of ['chord','bass','melody']){
  assert.equal(s.clips.parts[part].selected,'clip-1');assert.equal(s.clips.parts[part].clips.length,2);
  const clip=s.clips.parts[part].clips[1];assert.equal(clip.rate,0);assert.equal(clip.quantize,0);assert.equal(clip.length,16);
 }
 assert.equal(s.clips.parts.chord.clips[1].events[0].performance.duration,8);
 assert.equal(s.clips.parts.melody.clips[1].events[2].performance.start,2);
 p.undo();assert.deepEqual(p.inspect().clips,before);
});
test('Capture keeps bass gesture as separate bass changes, not repeated chords',()=>{
 const {pilot:p,advance}=setup({bassEnabled:true,bassGesture:true,chordSustain:'off',bassSustain:'off'});
 p.pad(C[0],true);advance(500);p.pad(C[2],true);advance(500);p.pad(C[0],false);p.pad(C[2],false);p.capture();
 const parts=p.inspect().clips.parts;
 assert.equal(parts.chord.clips[1].events.filter(Boolean).length,1);
 assert.equal(parts.bass.clips[1].events.filter(Boolean).length,2);
});
test('Capture excludes step audition and REC; missing tempo fails clearly',()=>{
 const {pilot:p,advance,tempo}=setup();
 p.step(0,true,{shift:true});p.step(0,false);p.step(0,true);advance(500);p.step(0,false);p.capture();
 assert.equal(p.inspect().clips.parts.chord.clips.length,1);
 p.record();p.pad(C[0],true);advance(500);p.pad(C[0],false);p.record();p.capture();
 assert.equal(p.inspect().clips.parts.chord.clips.length,1);
 tempo(0);p.pad(C[0],true);advance(500);p.pad(C[0],false);p.capture();
 assert.equal(p.inspect().clips.parts.chord.clips.length,1);
});
test('History preserves polyphony, caps window, rejects dense cells and resets on tempo change',()=>{
 const h=createCaptureHistory();let at=h.time(0,120);
 for(let i=0;i<8;i++)h.start(i,'melody',{note:60+i},90,at);
 at=h.time(500,120);for(let i=0;i<8;i++)h.stop(i,at);
 let take=h.snapshot(at);assert.equal(take.lanes.melody[0].more.length,7);
 h.clear();at=h.time(1000,120);for(let i=0;i<9;i++)h.start(i,'melody',{note:60+i},90,at);
 assert.equal(h.snapshot(h.time(1500,120)).error,'Capture too dense');
 h.time(1600,121);assert.equal(h.snapshot(h.time(1700,121)),null);
 h.start(0,'bass',{note:36},100,h.time(2000,121));
 take=h.snapshot(h.time(62000,121));assert.equal(take.length,64);assert.equal(take.lanes.bass[0].performance.duration,64);
});
test('Captured clips survive settings serialization; no duplicate capture after success',()=>{
 const {pilot:p,advance,saved}=setup();p.pad(C[0],true);advance(500);p.pad(C[0],false);p.capture();
 const clips=p.inspect().clips;p.capture();assert.deepEqual(p.inspect().clips,clips);
 p.unload();assert.deepEqual(saved().clips,clips);
});
test('Capture ends held live voices safely; releases in clip view cannot trigger notes',()=>{
 const {pilot:p,advance,commands}=setup({bassEnabled:true,chordSustain:'hold',melodySustain:'hold'});
 p.pad(C[0],true);p.pad(M[0],true);advance(1000);p.capture();
 assert.ok(p.inspect().voices.every(([,v])=>v.audition));
 const count=commands.length;p.pad(C[0],false);p.pad(M[0],false);
 assert.ok(!commands.slice(count).some(c=>c.op==='on'));
 assert.equal(p.inspect().clips.parts.melody.clips[1].events[0].performance.duration,8);
});
test('Capture preview sounds, START snaps to attacks, BPM leaves preview speed alone, Back releases voices',()=>{
 const {pilot:p,advance,commands}=setup({chordSustain:'off'});
 p.pad(C[0],true);advance(500);p.pad(C[0],false);advance(100);p.pad(C[3],true);advance(500);p.pad(C[3],false);
 p.capture();assert.ok(p.inspect().voices.some(([,v])=>v.audition));
 p.knob(0,1);assert.equal(p.inspect().model.cells[0].value,'0.60s');
 assert.deepEqual(p.inspect().voices.find(([,v])=>v.kind==='slot')[1].notes,[53,57,60]);
 const count=commands.length;p.knob(5,10);assert.equal(commands.length,count);
 p.knob(3,-1);assert.equal(p.inspect().voices.length,0);p.knob(3,1);assert.ok(p.inspect().voices.length);
 advance(200);p.tick();p.back();assert.equal(p.inspect().voices.length,0);
});
test('Full part bank rejects the whole capture without overwriting any part',()=>{
 const {pilot:p,advance}=setup({bassEnabled:true});
 for(let i=0;i<7;i++){
  p.pad(C[0],true);advance(500);p.pad(C[0],false);p.capture();p.back();
 }
 const before=p.inspect().clips;assert.equal(before.parts.chord.clips.length,8);
 p.pad(C[0],true);p.pad(M[0],true);advance(500);p.pad(C[0],false);p.pad(M[0],false);p.capture();
 assert.deepEqual(p.inspect().clips,before);
});
test('Tempo change and parking discard incompatible history',()=>{
 const {pilot:p,advance,tempo}=setup();p.pad(C[0],true);advance(500);p.pad(C[0],false);
 tempo(100);p.capture();assert.equal(p.inspect().clips.parts.chord.clips.length,1);
 p.pad(C[0],true);advance(500);p.pad(C[0],false);p.tick(undefined,true);p.tick(undefined,false);p.capture();
 assert.equal(p.inspect().clips.parts.chord.clips.length,1);
});
