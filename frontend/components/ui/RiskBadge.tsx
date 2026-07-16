export function RiskBadge({ level }: { level: string }) {
  const cls = {
    low:      "badge badge-low",
    medium:   "badge badge-medium",
    high:     "badge badge-high",
    critical: "badge badge-critical",
  }[level?.toLowerCase()] || "badge";

  const dot: Record<string, string> = {
    low: "#2dd4bf", medium: "#fbbf24", high: "#fb923c", critical: "#fb7185"
  };

  return (
    <span className={cls}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: dot[level?.toLowerCase()] || "#94a3b8", display: "inline-block" }} />
      {level?.charAt(0).toUpperCase() + level?.slice(1)}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const cls = {
    uploaded:   "badge badge-queued",
    validated:  "badge badge-running",
    clean:      "badge badge-active",
    published:  "badge badge-active",
    queued:     "badge badge-queued",
    running:    "badge badge-running",
    completed:  "badge badge-active",
    failed:     "badge badge-failed",
    active:     "badge badge-active",
  }[status?.toLowerCase()] || "badge";

  return <span className={cls}>{status}</span>;
}
