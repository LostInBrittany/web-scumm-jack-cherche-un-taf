// The IR's schema (4.1.12 "Language", ADR 0013), with zod: what tests/ir.test.ts checks every compiled game against,
// what the Studio's generated forms are built from (src/studio/forms-gen.ts: a field's kind, its id reference, its
// description) and what the DSL page is written from (tools/dsl-doc.ts). Each documented field carries metadata
// (`.meta({ description, fr, ref })`): the English and French sentence, and the kind of id it refers to. The
// player never loads this module (full zod stays out of its bundle); the core's runtime reads `GameIR` as a type only.
import * as z from 'zod';
import { CMD_KEYS } from './cmds';

/** The metadata a documented field carries: its sentence in both languages, and the kind of id it names. */
export interface FieldMeta {
  description: string;
  fr: string;
  /** The kind of id: the Studio offers the game's ids of that kind. */
  ref?: 'item' | 'flag' | 'room' | 'char' | 'objective' | 'event' | 'verb' | 'prop';
}
const doc = <T extends z.ZodType>(s: T, m: FieldMeta): T => s.meta({ ...m });

const id = z.string().min(1);
const value = z.union([z.boolean(), z.number(), z.string()]);

/** A condition (`Cond`): every kind of the DSL, recursive through `not`, `all` and `any`. */
export const condSchema: z.ZodType = z.lazy(() =>
  z.union([
    z.string().min(1),
    z.strictObject({ has: id }),
    z.strictObject({ flag: id, eq: value.optional(), gte: z.number().optional(), lt: z.number().optional() }),
    z.strictObject({ not: condSchema }),
    z.strictObject({ all: z.array(condSchema) }),
    z.strictObject({ any: z.array(condSchema) }),
    z.strictObject({ visited: id }),
    z.strictObject({ room: id }),
    z.strictObject({ prop: z.tuple([id, z.string()]) }),
    z.strictObject({ unlocked: id }),
    z.strictObject({ seen: z.string().min(1) }),
    z.strictObject({ actorIn: z.tuple([id, id]) }),
    z.strictObject({ player: id }),
  ]),
);

const KEYS = new Set<string>(CMD_KEYS);
/**
 * A command (`Cmd`): a hero line, or an object named by exactly one key of `CMD_KEYS` (core/cmds.ts). Each command's
 * own fields are the Studio's (src/studio/schema.ts `CMD_SPECS`) and the DSL page's (core/dsl-meta.ts).
 */
export const cmdSchema: z.ZodType = z.union([
  z.string(),
  z
    .record(z.string(), z.unknown())
    .refine((o) => Object.keys(o).filter((k) => KEYS.has(k)).length >= 1, {
      message: 'a command names one key of CMD_KEYS',
    })
    .refine((o) => !('choice' in o) || z.array(choiceSchema).safeParse(o.choice).success, {
      message: 'a choice is a list of options { id?, text, img?, if?, once?, do }',
    }),
]);
const cmds = z.array(cmdSchema);
/** One option of a `{ choice }` command (`Choice`). `img` is presentation: the IR leaves it out (core/ir.ts). */
export const choiceSchema = z.strictObject({
  id: id.optional(),
  text: z.string(),
  img: doc(id.optional(), {
    description: 'An image (manifest id): the option shows as a card, the image with its text under it.',
    fr: 'Une image (id du manifeste) : l’option s’affiche en carte, l’image avec son texte dessous.',
  }),
  if: condSchema.optional(),
  once: z.boolean().optional(),
  do: z.lazy(() => cmds),
});
const listLine = z.union([z.string(), z.strictObject({ id, text: z.string() })]);

/** An objective as a game writes it (`GameDef.objectives[id]`, ADR 0014): the Studio's form is generated from it. */
export const objectiveSchema = z.strictObject({
  title: doc(z.string().min(1), {
    description: 'What the quest journal shows (translated under `objectives/<id>.title`).',
    fr: 'Ce que montre le journal de quêtes (traduit sous `objectives/<id>.title`).',
  }),
  done: doc(condSchema, {
    description: 'Done the first time this condition holds after an action; best a condition that stays true.',
    fr: 'Accompli la première fois que cette condition est vraie après une action ; de préférence une condition qui le reste.',
  }),
  optional: doc(z.boolean().optional(), {
    description: 'A side objective: not part of 100% (`npm run solve -- --goal=100%`).',
    fr: 'Un objectif secondaire : hors du 100 % (`npm run solve -- --goal=100%`).',
  }),
  parent: doc(id.optional(), {
    description: 'The objective this one is a step of: shown under it.',
    fr: "L'objectif dont celui-ci est une étape : affiché sous lui.",
    ref: 'objective',
  }),
});

const source = z.strictObject({ file: z.string(), line: z.number().int().positive() });
const loose = z.record(z.string(), z.unknown());

