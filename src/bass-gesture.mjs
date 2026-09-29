// Platform-independent input roles. IDs are logical chord inputs, not MIDI pads.
// Only press() can choose harmony. release() either waits or ends ownership.
export function createBassGesture() {
  const held = new Set();
  let anchor = null, lastPressed = null;
  function reset() { held.clear(); anchor = null; lastPressed = null; }
  return {
    press(id) {
      if (held.has(id)) return { type: 'none' };
      const first = anchor === null;
      held.add(id); lastPressed = id;
      if (first) anchor = id;
      return { type: first ? 'start' : 'bass', anchor, input: id };
    },
    release(id) {
      if (!held.delete(id)) return { type: 'none' };
      if (held.size) return { type: 'wait' };
      const owner = anchor; reset(); return { type: 'end', anchor: owner };
    },
    reset,
    inspect: () => ({ active: anchor !== null, anchor, lastPressed, held: [...held] }),
  };
}

export function nearestBassPitch(pitchClass, previous) {
  const pc = ((pitchClass % 12) + 12) % 12;
  let best = pc;
  for (let note = pc; note <= 127; note += 12)
    if (Math.abs(note - previous) < Math.abs(best - previous)) best = note;
  return best;
}
