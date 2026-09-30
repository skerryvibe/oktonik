import test from 'node:test';
import assert from 'node:assert/strict';
import {createPilot,CHORD_PADS,PAGES} from '../src/pilot.mjs';
import {encodeDocument,STATE_PATH,readSettings} from '../src/settings.mjs';
import {createProjectPilot,ACTIVE_SET_PATH,projectStatePath} from '../src/project.mjs';
import {renderScreen} from '../src/display.mjs';

test('Public PLAY uses the same eight controls and MIDI behaviour as CHORD',()=>{
  const expected=['key','scaleId','extension','octave','spread','voiceLead','strumMs','chordSustain'];
  for(let knob=0;knob<8;knob++){
    const a=setup(),b=setup();b.pilot.changePage(1);
    assert.deepEqual(a.pilot.inspect().model.cells.map(c=>c.id),expected);
    for(const h of [a,b])h.pilot.pad(CHORD_PADS[0],true,90);
    for(const delta of [1,1,-1,-63,63]){
      a.commands.length=0;b.commands.length=0;
      a.pilot.knob(knob,delta);b.pilot.knob(knob,delta);
      assert.deepEqual(a.pilot.inspect().settings,b.pilot.inspect().settings);
      assert.deepEqual(a.commands,b.commands,`knob ${knob+1}, delta ${delta}`);
      assert.deepEqual(a.pilot.inspect().model.cells,b.pilot.inspect().model.cells);
      assert.ok(a.pilot.inspect().model.chordMap);
      assert.equal(a.pilot.inspect().model.pageName,'PLAY');
    }
    a.pilot.unload();b.pilot.unload();assert.equal(a.saved(),b.saved());
  }
});

test('Public PLAY touch is silent, shows parameter/value, and returns to map footer',()=>{
  const {pilot,commands}=setup();
  const settle=()=>{for(let i=0;i<70;i++)pilot.tick();};settle();
  const map=pilot.inspect().model.chordMap;commands.length=0;
  pilot.focus(6,true);settle();
  assert.equal(pilot.inspect().model.detail,'Strum: 0ms');
  assert.deepEqual(pilot.inspect().model.chordMap,map);assert.equal(commands.length,0);
  pilot.knob(6,1);assert.equal(pilot.inspect().model.detail,'Strum: 5ms');
  const texts=[];
  renderScreen({clear(){},line(){},rect(){},fill(){},text(x,y,t){texts.push([y,t]);}},pilot.inspect().model);
  assert.ok(texts.some(([y,t])=>y===55&&t==='Strum: 5ms'));
  assert.deepEqual(texts.filter(([y])=>y===18||y===40).map(([,t])=>t),['G','Am','Bdim','C','C','Dm','Em','F']);
  pilot.focus(6,false);settle();assert.match(pilot.inspect().model.detail,/CHORD MAP/);
  pilot.knob(0,1);assert.equal(pilot.inspect().model.chordMap.items[0].label,'Db');
  assert.equal(pilot.inspect().model.detail,'Key: Db');
});

test('Public PLAY edits remain per-pad inside EDIT and global after returning',()=>{
  const {pilot}=setup();pilot.pad(CHORD_PADS[1],true,100,{shift:true});
  pilot.knob(0,1);assert.equal(pilot.inspect().settings.key,0);
  pilot.pad(CHORD_PADS[1],false);pilot.pad(CHORD_PADS[1],true,100,{shift:true});
  assert.equal(pilot.inspect().model.pageName,'PLAY');pilot.knob(0,1);
  assert.equal(pilot.inspect().settings.key,1);
  pilot.changePage(1);assert.equal(pilot.inspect().model.cells[0].value,'Db');
});

