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

TEST_PATH.write_text(text, encoding="utf-8")
print(f"Converted {replacements} regression source reads to repository filesystem paths.")
