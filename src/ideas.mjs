import { SCALES, buildChordBank, applyModifiers, chordNotes, chordName, chordType, degreeName, normalizeHarmony, borrowedScaleId } from './theory.mjs';

export const IDEA_COLORS = Object.freeze(['IN', 'MIX', 'OUT']);
// Retain stored IDs so existing projects and frozen steps need no migration.
export const ideaStyle = color => ({IN:'SAFE',MIX:'COLOR',OUT:'WILD'}[color] || 'COLOR');
const pc = n => ((n % 12) + 12) % 12;
const pcs = chord => [...new Set(chord.intervals.map(n => pc(chord.rootOffset + n)))];
const signature = chord => chord.rootOffset + ':' + [...new Set(chord.intervals.map(pc))].sort((a,b) => a-b).join(',');
const distance = (a,b) => Math.min(pc(a-b), pc(b-a));

export function ideasContext(input, borrow = false) {
  const settings = normalizeHarmony(input);
  return { ...input, ...settings, ...(borrow ? { scaleId: borrowedScaleId(settings) } : {}) };
}

// Pitch-class proximity measures harmonic movement, not a physical voicing.
// Actual note/register assignment remains the responsibility of LEAD.
export function ideaRelationship(source, chord) {
  const a=pcs(source), b=pcs(chord);
  const shared=b.filter(n=>a.includes(n)).length;
  const motion=(b.reduce((s,n)=>s+Math.min(...a.map(m=>distance(n,m))),0)/b.length
    +a.reduce((s,n)=>s+Math.min(...b.map(m=>distance(n,m))),0)/a.length)/2;
  return {shared,motion,rootMotion:distance(source.rootOffset,chord.rootOffset),
    resolves:pc(source.rootOffset-chord.rootOffset)===7,
    target:source.targetOffset===chord.rootOffset};
}

export function ideaRelationshipScore(relation, color='MIX') {
  const {shared,motion,rootMotion,resolves,target}=relation;
  const score=color==='IN' ? shared*4-motion*5-rootMotion*.4+(resolves?10:0)
    : color==='OUT' ? shared*.5+Math.min(motion,3)*3+rootMotion*.6+(resolves?4:0)
    : shared*2-motion*2+(resolves?8:0);
  // An explicitly prepared ii/V/SUB destination remains easy to find even
  // with WILD selected. Exploration must not bury a deliberate resolution.
  return score+(target?100:0);
}

