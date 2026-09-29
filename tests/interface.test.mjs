import test from 'node:test';
import assert from 'node:assert/strict';
import { createPilot, PAGES, STOP_PAD, CHORD_PADS, MELODY_PADS } from '../src/pilot.mjs';
import { STATE_PATH, encodeDocument } from '../src/settings.mjs';
import { renderScreen } from '../src/display.mjs';

function setup(settings = {}) {
  const commands = [], leds = [];
  const pilot = createPilot({ read: path => path === STATE_PATH ? encodeDocument(settings, []) : null,
    write: () => true, send: c => commands.push(c), leds: values => leds.push(values) });
  pilot.init();
  pilot.changePage(PAGES.indexOf('CHORDS'));
  const page = name => pilot.changePage(PAGES.indexOf(name) - pilot.inspect().page);
  const turn = (id, delta) => {
    const index = pilot.inspect().model.cells.findIndex(c => c.id === id);
    assert.ok(index >= 0, `${id} must be visible`); pilot.knob(index, delta);
  };
  return { pilot, commands, leds, page, turn };
}

test('each normal-page setting has a single home; unused knobs are inert', () => {
  const { pilot, page, commands } = setup();
  const ids = [];
  for (const name of PAGES) {
    page(name);
    const cells = pilot.inspect().model.cells;
    if (!['PLAY','THEORY'].includes(name)) assert.equal(cells.length, 8);
    cells.forEach((cell, i) => {
      assert.ok(cell.label.length <= 5, `${cell.label} must fit its knob cell`);
      if (cell.id) ids.push(cell.id);
      else {
        const before = pilot.inspect().settings, sent = commands.length;
        pilot.knob(i, 1); pilot.focus(i);
        assert.deepEqual(pilot.inspect().settings, before);
        assert.equal(commands.length, sent);
      }
    });
  }
  assert.equal(ids.length, new Set(ids).size);
  for (const id of ['key', 'scaleId', 'extension', 'voiceLead', 'melodyFollow', 'chordSustain', 'bassEnabled', 'arpRoute','arpChannel','arpClock','arpBpm'])
    assert.ok(ids.includes(id));
});

test('one EDIT page holds eight controls, ignores page navigation and exits with Shift + same pad', () => {
  const { pilot, turn } = setup();
  pilot.pad(69, true, 100, { shift: true });
  const global = pilot.inspect().settings;
  turn('extensionName', 6); turn('padInversion', 2); turn('spread', 1);
  assert.deepEqual(pilot.inspect().settings, global);
  assert.equal(pilot.inspect().overrides[1].extensionName, '9');
  assert.equal(pilot.inspect().overrides[1].inversion, 1);
  assert.equal(pilot.inspect().overrides[1].lockInversion, true);
  turn('padInversion', -2);
  assert.equal(pilot.inspect().bank[1].lockInversion, false);
  pilot.changePage(1);
  assert.equal(pilot.inspect().editIndex, 1);
  assert.equal(pilot.inspect().model.pageCount, 1);
  assert.deepEqual(pilot.inspect().model.cells.map(c => c.id), ['rootOffset', 'chordType', 'extensionName', 'padInversion', 'spread', 'keep', 'reset', 'bassMode']);
  const before = pilot.inspect().overrides;
  pilot.focus(7); pilot.changePage(-1);
  assert.deepEqual(pilot.inspect().overrides, before);
  assert.equal(pilot.inspect().editIndex, 1);
  pilot.pad(69, true, 100, { shift: true });
  assert.equal(pilot.inspect().model.pageName, 'CHORDS');
  turn('extension', 1);
  assert.equal(pilot.inspect().settings.extension, 3);
  assert.equal(pilot.inspect().overrides[1].extensionName, '9');
});

test('KEEP cannot silently save a different pad than the edit screen shows', () => {
  const { pilot, turn } = setup();
  pilot.pad(84, true); pilot.pad(69, true); pilot.pad(84, false);
  pilot.selectEdit(2); turn('keep', 1);
  assert.ok(pilot.inspect().overrides.every(x => x === null));
  pilot.selectEdit(1); turn('keep', 1);
  assert.equal(pilot.inspect().overrides[1].customChord.rootOffset, 9);
});

