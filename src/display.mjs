/** OKTONIK's deliberately small, host-independent 128 x 64 display. */
export const SCREEN = Object.freeze({ width: 128, height: 64 });

const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const WHITE = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23];
const BLACK = [1, 3, 6, 8, 10, 13, 15, 18, 20, 22];
const mod = (n, by) => ((n % by) + by) % by;

/** The host's fixed font is six pixels wide, including its trailing space. */
function ascii(value) {
  return String(value ?? '')
    .replace(/♯/g, '#').replace(/♭/g, 'b').replace(/−|–|—/g, '-')
    .replace(/△|Δ/g, 'M').replace(/°/g, 'o').replace(/ø/g, 'h')
    .replace(/[^\x20-\x7e]/g, '?');
}

function fit(value, count) {
  const text = ascii(value);
  return text.length <= count ? text : text.slice(0, count - 1) + '~';
}

function footer(draw, value) {
  draw.line(0, 53, 127, 53, 1);
  draw.text(1, 55, fit(value, 21), 1);
}

function renderHeader(draw, model) {
  const pageIndex = Number.isFinite(model.pageIndex) ? Math.max(0, model.pageIndex) : 0;
  const pageCount = Math.min(11, Math.max(1, Number(model.pageCount) || 1));
  draw.text(1, 0, fit(model.pageName === 'ARP MIDI' ? 'A.MIDI' : model.pageName || 'HARMONY', 7), 1);
  // One mark per page: the selected tab is tall, the others are underlines.
  const step = model.borrowLocked ? (pageCount <= 6 ? 2 : 1) : pageCount > 10 ? 1 : pageCount > 6 ? 2 : pageCount > 4 ? 3 : 5;
  const width = model.borrowLocked ? 1 : pageCount > 6 ? 1 : pageCount > 4 ? 2 : 3;
  if (model.borrowLocked) {
    draw.fill(45, 0, 7, 8, 1);
    draw.text(46, 0, 'B', 0);
  }
  for (let index = 0; pageCount > 1 && index < pageCount; index += 1) {
    const x = (model.borrowLocked ? (pageCount <= 6 || pageCount>10 ? 53 : 54) : 45) + index * step;
    if (x + width > 64) break;
    if (index === pageIndex) draw.fill(x, 2, width, 5, 1);
    else draw.line(x, 6, x + width - 1, 6, 1);
  }
  draw.text(65, 0, fit(model.chordLabel || '--', 10), 1);
  draw.line(0, 9, 127, 9, 1);
}

function renderCells(draw, model) {
  const cells = Array.isArray(model.cells) ? model.cells : [];
  const focus = Number.isInteger(model.focused) ? model.focused : -1;
  for (let index = 0; index < 8; index += 1) {
    const cell = cells[index];
    if (!cell?.label) continue;
    const x = (index % 4) * 32;
    const y = index < 4 ? 10 : 32;
    const selected = index === focus && !cell.disabled;
    if (selected) draw.fill(x + 1, y + 1, 30, 9, 1);
    draw.text(x + 1, y + 1, fit(cell.label, 5), selected ? 0 : 1);
    draw.text(x + 1, y + 12, fit(cell.disabled ? cell.disabledValue ?? '--' : cell.value, 5), 1);
  }
  for (const x of [32, 64, 96]) draw.line(x, 10, x, 52, 1);
  draw.line(0, 31, 127, 31, 1);

  const focusedCell = focus >= 0 && focus < 8 ? cells[focus] : null;
  const fallback = [model.degreeLabel, model.transport].filter(Boolean).join(' | ');
  const detail = focusedCell
    ? `${focusedCell.fullLabel || focusedCell.label}: ${focusedCell.fullValue ?? focusedCell.value}`
    : fallback || 'CHORD PILOT';
  footer(draw, model.detail || detail);
}

