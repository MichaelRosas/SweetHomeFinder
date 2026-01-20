import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  getDoc,
  getDocs,
  serverTimestamp,
  addDoc,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../auth/AuthContext';
import { threadIdFor } from '../utils/Threads';
import { scoreMatch, describeMatchScore, matchScoreToPercent } from '../utils/match';
import NavBar from '../components/NavBar';
import { useNavigate } from 'react-router-dom';
import '../styles/ShelterApplications.css';

async function sendSystemMessage({
  petId,
  adopterId,
  shelterId,
  petName,
  adopterName,
  shelterName,
  text,
  adoptionClosed = false,
  adoptionReopened = false,
}) {
  const tid = threadIdFor({ petId, adopterId, shelterId });
  const basePayload = {
    id: tid,
    petId,
    petName: petName || null,
    adopterId,
    shelterId,
  };
  if (adopterName) basePayload.adopterName = adopterName;
  if (shelterName) basePayload.shelterName = shelterName;
  if (adoptionClosed) {
    basePayload.adoptionClosed = true;
    basePayload.adoptionClosedAt = serverTimestamp();
  }
  if (adoptionReopened) {
    basePayload.adoptionClosed = false;
    basePayload.adoptionReopenedAt = serverTimestamp();
  }

  await setDoc(doc(db, 'threads', tid), basePayload, { merge: true });
  try {
    await addDoc(collection(db, 'threads', tid, 'messages'), {
      text,
      senderId: 'system',
      createdAt: serverTimestamp(),
    });
    await updateDoc(doc(db, 'threads', tid), {
      lastMessage: text,
      lastMessageAt: serverTimestamp(),
      lastSenderId: 'system',
    });
  } catch {
    // messaging is best-effort
  }
}

