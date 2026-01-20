import { useEffect, useMemo, useState } from 'react';
import { doc, setDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';
import NavBar from '../components/NavBar';
import { useAuth } from '../auth/AuthContext';
import { db } from '../firebase/config';
import '../styles/Auth.css';
import '../styles/Profile.css';

function formatDate(value) {
  if (!value) return '';
  try {
    if (value instanceof Date) {
      return value.toISOString().slice(0, 10);
    }
    if (typeof value === 'string' && value.includes('T')) {
      return value.slice(0, 10);
    }
    return value;
  } catch {
    return '';
  }
}

export default function Profile() {
  const { user } = useAuth();
  const role = user?.role || null;

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({});
  const [allUsers, setAllUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  const [editUserForm, setEditUserForm] = useState({});

  const adopterProfile = useMemo(() => user?.adopterProfile || {}, [user?.adopterProfile]);
  const shelterProfile = useMemo(() => user?.shelterProfile || {}, [user?.shelterProfile]);

  useEffect(() => {
    if (!user) return;
    if (role === 'adopter') {
      setForm({
        name: adopterProfile.name || '',
        address: adopterProfile.address || '',
        dob: formatDate(adopterProfile.dob),
      });
    } else if (role === 'shelter') {
      setForm({
        companyName: shelterProfile.companyName || '',
        address: shelterProfile.address || '',
        description: shelterProfile.description || '',
      });
    } else {
      setForm({
        displayName: user.displayName || '',
      });
    }
    setEditing(false);
    setError('');
    setMessage('');
  }, [user, role, adopterProfile, shelterProfile]);

  // Fetch all users if admin
  useEffect(() => {
    if (!user || role !== 'admin') return;

    const fetchAllUsers = async () => {
      setLoadingUsers(true);
      try {
        const usersSnap = await getDocs(collection(db, 'users'));
        const users = usersSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        setAllUsers(users);
      } catch (err) {
        console.error('Failed to fetch users:', err);
        setError('Failed to load users. Please refresh the page.');
      } finally {
        setLoadingUsers(false);
      }
    };

    fetchAllUsers();
  }, [user, role]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (error) {
      setError('');
    }
    if (message) {
      setMessage('');
    }
  };

  const handleEditUserChange = (e) => {
    const { name, value } = e.target;
    setEditUserForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleCancel = () => {
    if (!user) return;
    if (role === 'adopter') {
      setForm({
        name: adopterProfile.name || '',
        address: adopterProfile.address || '',
        dob: formatDate(adopterProfile.dob),
      });
    } else if (role === 'shelter') {
      setForm({
        companyName: shelterProfile.companyName || '',
        address: shelterProfile.address || '',
        description: shelterProfile.description || '',
      });
    } else {
      setForm({
        displayName: user.displayName || '',
      });
    }
    setEditing(false);
    setError('');
    setMessage('');
  };

  const startEditing = () => {
    setEditing(true);
    setError('');
    setMessage('');
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!user?.uid) return;
    setError('');
    setMessage('');

    try {
      let payload = {};

      if (role === 'adopter') {
        const name = (form.name || '').trim();
        const address = (form.address || '').trim();
        if (!name || !address) {
          setError('Name and address are required.');
          return;
        }
        payload = {
          adopterProfile: {
            name,
            address,
            dob: form.dob || '',
          },
          displayName: name,
        };
      } else if (role === 'shelter') {
        const companyName = (form.companyName || '').trim();
        const address = (form.address || '').trim();
        if (!companyName || !address) {
          setError('Organization name and address are required.');
          return;
        }
        payload = {
          shelterProfile: {
            companyName,
            address,
            description: form.description || '',
          },
          displayName: companyName,
        };
      } else {
        payload = {
          displayName: (form.displayName || '').trim(),
        };
      }

      setSaving(true);
      await setDoc(doc(db, 'users', user.uid), payload, { merge: true });
      setMessage('Profile updated.');
      setEditing(false);
    } catch (err) {
      console.error('Failed to update profile', err);
      setError('Failed to update profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const startEditingUser = (u) => {
    setEditingUserId(u.id);
    if (u.role === 'adopter' && u.adopterProfile) {
      setEditUserForm({
        name: u.adopterProfile.name || '',
        address: u.adopterProfile.address || '',
        dob: formatDate(u.adopterProfile.dob),
      });
    } else if (u.role === 'shelter' && u.shelterProfile) {
      setEditUserForm({
        companyName: u.shelterProfile.companyName || '',
        address: u.shelterProfile.address || '',
        description: u.shelterProfile.description || '',
      });
    }
    setError('');
    setMessage('');
  };

  const cancelEditingUser = () => {
    setEditingUserId(null);
    setEditUserForm({});
    setError('');
    setMessage('');
  };

  const handleSaveUser = async (u) => {
    setError('');
    setMessage('');

    try {
      let payload = {};

      if (u.role === 'adopter') {
        const name = (editUserForm.name || '').trim();
        const address = (editUserForm.address || '').trim();
        if (!name || !address) {
          setError('Name and address are required.');
          return;
        }
        payload = {
          adopterProfile: {
            name,
            address,
            dob: editUserForm.dob || '',
          },
          displayName: name,
        };
      } else if (u.role === 'shelter') {
        const companyName = (editUserForm.companyName || '').trim();
        const address = (editUserForm.address || '').trim();
        if (!companyName || !address) {
          setError('Organization name and address are required.');
          return;
        }
        payload = {
          shelterProfile: {
            companyName,
            address,
            description: editUserForm.description || '',
          },
          displayName: companyName,
        };
      }

      setSaving(true);
      await setDoc(doc(db, 'users', u.id), payload, { merge: true });
      
      // Refresh users list
      const usersSnap = await getDocs(collection(db, 'users'));
      const users = usersSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      setAllUsers(users);
      
      setMessage('User updated successfully.');
      setEditingUserId(null);
      setEditUserForm({});
    } catch (err) {
      console.error('Failed to update user', err);
      setError('Failed to update user. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async (userId, userRole) => {
    if (userRole === 'admin') {
      setError('Cannot delete admin accounts.');
      return;
    }

    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
      return;
    }

    setError('');
    setMessage('');

    try {
      setSaving(true);
      await deleteDoc(doc(db, 'users', userId));
      
      // Refresh users list
      const usersSnap = await getDocs(collection(db, 'users'));
      const users = usersSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      setAllUsers(users);
      
      setMessage('User deleted successfully.');
    } catch (err) {
      console.error('Failed to delete user', err);
      setError('Failed to delete user. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return (
      <div className="auth-container">
        <NavBar variant="app" />
        <main className="auth-content">
          <div className="auth-card text-left">
            <h1>Profile</h1>
            <p>Please sign in to view your profile.</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <NavBar variant="app" />
      <main className="auth-content">
        {role !== 'admin' && (
          <div className="profile-card">
            <div className="profile-header">
              <div>
                <h1>Profile</h1>
                <p className="profile-subtitle">{user.email}</p>
              </div>
              {!editing && (
                <button className="auth-button" onClick={startEditing}>
                  Edit profile
                </button>
              )}
            </div>

            {error && <div className="profile-alert profile-alert--error">{error}</div>}
            {message && <div className="profile-alert profile-alert--success">{message}</div>}

            {!editing ? (
              <div className="profile-details">
                {role === 'adopter' ? (
                  <>
                    <div className="profile-detail">
                      <span className="profile-label">Full name</span>
                      <span className="profile-value">{adopterProfile.name || '—'}</span>
                    </div>
                    <div className="profile-detail">
                      <span className="profile-label">Address</span>
                      <span className="profile-value">{adopterProfile.address || '—'}</span>
                    </div>
                    <div className="profile-detail">
                      <span className="profile-label">Date of birth</span>
                      <span className="profile-value">{formatDate(adopterProfile.dob) || '—'}</span>
                    </div>
                  </>
                ) : role === 'shelter' ? (
                  <>
                    <div className="profile-detail">
                      <span className="profile-label">Shelter / Company</span>
                      <span className="profile-value">{shelterProfile.companyName || '—'}</span>
                    </div>
                    <div className="profile-detail">
                      <span className="profile-label">Address</span>
                      <span className="profile-value">{shelterProfile.address || '—'}</span>
                    </div>
                    <div className="profile-detail">
                      <span className="profile-label">Description</span>
                      <span className="profile-value">{shelterProfile.description || '—'}</span>
                    </div>
                  </>
                ) : null}
              </div>
            ) : (
              <form className="profile-form" onSubmit={handleSave}>
                <div className="profile-formGrid">
                  {role === 'adopter' ? (
                    <>
                      <label
                        htmlFor="profile-name"
                        className="profile-formField profile-formField--full"
                      >
                        <span>Full name</span>
                        <input
                          id="profile-name"
                          name="name"
                          value={form.name || ''}
                          onChange={handleChange}
                          required
                        />
                      </label>
                      <label
                        htmlFor="profile-address"
                        className="profile-formField profile-formField--full"
                      >
                        <span>Address</span>
                        <input
                          id="profile-address"
                          name="address"
                          value={form.address || ''}
                          onChange={handleChange}
                          required
                        />
                      </label>
                      <label
                        htmlFor="profile-dob"
                        className="profile-formField profile-formField--full"
                      >
                        <span>Date of birth</span>
                        <input
                          id="profile-dob"
                          name="dob"
                          type="date"
                          value={form.dob || ''}
                          onChange={handleChange}
                        />
                      </label>
                    </>
                  ) : role === 'shelter' ? (
                    <>
                      <label
                        htmlFor="profile-companyName"
                        className="profile-formField profile-formField--full"
                      >
                        <span>Shelter / Company name</span>
                        <input
                          id="profile-companyName"
                          name="companyName"
                          value={form.companyName || ''}
                          onChange={handleChange}
                          required
                        />
                      </label>
                      <label
                        htmlFor="profile-address"
                        className="profile-formField profile-formField--full"
                      >
                        <span>Address</span>
                        <input
                          id="profile-address"
                          name="address"
                          value={form.address || ''}
                          onChange={handleChange}
                          required
                        />
                      </label>
                      <label
                        htmlFor="profile-description"
                        className="profile-formField profile-formField--full"
                      >
                        <span>Description</span>
                        <textarea
                          id="profile-description"
                          name="description"
                          rows={4}
                          value={form.description || ''}
                          onChange={handleChange}
                        />
                      </label>
                    </>
                  ) : null}
                </div>
                <div className="profile-actions">
                  <button className="auth-button" type="submit" disabled={saving}>
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    className="auth-button auth-button--secondary"
                    onClick={handleCancel}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {role === 'admin' && (
          <div className="profile-card">
            <div className="profile-header">
              <div>
                <h1>All Users</h1>
                <p className="profile-subtitle">Manage all registered users</p>
              </div>
            </div>

            {error && <div className="profile-alert profile-alert--error">{error}</div>}
            {message && <div className="profile-alert profile-alert--success">{message}</div>}

            {loadingUsers ? (
              <div className="profile-details">Loading users...</div>
            ) : (
              <div className="users-grid">
                {allUsers.map((u) => (
                  <div key={u.id} className="user-card">
                    <div className="user-card__header">
                      <strong>{u.email}</strong>
                      <span className="badge badge--info">{u.role || 'unknown'}</span>
                    </div>
                    <div className="user-card__body">
                      {editingUserId === u.id ? (
                        <form onSubmit={(e) => { e.preventDefault(); handleSaveUser(u); }}>
                          {u.role === 'adopter' && (
                            <>
                              <label className="profile-formField profile-formField--full" style={{ marginBottom: '0.5rem' }}>
                                <span className="muted">Name:</span>
                                <input
                                  name="name"
                                  value={editUserForm.name || ''}
                                  onChange={handleEditUserChange}
                                  required
                                />
                              </label>
                              <label className="profile-formField profile-formField--full" style={{ marginBottom: '0.5rem' }}>
                                <span className="muted">Address:</span>
                                <input
                                  name="address"
                                  value={editUserForm.address || ''}
                                  onChange={handleEditUserChange}
                                  required
                                />
                              </label>
                              <label className="profile-formField profile-formField--full" style={{ marginBottom: '0.5rem' }}>
                                <span className="muted">Date of Birth:</span>
                                <input
                                  name="dob"
                                  type="date"
                                  value={editUserForm.dob || ''}
                                  onChange={handleEditUserChange}
                                />
                              </label>
                            </>
                          )}
                          {u.role === 'shelter' && (
                            <>
                              <label className="profile-formField profile-formField--full" style={{ marginBottom: '0.5rem' }}>
                                <span className="muted">Shelter:</span>
                                <input
                                  name="companyName"
                                  value={editUserForm.companyName || ''}
                                  onChange={handleEditUserChange}
                                  required
                                />
                              </label>
                              <label className="profile-formField profile-formField--full" style={{ marginBottom: '0.5rem' }}>
                                <span className="muted">Address:</span>
                                <input
                                  name="address"
                                  value={editUserForm.address || ''}
                                  onChange={handleEditUserChange}
                                  required
                                />
                              </label>
                              <label className="profile-formField profile-formField--full" style={{ marginBottom: '0.5rem' }}>
                                <span className="muted">Description:</span>
                                <textarea
                                  name="description"
                                  rows={3}
                                  value={editUserForm.description || ''}
                                  onChange={handleEditUserChange}
                                />
                              </label>
                            </>
                          )}
                          <div className="user-card__actions" style={{ marginTop: '0.75rem' }}>
                            <button 
                              className="auth-button auth-button--small" 
                              type="submit"
                              disabled={saving}
                            >
                              {saving ? 'Saving…' : 'Save'}
                            </button>
                            <button
                              className="auth-button auth-button--small auth-button--secondary"
                              type="button"
                              onClick={cancelEditingUser}
                              disabled={saving}
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      ) : (
                        <>
                          {u.role === 'adopter' && u.adopterProfile && (
                            <>
                              <div className="user-card__detail">
                                <span className="muted">Name:</span> {u.adopterProfile.name || '—'}
                              </div>
                              <div className="user-card__detail">
                                <span className="muted">Address:</span>{' '}
                                {u.adopterProfile.address || '—'}
                              </div>
                              <div className="user-card__detail">
                                <span className="muted">DOB:</span>{' '}
                                {formatDate(u.adopterProfile.dob) || '—'}
                              </div>
                            </>
                          )}
                          {u.role === 'shelter' && u.shelterProfile && (
                            <>
                              <div className="user-card__detail">
                                <span className="muted">Shelter:</span>{' '}
                                {u.shelterProfile.companyName || '—'}
                              </div>
                              <div className="user-card__detail">
                                <span className="muted">Address:</span>{' '}
                                {u.shelterProfile.address || '—'}
                              </div>
                              <div className="user-card__detail">
                                <span className="muted">Description:</span>{' '}
                                {u.shelterProfile.description || '—'}
                              </div>
                            </>
                          )}
                          {u.role === 'admin' && (
                            <div className="user-card__detail">
                              <span className="muted">Display name:</span> {u.displayName || '—'}
                            </div>
                          )}
                          <div className="user-card__actions">
                            {u.role !== 'admin' && (
                              <>
                                <button 
                                  className="auth-button auth-button--small" 
                                  onClick={() => startEditingUser(u)}
                                  disabled={saving}
                                >
                                  Edit
                                </button>
                                <button
                                  className="auth-button auth-button--small auth-button--danger"
                                  onClick={() => handleDeleteUser(u.id, u.role)}
                                  disabled={saving}
                                >
                                  Delete
                                </button>
                              </>
                            )}
                            {u.role === 'admin' && (
                              <span className="muted" style={{ fontSize: '0.875rem' }}>
                                Admin accounts cannot be edited or deleted
                              </span>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ))}
                {allUsers.length === 0 && <div className="profile-details">No users found.</div>}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}