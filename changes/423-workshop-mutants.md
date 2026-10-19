### Changes

- **The Studio Server's workshop mutation set is gated (4.2.3)**: the 104 survivors of `studio-workshop` (the
  backup, the journal shipped, the collection, the health, the previews, the builds and the prepared assets) are read
  one by one: 94 killed by short tests (`tests/studio-workshop-{backup,health,previews,prepared}-mutants.test.ts`),
  10 named in `docs/dev/mutants.json`. A survivor not named now fails the set's job, as for the other sets.
