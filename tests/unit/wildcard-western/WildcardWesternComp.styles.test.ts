import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('WildcardWesternComp styles', () => {
  it('includes compact responsive rules for narrow and short mobile viewports', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/components/WildcardWesternComp/WildcardWesternComp.css'),
      'utf8',
    );

    const mobileRuleStart = css.indexOf('@media (max-width: 540px), (max-height: 820px) {');
    expect(mobileRuleStart).toBeGreaterThanOrEqual(0);

    const mobileRuleBody = css.slice(mobileRuleStart);
    expect(mobileRuleBody).toContain('justify-content: flex-start;');
    expect(mobileRuleBody).toContain('.ww-avatar-btn--md { width: 58px; height: 58px; }');
    expect(mobileRuleBody).toContain('.ww-avatar-btn--sm { width: 28px; height: 28px; }');
    expect(mobileRuleBody).toContain('.ww-buzz-btn {');
    expect(mobileRuleBody).toContain('font-size: 1.35rem;');
    expect(mobileRuleBody).toContain('.ww-status-avatars .ww-avatar-name,');
    expect(mobileRuleBody).toContain('display: none;');
    expect(mobileRuleBody).toContain(
      'padding: 0.42rem 0.65rem max(0.42rem, env(safe-area-inset-bottom));',
    );
  });

  it('keeps the league header and final action visible while only standings scroll', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/components/WildcardWesternComp/WildcardWesternComp.css'),
      'utf8',
    );
    const component = readFileSync(
      resolve(process.cwd(), 'src/components/WildcardWesternComp/WildcardWesternComp.tsx'),
      'utf8',
    );

    expect(component).toContain("'ww-content ww-content--league-results'");
    expect(component).toContain('className="ww-btn ww-league-start"');
    expect(component).toContain('aria-label="League standings"');

    expect(css).toMatch(/\.ww-content--league-results\s*\{[^}]*min-height:\s*0;[^}]*justify-content:\s*flex-start;[^}]*overflow:\s*hidden;/s);
    expect(css).toMatch(/\.ww-content--league-results \.ww-league-results\s*\{[^}]*height:\s*100%;[^}]*min-height:\s*0;[^}]*display:\s*flex;/s);
    expect(css).toMatch(/\.ww-content--league-results \.ww-league-list\s*\{[^}]*flex:\s*1 1 auto;[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;[^}]*overscroll-behavior:\s*contain;[^}]*-webkit-overflow-scrolling:\s*touch;/s);
    expect(css).toMatch(/\.ww-league-start\s*\{[^}]*align-self:\s*center;/s);
  });
});
