import test from 'node:test';
import {navigate} from './navigate.mjs';
import assert from 'node:assert/strict';
import {createPilot,CHORD_PADS as C,MELODY_PADS as M,PAGES} from '../src/pilot.mjs';
import {STATE_PATH,encodeDocument,normalizeSettings} from '../src/settings.mjs';
function setup(settings={},profile='lab') {
  const commands=[];let saved;
  const p=createPilot({profile,read:path=>path===STATE_PATH?encodeDocument(settings,[]):null,
    write:(_path,s)=>{saved=s;return true;},send:c=>commands.push(c)});p.init();
  return {p,commands,saved:()=>saved,page:n=>navigate(p,n)};
}
test('divisi defaults off, persists with schema 7 and never activates in Public',()=>{
  assert.equal(normalizeSettings({}).divisi,false);
  assert.equal(normalizeSettings({divisi:true,channel:15}).divisi,true);
  assert.deepEqual(normalizeSettings({channel:3}).ensembleChannels,[3,4,5,6,7,8,9,10]);
  const h=setup();h.page('STRUM');h.p.knob(6,1);
  assert.equal(h.p.inspect().model.cells[6].value,'NOTE');
  h.p.unload();assert.equal(JSON.parse(h.saved()).schemaVersion,7);
  assert.match(h.saved(),/"divisi":true/);
  const pub=setup({divisi:true},'public');pub.p.pad(C[0],true);
  assert.ok(pub.commands.every(c=>!c.divisi));
});
test('only chord owners receive divisi; bass, melody and arp keep independent outputs',()=>{
  const h=setup({divisi:true,channel:2,bassEnabled:true,bassChannel:12,melodyChannel:13,arpEnabled:true,arpChannel:14});
  h.p.pad(C[0],true,90);h.p.pad(M[0],true,70);
  const chord=h.commands.findLast(c=>c.op==='on'&&c.owner===0);
  assert.equal(chord.divisi,1);assert.equal(chord.channel,2);
  const others=h.commands.filter(c=>c.op==='on'&&c.owner!==0);
  assert.ok(others.length>=2);assert.ok(others.every(c=>!c.divisi));
  assert.ok(h.commands.filter(c=>c.op==='arp').every(c=>!c.divisi&&c.channel===14));
  h.p.step(0,true,{shift:true});h.p.pad(C[0],false);h.p.step(0,true);
  assert.equal(h.commands.findLast(c=>c.op==='on'&&c.notes.length>1).divisi,1);
  assert.equal(h.commands.findLast(c=>c.op==='config').divisi,1);
});
test('divisi channel editing stops old owners, accepts arbitrary channels and leaves C.CH alone',()=>{
  const h=setup();h.p.pad(C[0],true);h.page('STRUM');
  let from=h.commands.length;h.p.knob(6,1);
  assert.ok(h.commands.slice(from).some(c=>c.op==='panic'));
  assert.equal(h.p.inspect().voices.length,0);
  h.page('MIDI');h.p.knob(1,100);assert.equal(h.p.inspect().settings.channel,0);
  assert.equal(h.p.inspect().model.cells[1].disabled,true);
  h.page('ENSEMBL');h.p.pad(C[0],true);from=h.commands.length;h.p.knob(0,63);
  assert.equal(h.p.inspect().settings.ensembleChannels[0],15);
  assert.ok(h.commands.slice(from).some(c=>c.op==='panic'));assert.equal(h.p.inspect().voices.length,0);
  h.p.pad(C[0],false);h.p.pad(C[0],true);
  assert.equal(h.commands.findLast(c=>c.op==='on'&&c.owner===0).channels[0],15);
  h.p.unload();assert.deepEqual(JSON.parse(h.saved()).settings.ensembleChannels,[15,1,2,3,4,5,6,7]);
});
test('divisi pedal covers reserved channels and reports secondary-channel conflicts',()=>{
  const h=setup({divisi:true,chordSustain:'pedal',channel:1,melodyChannel:3});
  h.p.pad(C[0],true);h.p.pad(C[0],false);
  const pedal=h.commands.findLast(c=>c.op==='pedal'&&c.owner===0&&c.enabled);
  assert.equal(pedal.divisi,1);assert.equal(pedal.channel,1);
  h.page('MIDI');for(let i=0;i<100;i++)h.p.tick();
  assert.match(JSON.stringify(h.p.inspect().model),/CC64: shared channel/);
  h.p.panic();assert.ok(h.commands.some(c=>c.op==='pedal'&&c.owner===0&&!c.enabled));
});
test('Bass Gesture changes only bass while divisi chord ownership remains unchanged',()=>{
  const h=setup({divisi:true,bassEnabled:true,bassGesture:true});
  h.p.pad(C[0],true);const from=h.commands.length;h.p.pad(C[2],true);
  assert.ok(!h.commands.slice(from).some(c=>c.op==='on'&&c.divisi));
  h.p.pad(C[0],false);h.p.pad(C[2],false);
  assert.equal(h.p.inspect().voices.length,0);
});
