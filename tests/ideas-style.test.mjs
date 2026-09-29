import test from 'node:test';
import assert from 'node:assert/strict';
import {generateIdeas,ideaStyle,ideaRelationship,ideaRelationshipScore} from '../src/ideas.mjs';
import {buildChordBank,applyModifiers} from '../src/theory.mjs';
import {createPilot,PAGES} from '../src/pilot.mjs';
import {encodeDocument,decodeDocument} from '../src/settings.mjs';

test('style ranks harmonic proximity, not just scale membership',()=>{
  const source={rootOffset:0,intervals:[0,4,7]};
  const near=ideaRelationship(source,{rootOffset:9,intervals:[0,3,7]});
  const far=ideaRelationship(source,{rootOffset:6,intervals:[0,4,7]});
  assert.ok(ideaRelationshipScore(near,'IN')>ideaRelationshipScore(far,'IN'));
  assert.ok(ideaRelationshipScore(near,'OUT')<ideaRelationshipScore(far,'OUT'));
  const bank=buildChordBank();
  const safe=generateIdeas(bank[0],{}, {color:'IN'}).filter(i=>!i.outside).map(i=>i.chord.rootOffset);
  const wild=generateIdeas(bank[0],{}, {color:'OUT'}).filter(i=>!i.outside).map(i=>i.chord.rootOffset);
  assert.notDeepEqual(safe.slice(0,2),wild);
});
test('SAFE keeps simple triads and sevenths even when global extension is 13; COLOR excludes 11/13',()=>{
  const settings={extension:6}, bank=buildChordBank(settings);
  for(const color of ['IN','MIX']) {
    const rows=generateIdeas(bank[0],settings,{color,bank});assert.equal(rows.length,8);
    for(const {chord} of rows) {
      assert.ok(chord.intervals.length<=(color==='IN'?4:5));
      assert.ok(Math.max(...chord.intervals)<=(color==='IN'?11:14));
    }
    if(color==='IN')assert.ok(rows.slice(0,3).every(r=>r.chord.intervals.length===3));
  }
});
test('explicit dominant targets remain first and explained in all three styles',()=>{
  const bank=buildChordBank();
  for(const color of ['IN','MIX','OUT']) {
    const source=applyModifiers(bank[1],{dom:true});
    const first=generateIdeas(source,{}, {color})[0];
    assert.equal(first.chord.rootOffset,2);assert.match(first.reason,/RESOLVE -> Dm/);
  }
});
test('old project style IDs survive reload and show new labels without editing saved chords',()=>{
  for(const id of ['IN','MIX','OUT']) {
    let text=encodeDocument({ideasColor:id},buildChordBank().slice(0,2));
    const previous=decodeDocument(JSON.parse(text)).progression;
    const p=createPilot({read:()=>text,write:(path,value)=>{text=value;return true;}});p.init();
    p.changePage(PAGES.indexOf('IDEAS'));
    assert.equal(p.inspect().model.cells[1].value,ideaStyle(id));
    assert.equal(p.inspect().model.cells[1].label,'STYLE');
    p.knob(1,1);const selected=p.inspect().settings.ideasColor;p.unload();
    assert.equal(decodeDocument(JSON.parse(text)).settings.ideasColor,selected);
    assert.deepEqual(decodeDocument(JSON.parse(text)).progression,previous);
  }
});
