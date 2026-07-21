# contracts/

Foundry Solidity for Beatlane. Scaffolded in G0; **Boast** (G15) + **TournamentVault** (G16).

## Network policy (G15–G16)

| Concern | Network | Notes |
|---|---|---|
| Boast attestation deploy (G15 AC) | **Celo Sepolia** (chain id `11142220`) | Alfajores `44787` sunset Sep 2025 |
| TournamentVault cup escrow / payout stub (G16) | **Celo Sepolia** (default) | Mainnet vault unsafe without funded deployer + audit |
| Second Chance / helpers / packs / **cup entry fees** | **Celo Mainnet** (chain id `42220`) | Locked Q07 — app treasury transfer |
| Player-facing prices | **cUSD** naming | Always; not native CELO |

Do **not** commit deployer private keys. Use `contracts/.env` (gitignored).

## Layout

```
contracts/
  foundry.toml
  src/BoastAttestation.sol
  src/TournamentVault.sol
  test/BoastAttestation.t.sol
  test/TournamentVault.t.sol
  script/DeployBoast.s.sol
  script/DeployBoastSmoke.s.sol
  script/DeployTournament.s.sol
  script/DeployTournamentSmoke.s.sol
  .env.example
```

## Install Foundry

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
# forge, cast, anvil on PATH (~/.foundry/bin)
```

## Build & test

```bash
cd contracts
forge install foundry-rs/forge-std --no-commit   # once
forge build
forge test -vv
```

## Deploy Boast → Celo Sepolia

1. Copy `.env.example` → `.env` and set:
   - `DEPLOYER_PRIVATE_KEY` — funded Sepolia key (faucet: https://faucet.celo.org / Google Cloud Web3)
   - `TREASURY_ADDRESS` — receives $0.29 cUSD per mint
2. Fund deployer with Sepolia **CELO** (gas). Official **USDm** (cUSD successor) may need a faucet; for AC3 smoke use `DeployBoastSmoke` (Mock cUSD).
3. Broadcast smoke (deploy + $0.29 mint):

```bash
cd contracts
set -a && source .env && set +a
forge script script/DeployBoastSmoke.s.sol:DeployBoastSmoke \
  --rpc-url "$CELO_SEPOLIA_RPC_URL" \
  --broadcast \
  --private-key "$DEPLOYER_PRIVATE_KEY"
```

4. Copy the logged contract address into `apps/web/.env`:

```bash
VITE_BOAST_CONTRACT_ADDRESS=0x…
VITE_BOAST_CHAIN_ID=11142220
VITE_BOAST_RPC_URL=https://forno.celo-sepolia.celo-testnet.org
VITE_BOAST_CUSD_ADDRESS=0x…   # MockCUSD from smoke, or Sepolia USDm 0xdE9e4C3ce781b4bA68120d6261cbad65ce0aB00b
VITE_BOAST_TREASURY_ADDRESS=0x…   # same as TREASURY_ADDRESS
```

## Deploy status

| Field | Value |
|---|---|
| Network | Celo Sepolia (11142220) |
| BoastAttestation | `0x3FB287D2B9a433c4cda02cd1622c48032a1eba90` |
| MockCUSD (AC3 smoke) | `0x8AB74DdA4aE337c70842bf96E678356900fdd93E` |
| Mint tx | `0xf6fb278d894b9efec2fa49a383178db8e3f76faa4a841ba25992916f16748dca` |
| Broadcast | `contracts/broadcast/DeployBoastSmoke.s.sol/11142220/run-latest.json` (gitignored) |
| Explorer | https://celo-sepolia.blockscout.com/address/0x3FB287D2B9a433c4cda02cd1622c48032a1eba90 |
| Mint price | `0.29` cUSD (`29e16` wei) |

## Mint price

`BoastAttestation.MINT_PRICE = 29e16` (= **$0.29 cUSD**, 18 decimals).

## Deploy TournamentVault → Celo Sepolia (G16)

Optional on-chain escrow. **Live app entry fees still use Mainnet cUSD → treasury** (Q07).  
Rake: `RAKE_BPS = 1500` (15%). Audit checklist: `docs/tournament-audit-checklist.md`.

```bash
cd contracts
set -a && source .env && set +a
forge script script/DeployTournamentSmoke.s.sol:DeployTournamentSmoke \
  --rpc-url "$CELO_SEPOLIA_RPC_URL" \
  --broadcast \
  --private-key "$DEPLOYER_PRIVATE_KEY"
```

Then set in `apps/web/.env`:

```bash
VITE_TOURNAMENT_CONTRACT_ADDRESS=0x…
VITE_TOURNAMENT_CHAIN_ID=11142220
```

### Tournament deploy status

| Field | Value |
|---|---|
| Network | Celo Sepolia (11142220) — preferred; Mainnet not deployed in G16 |
| TournamentVault | *not broadcast in this environment — run DeployTournamentSmoke locally* |
| Entry fee (app) | Mainnet cUSD via `VITE_TREASURY_ADDRESS` |
| Payout | App+edge stub (`tournament_payouts.status=stub`) unless vault `payoutStub` called |
| Rake | 15% |

```bash
forge test --match-contract TournamentVaultTest -vv
node apps/web/scripts/verify-g16.mjs
```
