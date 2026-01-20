import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, query, where, orderBy, limit, onSnapshot, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../auth/AuthContext';
import NavBar from '../components/NavBar';
import PetSummaryCard from '../components/PetSummaryCard';
import { scoreMatch, describeMatchScore, matchScoreToPercent } from '../utils/match';

import '../styles/Dashboard.css';

function getMatchScoreClass(score) {
  if (score >= 80) return 'match-score match-score--excellent';
  if (score >= 50) return 'match-score match-score--good';
  if (score >= 25) return 'match-score match-score--fair';
  return 'match-score match-score--poor';
}

function SkeletonCards({ count = 4 }) {
  return (
    <div className="cards-grid">
      {Array.from({ length: count }).map((_, i) => (
        <div className="card skeleton" key={i}>
          <div className="skeleton__thumb" />
          <div className="skeleton__line" />
          <div className="skeleton__line skeleton__line--short" />
        </div>
      ))}
    </div>
  );
}

function SkeletonList({ count = 4 }) {
  return (
    <div className="stack-12">
      {Array.from({ length: count }).map((_, i) => (
        <div className="card skeleton skeleton--row" key={i}>
          <div className="skeleton__line" />
          <div className="skeleton__line skeleton__line--short" />
        </div>
      ))}
    </div>
  );
}

