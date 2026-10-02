import { createPilot } from './pilot.mjs';
import { STATE_PATH, decodeDocument } from './settings.mjs';
import { BUILD_PROFILE, moduleId, globalStatePath } from './profile.mjs';

// Same identity source and state tree used by Schwung's built-in Song Mode.
export const ACTIVE_SET_PATH = '/data/UserData/schwung/active_set.txt';
export const SET_STATE_DIR = '/data/UserData/schwung/set_state';
export function parseProject(raw) {
  if (typeof raw !== 'string' || raw.length > 1024) return null;
  const [id, name] = raw.split('\n').map(s => s.trim());
  // Never treat transient __pending-* IDs or path fragments as a real set.
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(id) && name ? { id, name } : null;
}
export function projectStatePath(id, profile = BUILD_PROFILE) {
  if (!parseProject(id + '\nSet')) throw new Error('Invalid project ID');
  return `${SET_STATE_DIR}/${id}/${moduleId(profile)}_v7.json`;
}

export function createProjectPilot(io = {}) {
  const profile=io.profile ?? BUILD_PROFILE;
  let pilot, project = null, waiting = false, seenProject = false, lastCheck = -Infinity, parked = false;
  const pending = new Map();
  const now = io.now || Date.now;
  function decorate(model) {
    return { ...model,
      ...(waiting ? { detail: 'Waiting for Move set' } : pending.size ? { detail: 'Project save pending' }
        : !project && /^(Chord Pilot|OKTONIK)/.test(model.detail) ? { detail: 'GLOBAL: no project ID' } : {}),
    };
  }
  function read(path) { try { return io.read?.(path) ?? null; } catch (_) { return null; } }
  function write(path, text) {
    let ok = false;
    try {
      const dir = path.slice(0, path.lastIndexOf('/'));
      ok = (!io.ensureDir || io.ensureDir(dir) === true) && io.write?.(path, text) === true;
    } catch (_) { /* Keep the exact path with the queued document. */ }
    if (ok) pending.delete(path); else pending.set(path, text);
    return ok;
  }
  function attach(next) {
    // The old pilot's writer closes over its own path. Saving during a switch
    // can therefore never put A's settings in B, even if disk writes fail.
    pilot?.unload();
    project = next; seenProject ||= !!next;
    const target = next ? projectStatePath(next.id,profile) : globalStatePath(profile);
    // Copy only when the destination does not exist. Never write to legacy or
    // sibling-profile files, even when the destination is invalid or empty.
    if (!pending.has(target) && read(target) == null) {
      const legacy=next ? `${SET_STATE_DIR}/${next.id}/chord_pilot_v7.json`
        : '/data/UserData/schwung/modules/tools/chord-pilot/pilot-state-v7.json';
      const raw=read(legacy);
      if(typeof raw==='string' && raw.length<=262144) {
        try { const doc=JSON.parse(raw);if(doc.format==='chord-pilot'&&doc.schemaVersion===7){decodeDocument(doc);write(target,raw);} }
        catch (_) { /* Invalid legacy data remains untouched. Start safely. */ }
      }
    }
    pilot = createPilot({ ...io,
      read: path => path === STATE_PATH ? pending.get(target) ?? read(target) : null,
      write: (_path, text) => write(target, text),
      render: model => io.render?.(decorate(model)),
    });
    io.projectChanged?.(); io.forceLeds?.();
    if (parked) pilot.tick(null, true);
    pilot.init();
  }
  function refresh(force = false) {
    const time = now();
    if (!force && time - lastCheck < 500) return false;
    lastCheck = time;
    // At most one previously failed file per poll, always to its original set.
    const retry = pending.entries().next().value;
    if (retry) write(...retry);
    const raw = read(ACTIVE_SET_PATH), next = parseProject(raw);
    if (!next && (seenProject || raw)) {
      seenProject = true;
      if (!waiting) { waiting = true; pilot?.panic(); io.announce?.('Waiting for Move project'); }
      return false;
    }
    const wasWaiting = waiting; waiting = false;
    if (!pilot || next?.id !== project?.id) { attach(next); return true; }
    if (next) project = next; // Rename does not create a new project.
    if (wasWaiting) pilot.resume();
    return false;
  }
  const session = {
    init() {
      refresh(true);
      // A pending ID on first launch is a silent, non-persistent waiting view.
      if (!pilot) {
        pilot = createPilot({ ...io, read: () => null, write: () => false,
          render: model => io.render?.({ ...model, detail: 'Waiting for Move set' }) });
        pilot.init();
      }
    },
    tick(dsp, isParked = false) {
      parked = isParked;
      const changed = refresh();
      pilot?.tick(changed || waiting ? null : dsp, parked);
    },
    resume() { if (!refresh(true) && !waiting) pilot?.resume(); },
    unload() { pilot?.unload(); for (const entry of [...pending]) write(...entry); },
    inspect() { const state = pilot.inspect(); return { ...state, model: decorate(state.model),
      project: project && { ...project }, projectWaiting: waiting, pendingProjectSaves: pending.size }; },
  };
  for (const method of ['pad', 'pressure', 'step', 'knob', 'focus', 'shift', 'changePage', 'octave', 'repaint', 'panic',
    'selectEdit', 'resetEdit', 'keepVariation', 'capture', 'record', 'undo', 'arm', 'play', 'menu']) {
    session[method] = (...args) => {
      const changed = refresh();
      if (!waiting && !changed) return pilot?.[method](...args);
    };
  }
  return session;
}
