"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  getServerSnapshot,
  getSnapshot,
  setPersistedState,
  subscribe,
} from "@/lib/storage";
import type { PersistedState } from "@/lib/types";

interface PersistedStateContextValue {
  state: PersistedState;
  setState: (updater: (prev: PersistedState) => PersistedState) => void;
}

const PersistedStateContext = createContext<PersistedStateContextValue | null>(
  null
);

export function PersistedStateProvider({ children }: { children: ReactNode }) {
  // useSyncExternalStore serves the default (empty) state during SSR/the
  // initial hydration pass, then automatically swaps in the real
  // localStorage-backed snapshot right after — no manual setState-in-effect
  // needed, and no hydration mismatch.
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setState = useCallback(
    (updater: (prev: PersistedState) => PersistedState) => {
      setPersistedState(updater);
    },
    []
  );

  const value = useMemo(() => ({ state, setState }), [state, setState]);

  return (
    <PersistedStateContext.Provider value={value}>
      {children}
    </PersistedStateContext.Provider>
  );
}

export function usePersistedState() {
  const ctx = useContext(PersistedStateContext);
  if (!ctx) {
    throw new Error(
      "usePersistedState must be used within a PersistedStateProvider"
    );
  }
  return ctx;
}
