import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { db } from '../firebase/config';
import { doc, setDoc } from 'firebase/firestore';
import NavBar from '../components/NavBar';
import {
  getTypes,
  getBreeds,
  getColors,
  getAges,
  getGenders,
  getSizes,
} from '../services/PetFinder';
import '../styles/PetQuiz.css';

const blankTemplate = {
  animalType: '',
  breed: '',
  size: '',
  temperament: '',
  ageRange: '',
  gender: '',
  color: '',
};

const blankKeys = Object.keys(blankTemplate);

export default function PetQuiz() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(() => ({ ...blankTemplate }));
  const [savedPrefs, setSavedPrefs] = useState(() => ({ ...blankTemplate }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [types, setTypes] = useState([]);
  const [breedOptions, setBreedOptions] = useState([]);
  const [colors, setColors] = useState([]);
  const [ages, setAges] = useState([]);
  const [genders, setGenders] = useState([]);
  const [sizes, setSizes] = useState([]);

  // Load initial data
  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true);
      try {
        const [typesData, colorsData] = await Promise.all([getTypes(), getColors()]);

        setTypes(typesData);
        setColors(colorsData);
        setAges(getAges());
        setGenders(getGenders());
        setSizes(getSizes());
      } catch (error) {
        console.error('Failed to load pet options:', error);
        setError('Failed to load some options. Please refresh the page.');
      } finally {
        setLoading(false);
      }
    };

    loadInitialData();
  }, []);

  // Load breeds when animal type changes
  useEffect(() => {
    if (!form.animalType) {
      setBreedOptions([]);
      return;
    }

    const loadBreeds = async () => {
      try {
        const breeds = await getBreeds(form.animalType);
        setBreedOptions(breeds);
      } catch (error) {
        console.error('Failed to load breeds:', error);
        setBreedOptions(['Mixed Breed']);
      }
    };

    loadBreeds();
  }, [form.animalType]);

  useEffect(() => {
    const base = { ...blankTemplate, ...(user?.preferences || {}) };
    setSavedPrefs(base);
    setForm(base);
    setError('');
  }, [user?.preferences]);

  const hasSavedPrefs = useMemo(
    () => blankKeys.some((key) => (savedPrefs[key] ?? '').toString().trim().length > 0),
    [savedPrefs]
  );

  const hasChanges = useMemo(
    () => blankKeys.some((key) => (form[key] ?? '') !== (savedPrefs[key] ?? '')),
    [form, savedPrefs]
  );

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
      ...(name === 'animalType' ? { breed: '' } : {}),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.animalType || !form.size || !form.temperament || !form.ageRange) {
      setError('Please fill in all required fields.');
      return;
    }

    if (!user?.uid) {
      setError('You must be signed in to save preferences.');
      return;
    }

    try {
      setBusy(true);
      const userDoc = doc(db, 'users', user.uid);
      await setDoc(userDoc, { preferences: form }, { merge: true });
      const snapshot = { ...form };
      setSavedPrefs(snapshot);
      setForm(snapshot);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      console.error('Error saving preferences:', err);
      setError('Failed to save your preferences. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleDiscard = () => {
    if (!hasSavedPrefs) {
      navigate('/dashboard', { replace: true });
      return;
    }
    const confirmDiscard = window.confirm('Discard your changes?');
    if (!confirmDiscard) return;
    setForm({ ...savedPrefs });
    setError('');
    navigate('/dashboard', { replace: true });
  };

  if (loading) {
    return (
      <div className="auth-container">
        <NavBar variant="app" />
        <main className="auth-content">
          <div className="auth-card">
            <h1>Loading Pet Options...</h1>
            <p>Please wait while we fetch the latest pet information.</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <NavBar variant="app" />
      <main className="auth-content">
        <div className="auth-card quiz-container text-left">
          <h1 className="mb-16">{hasSavedPrefs ? 'Pet Preferences' : 'Pet Match Quiz'}</h1>
          <p className="quiz-intro">
            {hasSavedPrefs
              ? 'Update your saved pet preferences anytime.'
              : 'Tell us about your preferred pet to get personalized recommendations!'}
          </p>
          {error && <div className="error-message mb-16">{error}</div>}
          <form className="quiz-form" onSubmit={handleSubmit}>
            <label htmlFor="quiz-animalType">
              Animal Type*:
              <select
                id="quiz-animalType"
                name="animalType"
                value={form.animalType}
                onChange={handleChange}
              >
                <option value="">--Select--</option>
                {types.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>

            <label htmlFor="quiz-breed">
              Breed:
              <select
                id="quiz-breed"
                name="breed"
                value={form.breed}
                onChange={handleChange}
                disabled={!form.animalType}
              >
                <option value="">{form.animalType ? '--Any Breed--' : 'Select type first'}</option>
                {breedOptions.map((breed) => (
                  <option key={breed} value={breed}>
                    {breed}
                  </option>
                ))}
              </select>
            </label>

            <label htmlFor="quiz-size">
              Size*:
              <select id="quiz-size" name="size" value={form.size} onChange={handleChange}>
                <option value="">--Select--</option>
                {sizes.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>

            <label htmlFor="quiz-gender">
              Gender:
              <select id="quiz-gender" name="gender" value={form.gender} onChange={handleChange}>
                <option value="">--Any--</option>
                {genders.map((gender) => (
                  <option key={gender} value={gender}>
                    {gender}
                  </option>
                ))}
              </select>
            </label>

            <label htmlFor="quiz-color">
              Color:
              <select id="quiz-color" name="color" value={form.color} onChange={handleChange}>
                <option value="">--Any--</option>
                {colors.map((color) => (
                  <option key={color} value={color}>
                    {color}
                  </option>
                ))}
              </select>
            </label>

            <label htmlFor="quiz-temperament">
              Temperament*:
              <select
                id="quiz-temperament"
                name="temperament"
                value={form.temperament}
                onChange={handleChange}
              >
                <option value="">--Select--</option>
                <option value="Playful">Playful / Energetic</option>
                <option value="Calm">Calm / Relaxed</option>
                <option value="Friendly">Friendly / Social</option>
                <option value="Protective">Protective / Alert</option>
              </select>
            </label>

            <label htmlFor="quiz-ageRange">
              Age Range*:
              <select
                id="quiz-ageRange"
                name="ageRange"
                value={form.ageRange}
                onChange={handleChange}
              >
                <option value="">--Select--</option>
                {ages.map((age) => (
                  <option key={age} value={age}>
                    {age}
                  </option>
                ))}
              </select>
            </label>

            <div className="quiz-actions">
              {hasSavedPrefs && (
                <button
                  type="button"
                  className="back-button"
                  onClick={() => navigate('/dashboard', { replace: true })}
                >
                  Back to Dashboard
                </button>
              )}
              <button type="button" className="discard-button" onClick={handleDiscard}>
                {hasSavedPrefs ? 'Discard Changes' : 'Cancel'}
              </button>
              <button type="submit" className="submit-button" disabled={busy || !hasChanges}>
                {hasSavedPrefs ? 'Save Changes' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}