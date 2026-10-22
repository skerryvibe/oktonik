import test from 'node:test';
import assert from 'node:assert/strict';
import {melodyNotes,soloScaleIntervals,adaptiveScaleIntervals,buildChordBank,applyModifiers,SCALES} from '../src/theory.mjs';
import {normalizeSettings,encodeDocument,STATE_PATH} from '../src/settings.mjs';
import {createPilot,CHORD_PADS,PAGES} from '../src/pilot.mjs';
import {createProjectPilot,ACTIVE_SET_PATH} from '../src/project.mjs';
import {navigate} from './navigate.mjs';

test('solo palettes are independent, bounded, deterministic and preserve chord banks',()=>{
 for(const scale of SCALES)for(const key of [0,5,11])for(const mode of ['pentatonic','blues'])for(const type of ['auto','major','minor']) {
  const settings={key,scaleId:scale.id,melodyMode:mode,melodySoloType:type,melodyOctave:-1};
  const bank=buildChordBank(settings),before=JSON.stringify(bank);
  const a=melodyNotes(bank[0],settings),b=melodyNotes(bank[3],settings);
  assert.deepEqual(a,b);assert.equal(a.length,16);assert.ok(a.every(n=>n>=0&&n<=127));
  assert.equal(JSON.stringify(bank),before);
  assert.equal(soloScaleIntervals(settings).length,mode==='blues'?6:5);
 }
 assert.deepEqual(soloScaleIntervals({melodyMode:'blues',melodySoloType:'minor'}),[0,3,5,6,7,10]);
 assert.deepEqual(soloScaleIntervals({melodyMode:'blues',melodySoloType:'major'}),[0,2,3,4,7,9]);
 assert.equal(normalizeSettings({}).melodySoloType,'auto');
});
test('TARGET follows explicit ii/V target and returns to main scale without sticky modulation',()=>{
 const s={key:0,scaleId:'major',melodyAdapt:true,melodyAdaptTarget:true};
 const bank=buildChordBank(s),g=bank[4];
 for(const mod of [{ii:true},{dom:true}]) {
  const c=applyModifiers(g,mod,s);
  assert.deepEqual(adaptiveScaleIntervals(c,s),[0,2,4,6,7,9,11]);
 }
 assert.deepEqual(adaptiveScaleIntervals(g,s),[0,2,4,5,7,9,11]);
 const minor=applyModifiers(bank[5],{dom:true},s),tones=adaptiveScaleIntervals(minor,s);
 assert.ok(tones.includes(8)); // E7 -> Am includes G#.
 for(const n of minor.intervals)assert.ok(tones.includes((n+minor.rootOffset)%12));
});
test('both profiles share solo modes and palette types',()=>{
 for(const profile of ['lab','public']) {
  const p=createPilot({profile,read:()=>encodeDocument({melodyMode:'scale'},[])});p.init();
  if(profile==='lab')navigate(p,'MELODY');
  else for(let i=0;i<5&&p.inspect().model.pageName!=='MELODY';i++)p.changePage(1);
  const idx=p.inspect().model.cells.findIndex(c=>c.id==='melodyMode');
  assert.ok(idx>=0);
  p.knob(idx,20);
  assert.equal(p.inspect().settings.melodyMode,'blues');
  p.knob(2,1);assert.equal(p.inspect().settings.melodySoloType,'major');
 }
});
test('resume makes input live immediately, also after a parked project replacement',()=>{
 let id='A';const commands=[];
 const p=createProjectPilot({read:path=>path===ACTIVE_SET_PATH?id+'\nSet':null,send:c=>{commands.push(c);return true;}});
 p.init();p.tick(null,true);id='B';p.resume();
 assert.equal(p.inspect().parked,false);
 const at=commands.length;p.pad(CHORD_PADS[0],true);
 assert.ok(commands.slice(at).some(c=>c.op==='on'));
 p.pad(CHORD_PADS[0],false);
});
test('Lab button availability and solo colours are emitted in play and clip view',()=>{
 let leds=[];const p=createPilot({profile:'lab',leds:x=>leds=x,read:()=>encodeDocument({melodyMode:'blues',melodySoloType:'minor'},[])});p.init();
 for(const cc of [118,51,88,119,56,49,50,62,63,54,55])assert.ok(leds.some(l=>l.button&&l.note===cc));
 assert.equal(leds.find(l=>l.button&&l.note===56).role,'off');
 p.menu();assert.equal(leds.find(l=>l.button&&l.note===50).role,'on');
});
