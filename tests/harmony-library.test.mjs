import test from 'node:test';
import assert from 'node:assert/strict';
import {CHORD_RECIPES} from '../src/chord-library.mjs';
import {EXTENSION_PROFILES,profileDegrees,approachIntervals} from '../src/harmony-controls.mjs';
import {buildPadChord,buildChordBank,chordName,applyModifiers,chordNotes,voiceLeadNotes} from '../src/theory.mjs';
import {normalizeSettings,encodeDocument,normalizeOverride} from '../src/settings.mjs';
import {createPilot,CHORD_PADS as C,MODIFIER_PADS as X,PAGES} from '../src/pilot.mjs';
import {generateIdeasTo} from '../src/ideas.mjs';
test('every exact profile recipe can also be selected with pad TYPE and EXT',()=>{
 const paths={MAJ:['MAJ','TRIAD'],MIN:['MIN','TRIAD'],DIM:['DIM','TRIAD'],M7:['MAJ','MAJ7'],m7:['MIN','7'],D7:['MAJ','7'],M9:['MAJ','MAJ9'],m9:['MIN','9'],D9:['MAJ','9'],m11:['MIN','11'],D13:['MAJ','13(no11)'],'7b9':['MAJ','7b9'],'7#9':['MAJ','7#9'],'M#11':['MAJ','MAJ9#11'],'6/9':['MAJ','6/9'],m69:['MIN','6/9'],SUS2:['SUS2','TRIAD'],SUS4:['SUS4','TRIAD'],'7sus':['SUS4','7'],'9sus':['SUS4','9'],'5':['MAJ','5'],o7:['DIM','DIM7'],h7:['MIN','7b5'],'7b5':['MAJ','7b5'],'7#11':['MAJ','7#11'],'7b13':['MAJ','7b13']};
 for(const [id,notes] of Object.entries(CHORD_RECIPES)){
  const [chordType,extensionName]=paths[id];
  const override=normalizeOverride({chordType,extensionName});
  assert.deepEqual(buildPadChord({},0,override).intervals,notes,id);
 }
 assert.equal(chordName(buildPadChord({},0,{chordType:'MAJ',extensionName:'7b5'})),'C7b5');
 assert.equal(chordName(buildPadChord({},0,{chordType:'MIN',extensionName:'7b5'})),'Cm7b5');
});
test('older projects map to the closest of the twelve styles, which differ on multiple degrees',()=>{
 for(const [from,to] of [['jazz','sevenths'],['jazz2','jazz'],['jazz3','alt'],['soul3','soul'],['neo2','neo'],['ambient2','neo'],['pop1','global'],['classic1','classic'],['bossa','bossa']])
  assert.equal(normalizeSettings({extensionProfile:from,extensionProfileRevision:2}).extensionProfile,to,from);
 const current=normalizeSettings({extensionProfile:'jazz',extensionProfileRevision:3});assert.equal(current.extensionProfile,'jazz');
 assert.equal(EXTENSION_PROFILES.length,14);
 assert.deepEqual(profileDegrees(current),EXTENSION_PROFILES.find(p=>p.id==='jazz').degrees);
 for(const scaleId of ['major','natural_minor']){
  const profiles=EXTENSION_PROFILES.filter(p=>!['global','custom','sevenths'].includes(p.id));
  const banks=profiles.map(p=>buildChordBank({extensionProfile:p.id,extensionProfileRevision:3,scaleId}).slice(0,7));
  for(let i=0;i<banks.length;i++)for(let j=i+1;j<banks.length;j++){
   const changed=banks[i].filter((c,k)=>JSON.stringify(c.intervals)!==JSON.stringify(banks[j][k].intervals)).length;
   assert.ok(changed>=2,`${scaleId} ${profiles[i].id}/${profiles[j].id}: ${changed}`);
  }
 }
});
test('CENTER returns displaced harmony to OCT register without changing bass intent or locked inversion',()=>{
 const settings={voiceLead:true,leadRegister:'center'},c=buildChordBank()[0];
 for(const previous of [[24,28,31],[96,100,103],[]]){
  const notes=voiceLeadNotes(c,settings,previous),mean=notes.reduce((s,n)=>s+n,0)/notes.length;
  assert.ok(Math.abs(mean-55)<=4);
  const up=voiceLeadNotes(c,{...settings,octave:1},previous.map(n=>n+12));assert.deepEqual(up,notes.map(n=>n+12));
 }
 const explicit={...c,lockInversion:true,inversion:2,bassMode:'note',bassOffset:-8};
 assert.deepEqual(voiceLeadNotes(explicit,settings,[24,28,31]),chordNotes(explicit));assert.equal(explicit.bassOffset,-8);
});
test('CENTER stays compact across changing chord sizes and repeated progressions',()=>{
 for(const profile of EXTENSION_PROFILES){
  const settings={voiceLead:true,extensionProfile:profile.id,extensionProfileRevision:3};
  let previous=[96,100,103];
  for(let cycle=0;cycle<8;cycle++)for(const c of buildChordBank(settings)){
   const notes=voiceLeadNotes(c,settings,previous),mean=notes.reduce((s,n)=>s+n,0)/notes.length;
   assert.ok(Math.abs(mean-55)<=5,`${profile.id}: ${notes}`);
   assert.deepEqual([...new Set(notes.map(n=>n%12))].sort((a,b)=>a-b),[...new Set(chordNotes(c).map(n=>n%12))].sort((a,b)=>a-b));previous=notes;
  }
 }
});
test('PROFILE approaches use target quality and density; BASIC is backward compatible',()=>{
 const plain=buildPadChord({},3,{chordType:'MIN',extensionName:'ADD9'});
 const dense=buildPadChord({},3,{chordType:'MIN',extensionName:'11'});
 const input={extensionProfile:'jazz2',approachMode:'profile'};
 assert.deepEqual(approachIntervals('dom',plain,{}),[0,4,7,10]);
 assert.deepEqual(applyModifiers(plain,{ii:true},input).intervals,[0,3,6,10]);
 assert.deepEqual(applyModifiers(dense,{ii:true},input).intervals,[0,3,6,10,17]);
 assert.equal(chordName(applyModifiers(plain,{dom:true},input)),'C7b9');
 assert.equal(chordName(applyModifiers(dense,{dom:true},input)),'C7b9b13');
 assert.equal(applyModifiers(dense,{sub:true},input).rootOffset,6);
 const ideas=generateIdeasTo(plain,dense,input,{color:'MIX'});
 assert.deepEqual(ideas[1].chord.intervals,applyModifiers(dense,{dom:true},input).intervals);
});
test('register/approach selection is silent, persists, and map equals the modifier attack',()=>{
 const commands=[];let saved=encodeDocument({extensionProfile:'jazz2',bassEnabled:true},[]);
 const p=createPilot({read:()=>saved,write:(k,v)=>{saved=v;return true;},send:c=>commands.push(c)});p.init();p.pad(C[0],true);
 const voices=structuredClone(p.inspect().voices),n=commands.length;
 p.track(0);p.browse(2);p.knob(3,-1);p.back();p.changePage(PAGES.indexOf('IDEAS'));p.knob(4,1);
 assert.deepEqual(p.inspect().voices,voices);assert.equal(commands.length,n);
 p.changePage(-p.inspect().page);p.pad(C[0],false);p.pad(X[0],true);const map=p.inspect().model.chordMap.items[3];p.pad(C[3],true);
 assert.deepEqual(p.inspect().active.notes,map.notes);
 p.unload();const s=JSON.parse(saved).settings;assert.equal(s.approachMode,'profile');assert.equal(s.leadRegister,'free');
});
