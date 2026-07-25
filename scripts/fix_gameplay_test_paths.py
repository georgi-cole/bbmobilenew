from __future__ import annotations

import re
from pathlib import Path

TEST_PATH = Path("tests/unit/gameplayPolish.regression.test.ts")
text = TEST_PATH.read_text(encoding="utf-8")

text = text.replace(
    "import { readFileSync } from 'node:fs';\n",
    "import { readFileSync } from 'node:fs';\nimport { join } from 'node:path';\n",
    1,
)

helper = """
function sourceText(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8');
}

"""
marker = "describe('gameplay polish regressions', () => {"
if "function sourceText(" not in text:
    if marker not in text:
        raise RuntimeError("Could not find gameplay regression describe block")
    text = text.replace(marker, helper + marker, 1)

pattern = re.compile(
    r"readFileSync\(\s*new URL\(\s*(['\"])(?P<path>\.\./\.\./[^'\"]+)\1\s*,\s*import\.meta\.url\s*,?\s*\)\s*,\s*(['\"])utf8\3\s*,?\s*\)",
    re.DOTALL,
)

replacements = 0


def replace_file_url(match: re.Match[str]) -> str:
    global replacements
    replacements += 1
    relative_path = match.group("path").removeprefix("../../")
    return f"sourceText('{relative_path}')"


text = pattern.sub(replace_file_url, text)
if replacements < 3:
    raise RuntimeError(f"Expected at least 3 file-URL replacements, found {replacements}")

text = text.replace(
    "from '../../src/components/FloatingActionBar/FloatingActionBar';",
    "from '../../src/components/FloatingActionBar/publicMeterNavigation';",
    1,
)
TEST_PATH.write_text(text, encoding="utf-8")

navigation_path = Path(
    "src/components/FloatingActionBar/publicMeterNavigation.ts"
)
navigation_path.write_text(
    """export function resolvePublicMeterDestination(
  publicModeEnabled: boolean,
  publicRequestCount: number,
): string {
  if (!publicModeEnabled) return '/store';
  return publicRequestCount > 0 ? '/public-meter?tab=requests' : '/public-meter';
}
""",
    encoding="utf-8",
)

fab_path = Path("src/components/FloatingActionBar/FloatingActionBar.tsx")
fab_text = fab_path.read_text(encoding="utf-8")
layout_import = "import { resolveBalancedDockBottom } from './floatingActionBarLayout';\n"
nav_import = (
    "import { resolveBalancedDockBottom } from './floatingActionBarLayout';\n"
    "import { resolvePublicMeterDestination } from './publicMeterNavigation';\n"
)
if "from './publicMeterNavigation'" not in fab_text:
    if layout_import not in fab_text:
        raise RuntimeError("Could not find FloatingActionBar layout import")
    fab_text = fab_text.replace(layout_import, nav_import, 1)

fab_text, function_replacements = re.subn(
    r"\nexport function resolvePublicMeterDestination\(\s*publicModeEnabled: boolean,\s*publicRequestCount: number,\s*\): string \{\s*if \(!publicModeEnabled\) return '/store';\s*return publicRequestCount > 0 \? '/public-meter\?tab=requests' : '/public-meter';\s*\}\n",
    "\n",
    fab_text,
    count=1,
    flags=re.DOTALL,
)
if function_replacements != 1:
    raise RuntimeError(
        f"Expected to move one Public Meter resolver, moved {function_replacements}"
    )
fab_path.write_text(fab_text, encoding="utf-8")

print(
    f"Converted {replacements} source reads and isolated the Public Meter resolver."
)
