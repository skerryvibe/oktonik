// Repo-native guide diagrams, grounded in the Public pad map and theory engine.
import {mkdir,writeFile} from 'node:fs/promises';
import {createPilot,CHORD_PADS,MELODY_PADS,MODIFIER_PADS,STOP_PAD} from '../src/pilot.mjs';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const dir=fileURLToPath(new URL('../docs/images/',import.meta.url));
await mkdir(dir,{recursive:true});
const p=createPilot({profile:'public',read:()=>null});p.init();
const labels=p.inspect().model.chordMap.items.map(x=>x.label);
assert.equal(labels.length,8);
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const text=(x,y,s,size=18,fill='#eaf0f5',extra='')=>`<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" ${extra}>${esc(s)}</text>`;
const box=(x,y,w,h,fill,stroke='#354557')=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${fill}" stroke="${stroke}"/>`;
const shell=(title,desc,h,body)=>`<svg xmlns="http://www.w3.org/2000/svg" width="1040" height="${h}" viewBox="0 0 1040 ${h}" role="img" aria-labelledby="title desc"><title id="title">${esc(title)}</title><desc id="desc">${esc(desc)}</desc><style>text{font-family:Arial,sans-serif} .strong{font-weight:700}</style><rect width="1040" height="${h}" rx="18" fill="#101a26"/>${text(32,46,title,28,'#fff','class="strong"')}${body}</svg>\n`;
let pads=text(32,78,'PLAYER VIEW  ·  C MAJOR TRIADS  ·  NO MODIFIERS OR PAD EDITS',14,'#9fb3c8');
pads+=text(32,117,'LEFT HAND — HARMONY',17,'#f1cf82')+text(554,117,'RIGHT HAND — MELODY',17,'#adbcff');
const modifiers=['DOM / V','MAJ/MIN','SUS2','SUS4','II','SUB','BORROW'];
for(let row=0;row<4;row++)for(let col=0;col<8;col++){
  const note=68+(3-row)*8+col,x=32+col*122+(col>=4?34:0),y=140+row*86;
  const chord=CHORD_PADS.indexOf(note),melody=MELODY_PADS.indexOf(note),modifier=MODIFIER_PADS.indexOf(note);
  const label=note===STOP_PAD?'STOP':chord>=0?labels[chord]:modifier>=0?modifiers[modifier]:`M${melody+1}`;
  assert.ok(chord>=0||melody>=0||modifier>=0||note===STOP_PAD);
  const fill=note===STOP_PAD?'#234470':chord>=0?'#e3ebf3':modifier>=0?'#51432b':'#303b63';
  pads+=box(x,y,110,72,fill)+text(x+55,y+42,label,label.length>6?14:20,chord>=0?'#152336':'#fff','text-anchor="middle" class="strong"');
}
pads+=text(32,515,'Hold a modifier, then play a chord. STOP releases notes and sustain.',18);
pads+=text(32,549,'Melody: M1 → M16, bottom to top. Pitches depend on mode and harmony.',17,'#9fb3c8');
pads+=text(32,581,'Schematic colours identify pad roles here; see the guide for melody LED meanings.',14,'#9fb3c8');
await writeFile(dir+'/pad-layout.svg',shell('OKTONIK / THE PLAYING SURFACE','Four rows of eight pads: II SUB BORROW STOP on top left; DOM MAJ/MIN SUS2 SUS4 below; G Am Bdim C above C Dm Em F; sixteen melody pads on the right.',612,pads));
let gesture=text(32,80,'BASS ON  ·  GEST ON  ·  CHORD + BASS SUST OFF',15,'#9fb3c8');
const steps=[['1','Hold C','C','C chord + C bass','C'],['2','Press Em as well','C/E','Only bass changes','C + Em'],['3','Release C','C/E','No new notes','Em'],['4','Press C again','C','Only bass changes','C + Em'],['5','Release all','OFF','Gesture ends','None']];
for(let i=0;i<steps.length;i++){
 const [n,action,result,detail,held]=steps[i],x=32+i*198;
 gesture+=box(x,112,184,245,'#192a3a')+text(x+16,144,n,18,'#8ea9c0')+text(x+16,181,action,16)+text(x+16,238,result,32,'#b3c4ff','class="strong"')+text(x+16,277,detail,14,'#f1cf82')+text(x+16,326,'Held: '+held,14,'#9fb3c8');
 if(i<4)gesture+=text(x+185,242,'→',12,'#9fb3c8');
}
gesture+=text(32,402,'One C chord anchor. New presses choose bass; releases never select another chord.',18);
gesture+=text(32,438,'With HOLD or PEDAL, notes follow sustain after the gesture ends.',16,'#9fb3c8');
await writeFile(dir+'/bass-gesture.svg',shell('BASS GESTURE / KEEP THE CHORD, MOVE THE BASS','Five stages from C to C/E and back to C, without retriggering the chord. Release all pads to end the gesture.',468,gesture));
let routing=text(32,80,'ONE HARMONY  ·  THREE INDEPENDENT MIDI PARTS  ·  YOUR INSTRUMENTS MAKE THE SOUND',14,'#9fb3c8');
routing+=box(32,122,232,320,'#192a3a')+text(56,220,'OKTONIK',29,'#fff','class="strong"')+text(56,261,'Live harmony',20)+text(56,294,'Chords + modifiers',16,'#9fb3c8')+text(56,325,'Bass Gesture',16,'#9fb3c8');
for(const [i,name,controls,instrument] of [[0,'CHORD','C.OUT + C.CH','e.g. piano'],[1,'MELODY','M.OUT + M.CH','e.g. lead synth'],[2,'BASS','B.OUT + B.CH','e.g. bass synth']]){
 const y=122+i*116;
 routing+=text(287,y+56,'→',30,'#9fb3c8')+box(330,y,270,88,'#303b63')+text(350,y+35,name,20,'#fff','class="strong"')+text(350,y+65,controls,17,'#b8c9e0')+text(624,y+56,'→',30,'#9fb3c8')+box(671,y,335,88,'#192a3a')+text(692,y+36,'Receiving instrument',18)+text(692,y+65,instrument,17,'#9fb3c8');
}
routing+=text(32,490,'Set the receiver to the matching route/channel. These are examples, not fixed track assignments.',16);
routing+=text(32,525,'Separate channels are important when parts use different CC64 sustain behaviour.',16,'#f1cf82');
await writeFile(dir+'/midi-routing.svg',shell('MIDI / ONE PLAYER, THREE VOICES','Chord, melody and bass each have their own output route and channel leading to a receiving instrument.',560,routing));
console.log('Rendered guide diagrams: '+labels.join(', '));
