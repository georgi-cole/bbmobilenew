import './PhonePreviewPage.css';

const previewUrl = `${import.meta.env.BASE_URL}#/twists-test?preview=public-favorite&phonePreview=true`;

export default function PhonePreviewPage() {
  return (
    <main className="phone-preview-page">
      <div className="phone-preview-page__intro">
        <p className="phone-preview-page__eyebrow">Local device preview</p>
        <h1>Public Favorite on a phone</h1>
        <p>A live 390 × 844 phone frame. Tap through it exactly as a player would.</p>
        <a className="phone-preview-page__back" href="#/twists-test">Back to the test page</a>
      </div>

      <div className="phone-preview-page__phone" aria-label="390 by 844 phone simulator">
        <div className="phone-preview-page__speaker" aria-hidden="true" />
        <iframe
          className="phone-preview-page__screen"
          title="Public Favorite phone preview"
          src={previewUrl}
        />
      </div>
    </main>
  );
}