test('mode-specific controls explain their availability; HOLD prevents ineffective gate edits', () => {
  const { pilot, turn, page } = setup({ autoSustain: true });
  page('MELODY'); turn('melodyAdapt', 1);
  assert.equal(pilot.inspect().settings.melodyAdapt, false);
  assert.match(pilot.inspect().model.detail, /SCALE/);
  turn('melodyMode', 1); turn('melodyAdapt', 1);
  assert.equal(pilot.inspect().settings.melodyAdapt, true);
  turn('melodyFollow', -1);
  assert.equal(pilot.inspect().settings.melodyFollow, 'nearest');
  page('SEQ'); const gate = pilot.inspect().settings.gate;
  const text = [];
  renderScreen({ clear() {}, line() {}, fill() {}, rect() {}, text: (_x, _y, value) => text.push(value) }, pilot.inspect().model);
  assert.ok(text.includes('HOLD'));
  turn('gate', -1); assert.equal(pilot.inspect().settings.gate, gate);
  page('CHORDS'); turn('chordSustain', -1);
  page('SEQ'); turn('gate', -1); assert.equal(pilot.inspect().settings.gate, gate - 5);
});

test('STOP pad silences all parts from every page, cancels the loop and permits a clean next attack', () => {
  assert.equal(STOP_PAD, 95);
  for (const name of [...PAGES, 'EDIT']) {
    const { pilot, page, commands, leds } = setup({ autoSustain: true, bassEnabled: true });
    pilot.pad(68, true); pilot.step(0, true, { shift: true }); pilot.pad(68, false);
    for (const pad of MELODY_PADS) pilot.pad(pad, true);
    pilot.arm(true); pilot.pad(84, true);
    if (name === 'EDIT') pilot.selectEdit(1); else page(name);
    const saved = pilot.inspect().progression;
    pilot.pad(STOP_PAD, true); pilot.repaint();
    assert.equal(pilot.inspect().voices.length, 0);
    assert.equal(pilot.inspect().armed, false);
    assert.equal(pilot.inspect().settings.autoSustain, true);
    assert.deepEqual(pilot.inspect().progression, saved);
    assert.equal(pilot.inspect().modifiers.dom, false);
    assert.equal(commands.at(-1).op, 'kill');
    assert.equal(leds.at(-1).find(l => l.note === STOP_PAD && !l.button).role, 'stopHeld');
    const count = commands.length;
    pilot.pad(STOP_PAD, true); pilot.pad(STOP_PAD, false);
    for (const pad of [...MELODY_PADS, ...CHORD_PADS]) pilot.pad(pad, false);
    assert.equal(commands.length, count);
    pilot.selectEdit(-1); page('CHORDS'); pilot.knob(0, 1); // still-physically-held pads cannot be resurrected
    assert.equal(pilot.inspect().voices.length, 0);
    pilot.pad(68, true); assert.ok(pilot.inspect().voices.length > 0);
  }
});

test('MIDI last pair controls ARP without sending test notes', () => {
  const { pilot, page, commands } = setup({ previewRoute: 'move', channel: 1,
    melodyRoute: 'external', melodyChannel: 2, bassRoute: 'schwung', bassChannel: 3 });
  page('MIDI');
  assert.equal(pilot.inspect().model.cells[7].id,'arpChannel');
  const before=commands.length;
  pilot.knob(7,1); pilot.focus(7); pilot.knob(7,-1);
  assert.ok(commands.length>before);
  assert.ok(!commands.slice(before).some(c=>c.op==='arptest'||c.op==='on'));
});

test('legacy sequence route survives load and save, and can explicitly rejoin chord output',()=>{
  const {pilot,page,turn,commands}=setup({route:'external',previewRoute:'move'});
  assert.equal(pilot.inspect().settings.route,'external');
  page('SEQ');assert.equal(pilot.inspect().model.cells[5].id,'quantize');
  page('MIDI');turn('previewRoute',1);turn('previewRoute',-1);
  assert.equal(pilot.inspect().settings.route,'move');
  page('SEQ');assert.equal(pilot.inspect().model.cells[5].id,'quantize');
  assert.equal(commands.findLast(c=>c.op==='config').route,0);
});
