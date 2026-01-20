// Deterministic thread id helper
// Ensures a single conversation between an adopter and a shelter per pet.
export function threadIdFor({ petId, adopterId, shelterId }) {
  const p = String(petId || '').trim();
  const a = String(adopterId || '').trim();
  const s = String(shelterId || '').trim();
  return `${p}_${a}_${s}`;
}
