import test from 'node:test';
import assert from 'node:assert/strict';
import {createPilot,MAIN_PAGES,TRACK_PAGES,CHORD_PADS as C,MELODY_PADS as M} from '../src/pilot.mjs';
import {encodeDocument} from '../src/settings.mjs';

function setup(){const commands=[];const p=createPilot({profile:'lab',send:c=>commands.push(c),write:()=>true});p.init();return {p,commands};}
test('hardware main ring and track rings are separate, with consistent AT/SUST homes',()=>{
 const {p}=setup();
 for(const name of MAIN_PAGES){assert.equal(p.inspect().model.pageName,name);p.browse(1);}
 for(let t=0;t<3;t++){
  p.track(t);const base=p.inspect().model;
  assert.equal(base.cells[1].label,'OCT');assert.equal(base.cells[5].label,t===0?'LEAD':'AT');assert.equal(base.cells[7].label,'SUST');
  for(let i=0;i<TRACK_PAGES[t].length;i++){
   assert.equal(p.inspect().model.pageName,TRACK_PAGES[t][i]);
   assert.equal(p.inspect().model.pageIndex,i);assert.equal(p.inspect().model.pageCount,TRACK_PAGES[t].length);
   p.browse(1);
  }
  p.browse(-1);assert.equal(p.inspect().model.pageName,TRACK_PAGES[t].at(-1));
  assert.equal(p.back(),true);assert.equal(p.inspect().model.pageName,'PLAY');assert.equal(p.back(),false);
 }
});
test('track browsing and Shift do not change held voices or settings',()=>{
 const {p,commands}=setup();p.pad(C[0],true,80);p.pad(M[0],true,90);p.track(0);
 const settings=p.inspect().settings,voices=p.inspect().voices,n=commands.length;
 p.focus(0,true);p.browse(1);p.shift(true);
 assert.equal(p.inspect().model.pageName,'STRUM');assert.equal(p.inspect().model.focused,-1);
 p.browse(1);p.shift(false);assert.equal(p.inspect().model.pageName,'EXPR');
 p.track(1);p.browse(1);p.track(2);p.browse(1);p.back();
 assert.deepEqual(p.inspect().settings,settings);assert.deepEqual(p.inspect().voices,voices);assert.equal(commands.length,n);
});
test('track extras preserve record target and step lane',()=>{
 for(const [t,part] of ['chord','bass','melody'].entries()){
  const {p}=setup();p.track(1);p.knob(0,1);p.back();p.track(t);p.browse(1);p.recordContext();
  assert.equal(p.inspect().model.recordTarget,part==='chord'?'all':part);p.recordContext();
  p.pad(C[0],true);p.pad(M[0],true);p.step(0,true,{shift:true});p.step(0,false);
  assert.ok(p.inspect()[part==='chord'?'progression':part+'Progression'][0]);
 }
});
test('chord and step editors freeze local browsing and restore the track page',()=>{
 const {p}=setup();p.track(0);p.browse(1);p.selectEdit(2);p.browse(1);
 assert.equal(p.inspect().model.pageName,'EDIT 3');assert.equal(p.back(),true);
 p.selectEdit(-1);assert.equal(p.inspect().model.pageName,'STRUM');
 p.pad(C[0],true);p.step(0,true,{shift:true});p.step(0,false);p.pad(C[0],false);p.step(0,true);p.browse(1);
 assert.equal(p.inspect().model.pageName,'C.STP1');p.step(0,false);assert.equal(p.inspect().model.pageName,'STRUM');
});
test('clip view returns to track extras and recording switches to the chosen clip part',()=>{
 const {p}=setup();p.track(0);p.browse(1);p.menu();p.track(2);p.back();
 assert.equal(p.inspect().model.pageName,'STRUM');p.menu();p.track(2);p.recordContext();
 assert.equal(p.inspect().model.pageName,'MELODY');assert.equal(p.inspect().model.recordTarget,'melody');
});
test('Public main and track rings expose only release controls',()=>{
 const p=createPilot({profile:'public'});p.init();
 for(const name of ['EXT PROF','MOD PADS','MIDI','PLAY']){p.browse(1);assert.equal(p.inspect().model.pageName,name);}
 p.browse(-1);assert.equal(p.inspect().model.pageName,'MIDI');p.browse(-2);assert.equal(p.inspect().model.pageName,'EXT PROF');
 p.back();assert.equal(p.inspect().model.pageName,'PLAY');
 for(const [track,names] of [['CHORD'],['BASS','B.EXTRA'],['MELODY']].entries()){
  p.track(track);const base=p.inspect().model;
  assert.equal(base.cells[1].label,'OCT');assert.equal(base.cells[7].label,'SUST');
  if(track===0)assert.equal(base.cells[5].id,'voiceLead');
  if(track===2)assert.equal(base.cells[5].label,'AT');
  for(const name of names){assert.equal(p.inspect().model.pageName,name);p.browse(1);}
  assert.equal(p.inspect().model.pageName,names[0]);
 }
});
for(const profile of ['public','lab'])test(`${profile}: pressing the open Track again returns to PLAY`,()=>{
 const p=createPilot({profile});p.init();
 p.track(0);assert.equal(p.inspect().model.pageName,profile==='public'?'CHORD':'CHORDS');
 p.track(0);assert.equal(p.inspect().model.pageName,'PLAY');
 p.track(1);p.browse(1);assert.equal(p.inspect().model.pageName,'B.EXTRA');
 p.track(2);assert.equal(p.inspect().model.pageName,'MELODY');p.track(2);assert.equal(p.inspect().model.pageName,'PLAY');
 p.track(1);p.shiftStep(2);assert.equal(p.inspect().model.pageName,'SETUP');
 p.track(1);assert.equal(p.inspect().model.pageName,'BASS'); // a menu over the track closes to the track first
});
test('LEAD steps OFF, CNTR, FREE and keeps the saved register fields',()=>{
 let text=encodeDocument({voiceLead:false},[]);
 const p=createPilot({profile:'public',read:()=>text,write:(_k,v)=>{text=v;return true;}});p.init();
 const lead=()=>p.inspect().model.cells[5];assert.equal(lead().id,'voiceLead');assert.equal(lead().value,'OFF');
 p.knob(5,1);assert.equal(lead().value,'CNTR');assert.equal(p.inspect().settings.voiceLead,true);assert.equal(p.inspect().settings.leadRegister,'center');
 p.knob(5,1);assert.equal(lead().value,'FREE');assert.equal(p.inspect().settings.leadRegister,'free');
 p.knob(5,1);assert.equal(lead().value,'FREE');
 p.knob(5,-1);p.knob(5,-1);assert.equal(lead().value,'OFF');assert.equal(p.inspect().settings.voiceLead,false);
 p.knob(5,1);assert.equal(lead().value,'CNTR');
 p.unload();const s=JSON.parse(text).settings;assert.equal(s.voiceLead,true);assert.equal(s.leadRegister,'center');
 const free=createPilot({profile:'public',read:()=>encodeDocument({voiceLead:true,leadRegister:'free'},[])});free.init();
 assert.equal(free.inspect().model.cells[5].value,'FREE');
});
test('Public has no TRACK control and always follows the nearest chord tone; Lab keeps it',()=>{
 const saved=encodeDocument({melodyFollow:'pad'},[]);let text=saved;
 const io={read:()=>text,write:(_k,v)=>{text=v;return true;}};
 const pub=createPilot({...io,profile:'public'});pub.init();
 assert.equal(pub.inspect().settings.melodyFollow,'nearest');pub.track(2);
 assert.ok(!pub.inspect().model.cells.some(c=>c.id==='melodyFollow'));pub.browse(1);assert.equal(pub.inspect().model.pageName,'MELODY');
 pub.knob(0,1);pub.unload();assert.equal(JSON.parse(text).settings.melodyFollow,'pad');
 const lab=createPilot({read:()=>saved,profile:'lab'});lab.init();lab.track(2);lab.browse(1);
 assert.equal(lab.inspect().model.pageName,'M.EXTRA');assert.equal(lab.inspect().settings.melodyFollow,'pad');
});
