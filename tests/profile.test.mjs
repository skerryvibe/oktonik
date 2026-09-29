import test from 'node:test';
import assert from 'node:assert/strict';
import {createPilot,CHORD_PADS,PAGES} from '../src/pilot.mjs';
import {encodeDocument,STATE_PATH,readSettings} from '../src/settings.mjs';
import {createProjectPilot,ACTIVE_SET_PATH,projectStatePath} from '../src/project.mjs';

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
