import { useEffect, useRef } from 'react';
import type { Player } from '../../types';
import { enrichPlayer } from '../../utils/houseguestLookup';
import PlayerAvatar from '../PlayerAvatar/PlayerAvatar';
import './HouseguestInfoDialog.css';

interface HouseguestInfoDialogProps {
  player: Player;
  onClose: () => void;
}

function parseLocation(location?: string): { city: string; nationality: string } {
  if (!location) return { city: '', nationality: '' };
  const parts = location.split(', ');
  if (parts.length >= 2) {
    return { city: parts[0], nationality: parts[parts.length - 1] };
  }
  return { city: location, nationality: '' };
}

export default function HouseguestInfoDialog({ player, onClose }: HouseguestInfoDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const ep = enrichPlayer(player);
  const { city, nationality } = parseLocation(ep.location);

  const fields: Array<{ label: string; value: string | number | undefined }> = [
    { label: 'Age', value: ep.age },
    { label: 'Nationality', value: nationality || undefined },
    { label: 'City', value: city || undefined },
    { label: 'Occupation', value: ep.profession },
    { label: 'Zodiac', value: ep.zodiacSign },
  ];

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCloseRef.current();
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div
      className="hg-info-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="hg-info-dialog"
        role="dialog"
        aria-label={`${ep.fullName ?? ep.name} details`}
        aria-modal="true"
        tabIndex={-1}
        ref={dialogRef}
      >
        <button
          className="hg-info-dialog__close"
          onClick={onClose}
          aria-label="Close"
          type="button"
        >
          ✕
        </button>

        <div className="hg-info-dialog__header">
          <PlayerAvatar
            player={player}
            className="hg-info-dialog__avatar"
            size="lg"
            showRelationshipOutline={false}
            showEvictedStyle={false}
          />
          <div className="hg-info-dialog__identity">
            <h3 className="hg-info-dialog__name">{ep.fullName ?? ep.name}</h3>
          </div>
        </div>

        <dl className="hg-info-dialog__fields">
          {fields.map(({ label, value }) =>
            value !== undefined && value !== '' ? (
              <div key={label} className="hg-info-dialog__field">
                <dt className="hg-info-dialog__field-label">{label}</dt>
                <dd className="hg-info-dialog__field-value">{value}</dd>
              </div>
            ) : null,
          )}
        </dl>
      </div>
    </div>
  );
}
