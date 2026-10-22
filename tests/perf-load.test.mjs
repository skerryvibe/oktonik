import test from 'node:test';
import assert from 'node:assert/strict';
import { SCALES, EXTENSIONS, buildPadChord, buildPadBank } from '../src/theory.mjs';
import { createPilot, PAGES } from '../src/pilot.mjs';

test('shared pad bank equals building every pad separately', () => {
  const overrides = [null, { extension: 2 }, null, { chordType: 'MIN', extensionName: '7' }, null, { rootOffset: 3 }, null, { inversion: -2, spread: 2 }];
  for (const scale of SCALES) for (let extension = 0; extension < EXTENSIONS.length; extension++)
    for (const extensionProfile of ['global', 'soul']) {
      const input = { scaleId: scale.id, key: 2, extension, extensionProfile, inversion: 1, spread: 1 };
      for (const set of [[], overrides])
        assert.deepEqual(buildPadBank(input, set), Array.from({ length: 8 }, (_, i) => buildPadChord(input, i, set[i] || {})));
    }
});

function rig(profile, batch = false) {
  const sent = [], batches = [];
  const io = { profile, read: () => null, write: () => true, send: c => { sent.push(c); return true; } };
  if (batch) io.sendBatch = list => { batches.push(list); return true; };
  return { pilot: createPilot(io), sent, batches };
}

for (const profile of ['public', 'lab']) {
  test(`${profile}: unchanged DSP state is not resent`, () => {
    const { pilot, sent } = rig(profile);
    pilot.init(); sent.length = 0;
    pilot.changePage(PAGES.indexOf('CHORDS') - pilot.inspect().page);
    pilot.knob(0, 1); // key changes harmony, not DSP config
    assert.equal(sent.filter(c => ['config', 'melodyconfig', 'arp', 'cliplength'].includes(c.op)).length, 0);
  });
  test(`${profile}: start and resume upload in one batch, nothing sent singly`, () => {
    const { pilot, sent, batches } = rig(profile, true);
    pilot.init();
    assert.equal(sent.length, 0); assert.equal(batches.length, 1);
    assert.deepEqual(batches[0].slice(-1), [{ op: 'arm', enabled: 0 }]);
    assert.ok(batches[0].some(c => c.op === 'config'));
    pilot.resume();
    assert.equal(sent.length, 0); assert.equal(batches.length, 2);
    assert.ok(batches[1].some(c => c.op === 'config'), 'resume re-sends config after parking');
  });
  test(`${profile}: failed batch forgets cached DSP state and resends it`, () => {
    const sent = [];let fail = true;
    const pilot = createPilot({ profile, read: () => null, write: () => true, send: c => { sent.push(c); return true; },
      sendBatch: list => { if (fail) return false; sent.push(...list); return true; } });
    pilot.init(); fail = false; sent.length = 0;
    pilot.resume();
    assert.ok(sent.some(c => c.op === 'config'));
  });
}
