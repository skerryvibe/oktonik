import test from 'node:test';
import assert from 'node:assert/strict';
import {smartBassChoices} from '../src/smart-bass.mjs';
import {buildChordBank,SCALES,EXTENSIONS} from '../src/theory.mjs';
const chord=()=>buildChordBank()[0];
test('smart bass offers actual chord tones independently of chord voicing and explicit bass',()=>{
  const c={...chord(),inversion:-2,spread:2,bassMode:'note',bassOffset:11};
  const before=structuredClone(c);
  assert.deepEqual(smartBassChoices(c,{bassOctave:-1}).map(c=>c.note),[36,40,43]);
  assert.deepEqual(c,before);
  assert.deepEqual(smartBassChoices({...c,intervals:[0,5,7]}).map(c=>c.interval),[0,5,7]);
  assert.deepEqual(smartBassChoices({...c,intervals:[0,3,7,10,14]}).map(c=>c.interval),[0,2,3,7,10]);
});
test('smart bass keeps stable choice order while finding close pitches in an explicit register',()=>{
  const result=smartBassChoices(chord(),{bassOctave:-1},{previous:47,min:36,max:60});
  assert.deepEqual(result.map(c=>c.note),[48,52,43]);
  assert.deepEqual(result.map(c=>c.movement),[1,5,-4]);
  assert.equal(smartBassChoices(chord(),{},{previous:42})[0].note,36);
  assert.deepEqual(smartBassChoices(chord(),{},{min:60,max:60}).map(c=>c.note),[60]);
  assert.deepEqual(smartBassChoices(chord(),{},{min:70,max:30}),[]);
  assert.deepEqual(smartBassChoices(null),[]);
});
test('smart bass candidates stay in the actual harmony across keys, scales, extensions and MIDI bounds',()=>{
  for(const scale of SCALES)for(let key=0;key<12;key++)for(let extension=0;extension<EXTENSIONS.length;extension++) {
    const c=buildChordBank({key,scaleId:scale.id,extension})[0];
    for(const previous of [0,48,127]) {
      const choices=smartBassChoices(c,{key,bassOctave:-1},{previous});
      assert.ok(choices.length);
      for(const option of choices) {
        assert.ok(option.note>=0&&option.note<=127);
        assert.equal(option.note%12,(key+c.rootOffset+option.interval)%12);
        assert.ok(c.intervals.some(n=>n%12===option.interval));
      }
    }
  }
});
