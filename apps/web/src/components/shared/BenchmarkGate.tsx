import type { BenchmarkGate as BenchmarkGateType } from "@/lib/types";
import { SourceFlag } from "./SourceFlag";

export function BenchmarkGate({ gate }: { gate: BenchmarkGateType }) {
  const isHard = gate.severity === "hard-gate";

  return (
    <div
      className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm ${
        isHard
          ? "border-danger/40 bg-danger/10 text-danger"
          : "border-accent/30 bg-accent/10 text-accent"
      }`}
    >
      <span aria-hidden>{isHard ? "🛑" : "📈"}</span>
      <div className="flex-1">
        <p>{gate.label}</p>
        <div className="mt-1">
          <SourceFlag source={gate.source} />
        </div>
      </div>
    </div>
  );
}
