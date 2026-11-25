import assert from "node:assert/strict"

function countPending(items) {
	return items.filter(item => item.status === "pending").length
}

assert.equal(countPending([]), 0)
assert.equal(countPending([{ status: "pending" }, { status: "complete" }]), 1)

// Owned GitHub approval fixture for v202611251227.
