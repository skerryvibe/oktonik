import test from 'node:test';
import assert from 'node:assert/strict';
import { renderScreen, chordMapLines } from '../src/display.mjs';

test('chord map wraps long names at musical boundaries without dropping extensions',()=>{
  for(const [name,lines] of [
    ['C',['C']],['Cmaj7',['Cmaj7']],['Dbmaj7',['Db','maj7']],
    ['Cmaj13',['C','maj13']],['Bbmadd9',['Bbm','add9']],
    ['Cmaj7/E',['Cmaj7','/E']],['Dbmaj13/Ab',['Dbmaj','13/Ab']],
    ['Fmaj13#11',['Fmaj','13#11']],['A(1,9,b3,5,b7)',['A','(1,9~']],
    ['C♯maj7',['C#','maj7']],['Cmaj13(add9)/G',['Cmaj1','3(ad~']],
  ])assert.deepEqual(chordMapLines(name),lines,name);
});

test('two-line map names stay inside cells and selected background on PLAY and IDEAS',()=>{
  const labels=['Dbmaj7','Cmaj13','Bbmadd9','Dbmaj13/Ab','Csus4/E','Cm7','C','Cmaj13(add9)/G'];
  for(const pageName of ['PLAY','IDEAS'])for(let selected=0;selected<8;selected++){
    const calls=record({pageName,chordMap:{items:labels.map(label=>({label})),selected}});
    const texts=calls.filter(c=>c.type==='text'&&c.y>=10&&c.y<53);
    for(const c of texts){
      assert.ok(c.w<=30);assert.ok(c.x+c.w<=Math.ceil(c.x/32)*32);
      assert.ok(c.y+c.h<=(c.y<32?30:52));
    }
    const box=calls.find(c=>c.type==='fill'&&c.w===30&&c.h===18);
    for(const c of texts.filter(c=>c.color===0)){
      assert.ok(c.x>=box.x&&c.x+c.w<=box.x+box.w);
      assert.ok(c.y>=box.y&&c.y+c.h<=box.y+box.h);
    }
  }
});

function record(model) {
  const calls = [];
  const draw = {
    clear() { calls.push({ type: 'clear' }); },
    text(x, y, value, color) { calls.push({ type: 'text', x, y, w: value.length * 6, h: 8, value, color }); },
    line(x, y, endX, endY, color) { calls.push({ type: 'line', x, y, w: endX - x + 1, h: endY - y + 1, color }); },
    rect(x, y, w, h, color) { calls.push({ type: 'rect', x, y, w, h, color }); },
    fill(x, y, w, h, color) { calls.push({ type: 'fill', x, y, w, h, color }); },
  };
  renderScreen(draw, model);
  for (const call of calls.filter(item => item.type !== 'clear')) {
    assert.ok(call.x >= 0 && call.y >= 0 && call.w >= 0 && call.h >= 0, JSON.stringify(call));
    assert.ok(call.x + call.w <= 128 && call.y + call.h <= 64, JSON.stringify(call));
  }
  return calls;
}

const harmony = {
  pageName: 'CHORDS', pageIndex: 0, pageCount: 3, chordLabel: 'Cmaj9', degreeLabel: 'I', transport: 'OFF',
  cells: ['KEY', 'SCAL', 'EXT', 'COLR', 'INV', 'SPRD', 'OCT', 'STRM'].map((label, index) => ({ label, value: String(index + 10) })),
};

test('all eight labels and values are visible without knob numbers', () => {
  const calls = record(harmony);
  for (let index = 0; index < 8; index += 1) {
    assert.ok(calls.some(call => call.type === 'text' && call.value === harmony.cells[index].label));
    assert.ok(!calls.some(call => call.type === 'text' && call.value === String(index + 1) + harmony.cells[index].label));
    assert.ok(calls.some(call => call.type === 'text' && call.value === harmony.cells[index].value));
  }
  assert.equal(calls.filter(call => call.type === 'text' && call.y === 22).length, 4);
  assert.equal(calls.filter(call => call.type === 'text' && call.y === 44).length, 4);
});

test('focused knob stays legible with its full name and value in the footer', () => {
  const cells = harmony.cells.map(cell => ({ ...cell }));
  cells[4] = { label: 'INV', value: '+1', fullLabel: 'Inversion', fullValue: '+1' };
  const calls = record({ ...harmony, cells, focused: 4 });
  assert.ok(calls.some(call => call.type === 'text' && call.value === 'INV' && call.color === 0));
  assert.ok(calls.some(call => call.type === 'text' && call.value === 'Inversion: +1' && call.y === 55));
});

