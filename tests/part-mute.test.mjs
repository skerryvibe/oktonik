import test from 'node:test';
import assert from 'node:assert/strict';
import {createPilot,CHORD_PADS as C,MELODY_PADS as M,LIVE_BASS_OWNER} from '../src/pilot.mjs';
import {encodeDocument} from '../src/settings.mjs';

function setup(settings={}) {
  const commands=[];
  const p=createPilot({profile:'lab',read:()=>encodeDocument({bassEnabled:true,...settings},[]),
    write:()=>true,send:c=>{commands.push(c);return true;},render:()=>{},leds:()=>{}});
  p.init();return {p,commands};
}
test('part mute isolates chord, bass and melody and permits bass on the next chord attack',()=>{
  const {p,commands}=setup();p.pad(C[0],true);p.pad(M[0],true);
  let start=commands.length;p.mute(1);
  assert.ok(commands.slice(start).some(c=>c.op==='off'&&c.owner===LIVE_BASS_OWNER));
  assert.ok(!commands.slice(start).some(c=>c.op==='off'&&(c.owner===0||c.owner===8)));
  start=commands.length;p.mute(1);p.tick();assert.ok(!commands.slice(start).some(c=>c.op==='on'));
  p.pad(C[0],false);p.pad(C[1],true);
  assert.ok(commands.slice(start).some(c=>c.op==='on'&&c.owner===LIVE_BASS_OWNER));
  p.mute(0);start=commands.length;p.pad(C[1],false);p.pad(C[2],true);
  assert.ok(!commands.slice(start).some(c=>c.op==='on'&&c.owner<8));
  assert.ok(commands.slice(start).some(c=>c.op==='on'&&c.owner===LIVE_BASS_OWNER));
  p.panic();assert.equal(p.inspect().voices.length,0);
});
test('muted melody cannot be revoiced by a new harmony after unmute until released',()=>{
  const {p,commands}=setup({melodySustain:'hold',melodyExpression:'cc11'});
  p.pad(M[0],true);p.mute(2);p.mute(2);const start=commands.length;
  p.pad(C[1],true);p.pressure(0,127);p.tick();
  assert.ok(!commands.slice(start).some(c=>(c.op==='on'||c.op==='express')&&c.owner===8));
  p.pad(M[0],false);p.pad(M[0],true);
  assert.ok(commands.slice(start).some(c=>c.op==='on'&&c.owner===8));p.panic();
});
