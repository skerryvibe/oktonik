import test from 'node:test';
import assert from 'node:assert/strict';
import {SCALES,buildPadBank,chordNotes,chordName} from '../src/theory.mjs';
import {EXTENSION_PROFILES} from '../src/harmony-controls.mjs';
import {normalizeSettings} from '../src/settings.mjs';

// Profiles colour diatonic chords. Notes outside the key are allowed only where
// they are a deliberate idiom: harmonic-minor V, secondary dominants, leading-tone
// diminished sevenths, blues dominants, and jazz minor 6/9.
const DELIBERATE=new Set(['CLAS C Bdim7','CLAS Am E7b9','JAZZ Am Am6/9','JAZZ Am E7b9','ALT C G7b9','ALT Am E7b9',
  'BOSSA Am Am6/9','BOSSA Am E7b9','GOSPL C E7','GOSPL C Bdim7','GOSPL Am C7','BLUES C C7','BLUES C F7','BLUES Am E7']);
test('extension profiles stay in the key except for deliberate idioms',()=>{
  const outside=[];
  for(const p of EXTENSION_PROFILES){if(['global','custom'].includes(p.id))continue;
    for(const [scaleId,key,name] of [['major',0,'C'],['natural_minor',9,'Am']]){
      const s=normalizeSettings({key,scaleId,extensionProfile:p.id,extensionProfileRevision:3});
      const pcs=new Set(SCALES.find(x=>x.id===scaleId).intervals.map(i=>(i+key)%12));
      for(const chord of buildPadBank(s,Array(8).fill(null)).slice(0,7)){
        const label=`${p.label} ${name} ${chordName(chord,s)}`;
        if(chordNotes(chord,{...s,voiceLead:false}).some(n=>!pcs.has(n%12))&&!DELIBERATE.has(label))outside.push(label);
      }
    }
  }
  assert.deepEqual(outside,[]);
});
