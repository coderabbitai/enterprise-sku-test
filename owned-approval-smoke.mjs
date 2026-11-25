export function normalizeLabels(labels) {
	return [...new Set(labels.map(label => label.trim()).filter(Boolean))]
}
