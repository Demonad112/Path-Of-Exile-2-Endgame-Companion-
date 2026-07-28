export function ProgressBar({
  percent,
  label,
}: {
  percent: number;
  label?: string;
}) {
  const clamped = Math.min(100, Math.max(0, percent));

  return (
    <div className="w-full">
      {label && (
        <div className="mb-1.5 flex justify-between text-xs text-ink-mute">
          <span>{label}</span>
          <span className="font-medium text-ink-dim">{clamped}%</span>
        </div>
      )}
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken ring-1 ring-line">
        <div
          className="h-full rounded-full bg-good transition-all duration-500 ease-out"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
