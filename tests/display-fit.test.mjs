import test from 'node:test';
import assert from 'node:assert/strict';
import {createPilot,PAGES} from '../src/pilot.mjs';
import {PUBLIC_PAGES} from '../src/profile.mjs';

// The screen fits 5 characters per cell and 21 per footer; truncation hides meaning.
for(const profile of ['public','lab'])test(`${profile}: cell values fit 5 characters and footers 21`,()=>{
  const p=createPilot({profile});p.init();const problems=new Set();
  const check=where=>{const m=p.inspect().model;
    for(const c of m.cells||[]){const v=String(c.disabled?c.disabledValue??'--':c.value);if(v.length>5)problems.add(`${where} ${c.label}=${v}`);}
    if(m.detail&&m.detail.length>21)problems.add(`${where} footer ${m.detail}`);};
  const sweep=where=>{for(let k=0;k<8;k++)for(const d of [1,-1])for(let n=0;n<12;n++){p.knob(k,d);p.tick();check(where);}};
  for(let t=0;t<3;t++){p.track(t);for(let j=0;j<6;j++){const name=p.inspect().model.pageName;check(name);sweep(name);p.browse(1);}}
  p.back();
  const pages=profile==='public'?PUBLIC_PAGES:PAGES;
  for(const name of pages){p.changePage(pages.indexOf(name)-p.inspect().page);for(let i=0;i<70;i++)p.tick();check(name);p.shift(true);check(name+'+');p.shift(false);}
  for(const step of [2,6,8]){p.shiftStep(step);const name=p.inspect().model.pageName;check(name);sweep(name);p.back();}
  p.menu();check('CLIPS');sweep('CLIPS');
  assert.deepEqual([...problems],[]);
});
