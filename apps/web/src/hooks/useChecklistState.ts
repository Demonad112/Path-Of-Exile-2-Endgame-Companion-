"use client";

import { useCallback, useMemo } from "react";
import { usePersistedState } from "./usePersistedState";
import { roadmapSteps } from "@/data/roadmap";

export function actionItemKey(stepId: string, index: number) {
  return `${stepId}::${index}`;
}

export function useChecklistState() {
  const { state, setState } = usePersistedState();
  const { completedStepIds, completedActionItemKeys } = state.checklist;

  const toggleStep = useCallback(
    (stepId: string) => {
      setState((prev) => {
        const set = new Set(prev.checklist.completedStepIds);
        if (set.has(stepId)) set.delete(stepId);
        else set.add(stepId);
        return {
          ...prev,
          checklist: { ...prev.checklist, completedStepIds: Array.from(set) },
        };
      });
    },
    [setState]
  );

  const toggleActionItem = useCallback(
    (key: string) => {
      setState((prev) => {
        const set = new Set(prev.checklist.completedActionItemKeys);
        if (set.has(key)) set.delete(key);
        else set.add(key);
        return {
          ...prev,
          checklist: {
            ...prev.checklist,
            completedActionItemKeys: Array.from(set),
          },
        };
      });
    },
    [setState]
  );

  const isStepComplete = useCallback(
    (stepId: string) => completedStepIds.includes(stepId),
    [completedStepIds]
  );

  const isActionItemComplete = useCallback(
    (key: string) => completedActionItemKeys.includes(key),
    [completedActionItemKeys]
  );

  const completionPercent = useMemo(() => {
    if (roadmapSteps.length === 0) return 0;
    return Math.round(
      (completedStepIds.length / roadmapSteps.length) * 100
    );
  }, [completedStepIds]);

  return {
    toggleStep,
    toggleActionItem,
    isStepComplete,
    isActionItemComplete,
    completionPercent,
    completedStepIds,
  };
}
