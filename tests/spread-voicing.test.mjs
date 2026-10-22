import test from 'node:test';
import assert from 'node:assert/strict';
import {buildChordBank,chordNotes,voiceLeadNotes,EXTENSIONS,SCALES} from '../src/theory.mjs';

const pcs=notes=>[...new Set(notes.map(n=>n%12))].sort((a,b)=>a-b);
const PROGRESSION=[0,5,3,4,0,5,1,4];

test('WIDE keeps the bass alone and stays near two octaves for every extension',()=>{
  for(const scale of SCALES)for(let extension=0;extension<EXTENSIONS.length;extension++)for(const key of [0,7]){
    for(const chord of buildChordBank({scaleId:scale.id,extension,key,spread:2})){
      const notes=chordNotes(chord,{key}),close=chordNotes({...chord,spread:0},{key});
      // Pentatonic stacks double pitch classes; those keep their octaves.
      if(pcs(close).length===close.length)assert.ok(notes.at(-1)-notes[0]<=33,`${scale.id} ${EXTENSIONS[extension]}: ${notes}`);
      assert.ok(notes[1]-notes[0]>=10,`bass is separated: ${notes}`);
      assert.deepEqual(pcs(notes),pcs(close));assert.equal(notes.length,close.length);
    }
  }
  assert.deepEqual(chordNotes(buildChordBank({extension:1,spread:2})[0]),[48,59,64,67]); // C B E G
});

test('close LEAD puts only root, third or fifth in the bass',()=>{
  for(const extension of [1,2,5,6])for(const leadRegister of ['center','free']){
    const settings={extension,voiceLead:true,leadRegister},bank=buildChordBank(settings);let previous=[];
    for(let cycle=0;cycle<3;cycle++)for(const i of PROGRESSION){
      const c=bank[i],notes=voiceLeadNotes(c,settings,previous);
      const bass=((notes[0]-48-c.rootOffset)%12+12)%12;
      assert.ok(c.intervals.slice(0,3).map(n=>n%12).includes(bass),`${EXTENSIONS[extension]} bass ${bass}: ${notes}`);
      previous=notes;
    }
  }
});

test('OPEN/WIDE LEAD keeps the root in a fixed bass window and moves the top line smoothly',()=>{
  for(const spread of [1,2])for(const extension of [0,1,2,5])for(const leadRegister of ['center','free'])for(const octave of [-1,0,1]){
    const settings={extension,spread,voiceLead:true,leadRegister,octave},bank=buildChordBank(settings);
    const anchor=48+octave*12;let previous=[],first=null,top=0;
    for(let cycle=0;cycle<4;cycle++){
      const cycleNotes=[];
      for(const i of PROGRESSION){
        const c=bank[i],notes=voiceLeadNotes(c,settings,previous);
        assert.equal(((notes[0]-c.rootOffset)%12+12)%12,0,`root bass: ${notes}`);
        assert.ok(notes[0]>=anchor-5&&notes[0]<=anchor+6,`bass window: ${notes}`);
        assert.deepEqual(pcs(notes),pcs(chordNotes(c,settings)));
        assert.ok(notes.at(-1)-notes[0]<=40,`span: ${notes}`);
        if(previous.length)top=Math.max(top,Math.abs(notes.at(-1)-previous.at(-1)));
        cycleNotes.push(notes);previous=notes;
      }
      if(leadRegister==='center'){if(cycle===1)first=cycleNotes;if(cycle>1)assert.deepEqual(cycleNotes,first);}
    }
    assert.ok(top<=9,`${spread}/${extension}/${leadRegister}: top voice leaps ${top}`);
  }
});

test('CNTR with OPEN/WIDE does not move all voices in parallel with the bass',()=>{
  for(const spread of [1,2]){
    const settings={spread,voiceLead:true,leadRegister:'center'},bank=buildChordBank(settings);
    const c=voiceLeadNotes(bank[0],settings,[]),g=voiceLeadNotes(bank[4],settings,c);
    assert.notDeepEqual(g.slice(1).map(n=>n-g[0]),c.slice(1).map(n=>n-c[0]));
  }
});
