// Portable proposal engine only: no pad mapping, MIDI, or automatic selection.
import {bassNotes} from './theory.mjs';

/** Offer actual chord tones as bass choices in stable root-relative order.
 * With a previous MIDI note, choose the nearest octave for each pitch class
 * inside the caller's register. Ties prefer the lower note. Do not invent
 * thirds/sevenths for sus/triad chords or change explicit bass settings.
 */
export function smartBassChoices(chord, settings = {}, {previous = null, min = 0, max = 127} = {}) {
  if (!chord || !Array.isArray(chord.intervals) || !chord.intervals.length) return [];
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max > 127 || min > max) return [];
  const root = bassNotes({...chord, bassMode:'root'}, {...settings, bassMode:'root'})[0];
  if (root === undefined) return [];
  const intervals = [...new Set(chord.intervals.filter(Number.isInteger).map(n => (n % 12 + 12) % 12))].sort((a,b)=>a-b);
  return intervals.flatMap(interval => {
    const pitchClass = (root + interval) % 12;
    const target = Number.isInteger(previous) && previous >= 0 && previous <= 127 ? previous : root + interval;
    const pitches = Array.from({length:11},(_,octave)=>pitchClass+12*octave).filter(n=>n>=min&&n<=max);
    pitches.sort((a,b)=>Math.abs(a-target)-Math.abs(b-target)||a-b);
    return pitches.length ? [{interval,pitchClass,note:pitches[0],movement:Number.isInteger(previous)&&previous>=0&&previous<=127?pitches[0]-previous:null}] : [];
  });
}
