import { defineCollection } from 'astro:content';
import { docsLoader, i18nLoader } from '@astrojs/starlight/loaders';
import { docsSchema, i18nSchema } from '@astrojs/starlight/schema';
import { z } from 'astro/zod';

const isoDate = z.union([
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  z.date(),
]);

const trustFields = {
  version: z.literal('study-v2'),
  canonical_source: z.string().url(),
  source_authority: z.enum(['OFFICIAL_PRIMARY', 'AUTHOR_PRIMARY', 'SECONDARY']),
  accessed_at: isoDate,
  evidence_type: z.enum([
    'PRIMARY_SOURCE',
    'STATIC_ANALYSIS',
    'EXECUTED_EXPERIMENT',
    'USER_OBSERVATION',
    'NOT_APPLICABLE',
  ]),
  verification_status: z.enum([
    'UNVERIFIED',
    'PARTIALLY_VERIFIED',
    'VERIFIED',
    'NOT_APPLICABLE',
  ]),
  reviewed_at: isoDate,
  review_after: isoDate.nullable(),
  applicable_version: z.string().min(1).max(120).optional(),
};

const trustSchema = z.discriminatedUnion('source_kind', [
  z.object({
    ...trustFields,
    source_kind: z.literal('project'),
    note_type: z.enum([
      'concept', 'library', 'system', 'protocol', 'tool', 'platform-api', 'security-guidance',
    ]),
    immutable_revision: z.string().min(7).max(128),
  }),
  z.object({
    ...trustFields,
    source_kind: z.literal('paper'),
    note_type: z.enum(['paper', 'concept', 'protocol', 'security-guidance']),
    publication_id: z.string().min(3).max(240),
    source_version: z.string().min(1).max(120).optional(),
  }),
]);

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema({
      // Optional by design: the audit layer reports old notes as legacy-unverified.
      extend: z.object({ trust: trustSchema.optional() }),
    }),
  }),
  i18n: defineCollection({
    loader: i18nLoader(),
    schema: i18nSchema(),
  }),
};
