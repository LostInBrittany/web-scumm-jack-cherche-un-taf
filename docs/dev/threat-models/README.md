# Connector threat models (4.1.9)

One page per connector of the world outside, written before its code (`docs/dev/plans/4.1.9-gateways.md` §4). The
Bridge's own model is `docs/dev/THREAT-MODEL.md`; what every connector shares (process apart, untrusted input, an
attenuated Biscuit, limits, a log without content) is ADR 0008 (`docs/dev/adr/0008-connector-sdk.md`) and D19.

| Connector | Page | Entry point |
|---|---|---|
| Email | [email.md](email.md) | a provider's signed webhook, or an IMAP mailbox the connector polls |
| Telnet | [telnet.md](telnet.md) | a TCP port speaking a minimal Telnet |
| SSH | [ssh.md](ssh.md) | an SSH server (`ssh2`), password = pairing code, or a declared key |
| Open Badges | [open-badge.md](open-badge.md) | an HTTP form; the badge's documents fetched under a network policy |

The Studio Server (4.2.1), not a connector, has its own page: [studio-server.md](studio-server.md) (the API, OpenID
Connect, sessions and tokens, members, the journal's leases).

Shared by all four. The connector is a process of its own (`web-scumm-connector <id>`), never in the game's bundle nor
in its DSL; it holds one Biscuit attenuated to its signals; it never runs a host process, `eval`, `vm` or code from a
string (`tests/connectors-abuse.test.ts`, static and at run time under `--disallow-code-generation-from-strings`); it
logs identifiers and counts only (`safeLog`, `tests/connectors-sdk.test.ts` greps every fixture in the log); what it saw
stays in it: only a SHA-256 of the payload reaches the Bridge (`evidenceHash`), and the game only a declared signal.
