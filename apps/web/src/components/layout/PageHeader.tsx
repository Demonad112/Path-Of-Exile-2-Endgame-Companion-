import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
}: {
  title: string;
  description: ReactNode;
}) {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
        {title}
      </h1>
      <div className="mt-1 h-0.5 w-12 rounded-full bg-gradient-to-r from-[var(--accent)] to-transparent" />
      <p className="mt-3 max-w-3xl text-ink-mute">{description}</p>
    </div>
  );
}