// Bounded, deterministic NEXT suggestions. No MIDI, IO or randomness here.
// Entries are resolved snapshots: a BORROW latch is applied once at generation.
export function generateIdeas(source, input = {}, { color = 'MIX', borrow = false, bank } = {}) {
  const settings = normalizeHarmony(input), context = ideasContext(input, borrow);
  const scale = SCALES.find(s => s.id === context.scaleId);
  const scalePcs = new Set(scale.intervals);
  const base = (bank || buildChordBank(settings)).map(chord => borrow ? applyModifiers(chord, { borrow: true }, settings) : chord);
  const anchor = source || base[0];
  const pool = new Map();
  function add(raw, reason, family, priority = 0) {
    if (!raw) return;
    const chord = { ...raw, intervals: [...raw.intervals], register: 0 };
    // In-scale does not imply low tension: dense upper extensions can clash.
    if(color==='IN'&&(chord.intervals.length>4||Math.max(...chord.intervals)>11))return;
    if(color==='MIX'&&(chord.intervals.length>5||Math.max(...chord.intervals)>14))return;
    const tones = pcs(chord), outside = tones.filter(n => !scalePcs.has(n)).length;
    const key = signature(chord);
    if (pool.has(key)) return;
    const relation=ideaRelationship(anchor,chord);
    const score = priority + ideaRelationshipScore(relation,color)
      - (color==='IN' ? Math.max(0,chord.intervals.length-3)*12+(chordType(chord)==='DIM'?6:0) : 0)
      - (anchor.rootOffset === chord.rootOffset ? 4 : 0)
      - (signature(anchor) === key ? 20 : 0) - Math.abs(chord.intervals.length - anchor.intervals.length) * .4;
    if (chordNotes(chord, input).length)
      pool.set(key, { chord, reason: relation.target ? 'RESOLVE -> '+chordName(chord,input)
        : reason, family, outside, score, key, label: chordName(chord, input) });
  }
  base.forEach(c => add(c, degreeName(c, context) + ' | IN SCALE', 'scale', 8));
  // Additional in-scale shapes make eight distinct ideas possible even in
  // pentatonic modes, without filling a bank with octave copies of one chord.
  for (const extension of [0,1,2,3,4,5,6]) {
    buildChordBank({ ...context, extension, inversion: 0 }).slice(0,scale.intervals.length)
      .forEach(c => add(c, degreeName(c, context) + ' | IN SCALE', 'scale'));
  }
  // Sparse scales need simple alternatives, not dense extensions, to fill
  // eight distinct choices. The normal scale filter still applies below.
  if(scale.intervals.length<7)for(const simple of buildChordBank({...context,extension:0}))
    for(const variant of [{},{sus:2},{sus:4},{flip:true}])
      add(applyModifiers(simple,variant,context),'SIMPLE | IN SCALE','simple');
  base.forEach(target => {
    add(applyModifiers(target, { borrow: true }, context), 'BORROW | ' + degreeName(target, context), 'borrow');
    // Major/minor destinations have a clear tonicizing approach. Diminished,
    // augmented and suspended chords are still playable, but not advertised
    // as conventional ii-V destinations by the automatic suggestion engine.
    if (!['MAJ', 'MIN'].includes(chordType(target))) return;
    for (const [modifier, name] of [['dom','V'], ['sub','SUB'], ['ii','II']]) {
      add(applyModifiers(target, { [modifier]: true }, context), name + ' -> ' + chordName(target,input), modifier);
    }
  });
  const rank = rows => rows.sort((a,b) => b.score-a.score || a.key.localeCompare(b.key));
  const inside = rank([...pool.values()].filter(c => !c.outside));
  const outside = rank([...pool.values()].filter(c => c.outside));
  const result = [], seen = new Set();
  function take(rows, count) {
    // Prefer distinct roots, then allow a second quality/extension as needed.
    for (const distinct of [true, false]) for (const entry of rows) {
      if (count <= 0) return;
      if (seen.has(entry.key) || (distinct && result.some(c => c.chord.rootOffset === entry.chord.rootOffset))) continue;
      result.push(entry); seen.add(entry.key); count--;
    }
  }
  if (color === 'IN') take(inside, 8);
  else if (color === 'OUT') { take(inside, 2); take(outside, 6); }
  else { take(inside, 4); take(outside, 4); }
  take(color === 'IN' ? inside : rank([...inside,...outside]), 8-result.length);
  return result.slice(0,8).map(({ chord, reason, outside, family }) => ({ chord, reason, outside: outside > 0, family }));
}

// A live palette, not an automatic progression. The target is already resolved
// by the caller (including edits/BORROW); never apply BORROW to it again.
export function generateIdeasTo(source, target, input = {}, {color='MIX',borrow=false,bank}={}) {
  const context=ideasContext(input,borrow), scale=SCALES.find(s=>s.id===context.scaleId);
  const entries=[], seen=new Set(), name=chordName(target,input);
  function add(chord,reason,family) {
    const key=signature(chord);if(seen.has(key))return;
    seen.add(key);entries.push({chord:{...chord,intervals:[...chord.intervals]},reason,family,
      outside:pcs(chord).some(n=>!scale.intervals.includes(n))});
  }
  const tonal=['MAJ','MIN'].includes(chordType(target));
  if(tonal) {
    add(applyModifiers(target,{ii:true},context),'II -> V -> '+name,'ii');
    add(applyModifiers(target,{dom:true},context),'V -> '+name,'dom');
  }
  add(target,'TARGET '+name,'target');
  if(tonal&&color!=='IN')add(applyModifiers(target,{sub:true},context),'SUB -> '+name,'sub');
  const pool=new Map();
  for(const anchor of [source||target,target])for(const style of ['IN','MIX','OUT'])
    for(const row of generateIdeas(anchor,input,{color:style,borrow,bank})) {
      const key=signature(row.chord);if(seen.has(key)||pool.has(key))continue;
      if(color==='IN'&&row.outside)continue;
      const toward=ideaRelationship(row.chord,target);
      // Ignore incidental target metadata of a candidate: score its actual
      // connection to this selected destination, not an earlier approach.
      const score=ideaRelationshipScore({...toward,target:false},color)
        +.3*ideaRelationshipScore({...ideaRelationship(source||target,row.chord),target:false},color);
      pool.set(key,{...row,score,key});
    }
  const ranked=[...pool.values()].sort((a,b)=>b.score-a.score||a.key.localeCompare(b.key));
  for(const distinct of [true,false])for(const row of ranked) {
    if(entries.length>=8)break;
    if(distinct&&entries.some(e=>e.chord.rootOffset===row.chord.rootOffset))continue;
    add(row.chord,'TRY -> '+name,'connection');
  }
  return entries.slice(0,8);
}
