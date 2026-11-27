/**
 * Returns the first enabled option's label, or undefined when none is enabled.
 * @param {{ enabled: boolean, label: string }[]} options
 * @returns {string | undefined}
 */
export function firstEnabledLabel(options) {
  const selected = options.find(option => option.enabled)
  return selected.label
}
