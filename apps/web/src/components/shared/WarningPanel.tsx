import type { CommonMistake, Stage } from "@/lib/types";
import { Tag } from "./Tag";

export function WarningPanel({
  mistakes,
  stage,
  title = "Common mistakes",
}: {
  mistakes: CommonMistake[];
  stage: Stage;
  title?: string;
}) {
  const relevant = mistakes.filter((m) => m.appliesToStage.includes(stage));
  if (relevant.length === 0) return null;

  return (
    <div className="rounded-lg border border-danger/25 bg-gradient-to-b from-danger/[0.07] to-danger/[0.03] p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--danger)]">
        <span aria-hidden>⚠</span> {title}
      </h3>
      <ul className="space-y-3">
        {relevant.map((m) => (
          <li key={m.id} id={m.id} className="scroll-mt-24 text-sm text-danger/90">
            <p className="font-medium text-danger">{m.title}</p>
            <p className="text-danger/70">{m.description}</p>
            {m.relatedMechanics && m.relatedMechanics.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {m.relatedMechanics.map((mech) => (
                  <Tag key={mech} mechanic={mech} />
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