function setup(profile='public',document=null){
  const commands=[];let saved;
  const pilot=createPilot({profile,read:p=>p===STATE_PATH?document:null,write:(p,s)=>{saved=s;return true;},send:c=>commands.push(c)});
  pilot.init();return {pilot,commands,saved:()=>saved};
}
test('Public has five pages and simple strum, no experimental controls',()=>{
  const {pilot}=setup();const names=[],ids=[];
  for(let i=0;i<5;i++){const m=pilot.inspect().model;names.push(m.pageName);assert.equal(m.pageCount,5);ids.push(...m.cells.map(c=>c.id));pilot.changePage(1);}
  assert.deepEqual(names,['PLAY','CHORD','MELODY','BASS','MIDI']);
  assert.equal(pilot.inspect().model.pageName,'PLAY');
  assert.ok(ids.includes('strumMs'));
  for(const id of ['arpEnabled','record','arm','bassPlayback','arpRoute','strumDirection'])assert.ok(!ids.includes(id));
});
test('Public cannot arm, capture, record or audition steps; live notes still work',()=>{
  const {pilot,commands}=setup();commands.length=0;
  pilot.play();pilot.arm(true);pilot.record();pilot.capture();pilot.undo();pilot.step(0,true,{shift:true});pilot.step(0,false);
  assert.equal(commands.length,0);
  assert.equal(pilot.inspect().recordArmed,false);assert.equal(pilot.inspect().armed,false);
  pilot.pad(CHORD_PADS[0],true,100);assert.ok(commands.some(c=>c.op==='on'));
  pilot.pad(CHORD_PADS[0],false);pilot.panic();assert.ok(commands.some(c=>c.op==='kill'));
});
test('Public keeps dormant Lab state when saving shared settings',()=>{
  const raw=encodeDocument({arpEnabled:true,strumDirection:3,strumTiming:40,strumVelocity:30,bassPlayback:'clip'},[]);
  const original=readSettings(()=>raw);
  const {pilot,commands,saved}=setup('public',raw);
  assert.equal(commands.find(c=>c.op==='arp').enabled,0);
  assert.ok(!commands.some(c=>c.op==='slot'||c.op==='bassslot'));
  pilot.changePage(1);pilot.knob(0,1);pilot.unload();
  const restored=readSettings(()=>saved());
  for(const k of ['arpEnabled','strumDirection','strumTiming','strumVelocity','bassPlayback'])assert.equal(restored.settings[k],original.settings[k]);
  assert.equal(restored.settings.key,(original.settings.key+1)%12);
  assert.deepEqual(restored.progression,original.progression);
});
test('Public Menu only navigates five pages; Lab retains IDEAS',()=>{
  const {pilot}=setup();for(let i=0;i<10;i++){pilot.menu();assert.notEqual(pilot.inspect().model.pageName,'IDEAS');assert.equal(pilot.inspect().ideasEnabled,false);}
  const lab=setup('lab').pilot;for(const page of PAGES){assert.equal(lab.inspect().model.pageName,page);lab.changePage(1);}
});

test('Public project changes preserve recorded multi-event lanes for Lab',()=>{
  let beat=0;let document;
  const lab=createPilot({profile:'lab',clock:()=>({beat,ready:true}),write:(_,s)=>{document=s;return true;}});
  lab.init();lab.record();
  for(const [start,pad] of [[.1,0],[.6,2]]){beat=start;lab.pad(CHORD_PADS[pad],true,90);beat=start+.15;lab.pad(CHORD_PADS[pad],false);}
  lab.record();lab.unload();
  const before=readSettings(()=>document);
  assert.equal(before.progression[0].more.length,1);
  let project='one';const files=new Map([[projectStatePath('one','public'),document]]),commands=[];
  const pilot=createProjectPilot({profile:'public',now:()=>0,read:p=>p===ACTIVE_SET_PATH?project+'\nDemo':files.get(p),write:(p,s)=>{files.set(p,s);return true;},send:c=>commands.push(c)});
  pilot.init();pilot.changePage(1);pilot.knob(0,1);
  project='two';pilot.resume();assert.equal(pilot.inspect().settings.key,0);
  assert.ok(!commands.some(c=>c.op==='slot'||c.op==='bassslot'||c.op==='arp'&&c.enabled));
  project='one';pilot.resume();assert.equal(pilot.inspect().settings.key,1);pilot.unload();
  const after=readSettings(()=>files.get(projectStatePath('one','public')));
  assert.deepEqual(after.progression,before.progression);assert.deepEqual(after.bassProgression,before.bassProgression);
});

test('profiles import legacy project once and never overwrite each other or legacy',()=>{
  const legacy='/data/UserData/schwung/set_state/demo/chord_pilot_v7.json';
  const raw=encodeDocument({key:4},[]),files=new Map([[legacy,raw]]);
  const open=profile=>{const p=createProjectPilot({profile,read:path=>path===ACTIVE_SET_PATH?'demo\nDemo':files.get(path),write:(path,s)=>{files.set(path,s);return true;}});p.init();return p;};
  const pub=open('public');assert.equal(pub.inspect().settings.key,4);pub.changePage(1);pub.knob(0,1);pub.unload();
  const lab=open('lab');assert.equal(lab.inspect().settings.key,4);lab.changePage(1);lab.knob(0,2);lab.unload();
  assert.equal(open('public').inspect().settings.key,5);assert.equal(open('lab').inspect().settings.key,6);
  assert.equal(files.get(legacy),raw);
  files.set(projectStatePath('demo','public'),'');assert.equal(open('public').inspect().settings.key,0);
  assert.equal(files.get(projectStatePath('demo','public')),'');
});
