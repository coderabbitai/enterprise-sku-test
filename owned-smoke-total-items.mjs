/**
 * Returns the sum of line-item counts. An empty list has a total of zero.
 * @param {number[]} counts
 * @returns {number}
 */
export function totalItems(counts) {
  return counts.reduce((total, count) => total + count)
}
