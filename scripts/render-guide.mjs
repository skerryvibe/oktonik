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
// Shift + step shortcuts, in Move's step positions (printed icons light while Shift is held).
const shortcuts={2:['MIDI','page'],3:['SETUP','QNT COUNT'],5:['TEMPO','from Move'],6:['METRO','OFF ON REC'],7:['STRUM','menu'],8:['R.PAD','MEL/BASS'],
  9:['SCALE','key, melody'],10:['FULL','velocity'],13:['Schwung','tools'],14:['NEW','clip'],15:['DOUBLE','loop'],16:['QNT','clip on/off']};
let shift=text(32,80,'HOLD SHIFT  ·  ICONS UNDER THE STEPS LIGHT  ·  A LIT STEP MEANS THE SETTING IS ON',14,'#9fb3c8');
for(let i=1;i<=16;i++){
  const x=32+(i-1)*61,y=118,[name,detail]=shortcuts[i]||['',''],own=!!shortcuts[i]&&i!==13;
  shift+=box(x,y,52,40,i===13?'#2a2f38':own?'#e3ebf3':'#1b2633')+text(x+26,y+26,String(i),15,own?'#152336':'#7f93a8','text-anchor="middle" class="strong"');
  if(name){shift+=text(x+26,y+64,name,12,i===13?'#7f93a8':'#f1cf82','text-anchor="middle" class="strong"')+text(x+26,y+82,detail.split(' ')[0],10,'#9fb3c8','text-anchor="middle"');
    if(detail.split(' ').length>1)shift+=text(x+26,y+96,detail.split(' ').slice(1).join(' '),10,'#9fb3c8','text-anchor="middle"');}
}
shift+=text(32,262,'METRO step: blue = ON (while Move plays), red = REC (while recording).',17);
shift+=text(32,294,'SETUP, STRUM and SCALE open a page of knobs; press the same step or Back to close.',16,'#9fb3c8');
shift+=text(32,324,'Step 13 stays Schwung\'s tool menu. Positions follow Move where Move has the same function.',16,'#9fb3c8');
await writeFile(dir+'/shift-steps.svg',shell('SHIFT + STEP / SHORTCUTS','Sixteen step buttons: 2 MIDI, 3 SETUP, 5 tempo, 6 metronome, 7 strum menu, 8 right-hand pads, 9 scale, 10 full velocity, 13 Schwung tools, 14 new clip, 15 double loop, 16 quantize.',356,shift));
// Clip view (Menu): one pad row per part, eight clip places each.
let clipsView=text(32,80,'MENU OPENS CLIPS  ·  ONE ROW PER PART  ·  EIGHT CLIP PLACES EACH',14,'#9fb3c8');
const rows=[['CHORD','#e3ebf3','#152336'],['BASS','#2f5a46','#fff'],['MELODY','#303b63','#fff']];
for(let row=0;row<4;row++)for(let col=0;col<8;col++){
  const x=32+col*122+(col>=4?34:0),y=112+row*78,part=rows[row];
  if(part){const filled=col<3,selected=col===0;
    clipsView+=box(x,y,110,64,filled?part[1]:'#1b2633',selected?'#f1cf82':'#354557')+text(x+55,y+38,filled?`${part[0]} ${col+1}`:'empty',filled?14:13,filled?part[2]:'#7f93a8','text-anchor="middle" class="strong"');}
  else clipsView+=box(x,y,110,64,col===7?'#234470':'#141d28')+text(x+55,y+38,col===7?'STOP':'',16,'#fff','text-anchor="middle" class="strong"');
}
clipsView+=text(32,440,'Press a clip to play it (queued to the next bar while playing). Yellow outline: the clip that plays.',16);
clipsView+=text(32,470,'Copy + clip, then another clip: copy. Delete + clip: clear. Track 1/2/3 shows that part\'s steps.',16,'#9fb3c8');
clipsView+=text(32,500,'Knobs: LEN, RATE, QNT (this clip), PAGE, COUNT, METRO.',16,'#9fb3c8');
await writeFile(dir+'/clip-view.svg',shell('CLIPS / CHORDS, BASS AND MELODY','Clip view: top pad row chord clips, second row bass clips, third row melody clips, bottom-right pad STOP.',530,clipsView));
console.log('Rendered guide diagrams: '+labels.join(', '));
