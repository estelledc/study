#!/usr/bin/env node
// Match Astro/Starlight URL slug generation from content filename (without .md).
// Dots are removed from the path segment (oauth-2.1-rfc → oauth-21-rfc).

export function slugForUrl(slug) {
  return String(slug).replace(/\./g, '');
}
