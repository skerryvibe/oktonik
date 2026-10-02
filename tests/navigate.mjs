import {PAGES,EXTRA_PAGES} from '../src/pilot.mjs';
export function navigate(pilot,name) {
  pilot.shift(false);
  const parent=Object.keys(EXTRA_PAGES).find(p=>EXTRA_PAGES[p]===name);
  const index=PAGES.indexOf(parent||name);
  if(index<0)throw new Error('Unknown page '+name);
  pilot.changePage(index-pilot.inspect().page);
  if(parent)pilot.shift(true);
}
