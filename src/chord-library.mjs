// Shared pitch recipes for profiles and explicit pad extensions. No hardware/state.
export const CHORD_RECIPES=Object.freeze(Object.fromEntries(Object.entries({
  MAJ:[0,4,7],MIN:[0,3,7],DIM:[0,3,6],M7:[0,4,7,11],m7:[0,3,7,10],D7:[0,4,7,10],
  M9:[0,4,7,11,14],m9:[0,3,7,10,14],D9:[0,4,7,10,14],
  m11:[0,3,7,10,14,17],D13:[0,4,7,10,14,21],
  '7b9':[0,4,7,10,13],'7#9':[0,4,7,10,15],'M#11':[0,4,7,11,14,18],
  '6/9':[0,4,7,9,14],m69:[0,3,7,9,14],
  SUS2:[0,2,7],SUS4:[0,5,7],'7sus':[0,5,7,10],'9sus':[0,5,7,10,14],
  '5':[0,7],o7:[0,3,6,9],h7:[0,3,6,10],
  '7b5':[0,4,6,10],'7#11':[0,4,7,10,18],'7b13':[0,4,7,10,20],
}).map(([id,notes])=>[id,Object.freeze(notes)])));

export const EXTRA_PAD_EXTENSIONS=Object.freeze(['6/9','7b5','7b9','7#9','7#11','7b13','MAJ9#11','13(no11)','5']);
export function libraryPadIntervals(type,extension){
  const extra={'6/9':'6/9','7b5':'7b5','7b9':'7b9','7#9':'7#9','7#11':'7#11','7b13':'7b13','MAJ9#11':'M#11','13(no11)':'D13','5':'5'};
  const canonical={MAJ:{TRIAD:'MAJ','7':'D7',MAJ7:'M7','9':'D9',MAJ9:'M9'},
    MIN:{TRIAD:'MIN','7':'m7','9':'m9','11':'m11'},DIM:{TRIAD:'DIM','7':'h7'},
    SUS2:{TRIAD:'SUS2'},SUS4:{TRIAD:'SUS4','7':'7sus','9':'9sus'}};
  if(extension==='DIM7')return [...CHORD_RECIPES.o7];
  if(canonical[type]?.[extension])return [...CHORD_RECIPES[canonical[type][extension]]];
  if(!extra[extension])return null;
  let notes=[...CHORD_RECIPES[extra[extension]]];
  if(extension==='5')return notes;
  const thirds={MIN:3,DIM:3,SUS2:2,SUS4:5};
  if(thirds[type])notes=notes.map(n=>n===4?thirds[type]:n);
  if(type==='DIM')notes=notes.map(n=>n===7?6:n);
  if(type==='AUG')notes=notes.map(n=>n===7?8:n);
  return [...new Set(notes)].sort((a,b)=>a-b);
}
