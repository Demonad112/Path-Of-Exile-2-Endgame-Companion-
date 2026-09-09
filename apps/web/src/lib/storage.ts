import type { PersistedState } from "./types";

export const STORAGE_KEY = "poe2-endgame-companion:v1";
export const STORAGE_VERSION = 1;

const DEFAULT_STATE: PersistedState = {
  version: STORAGE_VERSION,
  checklist: { completedStepIds: [], completedActionItemKeys: [] },
  atlas: { allocatedClusterIds: [], allocatedForkIds: [] },
  dashboard: { lastQuizAnswers: {}, pinnedStrategyId: undefined },
  character: { snapshots: [] },
  updatedAt: new Date(0).toISOString(),
};

export function defaultState(): PersistedState {
  return DEFAULT_STATE;
}

// Module-level cache + subscriber list backing useSyncExternalStore, so the
// localStorage read only ever happens once per client session (lazily, on
// first getSnapshot() call) instead of inside a render/effect body.
let cache: PersistedState = DEFAULT_STATE;
let cacheInitialized = false;
const listeners = new Set<() => void>();

function readFromLocalStorage(): PersistedState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as PersistedState;
    if (!parsed || parsed.version !== STORAGE_VERSION) return DEFAULT_STATE;
    return {
      ...DEFAULT_STATE,
      ...parsed,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

function writeToLocalStorage(state: PersistedState): void {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...state, updatedAt: new Date().toISOString() })
    );
  } catch {
    // localStorage can throw in private-browsing contexts — best-effort only.
  }
}

export function getSnapshot(): PersistedState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  if (!cacheInitialized) {
    cache = readFromLocalStorage();
    cacheInitialized = true;
  }
  return cache;
}

export function getServerSnapshot(): PersistedState {
  return DEFAULT_STATE;
}

export function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function setPersistedState(
  updater: (prev: PersistedState) => PersistedState
): void {
  const prev = getSnapshot();
  const next = updater(prev);
  // An updater that returns exactly what it was given has decided nothing
  // changed, and serialising the whole state to localStorage and waking every
  // subscriber for that is pure cost. One character import runs the analysis
  // several times as the affix data, tree and ladder arrive, and each pass
  // re-recorded a history that had not moved.
  if (next === prev) return;
  cache = next;
  cacheInitialized = true;
  writeToLocalStorage(next);
  listeners.forEach((listener) => listener());
}
