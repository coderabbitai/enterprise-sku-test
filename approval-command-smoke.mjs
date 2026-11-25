import assert from "node:assert/strict"

const summarize = labels => [...new Set(labels)].sort()

assert.deepEqual(summarize(["ready", "owned", "ready"]), ["owned", "ready"])
assert.deepEqual(summarize([]), [])
