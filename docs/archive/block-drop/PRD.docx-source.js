const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, ShadingType } = require("docx");

const GRAY = "6B7280";
const ACCENT = "1B4D8F";

function h1(text){ return new Paragraph({ text, heading: HeadingLevel.HEADING_1, spacing:{before:320, after:160} }); }
function h2(text){ return new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing:{before:240, after:120} }); }
function p(text, opts={}){ return new Paragraph({ children:[ new TextRun({text, ...opts}) ], spacing:{after:120} }); }
function bullet(text){ return new Paragraph({ text, bullet:{level:0}, spacing:{after:60} }); }
function boldLead(lead, rest){
  return new Paragraph({ children:[ new TextRun({text:lead, bold:true}), new TextRun({text:rest}) ], spacing:{after:120} });
}

function cell(text, opts={}){
  return new TableCell({
    width:{ size: opts.width || 2000, type: WidthType.DXA },
    shading: opts.header ? { type: ShadingType.CLEAR, fill: "E8EEF7" } : undefined,
    children:[ new Paragraph({ children:[ new TextRun({ text, bold: !!opts.header, size: opts.size || 20 }) ] }) ],
    verticalAlign: "center",
  });
}

function makeTable(colWidths, rows){
  const totalWidth = colWidths.reduce((a,b)=>a+b,0);
  return new Table({
    width: { size: totalWidth, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: rows.map((r, i) => new TableRow({
      children: r.map((val, ci) => cell(val, { width: colWidths[ci], header: i===0 })),
    })),
  });
}

const doc = new Document({
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 },
      },
    },
    children: [
      new Paragraph({ children:[ new TextRun({ text:"Product Requirements Document", bold:true, size:44, color: ACCENT }) ], spacing:{after:80} }),
      new Paragraph({ children:[ new TextRun({ text:'"Block Drop" \u2014 A Play-to-Earn Block-Placement Puzzle on Celo', bold:true, size:30 }) ], spacing:{after:200} }),
      new Paragraph({ children:[ new TextRun({ text:"Document owner: Senior Product Manager   Status: Draft v1.0   Date: July 20, 2026", color: GRAY, size:20 }) ], spacing:{after:320} }),

      h1("1. Executive Summary"),
      p("Block Drop is a mobile-first, drag-and-drop block placement puzzle (Block Blast / 1010!-style, not a falling-piece Tetris clone) built on Celo, an Ethereum Layer 2 optimized for low-cost, mobile-friendly payments. Players drag polyomino pieces from a tray onto an 8x8 grid to fill and clear rows and columns, with no rotation, no timer pressure in the core mode, and a game-over state when none of the current pieces fit."),
      p("The game combines this session-dense, one-thumb puzzle loop with real-money spending mechanics (cosmetic shop items, power-up boosts, blitz tournament entry, and on-chain \"boast\" flexing) monetized through Celo's stablecoin rails (cUSD/USDC/USDT), which let players pay with near-zero gas fees without needing to understand crypto."),
      p("Celo is a strong fit here for the same reasons as the rest of the studio's slate: it is currently the #1 Ethereum L2 by daily active users, transaction fees average roughly half a cent, users can pay gas in stablecoins instead of a native token, and it already has significant reach in emerging markets via Opera's MiniPay wallet (16M+ wallets across 65+ countries), a natural acquisition channel for a casual mobile puzzle with a spending loop."),

      h1("2. Problem Statement & Opportunity"),
      boldLead("Problem: ", "Block-placement puzzles are among the stickiest genres in mobile (multiple sessions per day, very high D1 retention), which makes them a favorite for aggressive ad-network monetization (frequent interstitials, forced rewarded-video loops) and opaque continue-purchase mechanics. That volume of ad exposure caps user goodwill and margin per session, and players get no ownership of anything they spend on."),
      boldLead("Opportunity: ", "Keep the addictive core loop (tray-of-three placement, line clears, combo chains, near-miss board states) but settle purchases directly on-chain in stablecoins, bypassing app-store fees where possible; give players verifiable, ownable cosmetics and provable high-score/combo attestations, a genuine differentiator versus ad-saturated genre incumbents; and tap Celo's existing mobile-first, emerging-market user base (MiniPay) as a low-CAC acquisition channel for a genre that already over-indexes on high-frequency, low-friction play."),

      h1("3. Goals & Success Metrics"),
      h2("Business Goals"),
      bullet("Launch a free-to-play game with a real-money spending loop generating positive unit economics within 2 quarters of launch."),
      bullet("Achieve Day-30 retention \u2265 22% and a paying-user rate \u2265 5% (puzzle-genre benchmarks run higher than arcade: D30 retention 18\u201328%, payer conversion 3\u20136%, so we target the upper end via the on-chain ownership hook)."),
      bullet("Establish Block Drop as a flagship consumer app in the Celo ecosystem (co-marketing potential with Celo Foundation / MiniPay)."),
      h2("Non-Goals (v1)"),
      bullet("No speculative token ($BLOCK token, yield farming) at launch, to avoid gambling/securities classification risk."),
      bullet("No player-vs-player wagering of stablecoins in v1 (regulatory complexity); blitz tournaments use a rake/entry-fee model instead, not peer-to-peer betting pools."),
      h2("Success Metrics (KPIs)"),
      makeTable([2600, 2600, 4800], [
        ["Metric", "Target (Month 6)", "Notes"],
        ["MAU", "300,000", "Puzzle genre supports higher MAU per CAC dollar than arcade"],
        ["D1 / D7 / D30 retention", "45% / 26% / 22%", "Above Fruit Slash targets, reflecting genre norms"],
        ["Paying user %", "5\u20138%", ""],
        ["ARPPU (avg revenue/paying user/mo)", "$5\u20138", "Slightly lower ticket size than arcade, higher frequency"],
        ["ARPDAU", "$0.07\u20130.10", ""],
        ["Avg on-chain tx cost per purchase", "< $0.01", ""],
        ["Gross margin per transaction", "> 90%", "After infra + gateway"],
      ]),

      h1("4. Target Users & Personas"),
      boldLead("1. Casual Puzzle Grinder (primary, global) \u2014 ", "plays short 2\u20135 minute sessions many times a day, spends small amounts on undo/swap boosts and board skins; may not know or care it's \"on Celo,\" the wallet is invisible to them."),
      boldLead("2. MiniPay / Emerging-Market Stablecoin User (acquisition wedge) \u2014 ", "already has a Celo-based wallet via Opera MiniPay in Africa/LatAm/SE Asia, holds cUSD/USDT, low data-cost sensitivity, values near-zero fees."),
      boldLead("3. Crypto-native Competitive Clearer (differentiator audience) \u2014 ", "cares about provable high scores and clear-combo streaks, on-chain flex/boast, leaderboard NFTs, blitz tournament prize pools."),

      h1("5. Core Gameplay (Feature Scope)"),
      h2("5.1 Core Loop (v1 \u2014 table stakes, must match Block Blast / 1010! quality bar)"),
      bullet("8x8 grid; a tray of 3 polyomino pieces at a time, drag-and-drop placement (no rotation, matching genre convention)."),
      bullet("Clearing a full row or column removes it; clearing multiple lines in one placement triggers combo scoring."),
      bullet("No core-mode timer; game ends when none of the 3 tray pieces fit anywhere on the board."),
      bullet("Game modes: Classic (endless, no timer), Blitz (timed sprint for tournament play), Daily Puzzle (fixed seeded board and piece order for fair daily-challenge comparison)."),
      bullet("Daily challenges & streaks; local + global leaderboards."),
      h2("5.2 Web3-Native Features (differentiators)"),
      boldLead("Invisible wallet onboarding: ", "wallet created automatically via Magic.link on first login (email/social/phone); player never sees a seed phrase."),
      boldLead("On-chain \"Boast\" system: ", "player can pay a small fee to mint an immutable, timestamped attestation of a high score or a clear-combo streak to a smart contract; shareable as a card/link with a verifiable on-chain proof."),
      boldLead("Cosmetic ownership: ", "block skins, grid/board themes, and line-clear trail effects sold as ERC-1155 items, tradeable/resellable (with a marketplace royalty back to the studio) rather than app-store-locked IAP."),
      boldLead("Boosts/Power-ups: ", "consumable, non-transferable boosts (undo last move, swap a tray piece, single-cell bomb, color-match clear) sold as micro-transactions."),
      boldLead("Tournaments: ", "entry-fee based (cUSD) Blitz-mode cash tournaments scored on lines cleared in a fixed time, with automated smart-contract payout to top finishers, rake taken by the house."),
      boldLead("Battle Pass / Season Pass: ", "subscription-style cUSD purchase unlocking a cosmetic/reward track over a 4\u20136 week season."),

      h1("6. Business Model & Monetization"),
      h2("6.1 Revenue Streams"),
      makeTable([2400, 3200, 1600, 3200], [
        ["Stream", "Mechanic", "Price range (cUSD)", "Notes"],
        ["Cosmetic shop", "Block/board/trail skins (ERC-1155)", "$0.99\u2013$9.99", "Rarity tiers: Common \u2192 Legendary"],
        ["Boosts (consumables)", "Undo, swap piece, single-cell bomb, color match", "$0.29\u2013$1.99", "Sold in bundles for margin"],
        ["Boast/Flex minting", "On-chain proof-of-score or combo-streak attestation", "$0.49\u2013$1.99", "Low marginal cost, high margin"],
        ["Tournament entry", "Timed Blitz clear-count competitions", "$1\u2013$25 entry", "House rake 15\u201320% of prize pool"],
        ["Battle Pass", "Seasonal reward track", "$4.99 / season", "Recurring revenue anchor"],
        ["Marketplace royalty", "Secondary sale of cosmetic NFTs", "5% royalty", "Passive long-tail revenue"],
        ["Ads (opt-in, rewarded only)", "Watch-to-earn extra undo/currency", "eCPM based", "Fallback for non-payers, no forced interstitials"],
      ]),

      h2("6.2 Why On-Chain Improves the Business Model"),
      boldLead("Lower payment-processing cost: ", "Celo transaction fees run near $0.0005\u2013$0.001; stablecoin settlement avoids card-network interchange (2\u20133%) when purchases happen via web/PWA checkout rather than native app-store IAP."),
      boldLead("App-store fee avoidance: ", "route purchases through a web-based checkout (PWA / \"buy on web\" flow) for cosmetics and boosts where store policy allows, keeping the native app store purely for app installs, the single biggest margin lever (15\u201330% saved vs. IAP)."),
      boldLead("True ownership drives spend: ", "cosmetic NFTs a player can resell (with a royalty back to the studio) lower the psychological barrier to spending versus a pure sunk-cost IAP, which matters more in a genre where players make dozens of micro-decisions per session."),
      boldLead("Boast-to-acquire loop: ", "a shareable on-chain proof of a high score or a long clear-combo streak is inherently viral marketing (each boast link is a mini-ad), lowering CAC in a genre where organic sharing of near-loss recovery moments already drives a lot of unpaid distribution."),

      h2("6.3 Pricing & Economy Guardrails"),
      bullet("No purchasable competitive advantage that breaks fairness in ranked/tournament Blitz mode; boosts (undo, swap, bomb, color match) usable only in Classic/Daily modes, Tournament mode is boost-free to preserve integrity and avoid a pay-to-win/skill-gambling classification."),
      bullet("Cap daily tournament entry-fee spend per user with a soft warning (responsible-spending UX), and a self-exclusion/limit-setting option, given real-money stakes."),
      bullet("Legal review required before launch in each target jurisdiction to confirm the tournament/rake model does not trigger gambling regulation (skill-based competitions with fixed entry fees are generally treated differently from wagering, but this varies by country, confirm with counsel; this PRD is not legal advice)."),

      h1("7. Tech Stack Recommendation"),
      h2("7.1 Blockchain Layer \u2014 Celo (L2)"),
      p("Celo migrated from a standalone L1 to a full Ethereum L2 (OP Stack + EigenDA) in March 2025 and is EVM-equivalent, so standard Solidity/Hardhat/Foundry tooling works unmodified."),
      p("Fee abstraction lets players pay gas in cUSD/USDC/USDT directly, critical for a \"buy a skin for $0.99\" flow where you don't want to explain gas tokens. Block times of roughly 1 second mean purchases and boast-mints confirm fast enough for a puzzle-game UX loop."),
      p("Distribution advantage: MiniPay (Opera) gives access to 16M+ existing Celo wallets in emerging markets, a real acquisition channel and not just an infrastructure choice."),
      p("Smart contract stack: Solidity + Foundry (testing/fuzzing) or Hardhat, OpenZeppelin ERC-1155 for cosmetics, a simple escrow/attestation contract for the Boast feature, and a tournament-payout contract."),

      h2("7.2 Wallet & Auth \u2014 Magic.link"),
      bullet("Embedded/dedicated wallet SDK for invisible onboarding: email OTP, SMS, social login, or passkeys; the player logs in like any web2 game and a non-custodial wallet is provisioned behind the scenes (50\u2013100ms wallet creation/signing latency)."),
      bullet("Non-custodial: Magic's key-management system means the studio never custodies player funds, reducing regulatory and security burden."),
      bullet("Note (verify current feature parity before committing): several competitors (Privy/Stripe, Dynamic/Fireblocks, thirdweb, Openfort) now bundle native smart-account/gas-sponsorship features that Magic's core SDK does not include out of the box; pairing Magic with a separate paymaster/session-key solution may be needed for fully gasless in-game transactions."),

      h2("7.3 Blockchain Data / Indexing \u2014 Goldsky"),
      bullet("Goldsky Subgraphs to index on-chain events (cosmetic mints/transfers, boast attestations, tournament results) into a queryable GraphQL API for the game backend and leaderboard service, sub-second indexing latency, fully managed."),
      bullet("Goldsky Mirror to stream the same on-chain events directly into a Postgres/ClickHouse analytics warehouse in real time for BI, fraud detection, and finance reconciliation, with automatic reorg handling."),

      h2("7.4 Game Client"),
      p("Unlike a physics-heavy slicing or trick-shot title, a drag-and-drop grid puzzle has no particle systems, arcs, or collision physics to tune, which widens the realistic engine choice."),
      bullet("Recommended: a web-first PWA build (PixiJS or Phaser.js + React) as the primary client, since the whole interaction is 2D grid state and drag events; this leans directly into the \"buy on web to dodge app-store fees\" strategy and ships faster than a native-engine build."),
      bullet("Wrap the same web build in a thin native shell (Capacitor or a WebView wrapper) for app-store distribution and push notifications, rather than building a second native client in Unity."),
      bullet("If the team already has a Unity pipeline from other titles in the slate and prefers one engine across the portfolio, Unity remains a safe fallback, just heavier than the genre strictly requires."),

      h2("7.5 Backend"),
      bullet("Node.js/TypeScript services (board-state validation, anti-cheat score verification, matchmaking for tournaments), pairs naturally with Goldsky's GraphQL/webhook outputs and Magic's SDK (also TS-native)."),
      bullet("Postgres (via Goldsky Mirror sink) as the source of truth for indexed on-chain data joined with off-chain game-session data."),
      bullet("Redis for real-time leaderboard caching and rate limiting."),

      h2("7.6 Infra / DevOps"),
      bullet("AWS or GCP for backend hosting; Cloudflare for CDN/edge (asset delivery, DDoS protection)."),
      bullet("CI/CD: GitHub Actions; contracts tested via Foundry fuzzing plus a third-party audit before mainnet deployment (non-negotiable given real money flows)."),

      h2("7.7 Summary Stack Table"),
      makeTable([3200, 6800], [
        ["Layer", "Choice"],
        ["Blockchain", "Celo (Ethereum L2)"],
        ["Wallet/Auth", "Magic.link (embedded wallets, passwordless)"],
        ["On-chain data indexing", "Goldsky (Subgraphs + Mirror)"],
        ["Smart contracts", "Solidity, Foundry, OpenZeppelin"],
        ["Game client", "PixiJS/Phaser + React (PWA-first) wrapped for native distribution"],
        ["Backend", "Node.js/TypeScript, Postgres, Redis"],
        ["Hosting", "AWS/GCP + Cloudflare"],
      ]),

      h1("8. Security, Compliance & Risk"),
      bullet("Smart contract audit mandatory before mainnet launch for any contract touching player funds (shop, tournament payouts)."),
      bullet("KYC/AML: tournament cash payouts above regulatory thresholds may require KYC; plan for a KYC provider integration (many embedded-wallet vendors, including Magic, support pluggable identity/compliance tooling) before scaling tournament stakes."),
      bullet("Anti-cheat: server-authoritative board-state validation (client sends placements, server recomputes clears and score) to prevent fraudulent boast/tournament submissions."),
      bullet("Regulatory review per country on the tournament entry-fee/rake model (skill-game vs. gambling classification varies globally)."),
      bullet("Responsible spending: daily/weekly spend caps, cooldowns, and clear odds with no gacha-style randomized paid loot, to reduce regulatory exposure."),

      h1("9. Rollout Plan"),
      makeTable([2000, 5600, 2400], [
        ["Phase", "Scope", "Timeline"],
        ["Alpha", "Core drag-and-drop gameplay + wallet onboarding (Magic) + cosmetic shop, testnet", "Weeks 1\u20136"],
        ["Closed Beta", "Add Boast minting, Goldsky indexing/leaderboards, mainnet with real cUSD", "Weeks 7\u201312"],
        ["Public Launch", "Tournaments, Battle Pass, MiniPay co-marketing push", "Week 14"],
        ["Post-launch", "Marketplace/resale, expand to additional chains if warranted", "Ongoing"],
      ]),

      h1("10. Open Questions for Stakeholder Sign-off"),
      bullet("Which app stores (Apple/Google) will we distribute through, and how do we structure the web-checkout flow to stay compliant with their payment policies?"),
      bullet("What jurisdictions are in scope for launch, and has legal confirmed the tournament/rake model in each?"),
      bullet("Do we want Magic alone for wallets, or pair it with a smart-account/paymaster provider for gasless UX, needs a technical spike before Beta."),
      bullet("Given the lighter client requirement versus a physics-based title, do we ship this as the studio's PWA-first pilot to validate the web-checkout fee-avoidance strategy before committing Unity resources to the rest of the slate?"),

      new Paragraph({ spacing:{before:300}, children:[ new TextRun({ text:"This PRD reflects product and business strategy recommendations current as of July 2026. Blockchain infrastructure details (Celo, Goldsky, Magic.link feature sets and pricing) should be reconfirmed against current vendor documentation before final engineering commitment, as these platforms update frequently.", italics:true, size:18, color: GRAY }) ] }),
    ],
  }],
});

Packer.toBuffer(doc).then(buf => {
  require("fs").writeFileSync("/mnt/user-data/outputs/Block_Drop_PRD.docx", buf);
  console.log("written");
});