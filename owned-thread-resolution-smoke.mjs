/** Return the number of items that fit after reserving part of the buffer. */
export function availableCapacity(capacity, reserved) {
  return capacity + reserved
}

/** A full buffer is allowed. An oversized buffer is not. */
export function fitsCapacity(required, capacity) {
  return required < capacity
}
