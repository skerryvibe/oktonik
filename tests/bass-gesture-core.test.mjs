import test from 'node:test';
import assert from 'node:assert/strict';
import {createBassGesture} from '../src/bass-gesture.mjs';
test('core uses logical IDs and press-only choices, independent of Move or MIDI',()=>{
 const g=createBassGesture();
 assert.deepEqual(g.press('C'),{type:'start',anchor:'C',input:'C'});
 assert.equal(g.press('E').type,'bass');assert.equal(g.release('C').type,'wait');
 assert.deepEqual(g.press('C'),{type:'bass',anchor:'C',input:'C'});
 assert.equal(g.inspect().lastPressed,'C');assert.equal(g.release('E').type,'wait');
 assert.equal(g.inspect().lastPressed,'C');assert.deepEqual(g.release('C'),{type:'end',anchor:'C'});
 assert.equal(g.release('C').type,'none');assert.equal(g.press('E').type,'start');
 g.reset();assert.equal(g.inspect().active,false);
});
test('all 40320 release orders of eight logical inputs end once and never select harmony',()=>{
 function* orders(xs) {if(!xs.length){yield [];return;}for(let i=0;i<xs.length;i++)for(const tail of orders(xs.filter((_,j)=>i!==j)))yield [xs[i],...tail];}
 for(const order of orders([0,1,2,3,4,5,6,7])) {
   const g=createBassGesture();for(let i=0;i<8;i++)g.press(i);
   order.forEach((id,i)=>assert.equal(g.release(id).type,i===7?'end':'wait'));
   assert.equal(g.inspect().active,false);assert.equal(g.inspect().held.length,0);
 }
});
