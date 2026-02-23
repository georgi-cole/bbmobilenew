import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { closeSocialSummary } from '../../store/uiSlice';
import { selectLastSocialReport } from '../../social/socialSlice';
import './SocialSummaryPopup.css';

/**
 * SocialSummaryPopup — modal overlay that displays the SocialPhaseReport
 * (state.social.lastReport) after a social phase ends.
 *
 * The summary is persisted to the Diary Room automatically by SocialEngine.endPhase()
 * via SocialSummaryBridge. This popup is purely informational; the Close button only
 * dismisses the overlay.
 */
export default function SocialSummaryPopup() {
  const dispatch = useAppDispatch();
  const report = useAppSelector(selectLastSocialReport);

  function handleClose() {
    dispatch(closeSocialSummary());
  }

  if (!report) return null;

  return (
    <div
      className="ssp"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ssp-title"
    >
      <div className="ssp__card">
        <header className="ssp__header">
          <span className="ssp__icon">📊</span>
          <h2 className="ssp__title" id="ssp-title">
            Social Phase Summary
          </h2>
          <span className="ssp__week">Week {report.week}</span>
        </header>

        <div className="ssp__body">
          <p className="ssp__text">{report.summary}</p>
          <p className="ssp__note">🔒 Saved to Diary Room automatically</p>
        </div>

        <footer className="ssp__footer">
          <button className="ssp__close-btn" onClick={handleClose} type="button">
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}
