# ChainRaise

ChainRaise is a university demonstration project for transparent, blockchain-based crowdfunding. It is intended for Sepolia test ETH and academic use; it is not production financial software.

## Stage 1 setup

### Requirements

- Node.js 22.10 or later (the current setup was initialized with Node.js 26.7.0)
- npm
- Git

### Install and run

```bash
npm install
npm run dev
```

The Next.js App Router application is in `src/app`. Shared frontend components and browser/blockchain helpers belong in `src/components` and `src/lib` as they are implemented.

## Smart contract development

Hardhat 3 is configured in `hardhat.config.ts` with the official Mocha/ethers toolbox. It reads Solidity sources from `contracts/`, tests from `test/`, and deployment scripts from `scripts/`.

```bash
npm run compile
npm run test:contracts
```

No contract has been implemented yet. Contract behavior and tests are planned for later stages.

The production build uses Next.js's webpack backend (`next build --webpack`) because Turbopack's worker process exits unexpectedly in the current Windows development environment.

## Environment variables

Copy `.env.example` to `.env` only when local configuration is needed. Keep actual RPC credentials and deployment keys in the ignored `.env` file; never commit it or put a private key in a `NEXT_PUBLIC_` variable. The example contains placeholders, not working deployment credentials.

## Current scope

Stage 1 initializes the frontend and Solidity toolchain only. No campaign UI, contract, wallet integration, deployment or testnet transaction is included yet.

## Limitations

Smart contracts can enforce their programmed funding and withdrawal rules, but cannot verify that campaign descriptions are truthful or that creators deliver on their promises. This application is for a testnet academic demonstration, not for real funds.
