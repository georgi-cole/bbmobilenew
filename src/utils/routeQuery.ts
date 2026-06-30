export function getRouteSearchParams(): URLSearchParams {
  const params = new URLSearchParams(window.location.search);
  const hashQueryIndex = window.location.hash.indexOf('?');

  if (hashQueryIndex === -1) {
    return params;
  }

  const hashParams = new URLSearchParams(window.location.hash.slice(hashQueryIndex + 1));
  for (const [key, value] of hashParams.entries()) {
    params.set(key, value);
  }

  return params;
}

export function getRouteFlag(name: string): boolean {
  const params = getRouteSearchParams();
  const value = params.get(name);
  if (value == null) return params.has(name);
  return value === '' || value === '1' || value.toLowerCase() === 'true';
}
