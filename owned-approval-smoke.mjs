export function uniqueLabels(labels) {
  return [...new Set(labels.map(label => label.trim()).filter(Boolean))]
}
