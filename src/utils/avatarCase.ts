// src/utils/avatarCase.ts

function capitalizeFirstChar(s: string): string {
  if (!s || s.length === 0) return s;
  return s[0].toUpperCase() + s.slice(1);
}

function lowercaseFirstChar(s: string): string {
  if (!s || s.length === 0) return s;
  return s[0].toLowerCase() + s.slice(1);
}

export function avatarVariants(url: string): string[] {
  const m = url.match(/^(.*\/)([^/?#]+)(\?[^#]*)?(#.*)?$/);
  if (!m) return [url];
  const prefix = m[1];
  const filename = m[2];
  const query = m[3] || '';
  const hash = m[4] || '';

  const capitalized = capitalizeFirstChar(filename);
  const lowercased = lowercaseFirstChar(filename);

  const variants = [url];
  if (capitalized !== filename) variants.push(`${prefix}${capitalized}${query}${hash}`);
  if (lowercased !== filename && lowercased !== capitalized)
    variants.push(`${prefix}${lowercased}${query}${hash}`);

  return variants;
}
