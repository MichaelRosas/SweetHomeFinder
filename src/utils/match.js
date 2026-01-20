export const MAX_MATCH_SCORE = 145;

const AGE_ORDER = ['baby', 'young', 'adult', 'senior'];
const SIZE_ORDER = ['small', 'medium', 'large', 'extra large'];

const isEmpty = (v) => v === undefined || v === null || v === '';
const normalize = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : v);
const formatPts = (val) => (Number.isInteger(val) ? String(val) : Number(val.toFixed(1)));

function scoreField({ label, pref, petVal, weight, orderedValues }) {
  // If the user has no preference, count it as a match (full credit)
  if (isEmpty(pref)) {
    return {
      points: weight,
      detail: `+${formatPts(weight)} ${label}: No preference (counts as match)`,
    };
  }

  if (isEmpty(petVal)) {
    return { points: 0, detail: `+0 ${label}: Listing missing value` };
  }

  const prefNorm = normalize(pref);
  const petNorm = normalize(petVal);

  if (prefNorm === petNorm) {
    return { points: weight, detail: `+${formatPts(weight)} ${label}: Matches (${petVal})` };
  }

  // Allow half-credit for adjacent values when an order is defined (size, age)
  if (Array.isArray(orderedValues) && orderedValues.length) {
    const prefIdx = orderedValues.indexOf(prefNorm);
    const petIdx = orderedValues.indexOf(petNorm);
    if (prefIdx !== -1 && petIdx !== -1 && Math.abs(prefIdx - petIdx) === 1) {
      const half = weight / 2;
      return {
        points: half,
        detail: `+${formatPts(half)} ${label}: Close (${pref} vs ${petVal})`,
      };
    }
  }

  return {
    points: 0,
    detail: `+0 ${label}: Preferred ${pref || 'N/A'}, pet is ${petVal || 'N/A'}`,
  };
}

// Utility scorer used to compare a pet listing against adopter preferences.
// Scores are additive so higher totals indicate better matches.
export function scoreMatch(pet, prefs = {}) {
  if (!pet || !prefs) return 0;
  if (Object.keys(prefs).length === 0) return 0; // no quiz = no score

  const breakdown = [
    scoreField({
      label: 'Type',
      pref: prefs.animalType,
      petVal: pet.animalType || pet.species,
      weight: 50,
    }),
    scoreField({
      label: 'Size',
      pref: prefs.size,
      petVal: pet.size,
      weight: 25,
      orderedValues: SIZE_ORDER,
    }),
    scoreField({
      label: 'Temperament',
      pref: prefs.temperament,
      petVal: pet.temperament,
      weight: 25,
    }),
    scoreField({
      label: 'Age',
      pref: prefs.ageRange || prefs.age,
      petVal: pet.ageRange || pet.age,
      weight: 25,
      orderedValues: AGE_ORDER,
    }),
    scoreField({
      label: 'Breed',
      pref: prefs.breed,
      petVal: pet.breed,
      weight: 10,
    }),
    scoreField({
      label: 'Gender',
      pref: prefs.gender,
      petVal: pet.gender,
      weight: 5,
    }),
    scoreField({
      label: 'Color',
      pref: prefs.color,
      petVal: pet.color,
      weight: 5,
    }),
  ];

  return breakdown.reduce((sum, field) => sum + field.points, 0);
}

// Convert the raw additive score into a 0-100 percentage (rounded, clamped).
export function matchScoreToPercent(score) {
  if (!score || score <= 0) return 0;
  const pct = Math.round((score / MAX_MATCH_SCORE) * 100);
  return Math.min(100, Math.max(0, pct));
}

// Returns a human-friendly multiline string explaining where the score came from.
export function describeMatchScore(pet, prefs = {}) {
  const hasPrefs = prefs && Object.keys(prefs).length > 0;
  if (!pet) return 'Listing unavailable.';
  if (!hasPrefs) return 'No preferences set yet. Take the quiz to get personalized matches.';

  const fields = [
    scoreField({
      label: 'Type',
      pref: prefs.animalType,
      petVal: pet.animalType || pet.species,
      weight: 50,
    }),
    scoreField({
      label: 'Size',
      pref: prefs.size,
      petVal: pet.size,
      weight: 25,
      orderedValues: SIZE_ORDER,
    }),
    scoreField({
      label: 'Temperament',
      pref: prefs.temperament,
      petVal: pet.temperament,
      weight: 25,
    }),
    scoreField({
      label: 'Age',
      pref: prefs.ageRange || prefs.age,
      petVal: pet.ageRange || pet.age,
      weight: 25,
      orderedValues: AGE_ORDER,
    }),
    scoreField({
      label: 'Breed',
      pref: prefs.breed,
      petVal: pet.breed,
      weight: 10,
    }),
    scoreField({
      label: 'Gender',
      pref: prefs.gender,
      petVal: pet.gender,
      weight: 5,
    }),
    scoreField({
      label: 'Color',
      pref: prefs.color,
      petVal: pet.color,
      weight: 5,
    }),
  ];

  const total = fields.reduce((sum, field) => sum + field.points, 0);
  const percent = matchScoreToPercent(total);
  const header = `Match score: ${formatPts(total)} pts (${percent}%) of ${MAX_MATCH_SCORE}`;
  return [header, ...fields.map((f) => f.detail)].join('\n');
}