export default function ShelterApplications() {
  const { user } = useAuth();
  const [applications, setApplications] = useState([]);
  const [pets, setPets] = useState({});
  const [applicantData, setApplicantData] = useState({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const nav = useNavigate();
  const shelterName =
    user?.shelterProfile?.companyName || user?.displayName || user?.email || 'Shelter';

  // Fetch applications in real-time
  useEffect(() => {
    if (!user?.uid) return;

    const isAdmin = user?.role === 'admin';
    let q;

    if (isAdmin) {
      // Admins see ALL applications from all shelters
      console.log('[ShelterApplications] Admin fetching ALL applications');
      q = query(collection(db, 'applications'), orderBy('createdAt', 'desc'));
    } else {
      // Shelters see only applications to their own pets
      console.log('[ShelterApplications] Shelter fetching own applications');
      q = query(
        collection(db, 'applications'),
        where('shelterId', '==', user.uid),
        orderBy('createdAt', 'desc')
      );
    }

    const off = onSnapshot(
      q,
      (snap) => {
        const apps = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        console.log('[ShelterApplications] Fetched', apps.length, 'applications');
        setApplications(apps);
      },
      (error) => {
        console.error('[ShelterApplications] Error fetching applications:', error);
        // Fallback to query without orderBy if index is missing
        if (isAdmin) {
          q = query(collection(db, 'applications'));
        } else {
          q = query(collection(db, 'applications'), where('shelterId', '==', user.uid));
        }
        const fallbackOff = onSnapshot(q, (snap) => {
          const apps = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          console.log('[ShelterApplications] Fallback fetched', apps.length, 'applications');
          setApplications(apps);
        });
        return fallbackOff;
      }
    );
    return () => off();
  }, [user?.uid, user?.role]);

  // Fetch pet details and applicant preferences when applications change
  useEffect(() => {
    if (applications.length === 0) {
      setLoading(false);
      return;
    }

    async function fetchData() {
      setLoading(true);
      try {
        // Get unique pet IDs and applicant IDs
        const petIds = [...new Set(applications.map((app) => app.petId))];
        const applicantIds = [...new Set(applications.map((app) => app.applicantId))];

        // Fetch all pets in parallel
        const petPromises = petIds.map(async (petId) => {
          try {
            const petDoc = await getDoc(doc(db, 'pets', petId));
            return { id: petId, data: petDoc.exists() ? petDoc.data() : null };
          } catch (error) {
            console.error(`Error fetching pet ${petId}:`, error);
            return { id: petId, data: null };
          }
        });
        const petResults = await Promise.all(petPromises);
        const petsMap = {};
        petResults.forEach((result) => {
          if (result.data) {
            petsMap[result.id] = result.data;
          }
        });
        setPets(petsMap);

        // Fetch all applicant preferences in parallel
        const applicantPromises = applicantIds.map(async (applicantId) => {
          try {
            const userDoc = await getDoc(doc(db, 'users', applicantId));
            if (userDoc.exists()) {
              const userData = userDoc.data();
              return {
                id: applicantId,
                preferences: userData.preferences || null,
                name:
                  userData.adopterProfile?.name ||
                  userData.displayName ||
                  userData.email ||
                  'Unknown',
              };
            }
            return { id: applicantId, preferences: null, name: 'Unknown' };
          } catch (error) {
            console.error(`Error fetching applicant ${applicantId}:`, error);
            return { id: applicantId, preferences: null, name: 'Unknown' };
          }
        });
        const applicantResults = await Promise.all(applicantPromises);
        const applicantMap = {};
        applicantResults.forEach((result) => {
          applicantMap[result.id] = {
            preferences: result.preferences,
            name: result.name,
          };
        });
        setApplicantData(applicantMap);
      } catch (error) {
        console.error('Error fetching data:', error);
        setErr('Failed to load applications. Please refresh the page.');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [applications]);

  // Group and score applications
  const groupedApplications = useMemo(() => {
    if (!applications.length || !Object.keys(pets).length)
      return { activeGroups: [], previousGroups: [] };

    // Group by petId
    const groups = {};
    applications.forEach((app) => {
      if (!groups[app.petId]) {
        groups[app.petId] = [];
      }

      // Calculate match score
      const pet = pets[app.petId];
      const applicant = applicantData[app.applicantId];
      const matchScore = pet && applicant?.preferences ? scoreMatch(pet, applicant.preferences) : 0;
      const matchPercent = matchScoreToPercent(matchScore);

      groups[app.petId].push({
        ...app,
        matchScore,
        matchPercent,
        applicantName: applicant?.name || app.applicantName || app.applicantEmail || 'Unknown',
        hasPreferences: !!applicant?.preferences,
        applicantPrefs: applicant?.preferences || null,
      });
    });

    const groupArray = Object.entries(groups).map(([petId, apps]) => {
      const pet = pets[petId];
      return {
        petId,
        petName: pet?.name || 'Unknown Pet',
        pet,
        applications: apps.sort((a, b) => b.matchPercent - a.matchPercent), // Highest score first
      };
    });

    const activeGroups = groupArray
      .map((group) => ({
        ...group,
        applications: group.applications.filter((app) => app.status === 'submitted'),
      }))
      .filter((group) => group.applications.length > 0)
      .sort((a, b) => b.applications.length - a.applications.length);

    const previousGroups = groupArray
      .map((group) => ({
        ...group,
        applications: group.applications.filter((app) => app.status !== 'submitted'),
      }))
      .filter((group) => group.applications.length > 0)
      .sort((a, b) => {
        const aDate =
          Math.max(
            ...a.applications.map((app) => app.createdAt?.seconds || 0),
            a.pet?.updatedAt?.seconds || 0
          ) || 0;
        const bDate =
          Math.max(
            ...b.applications.map((app) => app.createdAt?.seconds || 0),
            b.pet?.updatedAt?.seconds || 0
          ) || 0;
        return bDate - aDate;
      });

    return { activeGroups, previousGroups };
  }, [applications, pets, applicantData]);

  const messageAdopter = async (app) => {
    const tid = threadIdFor({
      petId: app.petId,
      adopterId: app.applicantId,
      shelterId: app.shelterId,
    });
    const adopterName = app.applicantName || app.applicantEmail || 'Adopter';

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

  const setStatus = async (id, status) => {
    setErr('');
    try {
      const appRef = doc(db, 'applications', id);
      await updateDoc(appRef, { status });
      const appSnap = await getDoc(appRef);
      const app = appSnap.exists() ? { id: appSnap.id, ...appSnap.data() } : null;

      if (status === 'approved' && app?.petId) {
        await updateDoc(doc(db, 'pets', app.petId), { status: 'adopted' });

        // Notify approved adopter
        await sendSystemMessage({
          petId: app.petId,
          adopterId: app.applicantId,
          shelterId: app.shelterId,
          petName: app.petName,
          adopterName: app.applicantName || app.applicantEmail || 'Adopter',
          shelterName,
          text: `System: Your application for ${app.petName || 'this pet'} was approved!`,
        });
      }

      if (status === 'rejected' && app?.petId) {
        await sendSystemMessage({
          petId: app.petId,
          adopterId: app.applicantId,
          shelterId: app.shelterId,
          petName: app.petName,
          adopterName: app.applicantName || app.applicantEmail || 'Adopter',
          shelterName,
          text: `System: Your application for ${app.petName || 'this pet'} was not approved.`,
        });
      }
    } catch (error) {
      console.error('Failed to update application status', error);
      setErr('Failed to update application. Please try again.');
    }
  };

  const reopenRejected = async (app) => {
    setErr('');
    if (!app?.id) return;
    try {
      await updateDoc(doc(db, 'applications', app.id), { status: 'submitted' });
      await sendSystemMessage({
        petId: app.petId,
        adopterId: app.applicantId,
        shelterId: app.shelterId,
        petName: app.petName,
        adopterName: app.applicantName || app.applicantEmail || 'Adopter',
        shelterName,
        text: `System: Your application for ${app.petName || 'this pet'} has been reopened for consideration.`,
      });
    } catch (error) {
      console.error('Failed to reopen application', error);
      setErr('Failed to reopen application. Please try again.');
    }
  };

  const revokeApproval = async (app) => {
    setErr('');
    if (!app?.petId) {
      setErr('Missing pet information for this application.');
      return;
    }

    try {
      await updateDoc(doc(db, 'pets', app.petId), { status: 'active' });
      await updateDoc(doc(db, 'applications', app.id), { status: 'submitted' });

      await sendSystemMessage({
        petId: app.petId,
        adopterId: app.applicantId,
        shelterId: app.shelterId,
        petName: app.petName,
        adopterName: app.applicantName || app.applicantEmail || 'Adopter',
        shelterName,
        text: `System: The previous approval for ${app.petName || 'this pet'} was revoked. The listing is open again.`,
        adoptionReopened: true,
      });
    } catch (error) {
      console.error('Failed to revoke approval', error);
      setErr('Failed to revoke approval. Please try again.');
    }
  };

  const getMatchBadge = (score, hasPreferences) => {
    if (!hasPreferences) {
      return { className: 'match-badge match-badge--no-prefs', label: 'No Preferences' };
    }
    if (score >= 80) {
      return { className: 'match-badge match-badge--excellent', label: `${score}% Match` };
    }
    if (score >= 50) {
      return { className: 'match-badge match-badge--good', label: `${score}% Match` };
    }
    if (score > 0) {
      return { className: 'match-badge match-badge--fair', label: `${score}% Match` };
    }
    return { className: 'match-badge match-badge--poor', label: '0% Match' };
  };

  if (loading) {
    return (
      <div className="auth-container">
        <NavBar variant="app" />
        <main className="auth-content">
          <div className="auth-card shelter-apps text-left">
            <h1 className="mb-12">Incoming Applications</h1>
            <p className="muted">Loading applications...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <NavBar variant="app" />
      <main className="auth-content">
        <div className="auth-card shelter-apps text-left">
          <h1 className="mb-12">
            {user?.role === 'admin' ? 'All Applications' : 'Incoming Applications'}
          </h1>

          {err && <div className="alert alert--error mb-12">{err}</div>}

          {groupedApplications.activeGroups.length === 0 &&
          groupedApplications.previousGroups.length === 0 ? (
            <div className="empty-state">
              <p className="muted">No applications yet.</p>
              <p className="fs-14 muted">
                {user?.role === 'admin'
                  ? 'All applications from adopters to any shelter will appear here. Check the browser console (F12) for debugging information.'
                  : 'Applications will appear here when adopters apply to your pet listings.'}
              </p>
            </div>
          ) : (
            <div className="application-groups">
              {groupedApplications.activeGroups.length > 0 && (
                <>
                  <h2 className="section__title">Active Applications</h2>
                  {groupedApplications.activeGroups.map((group) => {
                    const pendingCount = group.applications.length;

                    return (
                      <div key={group.petId} className="pet-group">
                        {/* Pet Header */}
                        <div className="pet-group-header">
                          <div className="pet-group-info">
                            <h3 className="pet-group-title">{group.petName}</h3>
                            {group.pet && (
                              <p className="pet-group-details muted fs-14">
                                {group.pet.animalType} • {group.pet.breed || 'Mixed'} •{' '}
                                {group.pet.size} • {group.pet.temperament} • {group.pet.ageRange}
                              </p>
                            )}
                          </div>
                          <div className="pet-group-badge">
                            {pendingCount > 0 && (
                              <span className="pending-badge">{pendingCount} Pending</span>
                            )}
                            <span className="total-badge">{group.applications.length} Total</span>
                          </div>
                        </div>

                        {/* Applications List */}
                        <div className="applications-list">
                          {group.applications.map((app) => {
                            const matchBadge = getMatchBadge(app.matchPercent, app.hasPreferences);
                            const tooltip = describeMatchScore(group.pet, app.applicantPrefs);

                            return (
                              <div key={app.id} className="application-card">
                                {/* Applicant Info */}
                                <div className="application-header">
                                  <div className="application-info">
                                    <div className="applicant-name">
                                      {app.applicantName}
                                      <span className={matchBadge.className} title={tooltip}>
                                        {matchBadge.label}
                                      </span>
                                    </div>
                                    <div className="application-meta muted fs-13">
                                      {app.applicantEmail && app.applicantName
                                        ? `${app.applicantEmail} • `
                                        : ''}
                                      Applied:{' '}
                                      {app.createdAt?.seconds
                                        ? new Date(
                                            app.createdAt.seconds * 1000
                                          ).toLocaleDateString()
                                        : '—'}{' '}
                                      • Status:{' '}
                                      <span className={`status-${app.status}`}>{app.status}</span>
                                    </div>
                                    {!app.hasPreferences && (
                                      <div className="warning-message fs-13">
                                        ⚠️ Applicant hasn&apos;t set preferences yet
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Actions */}
                                <div className="application-actions">
                                  {app.status === 'submitted' && (
                                  <>
                                    <button
                                      className="auth-button auth-button--success auth-button--small"
                                      onClick={() => setStatus(app.id, 'approved')}
                                    >
                                      <span>✓</span>
                                      <span>Approve</span>
                                    </button>
                                    <button
                                      className="auth-button auth-button--danger auth-button--small"
                                      onClick={() => setStatus(app.id, 'rejected')}
                                    >
                                      <span>✗</span>
                                      <span>Reject</span>
                                    </button>
                                  </>
                                )}
                                  <button
                                    className="auth-button auth-button--secondary auth-button--small"
                                    onClick={() => messageAdopter(app)}
                                  >
                                    💬 Message
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}

              {groupedApplications.previousGroups.length > 0 && (
                <>
                  <h2 className="section__title mt-16">Previous Applications</h2>
                  {groupedApplications.previousGroups.map((group) => (
                    <div key={`${group.petId}-previous`} className="pet-group">
                      <div className="pet-group-header">
                        <div className="pet-group-info">
                          <h3 className="pet-group-title">{group.petName}</h3>
                          {group.pet && (
                            <p className="pet-group-details muted fs-14">
                              {group.pet.animalType} • {group.pet.breed || 'Mixed'} •{' '}
                              {group.pet.size} • {group.pet.temperament} • {group.pet.ageRange}
                            </p>
                          )}
                        </div>
                        <div className="pet-group-badge">
                          <span className="total-badge">{group.applications.length} Past</span>
                        </div>
                      </div>

                      <div className="applications-list">
                        {group.applications.map((app) => {
                          const matchBadge = getMatchBadge(app.matchPercent, app.hasPreferences);
                          const tooltip = describeMatchScore(group.pet, app.applicantPrefs);

                          return (
                            <div key={app.id} className="application-card">
                              <div className="application-header">
                                <div className="application-info">
                                  <div className="applicant-name">
                                    {app.applicantName}
                                    <span className={matchBadge.className} title={tooltip}>
                                      {matchBadge.label}
                                    </span>
                                  </div>
                                  <div className="application-meta muted fs-13">
                                    {app.applicantEmail && app.applicantName
                                      ? `${app.applicantEmail} • `
                                      : ''}
                                    Applied:{' '}
                                    {app.createdAt?.seconds
                                      ? new Date(app.createdAt.seconds * 1000).toLocaleDateString()
                                      : '—'}{' '}
                                    • Status:{' '}
                                    <span className={`status-${app.status}`}>{app.status}</span>
                                  </div>
                                  {!app.hasPreferences && (
                                    <div className="warning-message fs-13">
                                      ⚠️ Applicant hasn&apos;t set preferences yet
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="application-actions">
                                {app.status === 'approved' && (
                                  <button
                                    className="auth-button auth-button--danger auth-button--small"
                                    onClick={() => revokeApproval(app)}
                                  >
                                    ↩ Revoke approval
                                  </button>
                                )}
                                {app.status === 'rejected' && (
                                  <button
                                    className="auth-button auth-button--small"
                                    onClick={() => reopenRejected(app)}
                                  >
                                    ↺ Reopen
                                  </button>
                                )}
                                <button
                                  className="auth-button auth-button--secondary auth-button--small"
                                  onClick={() => messageAdopter(app)}
                                >
                                  💬 Message
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