test('six or seven page indicators fit between the page name and chord name', () => {
  for (const pageCount of [6, 7]) for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    const calls = record({ ...harmony, pageCount, pageIndex });
    const markers = calls.filter(c => (c.type === 'fill' || c.type === 'line') && c.x >= 45 && c.x < 65 && c.y < 9);
    assert.equal(markers.length, pageCount);
    assert.equal(markers.filter(c => c.h === 5).length, 1);
    assert.equal(markers.find(c => c.h === 5).x, 45 + pageIndex * (pageCount === 7 ? 2 : 3));
    assert.ok(markers.every(c => c.x + c.w <= 63));
  }
});

test('long values and musical unicode fit the fixed font without crossing cells', () => {
  const calls = record({ ...harmony, pageName: 'HARMONIC SETTINGS', chordLabel: 'C♯maj13(add9)/G♯', detail: 'A very long explanatory paragraph', cells: Array.from({ length: 8 }, () => ({ label: 'Scale choice', value: 'Mixolydian ♭6' })) });
  for (const call of calls.filter(call => call.type === 'text' && call.y >= 10 && call.y < 53)) {
    assert.ok(call.w <= 30);
    assert.ok(call.x + call.w <= Math.ceil(call.x / 32) * 32);
  }
  assert.ok(calls.some(call => call.type === 'text' && call.value.endsWith('~')));
});

test('theory view displays chord tones and a bounded two octave keyboard', () => {
  const calls = record({ pageName: 'THEORY', pageIndex: 2, pageCount: 3, chordLabel: 'Cmaj7/E', theory: { root: 60, notes: [64, 67, 71, 72], degree: 'I', source: 'Diatonic' } });
  assert.ok(calls.some(call => call.type === 'text' && call.value === 'E G B C'));
  for (const marker of ['R', 'B']) assert.ok(calls.some(call => call.type === 'text' && call.value === marker));
  assert.equal(calls.filter(call => call.type === 'rect' && call.h === 27).length, 14);
});

test('empty models and held-note status render safely', () => {
  record();
  const calls = record({ ...harmony, transport: 'WAIT' });
  assert.ok(calls.some(call => call.type === 'text' && call.value === 'I | WAIT'));
  record({ pageName: 'THEORY', theory: { notes: [] } });
});

test('BORROW lock badge is persistent without overlapping tabs or chord names, and single EDIT has no tabs', () => {
  for (const pageCount of [1, 6, 7, 9]) {
    const calls = record({ ...harmony, pageCount, borrowLocked: true });
    const badge = calls.find(c => c.type === 'text' && c.value === 'B' && c.y === 0);
    assert.equal(badge.color, 0);
    assert.ok(badge.x >= 45 && badge.x + badge.w <= 53);
    const tabs = calls.filter(c => ['fill','line'].includes(c.type) && c.x >= 53 && c.x < 65 && c.y < 9);
    assert.equal(tabs.length, pageCount === 1 ? 0 : pageCount);
    assert.ok(tabs.every(c => c.x + c.w <= 64));
  }
  const edit = record({ ...harmony, pageName: 'EDIT 5', pageCount: 1 });
  assert.ok(!edit.some(c => ['fill','line'].includes(c.type) && c.x >= 45 && c.x < 65 && c.y < 9));
});

test('IDEAS display matches physical A5-A8 above A1-A4, highlights the played pad and keeps knob hints readable', () => {
  const labels=['Am','F','Dm','G','A7','D7','Fm','Ab'];
  const calls=record({pageName:'IDEAS',pageCount:7,pageIndex:1,chordLabel:'A7',
    ideaView:{items:labels.map(label=>({label})),selected:4},detail:'V -> Dm'});
  assert.deepEqual(calls.filter(c=>c.type==='text' && c.y===18).map(c=>c.value),labels.slice(4));
  assert.deepEqual(calls.filter(c=>c.type==='text' && c.y===40).map(c=>c.value),labels.slice(0,4));
  assert.ok(calls.some(c=>c.type==='text' && c.value==='A7' && c.y===18 && c.color===0));
  record({pageName:'IDEAS',pageCount:7,borrowLocked:true,ideaView:{items:labels.map(label=>({label:label+'maj13'})),selected:0},detail:'Ideas color: MIX'});
});
