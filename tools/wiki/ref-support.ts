// The support matrix's per-surface part (`reference.support-matrix`, lot B11): for each product surface of the status
// registry (docs/dev/contracts.json, tools/wiki/contracts.ts), its five statuses kept apart, as of the registry's own
// `asOf` version (so a version bump alone does not change the page): the contract, the environments CI verifies, the
// automated checks, the people's passes with their state in that version's sheet and the issue that tracks each, and
// where the known limits are. No data file: the registry is the data, checked by `wiki -- check` (A5).
import { readContracts, surfaceStatuses } from './contracts';
import {
  code,
  colon,
  duplicateAnchors,
  type GenContext,
  type GenResult,
  type Generator,
  type Lang,
  repoLink,
} from './generated';

const SUPPORT_PAGE = 'reference.support-matrix';
const ISSUES = 'https://github.com/Quest-n-Click/quest-n-click/issues/';

const W = {
  en: {
    contract: 'Contract',
    status: { experimental: 'experimental', stable: 'stable', deprecated: 'deprecated' },
    environments: (v: string, d: string) => `Environments CI verifies (support matrix of ${v}, ${d})`,
    none: 'none named',
    checks: 'Automated checks',
    gates: 'ci:plan gates',
    jobs: 'CI and candidate jobs',
    tests: 'test files',
    passes: 'Checks by people',
    noPass: 'none asked',
    state: {
      passed: 'passed',
      failed: 'failed',
      blocked: 'blocked',
      'not-run': 'not run yet',
      'not-asked': 'not asked of this version',
    },
    sheet: 'states from',
    limits: 'Known limits',
    limitsText: 'the `[!LIMIT]` blocks of the pages that name this surface in the manifest (`surfaces`)',
  },
  fr: {
    contract: 'Contrat',
    status: { experimental: 'expérimental', stable: 'stable', deprecated: 'déprécié' },
    environments: (v: string, d: string) => `Environnements vérifiés par la CI (matrice de support de ${v}, ${d})`,
    none: 'aucun de nommé',
    checks: 'Vérifications automatiques',
    gates: 'gates de ci:plan',
    jobs: 'jobs de CI et du candidat',
    tests: 'fichiers de test',
    passes: 'Vérifications par des personnes',
    noPass: 'aucune demandée',
    state: {
      passed: 'réussie',
      failed: 'échouée',
      blocked: 'bloquée',
      'not-run': 'pas encore faite',
      'not-asked': 'pas demandée pour cette version',
    },
    sheet: 'états lus dans',
    limits: 'Limites connues',
    limitsText: 'les blocs `[!LIMIT]` des pages qui nomment cette surface dans le manifeste (`surfaces`)',
  },
} as const;

const testLink = (t: string) => (/[*?]/.test(t) ? code(t) : repoLink(t));

export const supportGenerator: Generator = {
  page: SUPPORT_PAGE,
  build({ root }: GenContext): GenResult {
    const { contracts, errors } = readContracts(root);
    if (!contracts) return { problems: errors };
    const statuses = surfaceStatuses(root, contracts, contracts.asOf.version);
    const text = (lang: Lang) => {
      const w = W[lang];
      const c = colon(lang);
      const semi = lang === 'en' ? '; ' : ' ; ';
      const out: string[] = [];
      for (const s of statuses.values()) {
        out.push(`<a name="${s.id}"></a>`, '', `### ${s.title[lang]}`, '');
        out.push(`- ${w.contract}${c}**${w.status[s.contract]}** (${code(s.id)}).`);
        out.push(
          `- ${w.environments(s.asOf.version, s.asOf.date)}${c}${s.environments.map((e) => e[lang]).join(semi) || w.none}.`,
        );
        const checks = [
          s.checks.gates.length ? `${w.gates} ${s.checks.gates.map(code).join(', ')}` : '',
          s.checks.jobs.length ? `${w.jobs} ${s.checks.jobs.map(code).join(', ')}` : '',
          s.checks.tests.length ? `${w.tests} ${s.checks.tests.map(testLink).join(', ')}` : '',
        ].filter(Boolean);
        out.push(`- ${w.checks}${c}${checks.join(semi) || w.none}.`);
        if (!s.passes.length) out.push(`- ${w.passes}${c}${w.noPass}.`);
        else {
          const sheet = s.passes.find((p) => p.sheet)?.sheet;
          out.push(`- ${w.passes}${sheet ? ` (${w.sheet} ${repoLink(sheet)})` : ''}${c.trimEnd()}`);
          for (const p of s.passes)
            out.push(
              `  - ${code(p.id)}${c}${w.state[p.state]}${p.issue ? `, [#${p.issue}](${ISSUES}${p.issue})` : ''}.`,
            );
        }
        out.push(`- ${w.limits}${c}${w.limitsText}.`, '');
      }
      return out.join('\n');
    };
    const en = text('en');
    return { sections: { en, fr: text('fr') }, problems: duplicateAnchors(SUPPORT_PAGE, en) };
  },
};
