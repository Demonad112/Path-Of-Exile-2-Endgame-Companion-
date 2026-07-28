"use client";

import { usePersistedState } from "./usePersistedState";
import { defaultState } from "@/lib/storage";

export function useResetProgress() {
  const { setState } = usePersistedState();
  return () => setState(() => defaultState());
}
