### Changes

- **The MCP on a hosted Studio (4.2.3, ADR 0029)**: a Studio Server serves its game's MCP tools at `/mcp` (MCP's
  Streamable HTTP, stateless), for an access token of the Studio's audience, never the session cookie; it says where its
  authorization is (`/.well-known/oauth-protected-resource`, RFC 9728). Each tool is a request to the server's own API
  with the caller's token: an agent writes as its member, with their role, their spans, in the journal.
  `npm run mcp -- --server <url>` points the local MCP server at a hosted Studio the same way (the CLI's token).
