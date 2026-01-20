import React from 'react';
import '../styles/PetSummaryCard.css';

export default function PetSummaryCard({ pet, role, uid, onView, onEdit, rightContent }) {
  const {
    id,
    name,
    animalType,
    species,
    breed,
    gender,
    photoUrls,
    status,
  } = pet;

  const normalizedStatus = (status || 'active').toLowerCase();
  const isAdopted = normalizedStatus === 'adopted';
  const isInactive = normalizedStatus === 'inactive';
  const showStatus = isAdopted || isInactive;
  const canEdit =
    role === 'admin' || (role === 'shelter' && uid && pet?.shelterId && pet.shelterId === uid);

  // Build details array with animalType/species, breed, and gender, filter out empty ones
  const details = [animalType || species, breed, gender].filter(Boolean);
  const mediaList = Array.isArray(photoUrls) ? photoUrls.filter(Boolean) : [];
  const cover = mediaList[0] || '/pet-placeholder.png';

  return (
    <div className="card pet-card card--compact">
      <img className="pet-card__image" src={cover} alt={name || 'Pet'} />

      <div className="pet-card__body">
        <div className="pet-card__titleRow">
          <strong className="pet-card__title">{name || 'Unnamed'}</strong>
          {showStatus && (
            <span className="badge badge--danger">{isAdopted ? 'Adopted' : 'Inactive'}</span>
          )}
        </div>

        <div className="pet-card__line muted">
          {details.length > 0 ? details.join(' · ') : 'Details not available'}
        </div>

        <div className="cluster-8 wrap">
          {onView && (
            <button className="auth-button" onClick={() => onView(id)}>
              View
            </button>
          )}
          {canEdit && onEdit && (
            <button className="auth-button auth-button--secondary" onClick={() => onEdit(id)}>
              Edit
            </button>
          )}
        </div>
      </div>

      {rightContent && <div className="pet-card__right">{rightContent}</div>}
    </div>
  );
}