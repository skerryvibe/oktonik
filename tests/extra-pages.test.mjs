import test from 'node:test';
import assert from 'node:assert/strict';
import {createPilot,PAGES,EXTRA_PAGES,CHORD_PADS as C} from '../src/pilot.mjs';
import {createProjectPilot,ACTIVE_SET_PATH} from '../src/project.mjs';
import {normalizeSettings} from '../src/settings.mjs';
import {renderScreen} from '../src/display.mjs';
import {navigate} from './navigate.mjs';
test('extra pages are temporary, silent and return to their parent with no stale touch',()=>{
  for(const [parent,extra] of Object.entries(EXTRA_PAGES)) {
    const commands=[];let writes=0;
    const p=createPilot({profile:'lab',send:c=>commands.push(c),write:()=>{writes++;return true;}});p.init();
    p.changePage(PAGES.indexOf(parent));p.pad(C[0],true);
    const before=structuredClone(p.inspect().settings),owners=p.inspect().voices,n=commands.length;
    p.focus(0,true);p.shift(true);
    assert.equal(p.inspect().model.pageName,extra);assert.equal(p.inspect().model.extraLayer,true);
    assert.equal(p.inspect().model.chordMap,undefined);
    p.focus(1,true);p.changePage(1);assert.equal(p.inspect().page,PAGES.indexOf(parent));
    p.shift(false);assert.equal(p.inspect().model.pageName,parent);
    assert.equal(p.inspect().model.focused,-1);assert.deepEqual(p.inspect().settings,before);
    assert.deepEqual(p.inspect().voices,owners);assert.equal(commands.length,n);assert.equal(writes,0);
  }
});
test('extra controls edit their settings, render a layer marker, and do not retarget EDIT',()=>{
  const p=createPilot({write:()=>true});p.init();p.shift(true);p.knob(0,1);
  assert.equal(p.inspect().settings.strumMs,5);assert.equal(p.inspect().settings.key,0);
  const labels=[];renderScreen({clear(){},line(){},rect(){},fill(){},text(x,y,s){labels.push(s);}},p.inspect().model);
  assert.ok(labels.includes('STRUM+'));
  p.pad(C[1],true,100,{shift:true});assert.equal(p.inspect().model.pageName,'EDIT 2');
  p.knob(0,1);assert.equal(p.inspect().settings.key,0);
  p.shift(false);assert.equal(p.inspect().model.pageName,'EDIT 2');
  p.pad(C[1],false);p.shift(true);p.pad(C[1],true,100,{shift:true});
  assert.equal(p.inspect().model.pageName,'PLAY');
});
test('park, resume and project switch clear extra layers; Public retains its layout',()=>{
  const p=createPilot();p.init();p.shift(true);p.tick(null,true);p.tick(null,false);
  assert.equal(p.inspect().model.pageName,'PLAY');p.shift(true);p.resume();assert.equal(p.inspect().model.pageName,'PLAY');
  let set='a',time=0;const project=createProjectPilot({read:path=>path===ACTIVE_SET_PATH?set+'\nSong':null,now:()=>time,write:()=>true});
  project.init();project.shift(true);assert.equal(project.inspect().model.pageName,'STRUM');
  set='b';time=1000;project.tick();assert.equal(project.inspect().model.pageName,'PLAY');
  const pub=createPilot({profile:'public'});pub.init();pub.shift(true);assert.equal(pub.inspect().model.pageName,'PLAY');pub.shift(false);
  assert.equal(pub.inspect().model.cells[6].id,'strumMs');
});
test('ensemble channels normalize, allow shared destinations and preserve legacy consecutive assignment',()=>{
  assert.deepEqual(normalizeSettings({}).ensembleChannels,[0,1,2,3,4,5,6,7]);
  assert.deepEqual(normalizeSettings({channel:8,divisi:true}).ensembleChannels,[8,9,10,11,12,13,14,15]);
  assert.deepEqual(normalizeSettings({ensembleChannels:[15,2,2,-1,30,'bad']}).ensembleChannels,[15,2,2,0,15,5,6,7]);
});
test('melody and bass extras have one parameter home and retain normal-page knob positions',()=>{
  const commands=[];const p=createPilot({send:c=>commands.push(c),write:()=>true});p.init();
  navigate(p,'MELODY');assert.equal(p.inspect().model.cells[4].id,'melodySustain');
  assert.ok(!p.inspect().model.cells.some(c=>['melodyFollow','melodyAftertouch'].includes(c.id)));
  p.shift(true);assert.deepEqual(p.inspect().model.cells.slice(0,2).map(c=>c.id),['melodyFollow','melodyAftertouch']);
  p.knob(1,1);assert.equal(p.inspect().settings.melodyAftertouch,true);
  navigate(p,'BASS');p.knob(0,1);assert.equal(p.inspect().model.cells[5].id,'bassSustain');
  p.shift(true);assert.deepEqual(p.inspect().model.cells.slice(0,3).map(c=>c.id),['bassVelocityMode','bassVelocity','bassPlayback']);
  p.knob(0,1);p.knob(1,-10);const velocity=p.inspect().settings.bassVelocity;
  p.shift(false);p.pad(C[0],true,20);
  assert.equal(commands.findLast(c=>c.op==='on'&&c.owner===40).velocity,velocity);
  assert.equal(p.inspect().model.pageName,'BASS');
});