function renderTheory(draw, model) {
  const theory = model.theory;
  const notes = [...new Set((theory.notes || []).filter(Number.isFinite).map(Math.round))]
    .sort((a, b) => a - b);
  const root = Number.isFinite(theory.root) ? theory.root : notes[0] ?? 60;
  const base = Math.floor((notes[0] ?? root) / 12) * 12;
  const top = notes[notes.length - 1];
  const bass = notes[0];
  const noteText = notes.length ? notes.map(note => NOTE_NAMES[mod(note, 12)]).join(' ') : 'PLAY A CHORD';
  draw.text(1, 13, fit(noteText, 21), 1);

  // The keyboard is a secondary learning view; parameter pages always retain
  // their eight controls. Marker R identifies the root, B the bass, T the top.
  for (let key = 0; key < WHITE.length; key += 1) {
    const midi = base + WHITE[key];
    const x = 8 + key * 8;
    draw.rect(x, 25, 8, 27, 1);
    if (notes.includes(midi)) {
      const marker = mod(midi, 12) === mod(root, 12) ? 'R' : midi === bass ? 'B' : midi === top ? 'T' : '+';
      draw.text(x + 1, 43, marker, 1);
    }
  }
  for (const semitone of BLACK) {
    const leftWhite = WHITE.indexOf(semitone - 1);
    const x = 8 + (leftWhite + 1) * 8 - 2;
    draw.fill(x, 25, 5, 15, 1);
    if (notes.includes(base + semitone)) draw.fill(x + 1, 34, 3, 4, 0);
  }
  const degree = theory.degree || model.degreeLabel;
  footer(draw, model.detail || (theory.source ? `${degree || ''} ${theory.source}`.trim() : 'R:ROOT B:BASS T:TOP'));
}

// Two fixed-font lines give each pad ten characters without shrinking text.
// Prefer musical boundaries; keep all characters when a name fits both lines.
export function chordMapLines(value) {
  const label = ascii(value || '--');
  if (label.length <= 5) return [label];
  const slash = label.indexOf('/');
  if (slash > 0 && slash <= 5 && label.length - slash <= 5)
    return [label.slice(0, slash), label.slice(slash)];
  const parts = label.match(/^([A-G][b#]?(?:m(?!aj))?)(.+)$/);
  if (parts && parts[2].length <= 5) return [parts[1], parts[2]];
  const quality = label.match(/^([A-G][b#]?(?:maj|min|m|dim|aug|sus))(.+)$/);
  if (quality && quality[1].length <= 5 && quality[2].length <= 5)
    return [quality[1], quality[2]];
  // Unrecognised voicings can be named as a long explicit interval list.
  // Keep the root legible rather than wrapping halfway through that list.
  if (label.length > 10 && parts?.[2].startsWith('('))
    return [parts[1], fit(parts[2], 5)];
  return [label.slice(0, 5), fit(label.slice(5), 5)];
}

function renderChordMap(draw, model, map) {
  // Display rows match the physical chord pads: A5-A8 above A1-A4.
  [4,5,6,7,0,1,2,3].forEach((pad, cell) => {
    const x = (cell % 4) * 32, y = cell < 4 ? 10 : 32;
    const selected = map.selected === pad;
    if (selected) draw.fill(x + 1, y + 2, 30, 18, 1);
    const lines = chordMapLines(map.items[pad]?.label);
    lines.forEach((label, row) => draw.text(x + 1,
      y + (lines.length === 1 ? 8 : 3 + row * 9), label, selected ? 0 : 1));
  });
  for (const x of [32,64,96]) draw.line(x,10,x,52,1);
  draw.line(0,31,127,31,1);
  footer(draw, model.detail || 'CHORD MAP');
}

/**
 * Only this five-method adapter is needed on hardware or in the preview:
 * clear(), text(x,y,text,color), line(x1,y1,x2,y2,color),
 * rect(x,y,width,height,color), fill(x,y,width,height,color).
 * Text is at most 21 characters and uses the host's 6 x 8 fixed font.
 */
export function renderScreen(draw, model = {}) {
  draw.clear();
  renderHeader(draw, model);
  if (model.chordMap || model.ideaView) renderChordMap(draw, model, model.chordMap || model.ideaView);
  else if (model.theory) renderTheory(draw, model);
  else renderCells(draw, model);
}
