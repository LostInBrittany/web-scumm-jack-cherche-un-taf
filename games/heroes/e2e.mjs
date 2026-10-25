// Playwright playthrough of "Who Am I Today?" (games/heroes, 4.4.0; scripts/e2e.mjs loads it, wiki/en/reference.npm-scripts.md).
// For each language (English, then French with `?lang=`) and each of the three heroes, from the real title screen:
//   - New game; the intro's three portrait cards (Choice.img), each with its image loaded and its label; the hero's card
//     is tapped;
//   - the hero says who they are (a switch), the engine's hero now carries that hero's name;
//   - Grandma greets the hero by name (`{hero}`) with the words for that hero, French agreeing them with the gull
//     (`Prête`), and the dust line plays that hero's clip (`garden.dust~form=<hero>`, `audio.voices` or
//     `audio.voicesByLang.fr`);
//   - the key is taken, the page reloaded, Continue: the same hero, the same name, the key still in the bag;
//   - the gate opened with the key: Grandma's farewell (French agrees it with the gull and plays her own clip, the plain
//     one for the cats), and the ending.
// In French, nothing visible is an English default of the engine (`harness.leaks()`).

const HEROES = [
  {
    form: 'pixel',
    name: 'Pixel',
    en: { me: 'Pixel. Small, fluffy, ready.', hello: 'Good morning, Pixel! Ready, my little fluffball?' },
    fr: { me: 'Pixel. Petit, tout doux, prêt.', hello: 'Bonjour, Pixel ! Prêt, ma petite boule de poils ?' },
  },
  {
    form: 'biscuit',
    name: 'Biscuit',
    en: { me: 'Biscuit. Awake. Mostly.', hello: 'Good morning, Biscuit! Ready, my big sleepyhead?' },
    fr: { me: 'Biscuit. Réveillé. Presque.', hello: 'Bonjour, Biscuit ! Prêt, mon gros dormeur ?' },
  },
  {
    form: 'gull',
    name: 'Gaby',
    en: { me: 'Gaby the gull. Squawk.', hello: 'Good morning, Gaby! Ready, my noisy seagull?' },
    fr: { me: 'Gaby la mouette. Kiaaa.', hello: 'Bonjour, Gaby ! Prête, ma mouette braillarde ?' },
  },
];

const TEXT = {
  en: {
    cards: ['Pixel', 'Biscuit', 'Gaby'],
    topicHello: 'Good morning, Grandma!',
    topicKey: 'Where is the gate key?',
    dust: 'Under the watering can.',
    bye: (h) => `Off you go, ${h.name}. Come back safe!`,
  },
  fr: {
    cards: ['Pixel', 'Biscuit', 'Gaby'],
    topicHello: 'Bonjour, Grand-mère !',
    topicKey: 'Où est la clé du portail ?',
    dust: "Sous l'arrosoir.",
    bye: (h) => `File, ${h.name}. Reviens ${h.form === 'gull' ? 'saine et sauve' : 'sain et sauf'} !`,
  },
};

/** The clip the farewell plays: one English clip; in French, the gull's own and the plain one for the cats. */
const byeClip = (lang, h) => (lang === 'fr' && h.form === 'gull' ? 'garden.bye~form=gull' : 'garden.bye');

