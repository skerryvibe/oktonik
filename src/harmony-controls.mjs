// Portable harmony controls: logical actions and scale-degree recipes, no pad IDs.
import {CHORD_RECIPES} from './chord-library.mjs';
export const MOD_ACTIONS = Object.freeze([
  ['off','OFF'], ['dom','V/'], ['flip','MAJ/MIN'], ['sus2','SUS2'], ['sus4','SUS4'],
  ['ii','II/'], ['sub','SUB'], ['borrow','BORROW'], ['add7','ADD7'],
  ['flat7','b7'], ['maj7','MAJ7'], ['add9','ADD9'],
  ['add6','ADD6'], ['sixNine','6/9'], ['flat9','b9'], ['sharp9','#9'],
  ['sharp11','#11'], ['flat13','b13'], ['dimTo','VIIo/'],
  ['commonDim','CT DIM'], ['backdoor','bVII7/'], ['minorIV','iv7/'],
  ['root','ROOT'], ['shell','SHELL'],
].map(([id,label])=>Object.freeze({id,label})));
export const DEFAULT_MODIFIERS = Object.freeze(['dom','flip','sus2','sus4','ii','sub','borrow']);
export const modifierLabel = id => MOD_ACTIONS.find(a=>a.id===id)?.label || 'OFF';
export function normalizeModifiers(value) {
  return DEFAULT_MODIFIERS.map((fallback,i)=>Array.isArray(value)&&MOD_ACTIONS.some(a=>a.id===value[i])?value[i]:fallback);
}
export function resolveModifiers(actions=[],borrowLocked=false) {
  const last=options=>[...actions].reverse().find(a=>options.includes(a));
  const approach=last(['dom','ii','sub','dimTo','commonDim','backdoor','minorIV']),sus=last(['sus2','sus4']);
  const seventh=last(['add7','flat7','maj7']);
  const ninth=last(['add9','sixNine','flat9','sharp9']);
  return {dom:approach==='dom',flip:actions.includes('flip'),sus:sus==='sus2'?2:sus==='sus4'?4:0,
    ...(approach==='ii'?{ii:true}:{}),...(approach==='sub'?{sub:true}:{}),
    ...(borrowLocked||actions.includes('borrow')?{borrow:true}:{}),
    ...(seventh?{seventh}:{}),...(ninth==='add9'||ninth==='sixNine'?{add9:true}:{}),
    ...(['dimTo','commonDim','backdoor','minorIV'].includes(approach)?{approach}:{}),
    ...(actions.includes('add6')||actions.includes('sixNine')?{add6:true}:{}),
    ...(['flat9','sharp9'].includes(ninth)?{ninth}:{}),
    ...Object.fromEntries(['sharp11','flat13','root','shell'].filter(id=>actions.includes(id)).map(id=>[id,true]))};
}

