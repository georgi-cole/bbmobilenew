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
});