function Empty({ title, body, actions }) {
  return (
    <div className="empty card">
      <h3 className="empty__title">{title}</h3>
      <p className="empty__body">{body}</p>
      {actions && <div className="empty__actions">{actions}</div>}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const nav = useNavigate();

  const role = user?.role ?? 'adopter'; // adopter | shelter | admin
  const uid = user?.uid ?? null;

  // State
  const [pets, setPets] = useState([]); // recent pets (live, role-aware)
  const [apps, setApps] = useState([]); // applications (per role)
  const [threads, setThreads] = useState([]); // adopter only
  const [loadingPets, setLoadingPets] = useState(true);
  const [loadingApps, setLoadingApps] = useState(true);
  const [errPets, setErrPets] = useState('');
  const [errApps, setErrApps] = useState('');

  useEffect(() => {
    let active = true;
    let unsubscribePrimary = () => {};
    let unsubscribeFallback = () => {};

    // if no user and not admin, clear & bail
    if (!user && role !== 'admin') {
      setPets([]);
      setLoadingPets(false);
      setErrPets('');
      return;
    }

    const ref = collection(db, 'pets');
    const baseLimit = role === 'adopter' ? 50 : 25;

    const handleSnapshot = (snap) => {
      if (!active) return;
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setPets(docs);
      setLoadingPets(false);
      setErrPets('');
    };

    const subscribe = (q, isFallback = false) =>
      onSnapshot(
        q,
        (snap) => handleSnapshot(snap),
        (error) => {
          console.warn(
            isFallback
              ? 'Fallback dashboard subscription failed'
              : 'Primary dashboard subscription failed',
            error
          );
          if (!active) return;
          if (isFallback) {
            setErrPets('Failed to load listings.');
            setPets([]);
            setLoadingPets(false);
          } else {
            startFallback();
          }
        }
      );

    function primaryQuery() {
      if (role === 'shelter' && uid) {
        return query(
          ref,
          where('shelterId', '==', uid),
          orderBy('createdAt', 'desc'),
          limit(baseLimit)
        );
      }
      if (role === 'admin') {
        return query(ref, orderBy('createdAt', 'desc'), limit(baseLimit));
      }
      // adopter (global newest)
      return query(ref, orderBy('createdAt', 'desc'), limit(baseLimit));
    }

    function fallbackQuery() {
      if (role === 'shelter' && uid) {
        return query(ref, where('shelterId', '==', uid), limit(baseLimit));
      }
      // admin / adopter
      return query(ref, limit(baseLimit));
    }

    function startFallback() {
      unsubscribeFallback?.();
      unsubscribeFallback = subscribe(fallbackQuery(), true);
    }

    // start primary
    try {
      setLoadingPets(true);
      setErrPets('');
      unsubscribePrimary = subscribe(primaryQuery());
    } catch (err) {
      console.warn('Unable to create ordered dashboard subscription, using fallback', err);
      startFallback();
    }

    return () => {
      active = false;
      unsubscribePrimary?.();
      unsubscribeFallback?.();
    };
  }, [role, uid, user]);

  // Applications + Threads (per-role)
  useEffect(() => {
    let cancelled = false;

    async function loadAdopter() {
      // recent applications (live)
      setLoadingApps(true);
      setErrApps('');
      const qApps = query(
        collection(db, 'applications'),
        where('applicantId', '==', uid),
        orderBy('createdAt', 'desc'),
        limit(8)
      );
      const unsubApps = onSnapshot(
        qApps,
        (snap) => {
          if (cancelled) return;
          setApps(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
          setLoadingApps(false);
        },
        (e) => {
          if (cancelled) return;
          console.warn('Adopter apps snapshot failed', e);
          setErrApps('Unable to load applications.');
          setLoadingApps(false);
        }
      );

      // threads (can be one-shot or live using one-shot here to keep load light)
      try {
        const qThreads = query(
          collection(db, 'threads'),
          where('adopterId', '==', uid),
          orderBy('lastMessageAt', 'desc'),
          limit(6)
        );
        const snap = await getDocs(qThreads);
        if (!cancelled) setThreads(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.warn('Failed to load threads', e);
        if (!cancelled) setThreads([]);
      }

      return () => unsubApps();
    }

    async function loadShelter() {
      // recent applications to this shelter (one-shot is OK here)
      setLoadingApps(true);
      setErrApps('');
      try {
        const qApps = query(
          collection(db, 'applications'),
          where('shelterId', '==', uid),
          orderBy('createdAt', 'desc'),
          limit(8)
        );
        const snap = await getDocs(qApps);
        if (!cancelled) {
          setApps(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
          setLoadingApps(false);
        }
      } catch (e) {
        if (!cancelled) {
          console.warn('Shelter apps query failed', e);
          setErrApps('Failed to load applications.');
          setLoadingApps(false);
        }
      }
    }

    async function loadAdmin() {
      // global recent applications
      setLoadingApps(true);
      setErrApps('');
      try {
        const qApps = query(
          collection(db, 'applications'),
          orderBy('createdAt', 'desc'),
          limit(10)
        );
        const snap = await getDocs(qApps);
        if (!cancelled) {
          setApps(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
          setLoadingApps(false);
        }
      } catch (e) {
        if (!cancelled) {
          console.warn('Admin apps query failed', e);
          setErrApps('Failed to load applications.');
          setLoadingApps(false);
        }
      }
    }

    // reset
    setApps([]);
    setThreads([]);

    if (role === 'adopter' && uid) {
      const cleanup = loadAdopter();
      return () => {
        cancelled = true;
        // if loadAdopter returned a promise that resolves to a function, await not necessary here
        Promise.resolve(cleanup).then((fn) => typeof fn === 'function' && fn());
      };
    }

    if (role === 'shelter' && uid) {
      loadShelter();
      return () => {
        cancelled = true;
      };
    }

    if (role === 'admin') {
      loadAdmin();
      return () => {
        cancelled = true;
      };
    }

    return () => {
      cancelled = true;
    };
  }, [role, uid]);

  // Derived stats
  const adopterStats = useMemo(() => {
    if (role !== 'adopter') return null;
    const submitted = apps.filter((a) => a.status === 'submitted').length;
    const approved = apps.filter((a) => a.status === 'approved').length;
    const closed = apps.filter((a) => a.status === 'closed' || a.status === 'rejected').length;
    return { submitted, approved, closed };
  }, [role, apps]);

  const shelterStats = useMemo(() => {
    if (role !== 'shelter') return null;
    const total = pets.length;
    const active = pets.filter((p) => (p.status ?? 'active') === 'active').length;
    const pendingApps = apps.filter((a) => a.status === 'submitted').length;
    return { active, total, pendingApps };
  }, [role, pets, apps]);

  const adminStats = useMemo(() => {
    if (role !== 'admin') return null;
    const totalPets = pets.length;
    const totalApps = apps.length;
    const pending = apps.filter((a) => a.status === 'submitted').length;
    return { totalPets, totalApps, pending };
  }, [role, pets, apps]);

  // Recommended pets for adopters with match scoring
  const recommendedPets = useMemo(() => {
    if (role !== 'adopter') return [];
    const preferences = user?.preferences;

    // Get IDs of pets the user has already applied to
    const appliedPetIds = new Set(apps.map((app) => app.petId));

    // Filter active pets and exclude already applied pets
    const activePets = pets.filter((p) => {
      const status = p.status ?? 'active';
      return status === 'active' && !appliedPetIds.has(p.id);
    });

    // If no preferences, return active pets without scoring
    if (!preferences) {
      return activePets.slice(0, 8);
    }

    // Score all active pets
    const scored = activePets.map((pet) => {
      const rawScore = scoreMatch(pet, preferences);
      return {
        ...pet,
        matchScore: rawScore,
        matchPercent: matchScoreToPercent(rawScore),
      };
    });

    // Filter out low matches (< 25%), sort by score descending, and take top 8
    return scored
      .filter((p) => p.matchPercent >= 25)
      .sort((a, b) => b.matchPercent - a.matchPercent)
      .slice(0, 8);
  }, [role, pets, user?.preferences, apps]);

  // Check if there are active pets available (for better empty state messaging)
  const hasActivePets = useMemo(() => {
    if (role !== 'adopter') return false;
    const appliedPetIds = new Set(apps.map((app) => app.petId));
    return pets.some((p) => {
      const status = p.status ?? 'active';
      return status === 'active' && !appliedPetIds.has(p.id);
    });
  }, [role, pets, apps]);

  // Role-specific hero content (routes restored to the ones that worked before)
  const hero = (() => {
    if (role === 'shelter') {
      return {
        title: 'Shelter Dashboard',
        subtitle: 'Manage your listings, review applications, and follow up with adopters.',
        actions: (
          <>
            <button className="btn" onClick={() => nav('/shelter/list')}>
              + New Listing
            </button>
            <Link to="/shelter/applications" className="btn btn--secondary">
              Manage Applications
            </Link>
          </>
        ),
      };
    }
    if (role === 'admin') {
      return {
        title: 'Admin Dashboard',
        subtitle: 'Overview of platform activity across pets, applications, and shelters.',
        actions: (
          <>
            <Link to="/pets" className="btn btn--secondary">
              Browse Catalog
            </Link>
            <Link to="/shelter/applications" className="btn">
              Open Applications Queue
            </Link>
          </>
        ),
      };
    }
    return {
      title: 'Your Dashboard',
      subtitle: 'Track your applications, continue conversations, and find your perfect match.',
      actions: (
        <>
          <Link to="/pets" className="btn btn--secondary">
            Browse Pets
          </Link>
          <Link to="/chat" className="btn">
            Open Chat
          </Link>
        </>
      ),
    };
  })();

  // UI (keeps your new, nicer layout)
  return (
    <div className="auth-container">
      <NavBar variant="app" />
      <main className="auth-content">
        <div className="auth-card max-1100">
          {/* Hero header */}
          <header className="hero">
            <div className="hero__text">
              <h1 className="hero__title">{hero.title}</h1>
              <p className="hero__subtitle">{hero.subtitle}</p>
            </div>
            <div className="hero__actions">{hero.actions}</div>
          </header>

          {(errPets || errApps) && (
            <div className="alert alert--error mb-16">{errPets || errApps}</div>
          )}

          {/* STATS */}
          {role === 'adopter' && adopterStats && (
            <section className="section">
              <div className="stats-grid">
                <div className="stat card">
                  <div className="stat__label">Submitted</div>
                  <div className="stat__value">{adopterStats.submitted}</div>
                </div>
                <div className="stat card">
                  <div className="stat__label">Approved</div>
                  <div className="stat__value">{adopterStats.approved}</div>
                </div>
                <div className="stat card">
                  <div className="stat__label">Closed / Rejected</div>
                  <div className="stat__value">{adopterStats.closed}</div>
                </div>
              </div>
            </section>
          )}

          {role === 'shelter' && shelterStats && (
            <section className="section">
              <div className="stats-grid">
                <div className="stat card">
                  <div className="stat__label">Active Listings</div>
                  <div className="stat__value">{shelterStats.active}</div>
                </div>
                <div className="stat card">
                  <div className="stat__label">Total Listings</div>
                  <div className="stat__value">{shelterStats.total}</div>
                </div>
                <div className="stat card">
                  <div className="stat__label">Pending Applications</div>
                  <div className="stat__value">{shelterStats.pendingApps}</div>
                </div>
              </div>
            </section>
          )}

          {role === 'admin' && adminStats && (
            <section className="section">
              <div className="stats-grid">
                <div className="stat card">
                  <div className="stat__label">Recent Pets (last {Math.min(pets.length, 12)})</div>
                  <div className="stat__value">{adminStats.totalPets}</div>
                </div>
                <div className="stat card">
                  <div className="stat__label">
                    Recent Applications (last {Math.min(apps.length, 10)})
                  </div>
                  <div className="stat__value">{adminStats.totalApps}</div>
                </div>
                <div className="stat card">
                  <div className="stat__label">Pending Applications</div>
                  <div className="stat__value">{adminStats.pending}</div>
                </div>
              </div>
            </section>
          )}

          {/* CONTENT */}
          {role === 'adopter' && (
            <>
              {/* Recommended Pets */}
              <section className="section">
                <div className="section__header">
                  <h2 className="section__title">Recommended for You</h2>
                  {user?.preferences && (
                    <Link to="/quiz" className="link-muted fs-12">
                      Update preferences
                    </Link>
                  )}
                </div>

                {loadingPets ? (
                  <SkeletonCards />
                ) : !user?.preferences ? (
                  <Empty
                    title="Take the quiz to get personalized recommendations"
                    body="Complete our quick pet preferences quiz to see pets that match your lifestyle and preferences."
                    actions={
                      <Link to="/quiz" className="btn">
                        Take Preferences Quiz
                      </Link>
                    }
                  />
                ) : recommendedPets.length === 0 ? (
                  <Empty
                    title={hasActivePets ? 'No good matches found' : 'No pets available'}
                    body={
                      hasActivePets
                        ? 'No pets meet the minimum 25% match threshold with your preferences. Try updating your preferences or browse all pets to see more options.'
                        : "There are currently no active pet listings that you haven't already applied to. Check back soon or contact shelters directly."
                    }
                    actions={
                      <>
                        {hasActivePets && (
                          <Link to="/quiz" className="btn">
                            Update Preferences
                          </Link>
                        )}
                        <Link to="/pets" className="btn btn--secondary">
                          Browse All Pets
                        </Link>
                      </>
                    }
                  />
                ) : (
                  <div className="cards-grid">
                    {recommendedPets.map((p) => (
                      <div key={p.id} className="card">
                        <PetSummaryCard
                          pet={p}
                          role={role}
                          uid={uid}
                          onView={(id) => nav(`/pets/${id}`)}
                          rightContent={
                            user?.preferences && (
                              <div
                                className={getMatchScoreClass(p.matchPercent)}
                                title={describeMatchScore(p, user?.preferences)}
                              >
                                <div className="match-score__value">{p.matchPercent}%</div>
                                <div className="match-score__label">Match</div>
                              </div>
                            )
                          }
                        />
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Applications */}
              <section className="section">
                <div className="section__header">
                  <h2 className="section__title">Your Recent Applications</h2>
                  <Link to="/applications" className="link-muted fs-12">
                    View all
                  </Link>
                </div>

                {loadingApps ? (
                  <SkeletonList />
                ) : apps.length === 0 ? (
                  <Empty
                    title="No applications yet"
                    body="Start by browsing pets and submitting your first application."
                    actions={
                      <Link to="/pets" className="btn">
                        Browse Pets
                      </Link>
                    }
                  />
                ) : (
                  <div className="table">
                    <div className="table__head">
                      <div>Pet</div>
                      <div>Status</div>
                      <div>Submitted</div>
                      <div className="cell--actions" />
                    </div>
                    <div className="table__body">
                      {apps.map((a) => (
                        <div key={a.id} className="table__row card">
                          <div className="cell-ellipsis">
                            <strong>{a.petName || a.petId}</strong>
                          </div>
                          <div>
                            <span className={`chip chip--${a.status || 'submitted'}`}>
                              {a.status}
                            </span>
                          </div>
                          <div>
                            {a.createdAt?.seconds
                              ? new Date(a.createdAt.seconds * 1000).toLocaleString()
                              : '—'}
                          </div>
                          <div className="cell--actions">
                            <div className="cluster-8 wrap">
                              <Link to={`/pets/${a.petId}`} className="btn btn--secondary">
                                View Listing
                              </Link>
                              <Link to={`/applications`} className="btn">
                                Manage
                              </Link>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              {/* Threads */}
              <section className="section">
                <div className="section__header">
                  <h2 className="section__title">Recent Conversations</h2>
                  <Link to="/chat" className="link-muted fs-12">
                    Open Chat
                  </Link>
                </div>
                {loadingApps ? (
                  <SkeletonCards count={2} />
                ) : threads.length === 0 ? (
                  <Empty
                    title="No conversations yet"
                    body="Conversations appear here after you message a shelter."
                    actions={
                      <Link to="/chat" className="btn">
                        Open Chat
                      </Link>
                    }
                  />
                ) : (
                  <div className="stack-12">
                    {threads.map((t) => (
                      <div key={t.id} className="card app-row">
                        <div className="row-between">
                          <strong>
                            {t.title || `Conversation with ${t.shelterName || 'Shelter'}`}
                          </strong>
                          <span className="muted fs-12">
                            {t.lastMessageAt?.seconds
                              ? new Date(t.lastMessageAt.seconds * 1000).toLocaleString()
                              : '—'}
                          </span>
                        </div>
                        <div className="cluster-8 mt-8 wrap">
                          <Link to={`/chat?thread=${t.id}`} className="btn">
                            Open Chat
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}

          {role === 'shelter' && (
            <>
              {/* Listings */}
              <section className="section">
                <div className="section__header">
                  <h2 className="section__title">Your Listings</h2>
                </div>

                {loadingPets ? (
                  <SkeletonCards />
                ) : pets.length === 0 ? (
                  <Empty
                    title="No listings yet"
                    body="Create your first listing to reach adopters."
                    actions={
                      <button className="btn" onClick={() => nav('/shelter/list')}>
                        Create Listing
                      </button>
                    }
                  />
                ) : (
                  <div className="cards-grid">
                    {pets.map((p) => (
                      <div key={p.id} className="card">
                        <PetSummaryCard
                          pet={p}
                          role={role}
                          uid={uid}
                          onView={(id) => nav(`/pets/${id}`)}
                          onEdit={(id) => nav(`/pets/${id}/edit`)}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Applications */}
              <section className="section">
                <div className="section__header">
                  <h2 className="section__title">Recent Applications</h2>
                  <Link to="/shelter/applications" className="link-muted fs-12">
                    View all
                  </Link>
                </div>

                {loadingApps ? (
                  <SkeletonList />
                ) : apps.length === 0 ? (
                  <Empty
                    title="No applications yet"
                    body="When adopters apply, they will appear here."
                    actions={
                      <Link to="/pets" className="btn btn--secondary">
                        Browse Catalog
                      </Link>
                    }
                  />
                ) : (
                  <div className="table">
                    <div className="table__head">
                      <div>Pet</div>
                      <div>Applicant</div>
                      <div>Status</div>
                      <div>Submitted</div>
                      <div className="cell--actions" />
                    </div>
                    <div className="table__body">
                      {apps.map((a) => (
                        <div key={a.id} className="table__row card">
                          <div className="cell-ellipsis">{a.petName || a.petId}</div>
                          <div className="cell-ellipsis">
                            {a.applicantName || a.applicantEmail || 'Adopter'}
                          </div>
                          <div>
                            <span className={`chip chip--${a.status || 'submitted'}`}>
                              {a.status}
                            </span>
                          </div>
                          <div>
                            {a.createdAt?.seconds
                              ? new Date(a.createdAt.seconds * 1000).toLocaleString()
                              : '—'}
                          </div>
                          <div className="cell--actions">
                            <div className="cluster-8 wrap">
                              <Link to={`/pets/${a.petId}`} className="btn btn--secondary">
                                View Listing
                              </Link>
                              <Link to="/shelter/applications" className="btn">
                                Manage
                              </Link>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            </>
          )}

          {role === 'admin' && (
            <>
              {/* Recent Pets */}
              <section className="section">
                <div className="section__header">
                  <h2 className="section__title">Recent Pets</h2>
                  <Link to="/pets" className="link-muted fs-12">
                    Browse all
                  </Link>
                </div>

                {loadingPets ? (
                  <SkeletonCards />
                ) : pets.length === 0 ? (
                  <Empty
                    title="No pets yet"
                    body="Newly created pets will be listed here."
                    actions={
                      <Link to="/pets" className="btn btn--secondary">
                        Browse Catalog
                      </Link>
                    }
                  />
                ) : (
                  <div className="cards-grid">
                    {pets.map((p) => (
                      <div key={p.id} className="card">
                        <PetSummaryCard
                          pet={p}
                          role={role}
                          uid={uid}
                          onView={(id) => nav(`/pets/${id}`)}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Recent Applications */}
              <section className="section">
                <div className="section__header">
                  <h2 className="section__title">Recent Applications</h2>
                  <Link to="/shelter/applications" className="link-muted fs-12">
                    Open queue
                  </Link>
                </div>

                {loadingApps ? (
                  <SkeletonList />
                ) : apps.length === 0 ? (
                  <Empty
                    title="No applications yet"
                    body="New applications will appear here as they are submitted."
                    actions={
                      <Link to="/shelter/applications" className="btn">
                        Open Applications
                      </Link>
                    }
                  />
                ) : (
                  <div className="table">
                    <div className="table__head">
                      <div>Pet</div>
                      <div>Applicant</div>
                      <div>Status</div>
                      <div>Submitted</div>
                      <div className="cell--actions" />
                    </div>
                    <div className="table__body">
                      {apps.map((a) => (
                        <div key={a.id} className="table__row card">
                          <div className="cell-ellipsis">{a.petName || a.petId}</div>
                          <div className="cell-ellipsis">
                            {a.applicantName || a.applicantEmail || 'Adopter'}
                          </div>
                          <div>
                            <span className={`chip chip--${a.status || 'submitted'}`}>
                              {a.status}
                            </span>
                          </div>
                          <div>
                            {a.createdAt?.seconds
                              ? new Date(a.createdAt.seconds * 1000).toLocaleString()
                              : '—'}
                          </div>
                          <div className="cell--actions">
                            <div className="cluster-8 wrap">
                              <Link to={`/pets/${a.petId}`} className="btn btn--secondary">
                                View Listing
                              </Link>
                              <Link to="/shelter/applications" className="btn">
                                Manage
                              </Link>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
