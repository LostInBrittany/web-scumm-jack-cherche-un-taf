// Who reviewed a translation pair or a claim's scope (4.5.0 "Wiki", A7 review; docs/dev/PLAN-4.5-WIKI.md §4.4.3 and
// §4.7.1, amendment A7). A record says the reviewer's name, whether a person or an AI read it (`kind`), and whether
// the reviewer wrote what they read (`relation: author`) or not (`independent`). An AI that checks its own pages is
// self-checking, not reviewing, and is said as such wherever a reader sees it. A published claim needs at least one
// review by a person (`kind: human`); a translation pair needs a record, an AI's included, said as what it is (D56
// amends A7, which wanted a person for every pair). `ready` still means the work is complete; it never meant reviewed.
import { z } from 'zod';

export const ReviewerSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    kind: z.enum(['human', 'ai']),
    relation: z.enum(['author', 'independent']),
    date: z.iso.date(),
  })
  .strict();
export type Reviewer = z.infer<typeof ReviewerSchema>;

/** The reviewers of a record: one per name, the latest kept, in the order they came. */
export function withReviewer(list: readonly Reviewer[], r: Reviewer): Reviewer[] {
  return [...list.filter((x) => x.name !== r.name), r];
}

export const humanReviewed = (list: readonly Reviewer[] | undefined) => !!list?.some((r) => r.kind === 'human');

/** What a record's reviewers amount to, in words (the CLI's and the rendered page's). */
export function reviewWords(list: readonly Reviewer[] | undefined, lang: 'en' | 'fr' = 'en'): string | undefined {
  if (!list?.length) return undefined;
  if (humanReviewed(list)) return lang === 'fr' ? 'relue' : 'reviewed';
  return list.some((r) => r.relation === 'independent')
    ? lang === 'fr'
      ? 'vérifiée par une IA indépendante, pas relue par une personne'
      : 'checked by an independent AI, not reviewed by a person'
    : lang === 'fr'
      ? 'vérifiée par son auteur (IA), pas relue'
      : 'self-checked by the author (AI), not reviewed';
}

/** The reviewer the CLI's options name: `--by <name> --kind human|ai --relation author|independent`, all required. */
export function reviewerOf(
  o: { by?: string; kind?: string; relation?: string },
  date: string,
): { reviewer?: Reviewer; problem?: string } {
  if (!o.by?.trim()) return { problem: '--by names who read it' };
  if (o.kind !== 'human' && o.kind !== 'ai') return { problem: '--kind is human or ai: who read it' };
  if (o.relation !== 'author' && o.relation !== 'independent')
    return { problem: '--relation is author (the reviewer wrote it) or independent' };
  return { reviewer: { name: o.by.trim(), kind: o.kind, relation: o.relation, date } };
}
