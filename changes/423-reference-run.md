### Changes

- **The Studio Server's runbook, after its reference run on Clever Cloud (4.2.3, H9)**: STUDIO-SERVER (en, fr) now
  says how to create the realm on Clever's managed Keycloak (its first admin password is temporary, `admin-cli` refuses
  it, the console's realm import works), which fields of `ops/studio/keycloak/realm.json` to change for a hosted
  Studio, to leave `APP_FOLDER` unset, to put `--` before a key's value in `clever env set`, to link both apps
  (`clever link --alias`) before `clever deploy --alias`, that the shell of `clever ssh` has the app's variables and
  that `clever ssh --command` waits for the old instance to go, how to keep a part of `clever logs`, that `/metrics` on
  the game's origin is a 401 (its session gate), what an overlapping redeploy costs (writes refused for about
  2.5 min, twice the database connections), and how to compare a restore drill through the API.
