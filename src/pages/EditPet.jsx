import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../auth/AuthContext';
import NavBar from '../components/NavBar';
import {
  getTypes,
  getBreeds,
  getColors,
  getAges,
  getGenders,
  getSizes,
} from '../services/PetFinder';
import '../styles/ShelterListPet.css';

const blankPet = {
  name: '',
  animalType: '',
  breed: '',
  size: '',
  gender: '',
  color: '',
  ageRange: '',
  temperament: '',
  description: '',
  photoUrls: [''],
  medicalUrls: [''],
  status: 'active',
};

export default function EditPet() {
  const { id } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();

  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const [types, setTypes] = useState([]);
  const [breedOptions, setBreedOptions] = useState([]);
  const [colors, setColors] = useState([]);
  const [ages, setAges] = useState([]);
  const [genders, setGenders] = useState([]);
  const [sizes, setSizes] = useState([]);

  // Load select options (types, colors, etc.)
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [typesData, colorsData] = await Promise.all([getTypes(), getColors()]);
        setTypes(typesData || []);
        setColors(colorsData || []);
        setAges(getAges() || []);
        setGenders(getGenders() || []);
        setSizes(getSizes() || []);
      } catch (err) {
        console.error('Failed to load pet options:', err);
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
        setColors(['Black', 'White', 'Brown', 'Gray', 'Golden', 'Mixed']);
        setAges(['Baby', 'Young', 'Adult', 'Senior']);
        setGenders(['Male', 'Female']);
        setSizes(['Small', 'Medium', 'Large', 'Extra Large']);
        setError('Some options may be limited. Please try refreshing the page.');
      }
    };

    loadInitialData();
  }, []);

  // Load the existing pet listing
  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    const loadPet = async () => {
      setLoading(true);
      try {
        const snap = await getDoc(doc(db, 'pets', id));
        if (!snap.exists()) {
          if (!cancelled) {
            setError('Listing not found.');
            setForm({ ...blankPet });
          }
          return;
        }
        const data = snap.data();
        if (!cancelled) {
          setForm({
            ...blankPet,
            ...data,
            photoUrls:
              Array.isArray(data.photoUrls) && data.photoUrls.length ? data.photoUrls : [''],
            medicalUrls:
              Array.isArray(data.medicalUrls) && data.medicalUrls.length
                ? data.medicalUrls
                : [''],
          });
        }
      } catch (err) {
        console.error('Failed to load pet:', err);
        if (!cancelled) {
          setError('Failed to load listing. Please try again.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadPet();

    return () => {
      cancelled = true;
    };
  }, [id]);

  // Redirect if not shelter/admin user
  useEffect(() => {
    if (!user) return;
    if (user.role !== 'shelter' && user.role !== 'admin') {
      nav('/dashboard', { replace: true });
    }
  }, [user, nav]);

  // Load breeds when animal type changes
  useEffect(() => {
    if (!form?.animalType) {
      setBreedOptions([]);
      return;
    }

    const loadBreeds = async () => {
      try {
        const breeds = await getBreeds(form.animalType);
        setBreedOptions(breeds || []);
      } catch (err) {
        console.error('Failed to load breeds:', err);
        setBreedOptions(['Mixed Breed']);
      }
    };

    loadBreeds();
  }, [form?.animalType]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
      ...(name === 'animalType' ? { breed: '' } : {}),
    }));
    if (error) setError('');
    if (message) setMessage('');
  };

  const handleMediaChange = (index, value) => {
    setForm((prev) => {
      const next = Array.isArray(prev.photoUrls) ? [...prev.photoUrls] : [];
      next[index] = value;
      return { ...prev, photoUrls: next };
    });
  };

  const addMediaField = () => {
    setForm((prev) => ({
      ...prev,
      photoUrls: [...(Array.isArray(prev.photoUrls) ? prev.photoUrls : []), ''],
    }));
  };

  const removeMediaField = (index) => {
    setForm((prev) => {
      const next = Array.isArray(prev.photoUrls) ? [...prev.photoUrls] : [];
      if (next.length > 1) {
        next.splice(index, 1);
      }
      return { ...prev, photoUrls: next };
    });
  };

  const handleMedicalChange = (index, value) => {
    setForm((prev) => {
      const next = Array.isArray(prev.medicalUrls) ? [...prev.medicalUrls] : [];
      next[index] = value;
      return { ...prev, medicalUrls: next };
    });
  };

  const addMedicalField = () => {
    setForm((prev) => ({
      ...prev,
      medicalUrls: [...(Array.isArray(prev.medicalUrls) ? prev.medicalUrls : []), ''],
    }));
  };

  const removeMedicalField = (index) => {
    setForm((prev) => {
      const next = Array.isArray(prev.medicalUrls) ? [...prev.medicalUrls] : [];
      if (next.length > 1) {
        next.splice(index, 1);
      }
      return { ...prev, medicalUrls: next };
    });
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form) return;
    setError('');
    setMessage('');

    const required = ['name', 'animalType', 'size', 'gender', 'ageRange', 'temperament'];
    const missing = required.filter((field) => {
      const value = form[field];
      return !value || (typeof value === 'string' && !value.trim());
    });

    if (missing.length) {
      setError(`Please fill in: ${missing.join(', ')}`);
      return;
    }

    if (!user?.uid) {
      setError('You must be signed in to update a listing.');
      return;
    }

    try {
      setBusy(true);
      const mediaList = (Array.isArray(form.photoUrls) ? form.photoUrls : [])
        .map((url) => (url || '').trim())
        .filter(Boolean);
      const medicalList = (Array.isArray(form.medicalUrls) ? form.medicalUrls : [])
        .map((url) => (url || '').trim())
        .filter(Boolean);

      const update = {
        name: form.name,
        animalType: form.animalType,
        breed: form.breed || '',
        size: form.size,
        gender: form.gender,
        color: form.color || '',
        ageRange: form.ageRange,
        temperament: form.temperament,
        description: form.description || '',
        photoUrls: mediaList,
        medicalUrls: medicalList,
        status: form.status || 'active',
        updatedAt: serverTimestamp(),
      };

      await updateDoc(doc(db, 'pets', id), update);
      setMessage('Listing updated.');
      // Navigate back to the pet detail page after successful save
      setTimeout(() => {
        nav(`/pets/${id}`);
      }, 500);
    } catch (err) {
      console.error('Error updating pet listing:', err);
      setError('Failed to update listing. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    if (!window.confirm('Delete this listing? This cannot be undone.')) return;
    setError('');
    setMessage('');
    try {
      setBusy(true);
      await deleteDoc(doc(db, 'pets', id));
      nav('/pets');
    } catch (err) {
      console.error('Failed to delete listing:', err);
      setError('Failed to delete listing. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (!user) {
    return (
      <div className="auth-container">
        <NavBar variant="app" />
        <main className="auth-content">
          <div className="auth-card">
            <p>Please sign in to continue.</p>
          </div>
        </main>
      </div>
    );
  }

  if (loading || !form) {
    return (
      <div className="auth-container">
        <NavBar variant="app" />
        <main className="auth-content">
          <div className="auth-card">
            <h1>Loading...</h1>
            <p>Loading listing...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <NavBar variant="app" />
      <main className="auth-content">
        <div className="auth-card shelter-list-pet text-left">
          <h1 className="mb-16">Edit Pet Listing</h1>

          {error && <div className="error-message mb-16">{error}</div>}
          {message && <div className="success-message mb-16">{message}</div>}

          <form className="pet-form" onSubmit={onSubmit}>
            <div className="form-row">
              <label htmlFor="pet-name">
                Pet Name*:
                <input
                  id="pet-name"
                  type="text"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="Enter pet's name"
                />
              </label>
            </div>

            <div className="form-row">
              <label htmlFor="pet-animalType">
                Animal Type*:
                <select
                  id="pet-animalType"
                  name="animalType"
                  value={form.animalType}
                  onChange={handleChange}
                >
                  <option value="">--Select--</option>
                  {Array.isArray(types) &&
                    types.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                </select>
              </label>

              <label htmlFor="pet-breed">
                Breed:
                <select
                  id="pet-breed"
                  name="breed"
                  value={form.breed}
                  onChange={handleChange}
                  disabled={!form.animalType}
                >
                  <option value="">
                    {form.animalType ? '--Any Breed--' : 'Select type first'}
                  </option>
                  {Array.isArray(breedOptions) &&
                    breedOptions.map((breed) => (
                      <option key={breed} value={breed}>
                        {breed}
                      </option>
                    ))}
                </select>
              </label>
            </div>

            <div className="form-row">
              <label htmlFor="pet-size">
                Size*:
                <select id="pet-size" name="size" value={form.size} onChange={handleChange}>
                  <option value="">--Select--</option>
                  {Array.isArray(sizes) &&
                    sizes.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                </select>
              </label>

              <label htmlFor="pet-gender">
                Gender*:
                <select id="pet-gender" name="gender" value={form.gender} onChange={handleChange}>
                  <option value="">--Select--</option>
                  {Array.isArray(genders) &&
                    genders.map((gender) => (
                      <option key={gender} value={gender}>
                        {gender}
                      </option>
                    ))}
                </select>
              </label>
            </div>

            <div className="form-row">
              <label htmlFor="pet-color">
                Color:
                <select id="pet-color" name="color" value={form.color} onChange={handleChange}>
                  <option value="">--Select--</option>
                  {Array.isArray(colors) &&
                    colors.map((color) => (
                      <option key={color} value={color}>
                        {color}
                      </option>
                    ))}
                </select>
              </label>

              <label htmlFor="pet-ageRange">
                Age Range*:
                <select
                  id="pet-ageRange"
                  name="ageRange"
                  value={form.ageRange}
                  onChange={handleChange}
                >
                  <option value="">--Select--</option>
                  {Array.isArray(ages) &&
                    ages.map((age) => (
                      <option key={age} value={age}>
                        {age}
                      </option>
                    ))}
                </select>
              </label>
            </div>

            <div className="form-row">
              <label htmlFor="pet-temperament">
                Temperament*:
                <select
                  id="pet-temperament"
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
            </div>

            <div className="form-row single-column">
              <label className="media-label">
                <span className="field-label">Media URL(s):</span>
                <div className="media-url-list">
                  {(form.photoUrls || ['']).map((url, idx) => (
                    <div key={idx} className="media-url-row">
                      <input
                        type="url"
                        name={`photoUrls-${idx}`}
                        value={url}
                        onChange={(e) => handleMediaChange(idx, e.target.value)}
                        placeholder="https://example.com/pet-photo.jpg"
                      />
                      {(form.photoUrls || []).length > 1 && (
                        <button
                          type="button"
                          className="auth-button auth-button--danger media-remove-button"
                          onClick={() => removeMediaField(idx)}
                          title="Remove this URL"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="auth-button auth-button--secondary media-add-button"
                  onClick={addMediaField}
                >
                  + Add another
                </button>
              </label>
            </div>

            <div className="form-row single-column">
              <label className="media-label">
                <span className="field-label">Medical Records URL(s):</span>
                <div className="media-url-list">
                  {(form.medicalUrls || ['']).map((url, idx) => (
                    <div key={idx} className="media-url-row">
                      <input
                        type="url"
                        name={`medicalUrls-${idx}`}
                        value={url}
                        onChange={(e) => handleMedicalChange(idx, e.target.value)}
                        placeholder="https://example.com/medical-record.pdf"
                      />
                      {(form.medicalUrls || []).length > 1 && (
                        <button
                          type="button"
                          className="auth-button auth-button--danger media-remove-button"
                          onClick={() => removeMedicalField(idx)}
                          title="Remove this URL"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="auth-button auth-button--secondary media-add-button"
                  onClick={addMedicalField}
                >
                  + Add another
                </button>
              </label>
            </div>

            <div className="form-row">
              <label htmlFor="pet-description">
                Description:
                <textarea
                  id="pet-description"
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  rows={4}
                  placeholder="Tell us about this pet's personality, special needs, or other important information..."
                />
              </label>
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="auth-button auth-button--secondary"
                onClick={() => nav(-1)}
              >
                Cancel
              </button>
              <button type="submit" className="auth-button" disabled={busy}>
                {busy ? 'Saving...' : 'Save changes'}
              </button>
              <button
                type="button"
                className="auth-button auth-button--danger"
                onClick={onDelete}
                disabled={busy}
              >
                Delete listing
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
