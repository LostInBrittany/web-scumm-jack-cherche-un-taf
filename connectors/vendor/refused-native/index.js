// The optional native parts of `ssh2` (`cpu-features`, and `nan` for its crypto binding) are refused (4.1.9, D19,
// docs/dev/threat-models/ssh.md): the root package.json `overrides` maps both here. `npm ci` still runs ssh2's install
// script, which attempts `node-gyp rebuild` of its binding and fails without the `nan` headers: no `.node` file
// results, and `ssh2` runs on its pure JavaScript paths. Calling this module is the explicit refusal.
module.exports = () => {
  throw new Error('quest-n-click-connectors refuses native code (cpu-features, nan): ssh2 runs in pure JavaScript');
};
