## 4.2.3 PR 5: the remote MCP (H4, ADR 0029)

- `studio-server/src/server/mcp.ts`: `/mcp`, MCP's Streamable HTTP transport, stateless (POST only, JSON answers; GET and
  DELETE 405); policy B only (a 401 carries `WWW-Authenticate: Bearer resource_metadata=…`, an invalid token
  `error="invalid_token"` too; the cookie is refused; a reviewer at least); `/.well-known/oauth-protected-resource`
  (and `/mcp` appended) names the resource, the OIDC provider, the header method. Wired in `http.ts` (after the game's
  origin, before `/api`) and `main.ts` (with OIDC only).
- `tools/studio/http-backend.ts`: the tools' backend over `/api` with a Bearer token asked per request, an operation id
  per write, a refusal said with its status (`ApiRefusal`). `/mcp` uses it on the loopback with the caller's token: the
  API's own checks, not a copy.
- `tools/mcp/tools-server.ts`: one MCP server definition (`toolsFor(backend)`, the two resources over the backend) for
  the stdio server over the core, the stdio server over a hosted Studio (`npm run mcp -- --server <url>`, the CLI's
  token from `login`), and `/mcp`.
- Limits: an agent sends no revision it read (H10's check does not apply to it; the guard does); screenshots, tests,
  documents and asset prompts are not offered remotely; a client without MCP's authorization discovery uses a token from
  `studio-server token` or the stdio server.
- **After the second reading**: the loopback goes to the address and port the request came in on (IPv6, a specific
  interface), with the Studio's `Host` (`node:http`, which fetch cannot set); a batch is refused (400); the tools are
  given up when the client goes away, and after 5 min; `solve` with a reality policy is refused (501), not answered
  without it; a malformed header is `invalid_request`; the remote instructions name no local tool; the audience a
  discovering client's token must carry, the short life of a pasted token, the loopback's refusal counting and the SDK
  in the server process are said (ADR, MCP, threat model).
- Docs: ADR 0029; MCP ("A hosted Studio"), STUDIO-SERVER (en, fr); the threat model's row.
- Tests: `tests/studio-mcp-remote.test.ts` (the metadata; a 401 with where to authorize, a token of another audience,
  the cookie, a non-member, a GET; an MCP SDK client listing and calling the tools, a write in the journal as the
  member; a reviewer's write 403, another member's span 423, a member removed refused at the next request),
  `tests/studio-http-backend.test.ts` (each tool's route, the token per request, the operation id, a refusal).

→ next: Claude (4.2.3 PR 6: Git, H5)