// Numeric extension IDs belong to theory's diatonic stack families. -1 = global.
// Explicit recipes may change quality as well as colour, without changing KEY,
// scale, routing or voicing controls. Numeric recipes remain scale-derived.
export const PROFILE_RECIPES = CHORD_RECIPES;
export const PROFILE_EXTENSIONS = Object.freeze([-1,0,3,4,1,2,5,6,...Object.keys(PROFILE_RECIPES)]);
// Functional roots stay fixed. These are performance colours, not rules that
// a given tonic extension requires a unique cadence.
export function approachIntervals(mode,target,input={}) {
  const minor=target.intervals.includes(3)&&!target.intervals.includes(4);
  const basic=mode==='ii'?[0,3,minor?6:7,10]:[0,4,7,10];
  if(input.approachMode!=='profile')return basic;
  const id=input.extensionProfile;
  const simple=['global','custom','sevenths','pop','classic'].includes(id);
  if(simple)return basic;
  const altered=id==='alt',ambient=id==='ambient';
  const dense=target.intervals.length>=6||target.intervals.some(n=>n>=17);
  if(mode==='ii')return [...basic,...(dense?[17]:!minor&&!ambient?[14]:[])];
  if(mode==='sub')return [...basic,...(altered||dense?[18]:[14])];
  if(ambient)return [0,5,7,10,...(dense?[14]:[])];
  if(minor)return [...basic,13,...(dense||altered?[20]:[])];
  return [...basic,altered?15:14,...(dense?[21]:[])];
}
const preset=(id,label,degrees,minor=degrees,description='')=>({id,label,degrees,minor,description});
// Twelve distinct styles, ordered from plain to rich, plus GLOBAL and CUSTOM.
// Recipes stay in the key except deliberate idioms (see profile-diatonic test);
// secondary dominants are left to the V/ modifier rather than built in.
export const EXTENSION_PROFILES = Object.freeze([
  {id:'global',label:'GLOBAL',degrees:[-1,-1,-1,-1,-1,-1,-1]},
  preset('pop','POP',[4,0,0,4,'SUS4',4,0],undefined,'Add9 and suspended V'),
  preset('classic','CLAS',[0,1,0,0,'D7',0,'o7'],['MIN','h7','MAJ','MIN','7b9','MAJ','D7'],'Functional triads and sevenths'),
  preset('sevenths','7THS',[1,1,1,1,1,1,1],undefined,'Diatonic sevenths'),
  preset('lofi','LOFI',['6/9','m7','MIN','M9','7sus','m7','h7'],['m9','DIM','M7','m7','7sus','MAJ','5'],'Soft sixths and suspended V'),
  preset('soul','SOUL',['6/9','m7','m7','M7','7sus','m7','h7'],['m7','h7','M7','m7','7sus','M7','D7'],'Warm sixths and suspended V'),
  preset('neo','NEO',['M9','m11','m7','M9','9sus','m9','h7'],['m9','h7','M9','m11','7sus','M9','D9'],'Ninths, elevenths, neo-soul'),
  preset('jazz','JAZZ',['6/9','m9','m7','M9','D13','m9','h7'],['m69','h7','M9','m9','7b9','M9','D9'],'Tonic 6/9, ii-V colour'),
  preset('alt','ALT',['M9','m11','m7','M#11','7b9','m9','h7'],['m9','h7','M9','m11','7b9','M#11','D13'],'Altered dominant'),
  preset('bossa','BOSSA',['6/9','m7','m7','6/9','D9','m9','h7'],['m69','h7','6/9','m69','7b9','6/9','D7'],'Sixths and ninths'),
  preset('gospel','GOSPL',['6/9','m9','D7','M9','9sus','m7','o7'],['m9','h7','D7','m7','7sus','6/9','D9'],'Secondary colour and suspended V'),
  preset('blues','BLUES',['D7','m7','m7','D7','D7','m7','h7'],['MIN','h7','MAJ','m7','D7','MAJ','D7'],'I7-IV7-V7 / minor blues'),
  preset('ambient','AMB',['SUS2','SUS2','5','SUS2','SUS4','SUS2','h7'],['SUS2','h7','5','SUS2','SUS4','SUS2','5'],'Open, third-free colours'),
  {id:'custom',label:'CUSTOM',degrees:[-1,-1,-1,-1,-1,-1,-1]},
].map(p=>Object.freeze({...p,degrees:Object.freeze(p.degrees),...(p.minor?{minor:Object.freeze(p.minor)}:{})})));
// Projects saved before the twelve-style list (revision < 3) keep the closest style.
// Revision 1/2 'jazz' was the plain-seventh JAZZ1, so it maps to 7THS.
const LEGACY_PROFILES=Object.freeze({jazz:'sevenths',jazz2:'jazz',jazz3:'alt',soul2:'soul',soul3:'soul',neo1:'neo',neo2:'neo',
  ambient2:'neo',ambient1:'ambient',lofi1:'lofi',lofi2:'lofi',pop1:'global',pop2:'pop',classic1:'classic',classic2:'classic'});
export function normalizeExtensionProfile(input={}) {
  const legacy=input.extensionProfileRevision!==3&&LEGACY_PROFILES[input.extensionProfile];
  const id=legacy||input.extensionProfile;
  return {extensionProfile:EXTENSION_PROFILES.some(p=>p.id===id)?id:'global',
    extensionProfileRevision:3,
    customExtensions:Array.from({length:7},(_,i)=>Array.isArray(input.customExtensions)&&PROFILE_EXTENSIONS.includes(input.customExtensions[i])?input.customExtensions[i]:-1)};
}
export function profileDegrees(input={}) {
  const s=normalizeExtensionProfile(input);
  const p=EXTENSION_PROFILES.find(p=>p.id===s.extensionProfile);
  const minor=['natural_minor','harmonic_minor','melodic_minor','dorian','phrygian','aeolian','locrian','minor_pentatonic'].includes(input.scaleId);
  return s.extensionProfile==='custom'?[...s.customExtensions]:[...(minor&&p.minor?p.minor:p.degrees)];
}
export const profileRecipe = (input,degree) => profileDegrees(input)[degree];
export function degreeExtension(input,degree) {
  const ext=profileDegrees(input)[degree];
  return Number.isInteger(ext)&&ext>=0?ext:input.extension;
}
