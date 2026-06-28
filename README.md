# Stellar Crowdfund dApp

A decentralized crowdfunding application built on the Stellar testnet using Soroban smart contracts with milestone-based fund release. Part of the **Stellar Journey To Mastery - Monthly Builder Challenge (Level 3 - Orange Belt)**.

## Live Demo

[View Live App](https://stellar-payment-dapp-chi.vercel.app)

## Features

- **Milestone-Based Crowdfunding** — Campaigns are broken into milestones. Funds are released only when milestones are approved.
- **Factory + Campaign Architecture** — Factory contract deploys individual Campaign contracts, each with its own state and milestone logic.
- **Multi-Wallet Support** — Connect with Freighter, Albedo, LOBSTR, xBull, Rabet, or Hana Wallet via StellarWalletsKit
- **Create Campaign** — Create on-chain campaigns with custom name, goal, deadline, and milestones
- **Donate XLM** — Donate to any campaign directly from your wallet
- **Submit & Approve Milestones** — Campaign creator submits milestones for review, then approves to release funds
- **Real-Time Updates** — Auto-polling every 10-15 seconds keeps campaign data fresh without manual refresh
- **Optimistic Updates** — UI updates instantly on submit/approve before RPC confirms
- **User-Friendly Error Handling** — Clear English error messages instead of raw WASM errors
- **Loading States & Skeletons** — Smooth loading indicators and skeleton screens
- **Mobile Responsive** — Fully responsive design for mobile, tablet, and desktop
- **Confetti Animation** — Celebration effect on successful transactions
- **CI/CD Pipeline** — GitHub Actions for automated testing, Vercel for auto-deployment

## Smart Contracts

### Factory Contract
- **Address:** `CDQRJDWGSYY62B4E7SUN5M2TXC4VQA6RNLFMQSCBEWUTZ3X3HLNORYIC`
- **Functions:**
  - `initialize(admin, campaign_wasm)` — Set admin and campaign WASM hash
  - `create_campaign(creator, name, goal, deadline, milestones)` — Deploy a new Campaign contract
  - `get_campaigns()` — List all deployed campaign addresses
  - `get_campaign_count()` — Total number of campaigns

### Campaign Contract (WASM Hash)
- **WASM Hash:** `6acaed997d8c2e9cd7715e8410e6028fde2280fd20111df944397edc3bfdb33e`
- **Functions:**
  - `init(admin, factory, name, goal, deadline, milestones)` — Initialize campaign with milestones
  - `donate(donor, amount)` — Donate XLM to the campaign
  - `submit_milestone(admin, index)` — Mark milestone as submitted
  - `approve_milestone(admin, index)` — Approve milestone and release funds
  - `get_name()` — Campaign name
  - `get_goal()` — Funding goal
  - `get_info()` — Goal, raised amount, and deadline
  - `get_milestones()` — All milestones with status
  - `get_total_raised()` — Total donations
  - `get_total_released()` — Total released funds

### Example Transaction
- **Deploy TX:** [View on Stellar Explorer](https://stellar.expert/explorer/testnet/tx/b3ac340be7aaa7eed0f0ab4937a7233e2dc71bb1901ad42b5ad02ac66f5aba90)

## Tech Stack

- **Frontend:** React + Vite
- **Styling:** Tailwind CSS v4
- **State Management:** Zustand
- **Stellar SDK:** `@stellar/stellar-sdk` v16
- **Wallet Kit:** `@creit.tech/stellar-wallets-kit` v2.4.0
- **Smart Contracts:** Soroban (Rust, soroban-sdk v26)
- **Testing:** Vitest + React Testing Library (frontend), Cargo test (contracts)
- **CI/CD:** GitHub Actions + Vercel

## Project Structure

```
stellar-payment-dapp/
├── contract/
│   ├── Cargo.toml                      # Workspace config
│   └── contracts/
│       ├── campaign/
│       │   ├── Cargo.toml
│       │   └── src/lib.rs              # Campaign contract logic + tests
│       └── factory/
│           ├── Cargo.toml
│           └── src/lib.rs              # Factory contract logic + tests
├── src/
│   ├── App.jsx                         # Main app with contract integration
│   ├── store.js                        # Zustand state management
│   ├── config.js                       # Contract addresses & network config
│   ├── main.jsx                        # Entry point
│   ├── components/
│   │   ├── Header.jsx                  # Wallet connect/disconnect
│   │   ├── CampaignCard.jsx            # Campaign list & detail views
│   │   ├── CreateCampaign.jsx          # Campaign creation form
│   │   ├── DonateForm.jsx              # Donation form with quick amounts
│   │   └── RecentDonations.jsx         # Recent donation history
│   └── __tests__/
│       ├── Header.test.jsx
│       ├── CampaignCard.test.jsx
│       └── DonateForm.test.jsx
├── screenshots/level3/                 # Submission screenshots
├── .github/workflows/ci.yml           # CI/CD pipeline
└── package.json
```

## Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/EnesPacaci/stellar-payment-dapp.git
   ```
2. Install dependencies:
   ```bash
   cd stellar-payment-dapp
   npm install --legacy-peer-deps
   ```
3. Start the dev server:
   ```bash
   npm run dev
   ```
4. Open `http://localhost:5173` in your browser.

## Prerequisites

- A Stellar wallet extension installed (Freighter recommended)
- Wallet set to **Testnet**
- A funded testnet account (get test XLM from [friendbot.stellar.org](https://friendbot.stellar.org))

## Testing

```bash
# Frontend tests
npx vitest run

# Smart contract tests (requires Rust toolchain)
cd contract
cargo test
```

## CI/CD Pipeline

- **CI:** GitHub Actions runs lint, build, and tests on every push to `main`
- **CD:** Vercel auto-deploys on every successful push to `main`

## Screenshots

See the [`screenshots/level3/`](screenshots/level3/) directory for:
- Mobile responsive UI
- CI/CD pipeline (GitHub Actions + Vercel)
- Test output (9 passing tests)

## Demo Video

[Stellar Crowdfund dApp - Level 3 Demo](https://youtu.be/6GIEoYrAzWI)

## License

MIT
