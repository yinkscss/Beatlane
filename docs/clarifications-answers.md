# Beatlane — locked clarification answers

Generated from `docs/clarifications.html` and confirmed in chat (Jul 21, 2026).  
**Orchestrator:** paste this block into every Implement dispatch until G19 completes.

Do not commit secrets. Magic publishable key lives in env (`VITE_MAGIC_PUBLISHABLE_KEY`), not in this file.

```
CLARIFICATION ANSWERS — Beatlane
Source: docs/clarifications-answers.md (locked)
Orchestrator: paste into every Implement dispatch until complete.

Q01. App layout
  - Monorepo — apps/web + contracts/ [monorepo]

Q02. Package manager
  - npm [npm]

Q03. Node version
  - Node 22 — prefer [22]

Q04. Supabase blockblast — permissions
  - Treat as greenfield — wipe/reset OK [greenfield_ok]

Q05. Supabase region / URL
  - OK to read via MCP get_project_url [mcp]
  Notes: project_ref=zxtwshhlicditrvqafzo (Supabase MCP URL provided by human)

Q06. Magic.link
  - I have a publishable key [have_key]
  Notes: Use env VITE_MAGIC_PUBLISHABLE_KEY (pk_live_… provided by human — do not commit)

Q07. Celo network for G10+
  - Celo Mainnet [mainnet]
  Notes: Human locked Celo Mainnet (not testnet-only). Extra care on payments/contracts; never commit deployer keys.

Q08. cUSD test funds
  - I will fund the test wallet manually [manual]
  Notes: On mainnet this means real cUSD — fund carefully; prefer small amounts.

Q09. Vercel deploy
  - Vercel Hobby is fine [hobby_ok]

Q10. Git branch policy
  - Commit & push directly to master [master_direct]

Q11. Commit style
  - Multiple commits per gate OK if needed [many_ok]

Q12. Sample audio
  - CC0/placeholder in-repo for G4–G7, Storage in G12 [cc0_then_storage]

Q13. Chart authorship
  - JSON now; allow MIDI tooling later (not v1) [midi_later]

Q14. Guest play
  - Require auth before any play [auth_all]

Q15. Second Chance shield
  - Enable + default ON + ~2s [enable, default_on, dur_2s]

Q16. Upstash Redis
  - Create new free DB when G13 starts [create_g13]

Q17. Sentry / PostHog
  - Create new Sentry at G18 [sentry_new]
  Notes: PostHog not explicitly selected — default to create new PostHog at G18 unless human says otherwise.

Q18. Foundry / contracts (G15–G16)
  - Deploy from this repo via Foundry [deploy_from_repo]

Q19. Tournament rake
  - 15% [15]

Q20. Season Pass duration
  - 4 weeks [4]

Q21. MiniPay
  - Stub CTA only until I provide tester device/docs [stub]

Q22. Design strictness
  - Pixel-match beat-pitch glass shatter + sky/lavender as closely as practical [pixel]

Q23. Out of scope hard bans
  - No ads — FAIL if added [no_ads]
  - Confirm all three bans for v1 [confirm_all]
  - No skins shop — FAIL if added [no_skins]
  - No game token — FAIL if added [no_token]

Q24. Stop conditions — max Implement retries on FAIL
  - 3 retries [3]

Q25. Human approval before Git push
  - No human pauses — auto Git on every PASS [none]

END CLARIFICATION ANSWERS
```
