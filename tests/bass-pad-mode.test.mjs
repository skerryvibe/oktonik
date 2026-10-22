import test from 'node:test';
import assert from 'node:assert/strict';
import {createPilot,CHORD_PADS as C,MELODY_PADS as M,PAGES} from '../src/pilot.mjs';
import {encodeDocument,normalizeSettings} from '../src/settings.mjs';
function setup(settings={},profile='lab'){
 const commands=[];let clock={beat:0,ready:false,bpm:120},text=encodeDocument({bassEnabled:true,bassVelocityMode:'pad',...settings},[]),toggles=0;
 const p=createPilot({profile,managedTransport:true,clock:()=>clock,read:()=>text,write:(k,v)=>{text=v;return true;},send:c=>{commands.push(c);return true;},transport:()=>{toggles++;return true;}});p.init();
 return {p,commands,time:beat=>clock={beat,ready:true,bpm:120},saved:()=>text,toggles:()=>toggles};
}
test('R.PAD bass keeps left chords, uses bass routing/velocity and does not add automatic bass',()=>{
 const h=setup({bassPads:true,bassChannel:5,bassRoute:'usb',melodyChannel:7,bassExpression:'cc11'}),{p}=h;
 p.track(1);p.pad(C[0],true);assert.ok(h.commands.some(c=>c.op==='on'&&c.owner===0&&c.notes.length===3));
 assert.ok(!h.commands.some(c=>c.op==='on'&&c.owner===40));
 p.pad(M[0],true,83);const b=h.commands.findLast(c=>c.op==='on');
 assert.equal(b.owner,40);assert.equal(b.channel,5);assert.equal(b.velocity,83);assert.equal(b.cc,11);assert.equal(b.notes[0],36);
 p.pressure(0,127);assert.equal(h.commands.findLast(c=>c.op==='express').owner,40);
 p.pad(C[0],false);assert.ok(p.inspect().voices.some(([id])=>id===40));
 p.pad(M[0],false);assert.equal(p.inspect().voices.length,0);
});
for(const profile of ['public','lab'])test(`${profile}: bass right pads are monophonic last-press; releases never resurrect older held notes`,()=>{
 const h=setup({bassPads:true},profile),{p}=h;p.pad(M[0],true);p.pad(M[1],true);
 let n=h.commands.length;p.pad(M[0],false);assert.ok(!h.commands.slice(n).some(c=>c.op==='on'||c.op==='off'));
 p.pad(M[1],false);assert.equal(p.inspect().voices.length,0);
 p.pad(M[0],true);p.pad(M[1],true);n=h.commands.length;p.pad(M[1],false);p.pad(M[0],false);
 assert.ok(!h.commands.slice(n).some(c=>c.op==='on'));assert.equal(p.inspect().voices.length,0);
});
for(const profile of ['public','lab'])test(`${profile}: switch is safe, persists, uses bass sustain and is shared by both pages`,()=>{
 const h=setup({bassSustain:'hold'},profile),{p}=h;p.track(1);p.knob(2,1);assert.equal(p.inspect().settings.bassPads,true);
 p.pad(M[0],true);p.knob(2,-1);assert.equal(p.inspect().settings.bassPads,true);
 p.pad(M[0],false);assert.equal(p.inspect().voices[0][1].sustained,true);
 p.track(2);assert.equal(p.inspect().model.cells[3].id,'bassPads');assert.equal(p.inspect().model.cells[3].value,'BASS');
 p.knob(3,-1);assert.equal(p.inspect().voices.length,0);
 p.track(1);assert.equal(p.inspect().model.cells[2].value,'MEL');p.knob(2,1);p.unload();
 assert.equal(JSON.parse(h.saved()).settings.bassPads,true);assert.equal(normalizeSettings({}).bassPads,false);
 const restored=setup(JSON.parse(h.saved()).settings,profile);restored.p.pad(M[0],true);assert.equal(restored.commands.findLast(c=>c.op==='on').owner,40);
});
for(const profile of ['public','lab'])test(`${profile}: right-hand bass records in bass lane, not melody lane`,()=>{
 const h=setup({bassPads:true},profile),{p}=h;p.record();h.time(0);p.pad(C[0],true);p.pad(M[0],true);
 h.time(1);p.pad(M[1],true);h.time(2);p.pad(M[1],false);p.pad(M[0],false);p.pad(C[0],false);
 assert.equal(p.inspect().bassProgression.filter(Boolean).length,2);assert.ok(!p.inspect().melodyProgression.some(Boolean));
});
for(const profile of ['public','lab'])test(`${profile}: chord changes do not cut independently held right-hand bass with HOLD or PEDAL`,()=>{
 for(const bassSustain of ['hold','pedal']){
 const h=setup({bassPads:true,bassSustain},profile),{p}=h;p.pad(M[0],true);const n=h.commands.length;p.pad(C[3],true);
 assert.ok(!h.commands.slice(n).some(c=>(c.op==='off'||c.op==='on')&&c.owner===40));
 assert.ok(p.inspect().voices.some(([id])=>id===40));p.panic();assert.equal(p.inspect().voices.length,0);
 }
});
test('Public bass surface uses bass output, does not send melody AT, and refuses switching during REC',()=>{
 const h=setup({bassPads:true,bassChannel:5,bassRoute:'usb',melodyAftertouch:true},'public'),{p}=h;
 p.track(1);p.pad(C[0],true);assert.ok(h.commands.some(c=>c.op==='on'&&c.owner===0));
 p.pad(M[0],true,83);const on=h.commands.findLast(c=>c.op==='on');assert.equal(on.owner,40);assert.equal(on.channel,5);assert.equal(on.velocity,83);
 const n=h.commands.length;p.pressure(0,127);p.tick();assert.ok(!h.commands.slice(n).some(c=>['pressure','express'].includes(c.op)));
 p.pad(M[0],false);p.pad(C[0],false);p.record();p.knob(2,-1);assert.equal(p.inspect().settings.bassPads,true);
 p.record();p.knob(2,-1);p.pad(M[0],true);assert.equal(h.commands.findLast(c=>c.op==='on').owner,8);
});
test('Play starts at selected page and rate, resets on stop, and browsing while playing is silent',()=>{
 const h=setup(),{p}=h;p.changePage(PAGES.indexOf('SEQ'));p.knob(2,1);p.pageSteps(1);p.play();
 assert.equal(h.commands.findLast(c=>c.op==='arm').origin,16);assert.equal(h.toggles(),1);
 p.tick();assert.deepEqual(p.inspect().clipOrigins,{chord:-16,bass:-16,melody:-16});
 h.time(0);p.tick();const n=h.commands.length;p.pageSteps(-1);assert.ok(!h.commands.slice(n).some(c=>c.op==='arm'));
 p.play();assert.equal(p.inspect().armed,false);assert.deepEqual(p.inspect().clipOrigins,{chord:0,bass:0,melody:0});
});
