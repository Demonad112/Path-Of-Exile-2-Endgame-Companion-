import { Suspense } from "react";
import { atlasClusters, memoryForks } from "@/data/atlasTree";
import { ClusterNode } from "./ClusterNode";
import { MemoryForkBranch } from "./MemoryForkBranch";
import { MechanicSubTreeList } from "./MechanicSubTreeList";

function SectionHeading({
  step,
  title,
  description,
}: {
  step: number;
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-4 border-b border-[var(--line)] pb-3">
      <h2 className="flex items-center gap-2.5 text-lg font-semibold text-ink-dim">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-[var(--accent)]/30 bg-[var(--accent-dim)] text-xs font-bold text-[var(--accent)]">
          {step}
        </span>
        {title}
      </h2>
      {description && (
        <p className="mt-1.5 ml-[34px] text-sm text-ink-mute">{description}</p>
      )}
    </div>
  );
}

export function ClusterFlow() {
  const earlyProgression = atlasClusters
    .filter((c) => c.group === "early-progression")
    .sort((a, b) => a.order - b.order);
  const general = atlasClusters
    .filter((c) => c.group === "general")
    .sort((a, b) => a.order - b.order);

  return (
    <div className="flex flex-col gap-10">
      <section>
        <SectionHeading
          step={1}
          title="Early Progression Sequence"
          description="Main-path allocation order, pre- and post-Arbiter of Ash/Divinity. Numbers are allocation sequence, not tree position."
        />
        <ul className="grid gap-2 sm:grid-cols-2">
          {earlyProgression.map((cluster) => (
            <ClusterNode key={cluster.id} cluster={cluster} />
          ))}
        </ul>
      </section>

      <section>
        <SectionHeading
          step={2}
          title="Memory Fork — Decision Point"
          description="Unlocked after the first Arbiter of Divinity kill. Three parallel branches — allocate whichever fits your farming loop first."
        />
        <div className="flex flex-col gap-3 md:flex-row">
          {memoryForks.map((fork) => (
            <MemoryForkBranch key={fork.id} fork={fork} />
          ))}
        </div>
      </section>

      <section>
        <SectionHeading
          step={3}
          title="Mechanic Sub-Trees"
          description="Commit to one mechanic at a time — payoff nodes sit deep. Switch tabs to see each mechanic's priority order."
        />
        <Suspense fallback={null}>
          <MechanicSubTreeList clusters={atlasClusters} />
        </Suspense>
      </section>

      <section>
        <SectionHeading step={4} title="General / Late-Game" />
        <ul className="grid gap-2 sm:grid-cols-2">
          {general.map((cluster) => (
            <ClusterNode key={cluster.id} cluster={cluster} />
          ))}
        </ul>
      </section>
    </div>
  );
}
