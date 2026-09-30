#!/usr/bin/env node
// Uses the production renderer and a tiny bitmap-font SVG drawing adapter.
// No browser, screenshot service, generated imagery or external font required.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderScreen } from '../src/display.mjs';
import { CHORD_PADS, PAGES, STOP_PAD } from '../src/pilot.mjs';
import { createProjectPilot, ACTIVE_SET_PATH } from '../src/project.mjs';
import { PRODUCT_VERSION } from '../src/profile.mjs';

const glyphs = {
  ' ': [0,0,0,0,0,0,0], '!': [4,4,4,4,4,0,4], '#': [10,31,10,10,31,10,0],
  '%': [25,25,2,4,8,19,19], '&': [12,18,20,8,21,18,13], "'": [4,4,0,0,0,0,0],
  '(': [2,4,8,8,8,4,2], ')': [8,4,2,2,2,4,8], '*': [0,21,14,31,14,21,0],
  '+': [0,4,4,31,4,4,0], ',': [0,0,0,0,0,4,8], '-': [0,0,0,31,0,0,0],
  '.': [0,0,0,0,0,0,4], '/': [1,2,2,4,8,8,16], ':': [0,4,0,0,4,0,0],
  ';': [0,4,0,0,4,4,8], '<': [1,2,4,8,4,2,1], '=': [0,0,31,0,31,0,0],
  '>': [16,8,4,2,4,8,16], '?': [14,17,1,2,4,0,4], '[': [14,8,8,8,8,8,14],
  ']': [14,2,2,2,2,2,14], '^': [4,10,17,0,0,0,0], '_': [0,0,0,0,0,0,31],
  '|': [4,4,4,4,4,4,4], '~': [0,0,9,22,0,0,0],
  '0': [14,17,19,21,25,17,14], '1': [4,12,4,4,4,4,14], '2': [14,17,1,2,4,8,31],
  '3': [30,1,1,14,1,1,30], '4': [2,6,10,18,31,2,2], '5': [31,16,16,30,1,1,30],
  '6': [14,16,16,30,17,17,14], '7': [31,1,2,4,8,8,8], '8': [14,17,17,14,17,17,14],
  '9': [14,17,17,15,1,1,14], A: [14,17,17,31,17,17,17], B: [30,17,17,30,17,17,30],
  C: [14,17,16,16,16,17,14], D: [30,17,17,17,17,17,30], E: [31,16,16,30,16,16,31],
  F: [31,16,16,30,16,16,16], G: [14,17,16,23,17,17,15], H: [17,17,17,31,17,17,17],
  I: [14,4,4,4,4,4,14], J: [7,2,2,2,2,18,12], K: [17,18,20,24,20,18,17],
  L: [16,16,16,16,16,16,31], M: [17,27,21,21,17,17,17], N: [17,25,25,21,19,19,17],
  O: [14,17,17,17,17,17,14], P: [30,17,17,30,16,16,16], Q: [14,17,17,17,21,18,13],
  R: [30,17,17,30,20,18,17], S: [15,16,16,14,1,1,30], T: [31,4,4,4,4,4,4],
  U: [17,17,17,17,17,17,14], V: [17,17,17,17,17,10,4], W: [17,17,17,21,21,27,17],
  X: [17,17,10,4,10,17,17], Y: [17,17,10,4,4,4,4], Z: [31,1,2,4,8,16,31],
  a: [0,0,14,1,15,17,15], b: [16,16,22,25,17,17,30], c: [0,0,14,16,16,17,14],
  d: [1,1,13,19,17,17,15], e: [0,0,14,17,31,16,14], f: [6,9,8,28,8,8,8],
  g: [0,15,17,17,15,1,14], h: [16,16,22,25,17,17,17], i: [4,0,12,4,4,4,14],
  j: [2,0,6,2,2,18,12], k: [16,16,18,20,24,20,18], l: [12,4,4,4,4,4,14],
  m: [0,0,26,21,21,21,21], n: [0,0,22,25,17,17,17], o: [0,0,14,17,17,17,14],
  p: [0,0,30,17,30,16,16], q: [0,0,15,17,15,1,1], r: [0,0,22,25,16,16,16],
  s: [0,0,15,16,14,1,30], t: [8,8,28,8,8,9,6], u: [0,0,17,17,17,19,13],
  v: [0,0,17,17,17,10,4], w: [0,0,17,17,21,21,10], x: [0,0,17,10,4,10,17],
  y: [0,0,17,17,15,1,14], z: [0,0,31,2,4,8,31],
};

