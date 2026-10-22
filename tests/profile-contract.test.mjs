import test from 'node:test';
import assert from 'node:assert/strict';
import {featuresFor,PUBLIC_020_FEATURES} from '../src/profile.mjs';

test('Lab includes every shipping and planned Public capability',()=>{
 const lab=featuresFor('lab');
 for(const feature of [...featuresFor('public'),...PUBLIC_020_FEATURES])assert.ok(lab.includes(feature),feature);
 for(const list of [lab,featuresFor('public'),PUBLIC_020_FEATURES]) {
  assert.equal(new Set(list).size,list.length);
  assert.ok(Object.isFrozen(list));
 }
 assert.throws(()=>featuresFor('typo'));
});
test('0.2.0 contract includes clips but excludes unfinished experiments',()=>{
 for(const name of ['clips','recording','partMute','soloPalettes','targetMelody','extensionProfiles','editableModifiers'])
  assert.ok(PUBLIC_020_FEATURES.includes(name));
 for(const name of ['ideas','capture','smartBass','ensemble','arp'])
  assert.ok(!PUBLIC_020_FEATURES.includes(name));
 assert.deepEqual(featuresFor('public'),PUBLIC_020_FEATURES);
});
