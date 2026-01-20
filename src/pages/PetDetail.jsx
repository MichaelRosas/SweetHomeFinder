import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { db } from '../firebase/config';
import {
  doc,
  getDoc,
  collection,
  addDoc,
  serverTimestamp,
  setDoc,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import { useAuth } from '../auth/AuthContext';
import { threadIdFor } from '../utils/Threads';
import NavBar from '../components/NavBar';
import '../styles/PetDetail.css';

function buildMediaList(pet) {
  const array = Array.isArray(pet?.photoUrls) ? pet.photoUrls.filter(Boolean) : [];
  return array;
}

function buildMedicalList(pet) {
  const array = Array.isArray(pet?.medicalUrls) ? pet.medicalUrls.filter(Boolean) : [];
  return array;
}

export default function PetDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();

  const [pet, setPet] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [existingApp, setExistingApp] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load pet details
  useEffect(() => {
    let alive = true;

    (async () => {
      setErr('');
      setLoading(true);
      try {
        const snap = await getDoc(doc(db, 'pets', id));
        if (!alive) return;

        if (snap.exists()) {
          setPet({ id: snap.id, ...snap.data() });
        } else {
          setPet(null);
          setErr('Listing not found.');
        }
      } catch (e) {
        console.error('Failed to load pet listing:', e);
        if (!alive) return;
        setPet(null);
        setErr('Could not load listing. Please try again later.');
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [id]);

  // Check if user already has an application for this pet
  useEffect(() => {
    if (!user?.uid || !id) return;

    (async () => {
      try {
        const qApps = query(
          collection(db, 'applications'),
          where('petId', '==', id),
          where('applicantId', '==', user.uid)
        );
        const snap = await getDocs(qApps);
        setExistingApp(snap.docs.length ? { id: snap.docs[0].id, ...snap.docs[0].data() } : null);
      } catch (e) {
        console.error('Failed to load existing application:', e);
        setExistingApp(null);
      }
    })();
  }, [user?.uid, id]);

  const role = user?.role || 'adopter';
  const canApply =
    user && role === 'adopter' && pet && (pet.status ?? 'active') === 'active' && !existingApp;

  const canEdit = user && (role === 'admin' || (role === 'shelter' && pet?.shelterId === user.uid));
  const statusLabel = (pet?.status || 'active').toLowerCase();

  const threadId =
    user && pet
      ? threadIdFor({
          petId: id,
          adopterId: user.uid,
          shelterId: pet?.shelterId || 'unknown',
        })
      : null;

  const handleApply = async () => {
    if (!user || !pet) return;
    setErr('');
    setBusy(true);
    try {
      // check again (idempotent)
      const qApps = query(
        collection(db, 'applications'),
        where('petId', '==', id),
        where('applicantId', '==', user.uid)
      );
      const snap = await getDocs(qApps);
      if (!snap.empty) {
        nav('/applications');
        return;
      }

      const adopterName =
        user?.adopterProfile?.name || user?.displayName || user?.email || 'Adopter';
      const shelterName =
        pet?.shelterName || pet?.shelterProfile?.companyName || pet?.shelterCompany || 'Shelter';

      // create application
      await addDoc(collection(db, 'applications'), {
        petId: id,
        petName: pet?.name || null,
        shelterId: pet?.shelterId || null,
        shelterName,
        applicantId: user.uid,
        applicantEmail: user.email,
        applicantName: adopterName,
        status: 'submitted',
        createdAt: serverTimestamp(),
      });

      // ensure thread exists
      if (threadId) {
        const threadPayload = {
          id: threadId,
          petId: id,
          petName: pet?.name || null,
          adopterId: user.uid,
          shelterId: pet?.shelterId || null,
          lastMessageAt: serverTimestamp(),
          lastMessage: 'Started conversation',
          lastSenderId: user.uid,
        };
        if (adopterName) threadPayload.adopterName = adopterName;
        if (shelterName) threadPayload.shelterName = shelterName;

        await setDoc(doc(db, 'threads', threadId), threadPayload, { merge: true });
      }

      nav('/applications');
    } catch (e) {
      console.error('Failed to submit application', e);
      setErr('Could not submit application. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="auth-container">
        <NavBar variant="app" />
        <main className="auth-content">
          <div className="auth-card">Loading…</div>
        </main>
      </div>
    );
  }

  if (!pet) {
    return (
      <div className="auth-container">
        <NavBar variant="app" />
        <main className="auth-content">
          <div className="auth-card">
            <h1>Listing unavailable</h1>
            <p>{err || 'This listing could not be found.'}</p>
          </div>
        </main>
      </div>
    );
  }

  const inactive = (pet.status ?? 'active') !== 'active';
  const media = buildMediaList(pet);
  const medicalRecords = buildMedicalList(pet);

  return (
    <div className="auth-container">
      <NavBar variant="app" />
      <main className="auth-content">
        <div className="auth-card pet-detail text-left">
          {/* Info Section at Top */}
          <div className="pet-detail__info">
            <h1 className="mb-4">{pet.name}</h1>

            <div className="muted mb-8">
              {pet.animalType || pet.species || 'Animal'} · {pet.breed || 'Breed'} ·{' '}
              {pet.size || 'Size'} · {pet.gender || 'Gender'} · {pet.color || 'Color'} ·{' '}
              {pet.ageRange || pet.age || 'Age'}
            </div>

            <div className="muted mb-8">Temperament: {pet.temperament || 'Not specified'}</div>

            <div className="mb-12">{pet.description || 'No description provided.'}</div>

            <div className="pet-detail__actions">
              <div className="pet-detail__actionsPrimary">
                {canEdit && (
                  <button className="auth-button" onClick={() => nav(`/pets/${id}/edit`)}>
                    Edit Listing
                  </button>
                )}
                {canApply && !inactive && (
                  <button className="auth-button" onClick={handleApply} disabled={busy}>
                    {busy ? 'Submitting…' : 'Apply to Adopt'}
                  </button>
                )}
                {!canApply && existingApp && threadId && (
                  <>
                    <button
                      className="auth-button"
                      onClick={() => nav(`/chat?thread=${encodeURIComponent(threadId)}`)}
                    >
                      Open chat
                    </button>
                    <Link className="auth-button auth-button--secondary" to="/applications">
                      View application
                    </Link>
                  </>
                )}
              </div>

              <div className="pet-detail__status">
                {statusLabel === 'adopted' && (
                  <span className="text-danger">This pet has been adopted.</span>
                )}
                {statusLabel === 'inactive' && (
                  <span className="text-danger">This listing is not active.</span>
                )}
                {err && <span className="text-danger">{err}</span>}
              </div>
            </div>
          </div>

          {/* Images Section */}
          <div className="pet-detail__section">
            <h2 className="pet-detail__sectionTitle">Photos</h2>
            <div className="pet-detail__scrollContainer">
              {media.length ? (
                media.map((url, idx) => (
                  <img
                    key={url + idx}
                    className="pet-detail__scrollImage"
                    src={url}
                    alt={pet.name ? `${pet.name} ${idx + 1}` : `Pet ${idx + 1}`}
                  />
                ))
              ) : (
                <img
                  className="pet-detail__scrollImage"
                  src="/pet-placeholder.png"
                  alt="Pet placeholder"
                />
              )}
            </div>
          </div>

          {/* Medical Records Section */}
          {medicalRecords.length > 0 && (
            <div className="pet-detail__section">
              <h2 className="pet-detail__sectionTitle">Medical Records</h2>
              <div className="pet-detail__scrollContainer">
                {medicalRecords.map((url, idx) => (
                  <a
                    key={url + idx}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="pet-detail__medicalLink"
                  >
                    <div className="pet-detail__medicalCard">
                      <svg
                        className="pet-detail__medicalIcon"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                      <span className="pet-detail__medicalText">Record {idx + 1}</span>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
