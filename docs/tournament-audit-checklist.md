# TournamentVault — audit checklist (G16)

Pre-mainnet checklist for the Blitz cup escrow / payout path. **The audit itself may be external**; this doc is the gate artifact.

## Scope

| Surface | Network | Role |
|---|---|---|
| Player entry fees | **Celo Mainnet** cUSD | App `transferCusdToTreasury` + `record-purchase` (Q07) |
| `TournamentVault.sol` | **Celo Sepolia** (testnet) by default | Optional on-chain escrow + `finalizeStub` / `payoutStub` |
| Ranking + prize math | Supabase Edge (`tournament-cup`) | App+edge **payout stub** (no automatic Mainnet prize transfer) |

Alfajores (`44787`) is sunset — do not deploy there.

## Must verify before Mainnet vault deploy

1. **Rake = 15%** (`RAKE_BPS = 1500`) — locked Q19; no silent change.
2. **Entry fee bounds** — PRD $1–$10; DB check + edge price match.
3. **Helpers / continues off** in Blitz — `helpersDisabled('blitz')`; no Second Chance overlay.
4. **Obstacle whitelist** — ban Reverse, Fog, Fake Gap (`blitzWhitelist.ts` + `sanitizeBlitzChart`).
5. **Access control** — only `treasury` may `createCup`, `finalizeStub`, `payoutStub`.
6. **No double entry** — `entered[cupId][player]` + unique `(tournament_id, user_id)`.
7. **Pool accounting** — rake taken once; `payoutStub` cannot over-distribute.
8. **Reentrancy / ERC20** — prefer CEI; assume non-standard cUSD return values tested.
9. **Deployer keys** — never commit; use `contracts/.env` (gitignored).
10. **KYC / spend caps** — PRD §8; soft caps planned G19; cash-out thresholds may need KYC before scaling stakes.
11. **Server score trust** — Blitz submit is currently client tiles + entry proof; harden tap revalidation before high-stakes Mainnet pots.
12. **External audit** — schedule before any Mainnet `TournamentVault` holding player funds.

## Honest status (implementer)

- **On-chain (optional Sepolia):** `TournamentVault` enter / finalize / payout stub.
- **Live app money path:** Mainnet cUSD entry → Postgres `tournament_entries`.
- **Payouts:** Edge `payout_stub` writes `tournament_payouts` with `status=stub` — **not** a real prize transfer.

## Commands

```bash
cd contracts && forge test --match-contract TournamentVaultTest -vv
node apps/web/scripts/verify-g16.mjs
```
