import { useEffect, useState } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  setDoc,
  serverTimestamp,
  getDoc,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../auth/AuthContext';
import { threadIdFor } from '../utils/Threads';
import { Link, useNavigate } from 'react-router-dom';
import NavBar from '../components/NavBar';
import PetSummaryCard from '../components/PetSummaryCard';
import '../styles/Applications.css';

export default function Applications() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [pets, setPets] = useState({});
  const nav = useNavigate();

  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, 'applications'),
      where('applicantId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const off = onSnapshot(q, (snap) => setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return () => off();
  }, [user?.uid]);

  useEffect(() => {
    const loadPets = async () => {
      const ids = Array.from(new Set(rows.map((r) => r.petId).filter(Boolean)));
      if (!ids.length) {
        setPets({});
        return;
      }

      const entries = await Promise.all(
        ids.map(async (pid) => {
          try {
            const snap = await getDoc(doc(db, 'pets', pid));
            return [pid, snap.exists() ? { id: pid, ...snap.data() } : null];
          } catch {
            return [pid, null];
          }
        })
      );

      const map = {};
      entries.forEach(([pid, data]) => {
        if (data) map[pid] = data;
      });
      setPets(map);
    };

    loadPets();
  }, [rows]);

  const ensureThreadThenOpen = async (app) => {
    const tid = threadIdFor({
      petId: app.petId,
      adopterId: app.applicantId,
      shelterId: app.shelterId,
    });
    const adopterName =
      user?.adopterProfile?.name ||
      user?.displayName ||
      app.applicantName ||
      user?.email ||
      'Adopter';
    const shelterName = app.shelterName || 'Shelter';

    const payload = {
      id: tid,
      petId: app.petId,
      petName: app.petName || null,
      adopterId: app.applicantId,
      shelterId: app.shelterId,
      lastMessageAt: serverTimestamp(),
      lastMessage: 'Conversation started',
      lastSenderId: user.uid,
    };
    if (adopterName) payload.adopterName = adopterName;
    if (shelterName) payload.shelterName = shelterName;

    await setDoc(doc(db, 'threads', tid), payload, { merge: true });
    nav(`/chat?thread=${encodeURIComponent(tid)}`);
  };

  return (
    <div className="auth-container">
      <NavBar variant="app" />
      <main className="auth-content">
        <div className="auth-card applications text-left">
          <h1 className="mb-12">My Applications</h1>
          {rows.length === 0 && <p>No applications yet.</p>}
          <div className="stack-12">
            {rows.map((r) => {
              const pet = pets[r.petId] || {};
              const appliedOn = r.createdAt?.seconds
                ? new Date(r.createdAt.seconds * 1000).toLocaleString()
                : '—';
              const displayPet = {
                id: r.petId,
                name: pet.name || r.petName || 'Pet',
                animalType: pet.animalType || pet.species,
                species: pet.species,
                breed: pet.breed,
                size: pet.size,
                gender: pet.gender,
                color: pet.color,
                ageRange: pet.ageRange || pet.age,
                temperament: pet.temperament,
                photoUrls: pet.photoUrls || [],
                shelterId: pet.shelterId,
              };

              return (
                <div key={r.id} className="card">
                  <PetSummaryCard
                    pet={displayPet}
                    role={user?.role || 'adopter'}
                    uid={user?.uid}
                    onView={() => nav(`/pets/${r.petId}`)}
                    rightContent={
                      <div className="application-card__meta">
                        <span className={`chip chip--${r.status || 'submitted'}`}>
                          {r.status || 'submitted'}
                        </span>
                        <span className="muted fs-12">Applied: {appliedOn}</span>
                        <div className="cluster-8 wrap mt-6">
                          <button className="auth-button" onClick={() => ensureThreadThenOpen(r)}>
                            Message Shelter
                          </button>
                        </div>
                      </div>
                    }
                  />
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
