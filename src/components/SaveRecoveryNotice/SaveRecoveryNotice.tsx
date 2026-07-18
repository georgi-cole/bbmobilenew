import { useEffect, useState } from 'react';
import {
  clearLastSavePersistenceIssue,
  getLastSavePersistenceIssue,
  SAVE_PERSISTENCE_ISSUE_EVENT,
  type SavePersistenceIssue,
} from '../../store/saveStatePersistence';
import './SaveRecoveryNotice.css';

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
  const copy = issue.kind === 'write_failed'
    ? {
        title: 'Progress could not be saved',
        body: 'Your season is still open. Free some browser storage, then use Save & Home again.',
      }
    : {
        title: 'Save recovered safely',
        body: 'A damaged save was set aside. The game opened the last valid version it could find.',
      };

  return (
    <aside className="save-recovery-notice" role="alert">
      <div><strong>{copy.title}</strong><span>{copy.body}</span></div>
      <button type="button" onClick={() => { clearLastSavePersistenceIssue(); setIssue(null); }} aria-label="Dismiss save notice">×</button>
    </aside>
  );
}
