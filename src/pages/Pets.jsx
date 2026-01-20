import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, onSnapshot, query, orderBy, limit, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import NavBar from '../components/NavBar';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import PetSummaryCard from '../components/PetSummaryCard';
import { getTypes, getBreeds, getColors, getGenders, getSizes } from '../services/PetFinder';
import { scoreMatch, matchScoreToPercent, describeMatchScore } from '../utils/match';
import '../styles/Pets.css';

function getMatchBadgeClass(score) {
  if (score >= 80) return 'pet-card__match pet-card__match--excellent';
  if (score >= 50) return 'pet-card__match pet-card__match--good';
  if (score >= 25) return 'pet-card__match pet-card__match--fair';
  return 'pet-card__match pet-card__match--poor';
}

export default function Pets() {
  const { user } = useAuth();
  const role = user?.role || 'adopter';
  const uid = user?.uid || null;
  const prefsRef = useRef(user?.preferences || null);
  const nav = useNavigate();

  const [pets, setPets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [onlyMatches, setOnlyMatches] = useState(false);
  const [sortBy, setSortBy] = useState('match');
  const [search, setSearch] = useState('');

  const [types, setTypes] = useState([]);
  const [breeds, setBreeds] = useState([]);
  const [colors, setColors] = useState([]);
  const [genders, setGenders] = useState([]);
  const [sizes, setSizes] = useState([]);
  const [selectedType, setSelectedType] = useState('');
  const [selectedBreed, setSelectedBreed] = useState('');
  const [selectedColor, setSelectedColor] = useState('');
  const [selectedGender, setSelectedGender] = useState('');
  const [selectedSize, setSelectedSize] = useState('');

  // Load Petfinder filter options (types/colors/etc.) with safe fallbacks.
  useEffect(() => {
    const loadOptions = async () => {
      try {
        const [typesData, colorsData] = await Promise.all([getTypes(), getColors()]);
        setTypes(typesData || []);
        setColors(colorsData || []);
        setGenders(getGenders() || []);
        setSizes(getSizes() || []);
      } catch (error) {
        console.error('Failed to load filter options:', error);
        // Static fallback options so filters remain usable even if Petfinder metadata fails
        setTypes([
          'Dog',
          'Cat',
          'Rabbit',
          'Small & Furry',
          'Horse',
          'Bird',
          'Scales, Fins & Other',
          'Barnyard',
        ]);
        setColors([
          'Black',
          'White',
          'Brown',
          'Gray',
          'Golden',
          'Cream',
          'Red',
          'Blue',
          'Chocolate',
          'Silver',
          'Tan',
          'Brindle',
          'Merle',
          'Tricolor',
          'Bicolor',
          'Orange',
          'Yellow',
          'Sable',
          'Fawn',
          'Buff',
        ]);
        setGenders(getGenders() || ['Male', 'Female']);
        setSizes(getSizes() || ['Small', 'Medium', 'Large', 'Extra Large']);
      }
    };
    loadOptions();
  }, []);

  // Load breeds when the selected type changes
  useEffect(() => {
    const loadBreeds = async () => {
      if (!selectedType) {
        setBreeds([]);
        setSelectedBreed('');
        return;
      }
      try {
        const breedData = await getBreeds(selectedType);
        setBreeds(breedData || []);
        setSelectedBreed('');
      } catch (error) {
        console.error('Failed to load breeds:', error);
        setBreeds(['Mixed Breed']);
      }
    };
    loadBreeds();
  }, [selectedType]);

  // Live pets feed (fallbacks to unordered limited list if index missing).
  useEffect(() => {
    let active = true;
    let unsubscribePrimary = () => {};
    let unsubscribeFallback = () => {};
    const ownersCache = new Map();

    const ref = collection(db, 'pets');
    setLoading(true);
    setLoadError('');

    const hydrateOwners = async (rawPets) => {
      const shelterIds = Array.from(new Set(rawPets.map((pet) => pet.shelterId).filter(Boolean)));
      const missing = shelterIds.filter((id) => !ownersCache.has(id));

      if (!missing.length) return;

      const entries = await Promise.all(
        missing.map(async (shelterId) => {
          try {
            const snapshot = await getDoc(doc(db, 'users', shelterId));
            if (!snapshot.exists()) return [shelterId, null];
            const data = snapshot.data();
            const name =
              data?.shelterProfile?.companyName ||
              data?.companyName ||
              data?.displayName ||
              data?.email ||
              'Shelter';
            const address = data?.shelterProfile?.address || data?.address || null;
            return [shelterId, { name, address }];
          } catch {
            return [shelterId, null];
          }
        })
      );

      entries.forEach(([id, value]) => ownersCache.set(id, value));
    };

    const handleSnapshot = async (snap) => {
      if (!active) return;
      try {
        const rawPets = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        await hydrateOwners(rawPets);
        if (!active) return;

        const enriched = rawPets.map((pet) => {
          const owner = pet.shelterId ? ownersCache.get(pet.shelterId) : undefined;
          const rawScore = scoreMatch(pet, prefsRef.current);
          const matchPercent = matchScoreToPercent(rawScore);
          return {
            ...pet,
            shelterName: pet.shelterName || owner?.name || 'Shelter',
            shelterAddress: pet.shelterAddress || owner?.address || null,
            shelterInfoUnavailable: owner === null && !pet.shelterName,
            _match: rawScore,
            _matchPercent: matchPercent,
          };
        });

        setPets(enriched);
        setLoading(false);
        setLoadError('');
      } catch (err) {
        console.error('Failed to process pets snapshot', err);
        if (!active) return;
        setLoadError('Failed to load pets.');
        setPets([]);
        setLoading(false);
      }
    };

    const subscribe = (q, isFallback = false) =>
      onSnapshot(
        q,
        (snapshot) => {
          handleSnapshot(snapshot);
        },
        (error) => {
          console.warn(
            isFallback ? 'Fallback pets subscription failed' : 'Primary pets subscription failed',
            error
          );
          if (!active) return;
          if (isFallback) {
            setLoadError('Failed to load pets.');
            setPets([]);
            setLoading(false);
          } else {
            startFallback();
          }
        }
      );

    function startFallback() {
      unsubscribeFallback?.();
      unsubscribeFallback = subscribe(query(ref, limit(50)), true);
    }

    try {
      unsubscribePrimary = subscribe(query(ref, orderBy('createdAt', 'desc'), limit(50)));
    } catch (err) {
      console.warn('Unable to create ordered pets subscription, using fallback', err);
      startFallback();
    }

    return () => {
      active = false;
      unsubscribePrimary?.();
      unsubscribeFallback?.();
    };
  }, []);

  const hasPreferences = useMemo(() => {
    const prefs = user?.preferences;
    if (!prefs) return false;
    return Object.values(prefs).some((val) => {
      if (Array.isArray(val)) return val.filter(Boolean).length > 0;
      if (typeof val === 'string') return val.trim().length > 0;
      return !!val;
    });
  }, [user?.preferences]);

  // Keep reference to latest preferences for snapshot hydration.
  useEffect(() => {
    const raw = user?.preferences || {};
    prefsRef.current = raw;

    setPets((prev) =>
      prev.map((pet) => {
        const newScore = scoreMatch(pet, raw);
        return { ...pet, _match: newScore, _matchPercent: matchScoreToPercent(newScore) };
      })
    );
  }, [user?.preferences]);

  const filtered = useMemo(() => {
    const base = pets.filter((pet) => {
      const status = pet.status ?? 'active';
      if (status === 'inactive' || status === 'adopted') return false;

      if (selectedType && (pet.animalType || pet.species) !== selectedType) return false;
      if (selectedBreed && (pet.breed || '').toLowerCase() !== selectedBreed.toLowerCase())
        return false;
      if (selectedColor && (pet.color || '').toLowerCase() !== selectedColor.toLowerCase())
        return false;
      if (selectedGender && (pet.gender || '').toLowerCase() !== selectedGender.toLowerCase())
        return false;
      if (selectedSize && (pet.size || '') !== selectedSize) return false;

      if (search.trim().length) {
        const q = search.trim().toLowerCase();
        const hay =
          `${pet.name || ''} ${pet.breed || ''} ${pet.species || ''} ${pet.animalType || ''} ${
            pet.color || ''
          }`.toLowerCase();
        if (!hay.includes(q)) return false;
      }

      if (onlyMatches && user?.role === 'adopter') {
        if ((pet._matchPercent || 0) < 50) return false;
      }
      return true;
    });

    if (sortBy === 'new') {
      return base.slice().sort((a, b) => {
        const aT = a.createdAt?.seconds || 0;
        const bT = b.createdAt?.seconds || 0;
        return bT - aT;
      });
    }
    return base.slice().sort((a, b) => (b._matchPercent || 0) - (a._matchPercent || 0));
  }, [
    pets,
    onlyMatches,
    sortBy,
    search,
    selectedType,
    selectedBreed,
    selectedColor,
    selectedGender,
    selectedSize,
    user?.role,
  ]);

  const onOpen = (id) => nav(`/pets/${id}`);
  const onEdit = (id) => nav(`/pets/${id}/edit`);

  return (
    <div className="auth-container">
      <NavBar variant="app" />
      <main className="auth-content">
        <div className="auth-card pets text-left">
          <div className="row-between wrap mb-16">
            <h1 className="m-0">Available Pets</h1>
            {role === 'shelter' && (
              <button className="auth-button" onClick={() => nav('/shelter/list')}>
                + New Listing
              </button>
            )}
          </div>

          {/* Controls */}
          <div className="filters cluster-12 wrap mb-12">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, breed, or type…"
              className="input min-240"
            />
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="select"
            >
              <option value="">Type: All</option>
              {types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select
              value={selectedBreed}
              onChange={(e) => setSelectedBreed(e.target.value)}
              disabled={!selectedType}
              className="select"
            >
              <option value="">{selectedType ? 'Breed: Any' : 'Breed: Select type first'}</option>
              {breeds.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
            <select
              value={selectedColor}
              onChange={(e) => setSelectedColor(e.target.value)}
              className="select"
            >
              <option value="">Color: Any</option>
              {colors.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              value={selectedGender}
              onChange={(e) => setSelectedGender(e.target.value)}
              className="select"
            >
              <option value="">Gender: Any</option>
              {genders.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            <select
              value={selectedSize}
              onChange={(e) => setSelectedSize(e.target.value)}
              className="select"
            >
              <option value="">Size: Any</option>
              {sizes.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            {user?.role === 'adopter' && (
              <>
                <label className="checkbox-inline">
                  <input
                    type="checkbox"
                    checked={onlyMatches}
                    onChange={(e) => setOnlyMatches(e.target.checked)}
                  />
                  Only show good matches
                </label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="select"
                >
                  <option value="match">Sort: Best Match</option>
                  <option value="new">Sort: Newest</option>
                </select>
              </>
            )}
          </div>

          {loading && <p>Loading pets…</p>}
          {loadError && <p className="text-danger">{loadError}</p>}
          {!loading && !loadError && filtered.length === 0 && <p>No pets match your filters.</p>}

          <div className="stack-14">
            {filtered.map((pet) => (
              <PetSummaryCard
                key={pet.id}
                pet={pet}
                role={role}
                uid={uid}
                onView={role === 'adopter' || role === 'shelter' ? onOpen : undefined}
                onEdit={onEdit}
                rightContent={
                  <div className="pet-card__shelter">
                    <div className="pet-card__shelterLabel">Shelter</div>
                    <strong className="pet-card__shelterName">
                      {pet.shelterName || 'Shelter'}
                    </strong>
                    {pet.shelterAddress && (
                      <div className="pet-card__shelterAddr">{pet.shelterAddress}</div>
                    )}
                    {pet.shelterInfoUnavailable && (
                      <div className="pet-card__shelterUnavailable">
                        Shelter details unavailable.
                      </div>
                    )}
                    {user?.role === 'adopter' && hasPreferences && (
                      <div
                        className={getMatchBadgeClass(pet._matchPercent || 0)}
                        title={describeMatchScore(pet, user?.preferences)}
                      >
                        <span className="pet-card__matchLabel">Match </span>
                        <span className="pet-card__matchValue">{pet._matchPercent || 0}%</span>
                      </div>
                    )}
                  </div>
                }
              />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
