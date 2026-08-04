import { useEffect, useState } from 'react';
import {
  clearLastSavePersistenceIssue,
  getLastSavePersistenceIssue,
  SAVE_PERSISTENCE_ISSUE_EVENT,
  type SavePersistenceIssue,
} from '../../store/saveStatePersistence';
import './SaveRecoveryNotice.css';

function getIssueCopy(issue: SavePersistenceIssue) {
  if (issue.kind === 'corrupt_recovered') {
    return {
      title: 'Save recovered safely',
      body: 'A damaged save was set aside. The game opened the last valid version it could find.',
    };
  }

  switch (issue.reason) {
    case 'quota_exceeded':
      return {
        title: 'Progress could not be saved',
        body: 'Browser storage is full. Your season is still open, so free some site storage and try Save & Home again.',
      };
    case 'storage_unavailable':
      return {
        title: 'Saving is unavailable',
        body: 'This browser is blocking site storage. Allow storage for this site, then try Save & Home again.',
      };
    case 'serialization_failed':
      return {
        title: 'Progress could not be prepared for saving',
        body: 'Your season is still open. Try Save & Home again; if the problem continues, keep the tab open and report it.',
      };
    default:
      return {
        title: 'Progress could not be saved',
        body: 'Your season is still open. Try Save & Home again before closing or refreshing the game.',
      };
  }
}

export default function SaveRecoveryNotice() {
  const [issue, setIssue] = useState<SavePersistenceIssue | null>(() => getLastSavePersistenceIssue());

  useEffect(() => {
    const onIssue = (event: Event) => {
      setIssue((event as CustomEvent<SavePersistenceIssue>).detail);
    };
    window.addEventListener(SAVE_PERSISTENCE_ISSUE_EVENT, onIssue);
    return () => window.removeEventListener(SAVE_PERSISTENCE_ISSUE_EVENT, onIssue);
  }, []);

  if (!issue) return null;
  const copy = getIssueCopy(issue);

  return (
    <aside className="save-recovery-notice" role="alert">
      <div><strong>{copy.title}</strong><span>{copy.body}</span></div>
      <button
        type="button"
        onClick={() => { clearLastSavePersistenceIssue(); setIssue(null); }}
        aria-label="Dismiss save notice"
      >
        ×
      </button>
    </aside>
  );
}