const room = z.strictObject({
  id,
  name: z.string(),
  hero: z.boolean().optional(),
  look: z.record(z.string(), z.union([z.string(), z.array(listLine)])),
  hints: z.array(z.strictObject({ id: id.optional(), until: condSchema, lines: z.array(listLine) })),
  exits: z.array(
    z.strictObject({
      id,
      name: z.string(),
      to: id,
      entry: z.union([id, z.tuple([z.number(), z.number()])]).optional(),
      if: condSchema.optional(),
      locked: z.string().optional(),
      verbs: z.array(id).optional(),
      visible: condSchema.optional(),
      kind: z.array(z.string()).optional(),
      oneWay: z.boolean().optional(),
      defaultVerb: id.optional(),
    }),
  ),
  walkLinks: z.array(z.strictObject({ id, if: condSchema.optional(), locked: z.string().optional() })),
  entities: z.array(z.string()),
  anchors: z
    .record(
      z.string(),
      z.strictObject({
        at: id,
        visible: condSchema.optional(),
        reachableBy: condSchema.optional(),
        capacity: z.number().int().positive().optional(),
        phase: z.string().optional(),
      }),
    )
    .optional(),
});

const entity = z.strictObject({
  key: z.string(),
  kind: z.enum(['prop', 'actor', 'hotspot', 'item', 'character']),
  id,
  room: id.optional(),
  name: z.string().optional(),
  kinds: z.array(z.string()).optional(),
  visible: condSchema.optional(),
  defaultVerb: id.optional(),
  states: z.array(z.string()).optional(),
  initial: z.string().optional(),
  anims: z.record(z.string(), z.record(z.string(), cmds)).optional(),
  char: id.optional(),
  interactive: z.boolean().optional(),
  exit: z.boolean().optional(),
  look: z.union([z.string(), z.array(listLine)]).optional(),
  home: id.optional(),
  refuse: z.string().optional(),
  hug: z.string().optional(),
});

const rule = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('rule'),
    id: z.string(),
    scope: id,
    verb: z.array(id),
    a: z.array(id),
    b: z.array(id).optional(),
    if: condSchema.optional(),
    do: cmds,
    exit: id.optional(),
  }),
  z.strictObject({
    kind: z.literal('topic'),
    id: z.string(),
    room: id,
    actor: id,
    topic: z.string(),
    if: condSchema.optional(),
    do: cmds,
  }),
  z.strictObject({
    kind: z.literal('listener'),
    id: z.string(),
    scope: id,
    on: id,
    if: condSchema.optional(),
    once: z.boolean().optional(),
    do: cmds,
  }),
  z.strictObject({
    kind: z.literal('reaction'),
    id: z.string(),
    verb: z.array(id),
    of: z.string().optional(),
    target: id.optional(),
    item: z.array(id).optional(),
    say: z.string(),
  }),
  z.strictObject({ kind: z.literal('fallback'), id: z.string(), verb: z.string(), lines: z.array(listLine) }),
]);

const script = z.strictObject({
  id,
  scope: id,
  trigger: z.enum(['world', 'enter', 'intro']),
  while: condSchema.optional(),
  loop: z.boolean().optional(),
  do: cmds,
  stepIds: z.array(id).optional(),
});

/** The whole IR (schema 1). */
export const gameIRSchema = z.strictObject({
  schema: z.literal(1),
  engine: z.string(),
  gameId: id,
  world: z.strictObject({
    schemaVersion: z.union([z.literal(2), z.literal(3)]).optional(),
    saveVersion: z.number().int(),
    hero: id,
    players: loose.optional(),
    hintItem: id.optional(),
    hintVoice: id.optional(),
    verbs: z.array(z.strictObject({ id, label: z.string(), join: z.string().optional() })),
    globalTalk: loose.optional(),
    start: loose,
    map: z
      .strictObject({
        start: id,
        regions: z.array(z.strictObject({ id, name: z.string(), parent: id.optional() })),
        places: z.array(z.strictObject({ id, name: z.string(), room: id, region: id, news: condSchema.optional() })),
      })
      .optional(),
    checkpoints: z.record(z.string(), loose),
    invariants: z.array(condSchema),
    migrations: z.array(loose),
    remix: loose.optional(),
  }),
  rooms: z.array(room),
  entities: z.array(entity),
  rules: z.array(rule),
  scripts: z.array(script),
  objectives: z.array(
    z.strictObject({ id, title: z.string().min(1), done: condSchema, optional: z.boolean(), parent: id.optional() }),
  ),
  reality: z.looseObject({ signals: z.array(loose) }),
  extensions: z.strictObject({
    trusted: z.string(),
    commands: z.array(z.strictObject({ name: z.string(), pure: z.boolean().optional(), effects: cmds.optional() })),
    minigames: z.array(z.string()),
    plugins: z.array(z.string()),
  }),
  variant: z.union([
    z.strictObject({ mode: z.literal('story') }),
    z.strictObject({ mode: z.literal('variant'), id, manifest: loose, variant: loose.optional() }),
  ]),
  provenance: z.record(z.string(), source),
});
