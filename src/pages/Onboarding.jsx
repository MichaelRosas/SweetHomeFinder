import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../auth/AuthContext';
import NavBar from '../components/NavBar';
import '../styles/Auth.css';
import '../styles/Onboarding.css';

export default function Onboarding() {
  const nav = useNavigate();
  const { user, checking } = useAuth();
  const [form, setForm] = useState({
    role: '',
    adopterName: '',
    adopterDob: '',
    adopterAddress: '',
    shelterName: '',
    shelterAddress: '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (checking) return;
    if (!user) {
      nav('/signin', { replace: true });
      return;
    }
    if (!user.needsOnboarding && user.role) {
      nav('/dashboard', { replace: true });
    }
  }, [user, checking, nav]);

  const adopterFields = useMemo(
    () => ({
      name: form.adopterName.trim(),
      dob: form.adopterDob.trim(),
      address: form.adopterAddress.trim(),
    }),
    [form.adopterName, form.adopterDob, form.adopterAddress]
  );

  const shelterFields = useMemo(
    () => ({
      companyName: form.shelterName.trim(),
      address: form.shelterAddress.trim(),
    }),
    [form.shelterName, form.shelterAddress]
  );

  const canSubmit = useMemo(() => {
    if (!form.role) return false;
    if (form.role === 'adopter') {
      return !!(adopterFields.name && adopterFields.dob && adopterFields.address);
    }
    if (form.role === 'shelter') {
      return !!(shelterFields.companyName && shelterFields.address);
    }
    return true;
  }, [form.role, adopterFields, shelterFields]);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
    if (error) {
      setError('');
    }
  };

  const validate = () => {
    if (!form.role) return 'Please choose a role.';
    if (form.role === 'adopter') {
      if (!adopterFields.name || !adopterFields.dob || !adopterFields.address) {
        return 'Please complete your name, date of birth, and address.';
      }
    }
    if (form.role === 'shelter') {
      if (!shelterFields.companyName || !shelterFields.address) {
        return 'Please provide your shelter name and address.';
      }
    }
    return '';
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!user?.uid) {
      setError('You must be signed in to continue.');
      return;
    }

    const validation = validate();
    if (validation) {
      setError(validation);
      return;
    }

    try {
      setBusy(true);
      const now = serverTimestamp();
      const payload = {
        email: user.email ?? null,
        role: form.role,
      };

      const shouldSetJoinedOn = user.needsOnboarding || user.joinedOn == null;
      if (shouldSetJoinedOn) {
        payload.joinedOn = now;
      }

      if (form.role === 'adopter') {
        payload.adopterProfile = adopterFields;
      } else if (form.role === 'shelter') {
        payload.shelterProfile = shelterFields;
      }

      await setDoc(
        doc(db, 'users', user.uid),
        {
          ...payload,
        },
        { merge: true }
      );

      nav('/dashboard', { replace: true });
    } catch (err) {
      console.error('Onboarding save failed', err);
      setError('Unable to save your details. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-container">
      <NavBar variant="app" />

      <main className="auth-content">
        <div className="auth-card card--wide">
          <h1>Complete Your Profile</h1>
          <p>Select a role to continue onboarding.</p>

          {error && <div className="error-message">{error}</div>}

          <form className="auth-form" onSubmit={onSubmit}>
            <div className="form-group">
              <label htmlFor="onboarding-role">Role</label>
              <select
                id="onboarding-role"
                name="role"
                value={form.role}
                onChange={onChange}
                required
              >
                <option value="">-- Select Role --</option>
                <option value="adopter">Adopter</option>
                <option value="shelter">Shelter</option>
              </select>
            </div>

            {form.role === 'adopter' && (
              <>
                <div className="form-group">
                  <label htmlFor="adopter-name">Full Name</label>
                  <input
                    id="adopter-name"
                    name="adopterName"
                    value={form.adopterName}
                    onChange={onChange}
                    placeholder="Jane Doe"
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="adopter-dob">Date of Birth</label>
                  <input
                    id="adopter-dob"
                    name="adopterDob"
                    type="date"
                    value={form.adopterDob}
                    onChange={onChange}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="adopter-address">Address</label>
                  <input
                    id="adopter-address"
                    name="adopterAddress"
                    value={form.adopterAddress}
                    onChange={onChange}
                    placeholder="1234 Main St, Springfield"
                    required
                  />
                </div>
              </>
            )}

            {form.role === 'shelter' && (
              <>
                <div className="form-group">
                  <label htmlFor="shelter-name">Shelter / Company Name</label>
                  <input
                    id="shelter-name"
                    name="shelterName"
                    value={form.shelterName}
                    onChange={onChange}
                    placeholder="Happy Tails Rescue"
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="shelter-address">Shelter Address</label>
                  <input
                    id="shelter-address"
                    name="shelterAddress"
                    value={form.shelterAddress}
                    onChange={onChange}
                    placeholder="5678 Oak Ave, Springfield"
                    required
                  />
                </div>
              </>
            )}

            <button className="auth-button" disabled={busy || !canSubmit}>
              {busy ? 'Saving...' : 'Continue to dashboard'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
