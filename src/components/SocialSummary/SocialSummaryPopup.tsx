import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { addSocialSummary } from '../../store/gameSlice';
import { closeSocialSummary } from '../../store/uiSlice';
import { selectLastSocialReport } from '../../social/socialSlice';
import './SocialSummaryPopup.css';

/**
 * SocialSummaryPopup — modal overlay that displays the SocialPhaseReport
 * (state.social.lastReport) after a social phase ends.
 *
 * The Close / Save button:
 *   1. Dispatches `game/addSocialSummary` to persist the summary to the
 *      Diary Room log (stored as a 'diary' event, NOT shown on the TV feed).
 *   2. Dispatches `ui/closeSocialSummary` to hide the popup.
 */
export default function SocialSummaryPopup() {
  const dispatch = useAppDispatch();
  const report = useAppSelector(selectLastSocialReport);

  function handleClose() {
    if (report) {
      dispatch(addSocialSummary({ summary: report.summary, week: report.week }));
    }
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
          <p className="ssp__note">🔒 Saving to Diary Room only</p>
        </div>

        <footer className="ssp__footer">
          <button className="ssp__close-btn" onClick={handleClose} type="button">
            Save to Diary &amp; Close
          </button>
        </footer>
      </div>
    </div>
  );
}