// Capture real screen models through the same gestures used on hardware.
const pilot = createProjectPilot({ write: () => true, now: () => 0,
  read: path => path === ACTIVE_SET_PATH ? 'preview-set\nDemo' : null });
pilot.init();
const settle = () => { for (let i = 0; i < 70; i++) pilot.tick(); return pilot.inspect().model; };
const go = name => {
  pilot.selectEdit(-1);
  pilot.changePage(PAGES.indexOf(name) - pilot.inspect().page);
};
pilot.pad(CHORD_PADS[0], true); pilot.pad(CHORD_PADS[0], false);
const examples = [{ title: 'PLAY / CHORD MAP', subtitle: 'Default view. Eight chords in the physical pad layout.', model: settle() }];
pilot.pad(94,true);
examples.push({title:'PLAY / BORROW PREVIEW',subtitle:'Silent live preview while BORROW is held.',model:settle()});
pilot.pad(94,false);pilot.pad(87,true);
examples.push({title:'PLAY / SUS4 PREVIEW',subtitle:'Header retains played chord; grid shows the next choices.',model:settle()});
pilot.pad(87,false);go('CHORDS');
examples.push({title:'CHORDS / CLEAN DEFAULTS',subtitle:'Global harmony settings, separate from PLAY.',model:settle()});
go('STRUM');pilot.knob(0,4);pilot.knob(1,2);pilot.knob(2,30);pilot.knob(3,20);
examples.push({title:'STRUM / EXPRESSION',subtitle:'Alternating direction, independent timing and velocity variation.',model:settle()});
pilot.knob(0,-4);pilot.knob(1,-2);pilot.knob(2,-30);pilot.knob(3,-20);go('CHORDS');
pilot.pad(CHORD_PADS[1], true, 100, { shift: true });
pilot.knob(2, 6);
pilot.knob(3, 2); pilot.knob(7, 1);
examples.push({ title: 'EDIT ONE CHORD', subtitle: 'Inverted chord; bass still ROOT. Eight controls, one page.', model: settle() });
go('IDEAS');
examples.push({ title: 'IDEAS / CONTROLS', subtitle: 'Knob 1: ON/OFF. Knob 2: STYLE: SAFE/COLOR/WILD. Knob 3: NEW.', model: settle() });
pilot.knob(0, 1);
examples.push({ title: 'IDEAS / PAD MAP', subtitle: 'A5-A8 above A1-A4, matching the left chord pads.', model: settle() });
pilot.knob(0,-1);pilot.pad(CHORD_PADS[5],true);pilot.pad(CHORD_PADS[5],false);
pilot.knob(3,1);pilot.knob(0,1);
examples.push({title:'IDEAS / TO Am',subtitle:'Lower pads: Bm7b5, E7, Am, SUB. Play the path yourself.',model:settle()});
pilot.knob(3,-1);
pilot.pad(CHORD_PADS[4], true); pilot.pad(CHORD_PADS[4], false);
examples.push({ title: 'IDEAS / TRY A CHORD', subtitle: 'Selected pad, sounding chord and short explanation.', model: settle() });
go('CHORDS');
pilot.pad(94, true, 100, { shift: true }); pilot.pad(94, false);
pilot.pad(CHORD_PADS[3], true); pilot.pad(CHORD_PADS[3], false);
examples.push({ title: 'BORROW LOCKED', subtitle: 'Shift + BORROW latches. The boxed B stays visible.', model: settle() });
go('MELODY');
examples.push({ title: 'MELODY / NEW DEFAULTS', subtitle: 'SCALE, octave -1, ADAPT ON. Existing projects retain choices.', model: settle() });
go('CHORDS');pilot.knob(7,1);
go('BASS'); pilot.knob(0, 1); pilot.knob(3, 1);
examples.push({ title: 'BASS', subtitle: 'B.NTE: ROOT or LOW; B.OCT stays independent.', model: settle() });
pilot.pad(92, true); pilot.pad(CHORD_PADS[1], true); pilot.pad(CHORD_PADS[1], false); pilot.pad(92, false);
go('PLAY');
pilot.step(15, true, { shift: true });
go('SEQ');
pilot.knob(4, -20);
examples.push({ title: 'SEQ / 16 STEPS', subtitle: 'R.PRT selects recording; PART selects step editing.', model: settle() });
pilot.knob(5,-30);
examples.push({title:'SEQ / QUANTIZE 70%',subtitle:'Non-destructive strength; original recording timing is retained.',model:settle()});
pilot.knob(5,30);
pilot.step(15,true);pilot.knob(2,3);pilot.step(15,false);
examples.push({title:'SEQ / LONG CHORD',subtitle:'Explicit LEN holds across cells. Old steps still use GATE.',model:settle()});
pilot.knob(6,1);
examples.push({title:'SEQ / RECORD ARMED',subtitle:'Waiting for Move Play. Chord takes use RATE grid and pad velocity.',model:settle()});
pilot.knob(6,-1);
pilot.knob(7,2);
examples.push({title:'SEQ / BASS OVERDUB',subtitle:'Record only bass over saved chords. Left pads select bass roots.',model:settle()});
pilot.knob(7,-2);
pilot.step(15,true);
examples.push({title:'CHORD STEP / HOLD',subtitle:'Temporary ROOT, EXT, LEN and VEL editor. Release to return.',model:settle()});
pilot.step(15,false);
pilot.knob(3,1);pilot.pad(CHORD_PADS[0],true);pilot.step(15,true,{shift:true});pilot.step(15,false);pilot.pad(CHORD_PADS[0],false);
go('BASS');
pilot.step(15,true);
examples.push({title:'BASS PAGE / STEP HOLD',subtitle:'Bass page automatically selects bass steps and their editor.',model:settle()});
pilot.step(15,false);go('SEQ');pilot.knob(3,-1);
go('MIDI');
examples.push({ title: 'MIDI / FOUR PARTS', subtitle: 'Chords, melody, bass and ARP: one routing page.', model: settle() });
go('THEORY');
examples.push({ title: 'THEORY', subtitle: 'Actual sounding notes, including independent bass.', model: settle() });
go('BASS'); pilot.pad(STOP_PAD, true);
examples.push({ title: 'STOP PAD', subtitle: 'Above SUS4: release all notes and stop the loop.', model: pilot.inspect().model });
pilot.pad(STOP_PAD, false); pilot.selectEdit(3);
examples.push({ title: 'EDIT WITH BORROW LOCK', subtitle: 'The badge marks prepared harmony; EDIT shows the saved pad.', model: settle() });
pilot.selectEdit(0);
pilot.knob(7, -63); pilot.knob(7, 14); pilot.knob(7, -1, { shift: true });
examples.push({ title: 'EDIT / INDEPENDENT BASS', subtitle: 'B.NTE B1; Shift + knob 8 changes octave.', model: settle() });
go('BASS'); pilot.knob(4,1);
pilot.pad(94,true,100,{shift:true}); pilot.pad(94,false);
pilot.pad(CHORD_PADS[3],true); pilot.pad(CHORD_PADS[2],true);
go('PLAY');
examples.push({title:'LIVE BASS / F + Em',subtitle:'Header F/E; grid retains each pad chord.',model:settle()});
go('ARP');pilot.knob(0,1);
examples.push({title:'ARP / EIGHT CONTROLS',subtitle:'Separate clocked part; press Move Play to run.',model:settle()});
go('A.CLOCK');
examples.push({title:'ARP / SYNC CLOCK',subtitle:'SYNC follows Move transport. FREE BPM is disabled.',model:settle()});
pilot.knob(0,1);
examples.push({title:'ARP / FREE CLOCK',subtitle:'Play a chord without Move Play. Own tempo: 30-300 BPM.',model:settle()});
go('ARP');pilot.knob(2,4);
examples.push({title:'ARP / CHORD PULSES',subtitle:'Whole voicing at RATE; RANGE is inactive in this mode.',model:settle()});
go('MIDI');pilot.knob(3,1);pilot.knob(5,2);
go('CHORDS');pilot.knob(7,1);
examples.push({title:'CHORDS / PEDAL',subtitle:'CC64 sustain, separate from melody and bass.',model:settle()});
go('BASS');
examples.push({title:'BASS / PAD VELOCITY',subtitle:'VEL PAD follows attack. Independent SUST on knob 6.',model:settle()});
go('MELODY');
examples.push({title:'MELODY / OWN SUSTAIN',subtitle:'Independent OFF, HOLD or PEDAL on knob 5.',model:settle()});

