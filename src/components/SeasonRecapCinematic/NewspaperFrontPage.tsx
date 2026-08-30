import type { NewspaperFrontPageData } from './newspaperFrontPages'
import type { MouseEvent } from 'react'

interface NewspaperFrontPageProps {
  page: NewspaperFrontPageData
  className?: string
}

export default function NewspaperFrontPage({ page, className }: NewspaperFrontPageProps) {
  const preventImageMenu = (event: MouseEvent<HTMLImageElement>) => event.preventDefault()
  return (
    <article
      className={[
        'src-news-page',
        `src-news-page--${page.layoutVariant}`,
        page.blackAndWhite ? 'src-news-page--bw' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="src-news-page__paper-noise" aria-hidden="true" />
      <div className="src-news-page__print-shadow" aria-hidden="true" />

      <header className="src-news-page__header">
        <div className="src-news-page__meta">
          <span>{page.category}</span>
          <span>{page.price}</span>
        </div>
        <div className="src-news-page__masthead-row">
          <span className="src-news-page__issue">
            {page.issueDate} • {page.issueNumber}
          </span>
          <h3 className="src-news-page__masthead">{page.newspaperName}</h3>
          <span className="src-news-page__edition">{page.edition}</span>
        </div>
        <div className="src-news-page__teasers">
          {page.pageTeasers.map((teaser) => (
            <span key={teaser} className="src-news-page__teaser">
              {teaser}
            </span>
          ))}
        </div>
      </header>

      <div className="src-news-page__labels">
        {page.decorativeTeaserLabels.map((label) => (
          <span key={label} className="src-news-page__label">
            {label}
          </span>
        ))}
      </div>

      <div className="src-news-page__lead">
        <div className="src-news-page__headline-wrap">
          <p className="src-news-page__banner">Front page special report</p>
          <h4 className="src-news-page__headline">{page.headline}</h4>
          <p className="src-news-page__subheadline">{page.subheadline}</p>
          {page.headlineHighlight && (
            <span className="src-news-page__headline-highlight">{page.headlineHighlight}</span>
          )}
        </div>

        <div className="src-news-page__photo-layout">
          <figure className="src-news-page__photo-frame">
            <img
              src={page.featuredImage}
              alt={page.featuredImageAlt}
              className="src-news-page__photo"
              draggable={false}
              onContextMenu={preventImageMenu}
            />
          </figure>
          {page.secondaryImage && (
            <figure className="src-news-page__photo-frame src-news-page__photo-frame--secondary">
              <img
                src={page.secondaryImage}
                alt={page.secondaryImageAlt ?? page.featuredImageAlt}
                className="src-news-page__photo"
                draggable={false}
                onContextMenu={preventImageMenu}
              />
            </figure>
          )}
        </div>
      </div>

      <div className="src-news-page__divider" aria-hidden="true" />

      <div className="src-news-page__snippets">
        {page.articleSnippets.map((snippet) => (
          <article key={`${page.id}-${snippet.label}`} className="src-news-page__snippet">
            <span className="src-news-page__snippet-label">{snippet.label}</span>
            <p className="src-news-page__snippet-text">{snippet.text}</p>
          </article>
        ))}
      </div>
    </article>
  )
}
