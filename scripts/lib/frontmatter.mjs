import yaml from 'js-yaml';

const FRONTMATTER_RE = /^(---\r?\n)([\s\S]*?)(\r?\n---)(?:\r?\n|$)/;
const KEY_RE = /^([A-Za-z_一-龥][A-Za-z0-9_一-龥]*)\s*:\s*(.*)$/;

export function extractFrontmatterBlock(text) {
  const match = text.match(FRONTMATTER_RE);
  if (!match) return null;
  return {
    raw: match[0],
    open: match[1],
    block: match[2],
    close: match[3],
    body: text.slice(match[0].length),
    end: match[0].length,
  };
}

export function replaceFrontmatterBlock(text, nextBlock) {
  const frontmatter = extractFrontmatterBlock(text);
  if (!frontmatter) return text;
  const trailingNewline = frontmatter.raw.endsWith('\n') ? '\n' : '';
  return `${frontmatter.open}${nextBlock}${frontmatter.close}${trailingNewline}${text.slice(frontmatter.end)}`;
}

export function parseFrontmatterLoose(text) {
  const frontmatter = extractFrontmatterBlock(text);
  if (!frontmatter) return null;

  try {
    const parsed = yaml.load(frontmatter.block);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return parseFrontmatterKeyValues(frontmatter.block);
  }
}

export function parseFrontmatterKeyValues(block) {
  const fields = {};
  for (const line of block.split(/\r?\n/)) {
    if (!line || /^\s/.test(line) || line.startsWith('-')) continue;
    const match = line.match(KEY_RE);
    if (!match) continue;
    const [, key, rawValue] = match;
    fields[key] = rawValue.trim().replace(/^["']|["']$/g, '');
  }
  return fields;
}

export function hasFrontmatterKey(text, key) {
  const frontmatter = extractFrontmatterBlock(text);
  if (!frontmatter) return false;
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}\\s*:`, 'm').test(frontmatter.block);
}
