import test from 'node:test';
import assert from 'node:assert/strict';
import {createPilot,CHORD_PADS as C,MELODY_PADS as M,LIVE_BASS_OWNER} from '../src/pilot.mjs';
import {STATE_PATH,encodeDocument,normalizeSettings} from '../src/settings.mjs';
function setup(settings={},profile='lab') {
 const commands=[];let saved;
 const p=createPilot({profile,read:path=>path===STATE_PATH?encodeDocument(settings,[]):null,
 write:(_p,s)=>{saved=s;return true;},send:c=>commands.push(c)});p.init();
 return {p,commands,saved:()=>saved};
}
test('chord CC starts from velocity and responds immediately, freezes HOLD and excludes bass selectors',()=>{
 const {p,commands}=setup({chordExpression:'cc1',chordSustain:'hold',divisi:true,bassEnabled:true,bassGesture:true});
 p.pad(C[0],true);const on=commands.findLast(c=>c.op==='on'&&c.owner===0);
 assert.equal(on.cc,1);assert.equal(on.amount,91);
 p.chordPressure(0,127);assert.equal(commands.findLast(c=>c.op==='express').amount,110);
 for(let i=0;i<30;i++)p.tick();assert.equal(commands.findLast(c=>c.op==='express').amount,110);
 p.pad(C[2],true);const from=commands.length;p.chordPressure(2,127);p.tick();
 assert.equal(commands.slice(from).filter(c=>c.op==='express'&&c.owner===8).length,0);
 p.pad(C[0],false);p.pad(C[2],false);const end=commands.length;
 p.chordPressure(0,0);for(let i=0;i<10;i++)p.tick();
 assert.equal(commands.slice(end).filter(c=>c.op==='express'&&c.owner===8).length,0);
 p.pad(C[1],true,50);assert.equal(commands.findLast(c=>c.op==='on'&&c.cc).amount,55);
});
test('poly resets at release; Public ignores chord expression even from saved settings',()=>{
 const {p,commands}=setup({chordExpression:'poly',chordSustain:'hold'});
 p.pad(C[0],true);p.chordPressure(0,100);p.tick();
 assert.equal(commands.findLast(c=>c.op==='pressure').pressure,100);
 p.pad(C[0],false);assert.equal(commands.findLast(c=>c.op==='pressure').pressure,0);
 const pub=setup({chordExpression:'cc11',divisi:true},'public');pub.p.pad(C[0],true);pub.p.chordPressure(0,127);pub.p.tick();
 assert.ok(pub.commands.every(c=>!c.cc&&c.op!=='express'));
});
test('independent bass and melody expression use attack levels and mapped owners; releases freeze CC',()=>{
 const {p,commands}=setup({bassEnabled:true,bassGesture:true,bassExpression:'cc11',melodyExpression:'cc1',
   bassChannel:2,melodyChannel:3,bassVelocityMode:'pad',bassSustain:'hold',melodySustain:'hold'});
 p.pad(C[0],true,64);p.pad(M[0],true,127);
 assert.equal(commands.findLast(c=>c.op==='on'&&c.owner===LIVE_BASS_OWNER).amount,65);
 assert.equal(commands.findLast(c=>c.op==='on'&&c.owner===8).amount,110);
 p.chordPressure(0,127);assert.equal(commands.findLast(c=>c.op==='express'&&c.owner===LIVE_BASS_OWNER).amount,110);
 p.pressure(0,0);assert.equal(commands.findLast(c=>c.op==='express'&&c.owner===8).amount,110);
 p.pad(C[2],true,70);const start=commands.length;
 p.chordPressure(0,0);assert.ok(commands.slice(start).every(c=>c.owner!==LIVE_BASS_OWNER));
 p.chordPressure(2,0);p.pad(C[2],false);p.pad(C[0],false);p.pad(M[0],false);
 const end=commands.length;p.pressure(0,127);p.chordPressure(2,127);p.tick();
 assert.ok(commands.slice(end).every(c=>c.op!=='express'));
});
test('bass POLY resets on selector release, never falls back to held anchor pressure',()=>{
 const {p,commands}=setup({bassEnabled:true,bassGesture:true,bassExpression:'poly',bassSustain:'hold'});
 p.pad(C[0],true);p.pad(C[2],true);p.chordPressure(2,99);p.tick();
 assert.equal(commands.findLast(c=>c.op==='pressure'&&c.owner===LIVE_BASS_OWNER).pressure,99);
 p.pad(C[2],false);assert.equal(commands.findLast(c=>c.op==='pressure'&&c.owner===LIVE_BASS_OWNER).pressure,0);
 const start=commands.length;p.chordPressure(0,70);p.tick();
 assert.ok(commands.slice(start).every(c=>c.op!=='pressure'));
});
test('per-part CC bounds, routing, reattack and Public isolation',()=>{
 for(const mode of ['off','poly','cc1','cc11']) {
  const {p,commands}=setup({melodyExpression:mode,bassExpression:mode,bassEnabled:true,
    melodyExpressionMin:30,melodyExpressionMax:90,bassExpressionMin:40,bassExpressionMax:100,
    bassChannel:4,melodyChannel:7,bassVelocityMode:'pad'});
  p.pad(C[0],true,1);p.pad(M[0],true,1);
  const bass=commands.findLast(c=>c.op==='on'&&c.owner===LIVE_BASS_OWNER);
  const melody=commands.findLast(c=>c.op==='on'&&c.owner===8);
  assert.equal(bass.channel,4);assert.equal(melody.channel,7);
  if(mode.startsWith('cc')) {
   assert.equal(bass.cc,Number(mode.slice(2)));assert.equal(bass.amount,40);
   assert.equal(melody.amount,30);
   p.pressure(0,127);assert.equal(commands.findLast(c=>c.op==='express'&&c.owner===8).amount,90);
   // At most one immediate CC per owner per tick; the rest is coalesced.
   const burst=commands.length;p.pressure(0,60);p.pressure(0,0);
   assert.equal(commands.slice(burst).filter(c=>c.op==='express'&&c.owner===8).length,0);
   p.tick();assert.equal(commands.slice(burst).filter(c=>c.op==='express'&&c.owner===8).length,1);
   assert.equal(commands.findLast(c=>c.op==='express'&&c.owner===8).amount,30);
   p.pressure(0,127);assert.equal(commands.findLast(c=>c.op==='express'&&c.owner===8).amount,90,'first change after a tick is immediate');
   p.tick();p.pressure(0,0);assert.equal(commands.findLast(c=>c.op==='express'&&c.owner===8).amount,30);
   p.pad(M[0],false);p.pad(M[0],true,127);
   assert.equal(commands.findLast(c=>c.op==='on'&&c.owner===8).amount,90);
  } else assert.ok(!bass.cc&&!melody.cc);
  p.panic();const end=commands.length;p.pressure(0,127);p.chordPressure(0,127);p.tick();
  assert.ok(commands.slice(end).every(c=>!['express','pressure'].includes(c.op)));
 }
 const pub=setup({bassEnabled:true,bassExpression:'cc1',melodyExpression:'cc11'},'public');
 pub.p.pad(C[0],true);pub.p.pad(M[0],true);pub.p.chordPressure(0,127);pub.p.pressure(0,127);pub.p.tick();
 assert.ok(pub.commands.every(c=>!c.cc&&c.op!=='express'));
 assert.equal(normalizeSettings({melodyAftertouch:true}).melodyExpression,'poly');
 assert.equal(normalizeSettings({bassExpressionMin:90,bassExpressionMax:20}).bassExpressionMax,90);
});
test('expression extras persist bounds and safely stop before changes',()=>{
 const h=setup();h.p.shift(true);h.p.changePage(1);
 assert.equal(h.p.inspect().model.pageName,'EXPR');
 h.p.knob(0,3);h.p.knob(1,200);h.p.knob(2,-200);
 const s=h.p.inspect().settings;assert.equal(s.chordExpression,'cc11');assert.equal(s.expressionMin,s.expressionMax);
 h.p.shift(false);h.p.pad(C[0],true);h.p.shift(true);h.p.changePage(1);const start=h.commands.length;h.p.knob(0,-1);
 assert.ok(h.commands.slice(start).some(c=>c.op==='panic'));
 h.p.unload();assert.equal(JSON.parse(h.saved()).settings.chordExpression,'cc1');
 assert.equal(normalizeSettings({expressionMin:100,expressionMax:10}).expressionMax,100);
});
