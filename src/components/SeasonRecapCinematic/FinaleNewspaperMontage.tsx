import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import NewspaperFrontPage from './NewspaperFrontPage';
import type { NewspaperFrontPageData } from './newspaperFrontPages';
import './FinaleNewspaperMontage.css';

export interface FinaleMontageNote {
  kicker: string;
  line: string;
}

interface FinaleNewspaperMontageProps {
  pages: NewspaperFrontPageData[];
  notes?: FinaleMontageNote[];
  durationMs: number;
  reducedMotion?: boolean;
}

const MAX_STACKED_PAGES = 3;

export default function FinaleNewspaperMontage({
  pages,
  notes = [],
  durationMs,
  reducedMotion = false,
}: FinaleNewspaperMontageProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const stepMs = Math.max(1000, Math.floor(durationMs / Math.min(Math.max(pages.length, 1), 5)));

  useEffect(() => {
    if (reducedMotion || pages.length <= 1 || activeIndex >= pages.length - 1) return;

    const timer = setTimeout(() => {
      setActiveIndex((current) => (current >= pages.length - 1 ? current : current + 1));
    }, stepMs);

    return () => clearTimeout(timer);
  }, [activeIndex, pages.length, reducedMotion, stepMs]);

  const visiblePages = useMemo(() => pages.slice(0, activeIndex + 1).slice(-MAX_STACKED_PAGES), [activeIndex, pages]);

  return (
    <div className="src-news-montage">
      <div className="src-news-montage__stage">
        <AnimatePresence initial={false}>
          <motion.div
            key={`flash-${activeIndex}`}
            className="src-news-montage__flash"
            initial={{ opacity: 0.14 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.45 }}
          />
        </AnimatePresence>

        {visiblePages.map((page, index) => {
          const depth = visiblePages.length - index - 1;
          const isFrontPage = depth === 0;

          return (
            <motion.div
              key={page.id}
              className={`src-news-montage__paper src-news-montage__paper--depth-${depth}`}
              aria-hidden={!isFrontPage}
              initial={
                reducedMotion
                  ? false
                  : {
                      opacity: isFrontPage ? 0 : 0.72,
                      x: isFrontPage ? 72 : -12 * depth,
                      y: isFrontPage ? 26 : 18 * depth,
                      rotate: isFrontPage ? 7 : -2 * depth,
                      scale: isFrontPage ? 1.04 : 1 - depth * 0.03,
                    }
              }
              animate={{
                opacity: 1 - depth * 0.18,
                x: -12 * depth,
                y: 18 * depth,
                rotate: isFrontPage ? (activeIndex % 2 === 0 ? -2.5 : 2.5) : -2.5 * depth,
                scale: 1 - depth * 0.035,
              }}
              transition={{ duration: reducedMotion ? 0 : 0.5, ease: [0.22, 1, 0.36, 1] }}
              style={{ zIndex: 10 - depth }}
            >
              <NewspaperFrontPage page={page} />
            </motion.div>
          );
        })}
      </div>

      {notes.length > 0 && (
        <div className="src-news-montage__notes" aria-label="Season drama notes">
          {notes.map((note) => (
            <article key={note.kicker} className="src-news-montage__note">
              <span className="src-news-montage__note-kicker">{note.kicker}</span>
              <p className="src-news-montage__note-line">{note.line}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
