export function matchOfficialSource(registry, value) {
  if (registry?.schema_version !== 'study-official-source-registry-v1') {
    return { ok: false, reason: 'official-source-registry-invalid', registry_id: null };
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: 'official-source-not-registered', registry_id: null };
  }
  const githubRule = registry.github_repository_rule;
  if (githubRule && url.origin === githubRule.origin) {
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length >= githubRule.minimum_path_segments) {
      return { ok: true, reason: null, registry_id: githubRule.id };
    }
  }
  const origin = (registry.origins ?? []).find((entry) => entry.origin === url.origin);
  return origin
    ? { ok: true, reason: null, registry_id: origin.id }
    : { ok: false, reason: 'official-source-not-registered', registry_id: null };
}
