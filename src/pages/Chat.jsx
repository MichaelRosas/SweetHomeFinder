import { useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  setDoc,
  getDoc,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../auth/AuthContext';
import { useSearchParams } from 'react-router-dom';
import NavBar from '../components/NavBar';
import '../styles/Chat.css';

export default function Chat() {
  const { user } = useAuth();
  const [threads, setThreads] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [params] = useSearchParams();
  const [err, setErr] = useState('');

  const role = user?.role;

  // --- Header meta + labels (Task A) ---
  const [threadMeta, setThreadMeta] = useState(null);
  const [labels, setLabels] = useState({ adopter: null, shelter: null, pet: '' });
  const labelCacheRef = useRef(new Map());
  const warnedDeniedRef = useRef(new Set());

  function getUserLabelFromDoc(data) {
    const role = data?.role;
    if (role === 'shelter') {
      return data?.shelterProfile?.companyName || data?.displayName || data?.email || 'Shelter';
    }
    if (role === 'adopter') {
      return data?.adopterProfile?.name || data?.displayName || data?.email || 'Adopter';
    }
    return data?.displayName || data?.email || '(Unknown User)';
  }

  function defaultLabelForRole(role) {
    if (role === 'shelter') return 'Shelter';
    if (role === 'adopter') return 'Adopter';
    return '(Unknown User)';
  }

  // Load threads for this user (adopter + shelter). Admin sees all.
  useEffect(() => {
    if (!user?.uid) return;
    const unsubs = [];

    const mergeAndSort = (rows) =>
      setThreads((prev) => {
        const map = new Map(prev.map((r) => [r.id, r]));
        rows.forEach((r) => map.set(r.id, r));
        return Array.from(map.values()).sort((a, b) => {
          const aT = a.lastMessageAt?.seconds || 0;
          const bT = b.lastMessageAt?.seconds || 0;
          return bT - aT;
        });
      });

    const qAdopter = query(
      collection(db, 'threads'),
      where('adopterId', '==', user.uid),
      orderBy('lastMessageAt', 'desc')
    );
    unsubs.push(
      onSnapshot(qAdopter, (snap) =>
        mergeAndSort(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      )
    );

    const qShelter = query(
      collection(db, 'threads'),
      where('shelterId', '==', user.uid),
      orderBy('lastMessageAt', 'desc')
    );
    unsubs.push(
      onSnapshot(qShelter, (snap) =>
        mergeAndSort(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      )
    );

    if (role === 'admin') {
      const qAll = query(collection(db, 'threads'), orderBy('lastMessageAt', 'desc'));
      unsubs.push(
        onSnapshot(qAll, (snap) => mergeAndSort(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))
      );
    }

    return () => unsubs.forEach((fn) => fn());
  }, [user?.uid, role]);

  // If deep-linked (?thread=...), eagerly ensure the thread doc exists.
  useEffect(() => {
    (async () => {
      const tid = params.get('thread');
      if (!tid || !user?.uid) return;

      setActiveId((prev) => prev || tid);

      try {
        const tRef = doc(db, 'threads', tid);
        const tSnap = await getDoc(tRef);
        if (!tSnap.exists()) {
          const [petId, adopterId, shelterId] = String(tid).split('_');
          const payload = {
            id: tid,
            petId: petId || null,
            adopterId: adopterId || null,
            shelterId: shelterId || null,
            lastMessageAt: serverTimestamp(),
            lastMessage: 'Conversation started',
            lastSenderId: user.uid,
          };

          // Fetch pet document to get shelter name and pet name
          if (petId) {
            try {
              const petSnap = await getDoc(doc(db, 'pets', petId));
              if (petSnap.exists()) {
                const petData = petSnap.data();
                payload.petName = petData.name || null;
                payload.shelterName = petData.shelterName || 'Shelter';
              }
            } catch (e) {
              console.warn('Failed to fetch pet details:', e);
            }
          }

          // Set current user's name based on role
          if (role === 'adopter') {
            payload.adopterId = user.uid;
            payload.adopterName =
              user?.adopterProfile?.name || user?.displayName || user?.email || 'Adopter';
          }
          if (role === 'shelter') {
            payload.shelterId = user.uid;
            payload.shelterName =
              user?.shelterProfile?.companyName || user?.displayName || user?.email || 'Shelter';
          }

          await setDoc(tRef, payload, { merge: true });
        }
      } catch (e) {
        console.error('Failed to ensure thread:', e);
        setErr('Could not open conversation. Please try again or contact support.');
      }
    })();
  }, [params, user?.uid, role]);

  // Messages for active thread (with error handling)
  useEffect(() => {
    if (!activeId) return;
    setErr('');
    const q = query(collection(db, 'threads', activeId, 'messages'), orderBy('createdAt', 'asc'));
    const off = onSnapshot(
      q,
      (snap) => {
        setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (e) => {
        console.error('Failed to subscribe to messages:', e);
        setMessages([]);
        setErr(
          e?.message?.includes('Missing or insufficient permissions')
            ? 'You do not have access to this conversation.'
            : 'Could not load messages. Please try again.'
        );
      }
    );
    return () => off();
  }, [activeId]);

  const activeThread = useMemo(
    () => threads.find((t) => t.id === activeId) || null,
    [threads, activeId]
  );

  // Subscribe to the active thread document to hydrate header meta (adopterId, shelterId, petName)
  useEffect(() => {
    if (!activeId) {
      setThreadMeta(null);
      return;
    }
    const tRef = doc(db, 'threads', activeId);
    const off = onSnapshot(tRef, (snap) => {
      setThreadMeta(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    });
    return () => off();
  }, [activeId]);

  // Fetch and cache user labels (adopter/shelter) ONCE per unique uid, fallback gracefully on permission errors
  useEffect(() => {
    const adopterId = threadMeta?.adopterId;
    const shelterId = threadMeta?.shelterId;
    if (!adopterId && !shelterId) return;

    let cancelled = false;

    const fetchLabel = async (uid, fallbackRole, fallbackThreadLabel) => {
      if (!uid) return null;
      const cache = labelCacheRef.current;
      if (cache.has(uid)) return cache.get(uid);
      try {
        const snap = await getDoc(doc(db, 'users', uid));
        let label;
        if (snap.exists()) {
          label = getUserLabelFromDoc(snap.data());
        } else {
          label = fallbackThreadLabel || defaultLabelForRole(fallbackRole);
        }
        cache.set(uid, label);
        return label;
      } catch (e) {
        // Rules-aware fallback
        if (e?.code === 'permission-denied') {
          if (!warnedDeniedRef.current.has(uid)) {
            console.warn(
              '[Chat] /users read permission denied for',
              uid,
              '— using thread fallback label once.'
            );
            warnedDeniedRef.current.add(uid);
          }
          const label = fallbackThreadLabel || defaultLabelForRole(fallbackRole);
          labelCacheRef.current.set(uid, label);
          return label;
        }
        console.warn('[Chat] Failed to read user', uid, e);
        const label = fallbackThreadLabel || defaultLabelForRole(fallbackRole);
        labelCacheRef.current.set(uid, label);
        return label;
      }
    };

    (async () => {
      const adopterFallback = threadMeta?.adopterName || 'Adopter';
      const shelterFallback = threadMeta?.shelterName || 'Shelter';
      const [adopterLabel, shelterLabel] = await Promise.all([
        fetchLabel(adopterId, 'adopter', adopterFallback),
        fetchLabel(shelterId, 'shelter', shelterFallback),
      ]);
      if (!cancelled) {
        setLabels((prev) => ({ ...prev, adopter: adopterLabel, shelter: shelterLabel }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    threadMeta?.adopterId,
    threadMeta?.shelterId,
    threadMeta?.adopterName,
    threadMeta?.shelterName,
  ]);

  // Resolve the pet label from thread or pet doc
  useEffect(() => {
    const petName = threadMeta?.petName;
    const petId = threadMeta?.petId;
    let cancelled = false;

    if (petName) {
      setLabels((prev) => ({ ...prev, pet: petName }));
      return;
    }
    if (!petId) {
      setLabels((prev) => ({ ...prev, pet: 'Conversation' }));
      return;
    }

    (async () => {
      try {
        const snap = await getDoc(doc(db, 'pets', petId));
        const name = snap.exists() ? snap.data()?.name || petId : petId;
        if (!cancelled) setLabels((prev) => ({ ...prev, pet: name }));
      } catch {
        if (!cancelled) setLabels((prev) => ({ ...prev, pet: petId || 'Conversation' }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [threadMeta?.petId, threadMeta?.petName]);

  const headerInfo = useMemo(() => {
    if (!activeId) {
      return { title: 'Select a conversation', subtitle: '' };
    }
    if (!threadMeta) {
      return { title: 'Loading conversation…', subtitle: '' };
    }
    const adopterLabel = labels.adopter || threadMeta.adopterName || 'Adopter';
    const shelterLabel = labels.shelter || threadMeta.shelterName || 'Shelter';
    const petLabel = labels.pet || threadMeta.petName || threadMeta.petId || 'Conversation';

    // Counterparty logic
    if (role === 'adopter' || user?.uid === threadMeta.adopterId) {
      return { title: shelterLabel, subtitle: petLabel };
    }
    if (role === 'shelter' || user?.uid === threadMeta.shelterId) {
      return { title: adopterLabel, subtitle: petLabel };
    }
    // Admin or unknown role: show both
    return { title: `Adopter: ${adopterLabel} • Shelter: ${shelterLabel}`, subtitle: petLabel };
  }, [activeId, threadMeta, labels, role, user?.uid]);

  const send = async () => {
    const trimmed = text.trim();
    if (!activeId || !user?.uid || !trimmed) return;

    setErr('');
    try {
      if (!activeThread) {
        const [petId, adopterId, shelterId] = String(activeId).split('_');
        const payload = {
          id: activeId,
          petId: petId || null,
          adopterId: adopterId || null,
          shelterId: shelterId || null,
          lastMessageAt: serverTimestamp(),
          lastMessage: trimmed,
          lastSenderId: user.uid,
        };

        // Fetch pet document to get shelter name and pet name
        if (petId) {
          try {
            const petSnap = await getDoc(doc(db, 'pets', petId));
            if (petSnap.exists()) {
              const petData = petSnap.data();
              payload.petName = petData.name || null;
              payload.shelterName = petData.shelterName || 'Shelter';
            }
          } catch (e) {
            console.warn('Failed to fetch pet details:', e);
          }
        }

        // Set current user's name based on role
        if (role === 'adopter') {
          payload.adopterId = user.uid;
          payload.adopterName =
            user?.adopterProfile?.name || user?.displayName || user?.email || 'Adopter';
        }
        if (role === 'shelter') {
          payload.shelterId = user.uid;
          payload.shelterName =
            user?.shelterProfile?.companyName || user?.displayName || user?.email || 'Shelter';
        }

        await setDoc(doc(db, 'threads', activeId), payload, { merge: true });
      }

      await addDoc(collection(db, 'threads', activeId, 'messages'), {
        text: trimmed,
        senderId: user.uid,
        createdAt: serverTimestamp(),
      });

      setText('');
      await updateDoc(doc(db, 'threads', activeId), {
        lastMessage: trimmed,
        lastMessageAt: serverTimestamp(),
        lastSenderId: user.uid,
      });
    } catch (e) {
      console.error('Failed to send message:', e);
      setErr(
        e?.message?.includes('Missing or insufficient permissions')
          ? 'You do not have access to this conversation.'
          : 'Could not send message. Please try again.'
      );
    }
  };

  // Helper to determine message bubble class based on sender
  const getMessageClass = (senderId) => {
    if (senderId === 'system') return 'system';

    // For admin viewing: color-code by role
    if (role === 'admin' && threadMeta) {
      if (senderId === threadMeta.adopterId) return 'adopter';
      if (senderId === threadMeta.shelterId) return 'shelter';
    }

    // For regular users: align based on whether it's their message
    return senderId === user?.uid ? 'self' : '';
  };

  return (
    <div className="auth-container">
      <NavBar variant="app" />
      <main className="auth-content">
        <div className="auth-card chat card--wide">
          <div className="chat__sidebar">
            <h3 className="mb-8">Conversations</h3>
            <div className="chat__threadList">
              {threads.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveId(t.id)}
                  className={`chat__threadBtn ${activeId === t.id ? 'is-active' : ''}`}
                >
                  <div className="chat__threadTitle">
                    {t.adopterName || 'Adopter'} • {t.petName || t.petId || 'Pet'}
                  </div>
                  <div className="chat__threadLast muted">{t.lastMessage || '—'}</div>
                </button>
              ))}
              {threads.length === 0 && (
                <div className="chat__empty muted">No conversations yet.</div>
              )}
            </div>
          </div>

          <div className="chat__panel">
            <div className="chat__header">
              <div className="chat__headerTitle">{headerInfo.title}</div>
              {headerInfo.subtitle && (
                <div className="chat__headerSubtitle muted">{headerInfo.subtitle}</div>
              )}
            </div>
            <div className="chat__messages">
              {activeId ? (
                messages.length ? (
                  messages.map((m) => {
                    const msgClass = getMessageClass(m.senderId);
                    return (
                      <div key={m.id} className={`chat__bubbleRow ${msgClass}`}>
                        <div className="chat__bubble">{m.text}</div>
                      </div>
                    );
                  })
                ) : (
                  <div className="muted">Say hello 👋</div>
                )
              ) : (
                <div className="muted">Select a conversation to start messaging.</div>
              )}
              {err && <div className="text-danger mt-8">{err}</div>}
            </div>
            <div className="chat__composer">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Type a message…"
                className="input input--pill flex-1"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    send();
                  }
                }}
              />
              <button className="auth-button" onClick={send} disabled={!activeId || !text.trim()}>
                Send
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
