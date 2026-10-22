import test from 'node:test';
import assert from 'node:assert/strict';
import {MOD_ACTIONS,DEFAULT_MODIFIERS,normalizeModifiers,resolveModifiers,EXTENSION_PROFILES} from '../src/harmony-controls.mjs';
import {applyModifiers,buildPadChord,buildChordBank,chordName,chordNotes,adaptiveScaleIntervals,SCALES} from '../src/theory.mjs';
import {normalizeSettings,normalizeOverride,encodeDocument,STATE_PATH,decodeDocument} from '../src/settings.mjs';
import {createPilot,CHORD_PADS as C,MODIFIER_PADS as X,PAGES,MAIN_PAGES} from '../src/pilot.mjs';
import {renderScreen} from '../src/display.mjs';

function setup(settings={},overrides=[]) {
 let saved=encodeDocument(settings,[],overrides);const commands=[];
 const io={read:k=>k===STATE_PATH?saved:null,write:(k,v)=>{saved=v;return true;},send:c=>{commands.push(c);return true;}};
 const p=createPilot(io);p.init();
 // EXT PROF and MOD PADS follow PLAY on the main encoder ring.
 const page=name=>{p.changePage(PAGES.indexOf('PLAY')-p.inspect().page||PAGES.length);p.browse(MAIN_PAGES.indexOf(name));};
 return {p,io,commands,page,saved:()=>JSON.parse(saved)};
}
test('old and malformed settings retain default modifiers and global extensions',()=>{
 const s=normalizeSettings({modifierAssignments:['bogus','off',null],extensionProfile:'bad',customExtensions:[NaN,100,4]});
 assert.deepEqual(s.modifierAssignments,['dom','off','sus2','sus4','ii','sub','borrow']);
 assert.equal(s.extensionProfile,'global');assert.deepEqual(s.customExtensions,[-1,-1,4,-1,-1,-1,-1]);
 assert.deepEqual(normalizeModifiers(null),DEFAULT_MODIFIERS);
 assert.deepEqual(buildChordBank(),buildChordBank({extensionProfile:'global'}));
});
test('logical actions resolve last-pressed exclusive groups and compose independent additions',()=>{
 assert.deepEqual(resolveModifiers(['dom','ii','sub','sus4','sus2','add7','maj7','add9']),
  {dom:false,flip:false,sus:2,sub:true,seventh:'maj7',add9:true});
 assert.equal(resolveModifiers(['off'],true).borrow,true);
});
test('ADD7 follows scale; explicit sevenths replace only the seventh and retain extensions',()=>{
 const bank=buildChordBank();
 assert.equal(chordName(applyModifiers(bank[0],{seventh:'add7'})),'Cmaj7');
 assert.equal(chordName(applyModifiers(bank[1],{seventh:'add7'})),'Dm7');
 assert.equal(chordName(applyModifiers(bank[4],{seventh:'add7'})),'G7');
 assert.equal(chordName(applyModifiers(bank[6],{seventh:'add7'})),'Bm7b5');
 const ninth=buildChordBank({extension:2})[0];
 assert.deepEqual(applyModifiers(ninth,{seventh:'flat7'}).intervals,[0,4,7,10,14]);
 assert.deepEqual(applyModifiers(applyModifiers(ninth,{seventh:'flat7'}),{seventh:'maj7'}).intervals,ninth.intervals);
 assert.deepEqual(applyModifiers(ninth,{seventh:'add7',add9:true}).intervals,ninth.intervals);
 assert.equal(chordName(applyModifiers(bank[0],{borrow:true,seventh:'add7'})),'Cm7');
 assert.equal(chordName(applyModifiers(bank[0],{dom:true,seventh:'add7'})),'G7');
 assert.deepEqual(applyModifiers(bank[0],{sus:4,seventh:'flat7',add9:true}).intervals,[0,5,7,10,14]);
 const dim=buildPadChord({},0,{extensionName:'DIM7',chordType:'DIM'});
 assert.deepEqual(applyModifiers(dim,{seventh:'add7'}).intervals,[0,3,6,9]);
 assert.deepEqual(applyModifiers(dim,{seventh:'flat7'}).intervals,[0,3,6,10]);
 assert.deepEqual(applyModifiers(buildPadChord({},0,{extensionName:'6'}),{seventh:'maj7'}).intervals,[0,4,7,9,11]);
 const full={rootOffset:0,intervals:[0,1,6,7,8,9,10,11]};
 assert.equal(chordNotes(applyModifiers(full,{sus:4,add9:true,seventh:'add7'})).length,8);
});
test('modifier editor matches physical layout, remains silent, and round-trips through settings',()=>{
 const h=setup();h.page('MOD PADS');
 assert.deepEqual(h.p.inspect().model.cells.map(c=>c.id),['modifier4','modifier5','modifier6','approachMode', 'modifier0','modifier1','modifier2','modifier3']);
 h.p.knob(3,1);assert.equal(h.p.inspect().settings.approachMode,'profile');assert.equal(h.p.inspect().model.cells[3].value,'PROF');
 const before=h.commands.length;h.p.knob(7,4); // SUS4 -> ADD7
 assert.equal(h.p.inspect().settings.modifierAssignments[3],'add7');assert.equal(h.commands.length,before);
 h.p.unload();const reload=createPilot(h.io);assert.equal(reload.inspect().settings.modifierAssignments[3],'add7');
});
test('new modifier previews match attacks; modifier presses/releases never emit musical events',()=>{
 for(const a of MOD_ACTIONS)for(let i=0;i<8;i++){
  const assignments=[...DEFAULT_MODIFIERS];assignments[3]=a.id;
  const h=setup({modifierAssignments:assignments,extensionProfile:'jazz',bassEnabled:true});
  let before=h.commands.length;h.p.pad(X[3],true);assert.equal(h.commands.length,before);
  const expected=h.p.inspect().model.chordMap.items[i];h.p.pad(C[i],true);
  assert.deepEqual(h.p.inspect().active.notes,expected.notes);
  assert.equal(h.p.inspect().model.chordLabel,expected.label);
  const voices=h.p.inspect().voices;before=h.commands.length;h.p.pad(X[3],false);
  assert.deepEqual(h.p.inspect().voices,voices);assert.equal(h.commands.length,before);
  h.p.pad(C[i],false);assert.equal(h.p.inspect().voices.length,0);
 }
});
test('remapped BORROW supports pad+jog latch and duplicate presses cannot double-toggle',()=>{
 const assignments=[...DEFAULT_MODIFIERS];assignments[0]='borrow';assignments[6]='add9';
 const h=setup({modifierAssignments:assignments});
 h.p.pad(X[0],true);h.p.mainButton(true);h.p.mainButton(true);h.p.mainButton(false);h.p.pad(X[0],false);
 assert.equal(h.p.inspect().borrowLocked,true);
 h.p.pad(X[6],true,100,{shift:true});h.p.pad(X[6],false);assert.equal(h.p.inspect().borrowLocked,true);h.p.back();
 h.p.pad(X[0],true);h.p.mainButton(true);h.p.mainButton(false);h.p.pad(X[0],false);assert.equal(h.p.inspect().borrowLocked,false);
 h.p.pad(X[0],true);h.p.mainButton(true);h.p.mainButton(false);h.p.pad(X[0],false);h.page('MOD PADS');h.p.knob(4,1);
 assert.equal(h.p.inspect().borrowLocked,false);
});
test('held assignment changes are blocked; OFF disables the pad without disabling STOP',()=>{
 const h=setup();h.page('MOD PADS');h.p.pad(X[3],true);h.p.knob(7,4);
 assert.equal(h.p.inspect().settings.modifierAssignments[3],'sus4');h.p.pad(X[3],false);h.p.knob(7,-63);
 assert.equal(h.p.inspect().settings.modifierAssignments[3],'off');
 h.p.pad(X[3],true);assert.equal(h.p.inspect().modifiers.sus,0);h.p.pad(C[0],true);h.p.pad(95,true);
 assert.equal(h.p.inspect().voices.length,0);
});
test('profiles are diatonic degree recipes; octave tonic shares the first recipe',()=>{
 const bank=buildChordBank({extensionProfile:'soul'});
 assert.equal(chordName(bank[0]),'C6/9');assert.equal(chordName(bank[4]),'G7sus4');
 assert.deepEqual(bank[0].intervals,bank[7].intervals);
 const custom=buildChordBank({extension:1,extensionProfile:'custom',customExtensions:[4,-1,0,0,6,0,0]});
 assert.deepEqual(custom[1].intervals,[0,3,7,10]);assert.equal(chordName(custom[4]),'G13');
 assert.equal(chordName(buildChordBank({key:2,extensionProfile:'soul'})[0],{key:2}),'D6/9');
});
test('per-pad extensions and custom chords take priority over profiles',()=>{
 const settings={extensionProfile:'jazz'};
 assert.equal(chordName(buildPadChord(settings,0,{extensionName:'TRIAD'})),'C');
 assert.equal(chordName(buildPadChord(settings,0,{extension:3})),'C6');
 const custom={rootOffset:1,intervals:[0,3,7,11],register:0};
 assert.deepEqual(buildPadChord(settings,0,{customChord:custom}).intervals,custom.intervals);
 assert.equal(chordName(buildPadChord(settings,0,{extensionName:'MAJ7'})),'Cmaj7');
});
test('editing a recipe creates CUSTOM; switching presets preserves the custom slot and saved steps',()=>{
 const h=setup();h.p.pad(C[0],true);h.p.step(0,true);h.p.step(0,false);
 const voices=h.p.inspect().voices,steps=structuredClone(h.p.inspect().progression);
 h.page('EXT PROF');let before=h.commands.length;h.p.knob(3,EXTENSION_PROFILES.findIndex(p=>p.id==='soul'));
 assert.equal(h.p.inspect().settings.extensionProfile,'soul');assert.equal(h.commands.length,before);
 assert.deepEqual(h.p.inspect().voices,voices);
 h.p.knob(4,1);assert.equal(h.p.inspect().settings.extensionProfile,'custom');
 const custom=[...h.p.inspect().settings.customExtensions];assert.equal(custom[0],'m69');assert.equal(custom[4],'7sus');
 h.p.knob(3,-2);h.p.knob(3,2);assert.equal(h.p.inspect().settings.extensionProfile,'custom');assert.deepEqual(h.p.inspect().settings.customExtensions,custom);
 assert.deepEqual(h.p.inspect().progression,steps);h.p.pad(C[0],false);h.p.unload();
 const reload=createPilot(h.io);assert.deepEqual(reload.inspect().settings.customExtensions,custom);
 assert.deepEqual(reload.inspect().progression,steps);
});
test('global EXT explicitly leaves profile mode and individual pad edits stay in place',()=>{
 const h=setup({extensionProfile:'soul'},[{extensionName:'MAJ7'}]);h.p.knob(2,1);
 assert.equal(h.p.inspect().settings.extensionProfile,'global');
 assert.equal(h.p.inspect().model.chordMap.items[0].label,'Cmaj7');
});
test('IDEAS applies remapped modifiers through the same query as its preview',()=>{
 const assignments=[...DEFAULT_MODIFIERS];assignments[3]='add9';
 const h=setup({modifierAssignments:assignments});h.p.changePage(PAGES.indexOf('IDEAS'));h.p.knob(0,1);h.p.pad(X[3],true);
 const preview=h.p.inspect().model.chordMap.items[0];h.p.pad(C[0],true);
 assert.deepEqual(h.p.inspect().active.notes,preview.notes);h.p.pad(C[0],false);h.p.pad(X[3],false);
});
test('all profile/action/scale combinations remain valid and bounded',()=>{
 for(const scale of SCALES)for(const profile of EXTENSION_PROFILES)for(const action of MOD_ACTIONS){
  const settings={scaleId:scale.id,extensionProfile:profile.id};
  for(const base of buildChordBank(settings)){
   const chord=applyModifiers(base,resolveModifiers([action.id]),settings),notes=chordNotes(chord,settings);
   assert.ok(notes.length>0&&notes.length<=8,`${scale.id}/${profile.id}/${action.id}`);
   assert.ok(notes.every(n=>n>=0&&n<=127));
  }
 }
});
test('additive variants survive pad override serialization',()=>{
 const o=normalizeOverride({variant:{seventh:'maj7',add9:true}});
 const doc=decodeDocument(JSON.parse(encodeDocument({},[],[o])));
 assert.equal(doc.overrides[0].variant.seventh,'maj7');assert.equal(doc.overrides[0].variant.add9,true);
});
test('harmony pages render eight controls and Public preserves profile assignments',()=>{
 const h=setup();for(const page of ['MOD PADS','EXT PROF']){
  h.page(page);const labels=[];renderScreen({clear(){},rect(){},fill(){},line(){},text(x,y,t){labels.push(t);}},h.p.inspect().model);
  assert.equal(h.p.inspect().model.cells.length,8);assert.ok(labels.length>16);
 }
 const p=createPilot({...h.io,profile:'public',read:()=>encodeDocument({extensionProfile:'soul',modifierAssignments:Array(7).fill('off')},[])});
 assert.equal(p.inspect().settings.extensionProfile,'soul');assert.deepEqual(p.inspect().settings.modifierAssignments,Array(7).fill('off'));
 p.browse(1);assert.equal(p.inspect().model.pageName,'EXT PROF');
 p.browse(1);assert.equal(p.inspect().model.pageName,'MOD PADS');
});