const esc = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function screenSvg(model) {
  const elements = [];
  const fill = (x,y,w,h,color=1) => elements.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color ? '#f4f5e9' : '#0a0e10'}"/>`);
  const draw = {
    clear() { fill(0,0,128,64,0); }, fill,
    line(x1,y1,x2,y2,color=1) { fill(x1,y1,x2-x1+1,y2-y1+1,color); },
    rect(x,y,w,h,color=1) { fill(x,y,w,1,color); fill(x,y+h-1,w,1,color); fill(x,y,1,h,color); fill(x+w-1,y,1,h,color); },
    text(x,y,text,color=1) {
      for (let index=0; index<text.length; index+=1) {
        const glyph = glyphs[text[index]] || glyphs['?'];
        for (let row=0; row<7; row+=1) for (let column=0; column<5; column+=1) {
          if (glyph[row] & (1 << (4-column))) fill(x+index*6+column,y+row,1,1,color);
        }
      }
    },
  };
  renderScreen(draw,model);
  return elements.join('');
}

const publicPreview=process.env.OKTONIK_PREVIEW_PUBLIC==='1';
if(publicPreview){
  examples.length=0;
  const live=createProjectPilot({profile:'public',write:()=>true,read:path=>path===ACTIVE_SET_PATH?'preview-set\nDemo':null,now:()=>0});
  live.init();
  const capture=(title,subtitle)=>{for(let i=0;i<70;i++)live.tick();examples.push({title,subtitle,model:live.inspect().model});};
  for(const name of ['PLAY','CHORD','MELODY','BASS','MIDI']){capture(name,'OKTONIK Public / live performance');live.changePage(1);}
  live.pad(CHORD_PADS[0],true,100,{shift:true});capture('EDIT CHORD','Shift + chord pad to open or close.');
  if(process.env.OKTONIK_PREVIEW_MAP==='1'){
    examples.length=0;live.selectEdit(-1);
    live.changePage(-live.inspect().page);
    capture('SHORT NAMES','Short chord names retain the centred single line.');
    live.knob(2,6);capture('13TH EXTENSIONS','Long names use both lines at the original font size.');
    live.knob(0,1);capture('ACCIDENTAL ROOTS','Root and extension split where they fit.');
    live.pad(CHORD_PADS[0],true);capture('SELECTED CHORD','Both lines remain inside the selected-pad highlight.');
  }
}
const frames = examples.map((example,index) => {
  const x = 38+(index%2)*506;
  const y = 126+Math.floor(index/2)*302;
  return `<g transform="translate(${x},${y})"><text y="0" class="label">${esc(example.title)}</text><text y="24" class="caption">${esc(example.subtitle)}</text><rect x="-10" y="36" width="468" height="244" rx="12" fill="#222b2e"/><g transform="translate(0,46) scale(3.5)" shape-rendering="crispEdges">${screenSvg(example.model)}</g></g>`;
}).join('');
const height = 146 + Math.ceil(examples.length / 2) * 302;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1040" height="${height}" viewBox="0 0 1040 ${height}"><style>text{font-family:Arial,sans-serif}.label{font-size:13px;font-weight:700;fill:#a8d6c3;letter-spacing:1.2px}.caption{font-size:14px;fill:#a4afaf}</style><rect width="1040" height="${height}" fill="#12191b"/><text x="38" y="49" fill="#eef3ee" font-size="30" font-weight="700">OKTONIK</text><text x="39" y="77" class="caption">${PRODUCT_VERSION} / 128 × 64 display / full-size pixel layout enlarged 3.5×</text>${frames}</svg>\n`;
const destination = resolve(process.argv[2] || fileURLToPath(new URL('../docs/display-preview.svg', import.meta.url)));
await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, svg);
console.log(destination);
