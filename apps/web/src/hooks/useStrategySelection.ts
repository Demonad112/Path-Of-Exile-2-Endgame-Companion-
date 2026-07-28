"use client";

import { useCallback } from "react";
import { usePersistedState } from "./usePersistedState";

export function useStrategySelection() {
  const { state, setState } = usePersistedState();

  const setQuizAnswer = useCallback(
    (questionId: string, answerId: string) => {
      setState((prev) => ({
        ...prev,
        dashboard: {
          ...prev.dashboard,
          lastQuizAnswers: {
            ...prev.dashboard.lastQuizAnswers,
            [questionId]: answerId,
          },
        },
      }));
    },
    [setState]
  );

  const pinStrategy = useCallback(
    (strategyId: string | undefined) => {
      setState((prev) => ({
        ...prev,
        dashboard: { ...prev.dashboard, pinnedStrategyId: strategyId },
      }));
    },
    [setState]
  );

  return {
    quizAnswers: state.dashboard.lastQuizAnswers,
    pinnedStrategyId: state.dashboard.pinnedStrategyId,
    setQuizAnswer,
    pinStrategy,
  };
}