test('Back exits chord EDIT without parking, changing harmony or retriggering',()=>{
 for(const track of [false,true]){
  const h=setup();if(track)h.page('STRUM');
  const original=h.p.inspect().model.pageName;h.p.pad(C[0],true);h.p.selectEdit(0);
  const before=h.commands.length,voices=h.p.inspect().voices;
  assert.equal(h.p.back(),true);assert.equal(h.p.inspect().editIndex,-1);
  assert.equal(h.p.inspect().model.pageName,original);assert.deepEqual(h.p.inspect().voices,voices);assert.equal(h.commands.length,before);
  h.p.pad(C[0],false);assert.equal(h.p.inspect().voices.length,0);
 }
});
test('Shift plus each modifier opens direct edit, never arms its action, and Back returns',()=>{
 for(let i=0;i<X.length;i++){
  const h=setup(),before=h.commands.length;h.p.pad(X[i],true,100,{shift:true});
  assert.equal(h.p.inspect().modifierEditIndex,i);assert.equal(h.p.inspect().modifiers.borrow,undefined);
  assert.equal(h.p.inspect().modifiers.sus,0);assert.equal(h.p.inspect().modifiers.dom,false);
  h.p.knob(0,1); // Works while edit pad still held, with no performance action.
  assert.equal(h.commands.length,before);h.p.pad(X[i],false);
  h.p.shift(true);h.p.browse(1);h.p.shift(false);assert.equal(h.p.inspect().modifierEditIndex,i);
  assert.equal(h.p.back(),true);assert.equal(h.p.inspect().model.pageName,'PLAY');
  assert.equal(h.commands.length,before);assert.equal(h.p.inspect().modifierEditIndex,-1);
 }
});
test('modifier editor can be toggled by the same Shift pad, or switched without losing return page',()=>{
 const h=setup();h.page('EXT PROF');h.p.pad(X[3],true,100,{shift:true});h.p.pad(X[3],false);
 h.p.pad(X[1],true,100,{shift:true});h.p.pad(X[1],false);assert.equal(h.p.inspect().modifierEditIndex,1);
 h.p.pad(X[1],true,100,{shift:true});h.p.pad(X[1],false);assert.equal(h.p.inspect().modifierEditIndex,-1);
 assert.equal(h.p.inspect().model.pageName,'EXT PROF');
});
test('profile layout mirrors chord pads with PROF at upper right, including pentatonic repeats',()=>{
 const h=setup();h.page('EXT PROF');
 assert.deepEqual(h.p.inspect().model.cells.map(c=>c.id),['degreeExt4','degreeExt5','degreeExt6','extensionProfile','degreeExt0','degreeExt1','degreeExt2','degreeExt3']);
 assert.deepEqual(h.p.inspect().model.cells.map(c=>c.label),['G','Am','Bdim','PROF','C','Dm','Em','F']);
 h.p.knob(0,1);assert.equal(h.p.inspect().settings.customExtensions[4],0);
 const pent=setup({scaleId:'major_pentatonic'});pent.page('EXT PROF');
 assert.deepEqual(pent.p.inspect().model.cells.map(c=>c.id),['degreeExt4','degreeExt0','degreeExt1','extensionProfile','degreeExt0','degreeExt1','degreeExt2','degreeExt3']);
});
test('style presets supply actual chord qualities in major/minor without altering scale, routing or lead',()=>{
 const names=(profile,scale='major')=>buildChordBank({extensionProfile:profile,extensionProfileRevision:3,scaleId:scale}).map(c=>chordName(c,{scaleId:scale}));
 assert.deepEqual([0,1,4].map(i=>names('jazz')[i]),['C6/9','Dm9','G13']);
 assert.deepEqual([0,1,4].map(i=>names('jazz','natural_minor')[i]),['Cm6/9','Dm7b5','G7b9']);
 assert.equal(names('gospel')[2],'E7');
 assert.equal(buildChordBank({extensionProfile:'gospel'})[2].source,'custom');
 assert.deepEqual([0,3,4].map(i=>names('blues')[i]),['C7','F7','G7']);
 assert.equal(names('classic','natural_minor')[4],'G7b9');
 const h=setup({scaleId:'natural_minor',key:5,voiceLead:true,octave:-1,melodyChannel:3});h.page('EXT PROF');
 const before=h.p.inspect().settings;h.p.knob(3,3);const after=h.p.inspect().settings;
 for(const k of ['scaleId','key','voiceLead','octave','melodyChannel'])assert.equal(after[k],before[k]);
});
test('explicit profile alterations reach melody ADAPT and Chord Map, including transposed keys',()=>{
 for(let key=0;key<12;key++){
  const h=setup({key,extensionProfile:'gospel',melodyAdapt:true,melodyMode:'scale'});
  const preview=h.p.inspect().model.chordMap.items[2];h.p.pad(C[2],true);
  assert.deepEqual(h.p.inspect().active.notes,preview.notes);
  assert.equal(h.p.inspect().active.chord.intervals[1],4);
  assert.ok(adaptiveScaleIntervals(h.p.inspect().active.chord,h.p.inspect().settings).includes(8));
 }
});
test('custom explicit recipes survive save/reload and old numeric custom recipes stay valid',()=>{
 const s=normalizeSettings({extensionProfile:'custom',customExtensions:['M9','m9','D7','M#11','7b9','m69','h7']});
 const loaded=decodeDocument(JSON.parse(encodeDocument(s,[]))).settings;
 assert.deepEqual(loaded.customExtensions,s.customExtensions);
 assert.equal(chordName(buildPadChord(loaded,2)),'E7');
 assert.deepEqual(normalizeSettings({customExtensions:[4,2,1,2,6,1,1]}).customExtensions,[4,2,1,2,6,1,1]);
});
test('profile cells make pad overrides explicit and refuse an ineffective recipe edit',()=>{
 const h=setup({extensionProfile:'jazz',extensionProfileRevision:3},[{extensionName:'TRIAD'}]);h.page('EXT PROF');
 assert.equal(h.p.inspect().model.cells[4].disabledValue,'PAD');
 const before=h.p.inspect().settings;h.p.knob(4,1);assert.deepEqual(h.p.inspect().settings,before);
});
test('Public Shift BORROW edits; unshifted BORROW plus jog locks',()=>{
 const p=createPilot({profile:'public'});p.init();p.pad(94,true,100,{shift:true});p.pad(94,false);
 assert.equal(p.inspect().borrowLocked,false);assert.equal(p.inspect().modifierEditIndex,6);
 assert.equal(p.back(),true);assert.equal(p.inspect().modifierEditIndex,-1);
 p.pad(94,true);p.mainButton(true);p.mainButton(false);p.pad(94,false);
 assert.equal(p.inspect().borrowLocked,true);
});
