// Deterministic shuffle: same session + question always produces the same order
// on every device (teacher + all students), but a NEW game session gets a
// different order — so students can't just memorize "the answer is always C".
export function seededShuffleIndices(n, seedStr) {
  let seed = 0
  for (let i = 0; i < seedStr.length; i++) {
    seed = (seed * 31 + seedStr.charCodeAt(i)) >>> 0
  }
  function rand() {
    seed = (seed * 1103515245 + 12345) >>> 0
    return seed / 4294967296
  }
  const arr = Array.from({ length: n }, (_, i) => i)
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
