/** Format a display label, using a fallback for blank input. */
export function formatDisplayLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ") || "Untitled";
}