export async function run(h) {
  const { page } = h;
  const base = new URL(page.url());
  base.search = '';
  const voices = () => page.evaluate(() => window.__voices ?? []);

  /** The page at `lang`, its voice clips recorded (`App.audio.voice`, called with the clip id the line resolved). */
  async function open(lang, reload = false) {
    if (reload) await page.reload();
    else {
      const u = new URL(base);
      if (lang !== 'en') u.searchParams.set('lang', lang);
      await page.goto(u.toString());
    }
    await page.waitForFunction(() => !!window.__game, null, { timeout: 15000 });
    await page.evaluate(() => {
      const a = window.__game.audio;
      const play = a.voice.bind(a);
      window.__voices = [];
      a.voice = (id) => {
        window.__voices.push(id);
        return play(id);
      };
    });
    await page.locator('.overlay .bigbtn').first().waitFor({ timeout: 15000 });
  }

  /** Waits until the line on screen reads `text` (before `waitIdle` taps it away), then until the game is idle. */
  async function hear(text, { acceptEnding = false } = {}) {
    for (let waited = 0; waited < 12000; waited += 50) {
      const s = await h.state();
      if (s.speech && s.text.includes(text)) return h.waitIdle({ acceptEnding });
      // Another line first (the hero repeats the answer picked): tapped away like a player would.
      if (s.speech) await h.tapScene(320, 10).catch(() => {});
      await page.waitForTimeout(s.speech ? 120 : 50);
    }
    throw new Error(`heroes: the line "${text}" was never shown (last: "${(await h.state()).text}")`);
  }

  /** Taps the choice (a card or a topic) labelled `label`, then waits for `line`. */
  async function choose(label, line) {
    const c = page.locator('.side .choices .choice', { hasText: label }).first();
    await c.waitFor({ timeout: 12000 });
    await c.tap();
    return hear(line);
  }

  const hero = () =>
    page.evaluate(() => {
      const e = window.__game.engine;
      return { form: e.state.flags.form, name: e.character('hero')?.name, inventory: e.state.inventory };
    });

  async function expectHero(want, where) {
    const got = await hero();
    if (got.form !== want.form || got.name !== want.name)
      throw new Error(`heroes: ${where}: the hero is ${got.name} (form ${got.form}), expected ${want.name} (${want.form})`);
    return got;
  }

  for (const lang of ['en', 'fr']) {
    const T = TEXT[lang];
    for (const hh of HEROES) {
      const L = hh[lang];
      const tag = `${lang}-${hh.form}`;
      await open(lang);
      // New game (a saved game from the previous hero asks before it is erased).
      await page.locator('.overlay .bigbtn').first().tap();
      const erase = page.locator('.menu button.warn');
      if (await erase.waitFor({ timeout: 1500 }).then(
        () => true,
        () => false,
      ))
        await erase.tap();
      // The intro asks who the hero is with three portrait cards.
      await page.locator('.side .choices .choice.card').first().waitFor({ timeout: 15000 });
      const cards = await page.evaluate(() =>
        [...document.querySelectorAll('.side .choices .choice.card')].map((b) => ({
          label: b.textContent.trim(),
          img: !!b.querySelector('img')?.complete && (b.querySelector('img')?.naturalWidth ?? 0) > 0,
        })),
      );
      if (cards.map((c) => c.label).join('|') !== T.cards.join('|') || cards.some((c) => !c.img))
        throw new Error(`heroes: ${tag}: the portrait cards are ${JSON.stringify(cards)}`);
      await h.screenshot(`${tag}-cards`);
      await choose(hh.name, L.me);
      await expectHero(hh, `${tag}: after the choice`);
      // Grandma: the hero's name and the words for that hero; the dust line, voiced for that hero.
      await h.verbById('talk');
      await h.target('grandma');
      await choose(T.topicHello, L.hello);
      await h.screenshot(`${tag}-hello`);
      await choose(T.topicKey, T.dust);
      const clip = `garden.dust~form=${hh.form}`;
      if (!(await voices()).includes(clip))
        throw new Error(`heroes: ${tag}: the dust line played ${JSON.stringify(await voices())}, expected ${clip}`);
      await page.locator('.side .choices .choice').last().tap();
      await h.waitIdle();
      await h.play([{ verb: 'take', a: 'can' }]);
      // The autosave, then a reload and Continue: the same hero.
      await page.waitForTimeout(400);
      await open(lang, true);
      const cont = page.locator('.overlay .bigbtn').nth(1);
      if (await cont.isDisabled()) throw new Error(`heroes: ${tag}: Continue is disabled after the reload`);
      await cont.tap();
      await page.waitForFunction(() => !!window.__game.engine.state.room, null, { timeout: 15000 });
      await h.waitIdle();
      const back = await expectHero(hh, `${tag}: after Continue`);
      if (!back.inventory.includes('key')) throw new Error(`heroes: ${tag}: the key is gone after Continue`);
      // The gate: Grandma's farewell, then the ending.
      await h.verbById('use');
      await h.target('key');
      await h.target('gate');
      await hear(T.bye(hh), { acceptEnding: true });
      if (!(await voices()).includes(byeClip(lang, hh)))
        throw new Error(`heroes: ${tag}: the farewell played ${JSON.stringify(await voices())}, expected ${byeClip(lang, hh)}`);
      for (let waited = 0; !(await h.ended()) && waited < 8000; waited += 100) await page.waitForTimeout(100);
      if (!(await h.ended())) throw new Error(`heroes: ${tag}: the ending was not reached`);
      await h.screenshot(`${tag}-end`);
      if (lang === 'fr') {
        const leaks = await h.leaks();
        if (leaks.length) throw new Error(`heroes: ${tag}: English defaults visible in French: ${leaks.join(' | ')}`);
      }
      console.log(`e2e: heroes: ${tag}: ${hh.name} chosen on a card, named, greeted, voiced, kept by Continue, finished`);
    }
  }
}
