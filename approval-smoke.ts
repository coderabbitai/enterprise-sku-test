/** Format an optional display label, using a fallback for blank input. */
export function formatDisplayLabel(label: string): string {
  return label.trim() || "Untitled";
}
