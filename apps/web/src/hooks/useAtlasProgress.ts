"use client";

import { useCallback, useMemo } from "react";
import { usePersistedState } from "./usePersistedState";
import { atlasClusters, memoryForks } from "@/data/atlasTree";

export function useAtlasProgress() {
  const { state, setState } = usePersistedState();
  const { allocatedClusterIds, allocatedForkIds } = state.atlas;

  const toggleCluster = useCallback(
    (clusterId: string) => {
      setState((prev) => {
        const set = new Set(prev.atlas.allocatedClusterIds);
        if (set.has(clusterId)) set.delete(clusterId);
        else set.add(clusterId);
        return {
          ...prev,
          atlas: { ...prev.atlas, allocatedClusterIds: Array.from(set) },
        };
      });
    },
    [setState]
  );

  const toggleFork = useCallback(
    (forkId: string) => {
      setState((prev) => {
        const set = new Set(prev.atlas.allocatedForkIds);
        if (set.has(forkId)) set.delete(forkId);
        else set.add(forkId);
        return {
          ...prev,
          atlas: { ...prev.atlas, allocatedForkIds: Array.from(set) },
        };
      });
    },
    [setState]
  );

  const isClusterAllocated = useCallback(
    (clusterId: string) => allocatedClusterIds.includes(clusterId),
    [allocatedClusterIds]
  );

  const isForkAllocated = useCallback(
    (forkId: string) => allocatedForkIds.includes(forkId),
    [allocatedForkIds]
  );

  const allocationPercent = useMemo(() => {
    const total = atlasClusters.length + memoryForks.length;
    if (total === 0) return 0;
    const done = allocatedClusterIds.length + allocatedForkIds.length;
    return Math.round((done / total) * 100);
  }, [allocatedClusterIds, allocatedForkIds]);

  return {
    toggleCluster,
    toggleFork,
    isClusterAllocated,
    isForkAllocated,
    allocationPercent,
  };
}
