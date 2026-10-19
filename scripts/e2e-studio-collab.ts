// Three people on one hosted Studio, in three browsers (4.2.1 PR 7, plan §11 "E2E Playwright à trois contextes"): Léa
// (owner), Tom (dev) and Ali (reviewer) log in through the provider and see one another; Tom takes the notes; Léa's
// note is refused (423) with her draft kept and named holder, then saved once Tom lets go; Ali cannot write; Léa's
// network is cut, Tom writes, and Léa catches up from the journal when it is back; everyone ends on the same revision.
// Léa makes Ali a dev from the members' screen, and Ali writes. A visitor sees the login page and someone who is not a
// member sees "access not granted". Usage:
// tsx scripts/e2e-studio-collab.ts [--browser=chromium|firefox|webkit]. Exit 0 / 1.
import { chromium, firefox, type Page, webkit } from 'playwright';
import { startStack } from './lib/studio-stack';

const browserName = process.argv.find((a) => a.startsWith('--browser='))?.slice(10) ?? 'chromium';
const engine = { chromium, firefox, webkit }[browserName] ?? chromium;
// Firefox and WebKit over https (WebKit keeps no `Secure` cookie over http); WebKit on macOS only (see
// e2e-studio-hosted.ts: on Linux it stores no cookie a frame of another host sets).
const stack = await startStack({ tls: engine !== chromium, game: 'demo' });
const steps: [string, boolean, string?][] = [];
const check = (name: string, ok: boolean, detail?: string) => {
  steps.push([name, ok, detail]);
  console.log(`${ok ? '✓' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const browser = await engine.launch();
/** What each page did, printed if a step fails: its writes and their answers, its refusals, its console's errors. */
const trace: string[] = [];
const until = async (what: () => Promise<boolean>, ms = 15_000) => {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 200)))
    if (await what()) return true;
  return false;
};
const revisionOf = async (p: Page) => Number(await p.locator('.rev strong').innerText());
/**
 * Takes or releases a span from the spans panel, and waits until the panel shows it done (the click returns before the
 * server has answered: a write sent at once could still meet the old lease).
 */
async function spanAct(p: Page, span: string, act: 'Take' | 'Release') {
  await p.locator('.who summary').click();
  await p.getByRole('button', { name: 'Spans…' }).click();
  const row = p.locator('.span-row', { hasText: new RegExp(`^${span}`) });
  await row.getByRole('button', { name: act }).click();
  const want = act === 'Take' ? 'held by you' : 'free';
  if (!(await until(async () => (await row.locator('.span-state').innerText()) === want)))
    throw new Error(`${span}: not ${want} after ${act}`);
  await p.keyboard.press('Escape');
}

/** Adds a note in the Notes tab (the one composer that is shown there). */
async function addNote(p: Page, text: string) {
  await p.getByRole('tab', { name: 'Notes' }).click();
  const tab = p.locator('section.tab.notestab');
  await tab.getByLabel('Note text').first().fill(text);
  await tab.getByRole('button', { name: 'Add note' }).first().click();
}

try {
  const people: Record<string, Page> = {};
  for (const [who, role] of [
    ['lea', 'owner'],
    ['tom', 'dev'],
    ['ali', 'reviewer'],
  ] as const) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: stack.tls });
    const page = await ctx.newPage();
    page.on('response', (r) => {
      const u = new URL(r.url());
      if (r.status() >= 400 || (r.request().method() !== 'GET' && u.pathname.startsWith('/api/')))
        trace.push(`${who} ${r.request().method()} ${u.pathname} ${r.status()}`);
    });
    page.on('requestfailed', (r) => trace.push(`${who} failed ${new URL(r.url()).pathname} ${r.failure()?.errorText}`));
    page.on('console', (m) => m.type() === 'error' && trace.push(`${who} console ${m.text().slice(0, 200)}`));
    page.on('load', () => trace.push(`${who} load ${page.url().slice(-40)}`));
    const invite = await stack.invite(who, role);
    await page.goto(`${stack.studioUrl}/auth/login?invite=${invite}&returnTo=${encodeURIComponent('/#notes')}`);
    await page.locator('.hosted-bar .rev').waitFor({ timeout: 30_000 });
    people[who] = page;
  }
  const { lea, tom, ali } = people as Record<'lea' | 'tom' | 'ali', Page>;
  check(
    'three members see one another',
    await until(async () => (await lea.locator('.here .avatar').count()) === 3),
    `${await lea.locator('.here .avatar').count()} here`,
  );

  // Tom takes the notes; Léa's note is refused, her draft kept.
  await spanAct(tom, 'notes', 'Take');
  const before = await revisionOf(lea);
  await addNote(lea, 'The gnome should wink at the end.');
  const dialog = lea.getByRole('dialog');
  await dialog.waitFor({ timeout: 10_000 });
  const title = await dialog.getAttribute('aria-label');
  check('a span held by another is refused, naming them', /notes is held by tom/i.test(title ?? ''), title ?? '');
  check('the draft is kept to copy', (await dialog.locator('.draft pre').innerText()).includes('gnome should wink'));

  // Tom lets go; Léa's draft is saved.
  await spanAct(tom, 'notes', 'Release');
  await dialog.getByRole('button', { name: 'Try again' }).click();
  check('once free, the draft is saved', await until(async () => (await revisionOf(lea)) === before + 1));

  // Ali reads but does not write.
  await addNote(ali, 'A reviewer’s note');
  check(
    'a reviewer cannot write',
    await until(async () => (await ali.locator('.toast', { hasText: /role dev/ }).count()) > 0, 5000),
  );

  // Léa lets the notes go (her saved note took them), then is cut off; Tom writes; Léa catches up from the journal.
  await spanAct(lea, 'notes', 'Release');
  await lea.route('**/api/events', (r) => r.abort());
  stack.cut();
  check('a cut is shown', await until(async () => (await lea.locator('.pending.cut').count()) > 0));
  await addNote(tom, 'Tom was here.');
  const target = before + 2;
  await until(async () => (await revisionOf(tom)) === target);
  await lea.unroute('**/api/events');
  check(
    'after the cut, the revision missed is caught up',
    await until(async () => (await revisionOf(lea)) === target, 30_000),
    `léa at ${await revisionOf(lea)}, tom at ${await revisionOf(tom)}`,
  );
  check(
    "and what it changed reaches Léa's screen (Tom's note in her Notes tab)",
    await until(async () => (await lea.locator('section.tab.notestab', { hasText: 'Tom was here.' }).count()) > 0),
  );
  check('everyone ends on the same revision', await until(async () => (await revisionOf(ali)) === target));

  // Léa, owner, sees the members and makes Ali a dev; Ali then writes.
  await lea.locator('.who summary').click();
  await lea.getByRole('button', { name: 'Members…' }).click();
  const members = lea.getByRole('dialog');
  await members.locator('.members-table tbody tr').nth(2).waitFor({ timeout: 10_000 });
  check('the owner sees the three members', (await members.locator('.members-table tbody tr').count()) === 3);
  // Ali's page starts again by itself: the role change closes Ali's stream, and the page finds its new role.
  const aliReloaded = ali.waitForEvent('load', { timeout: 30_000 });
  lea.once('dialog', (d) => void d.accept());
  await members.getByLabel('Role of Ali').selectOption('dev');
  await until(async () => (await members.getByLabel('Role of Ali').inputValue()) === 'dev');
  await lea.keyboard.press('Escape');
  await aliReloaded;
  // The new page's stream up: the page has started, and no reload is still to come.
  await ali.locator('.hosted-bar .rev.up').waitFor({ timeout: 30_000 });
  // Tom's note took the notes (a write takes its spans): he lets them go first.
  await spanAct(tom, 'notes', 'Release');
  await addNote(ali, 'Now I can write.');
  const wrote = await until(async () => (await revisionOf(ali)) === target + 1);
  check(
    'a reviewer made dev writes',
    wrote,
    wrote
      ? undefined
      : `ali at ${await revisionOf(ali)}, léa at ${await revisionOf(lea)}, want ${target + 1}; ali's menu: ${await ali
          .locator('.who summary')
          .innerText({
            timeout: 1000,
          })}; toasts: ${(await ali.locator('.toast').allInnerTexts()).join(' | ')}; dialog: ${await ali
          .getByRole('dialog')
          .getAttribute('aria-label', { timeout: 1000 })
          .catch(() => 'none')}`,
  );

  // A visitor, a stranger.
  const visitor = await (await browser.newContext({ ignoreHTTPSErrors: stack.tls })).newPage();
  await visitor.goto(stack.studioUrl);
  check(
    'a visitor sees the login page',
    await visitor
      .getByRole('link', { name: 'Log in' })
      .waitFor({ timeout: 15_000 })
      .then(
        () => true,
        () => false,
      ),
  );
  const stranger = await (await browser.newContext({ ignoreHTTPSErrors: stack.tls })).newPage();
  stack.as('sam');
  await stranger.goto(`${stack.studioUrl}/auth/login`);
  await stranger.getByRole('heading', { name: 'Access not granted' }).waitFor({ timeout: 15_000 });
  check('someone who is not a member sees nothing of the game', true);
} catch (e) {
  check('the run', false, (e as Error).message.split('\n')[0]);
} finally {
  if (steps.some(([, ok]) => !ok)) console.log(trace.slice(-60).join('\n'));
  await browser.close();
  await stack.stop();
}
const failed = steps.some(([, ok]) => !ok);
console.log(failed ? '✖ e2e:studio-collab failed' : '✓ e2e:studio-collab');
process.exit(failed ? 1 : 0);
