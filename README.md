<!-- readme-seo: bannysukumar-professional-v4 -->

# Telugu Earning Hub

Telugu Earning Hub is a TypeScript pnpm monorepo. The product interface is `artifacts/roi-platform`, a React app titled Telugu-Earning-Hub, with an API in `artifacts/api-server` for plans, investments, withdrawals, and referrals.

## Overview

The ROI platform includes public pages for home, plans, about, contact, and a binary plan, plus login and registration. Signed-in pages cover a user dashboard, investments, add fund, withdrawals, income history, and binary, sponsor, and level trees. An admin area covers users, deposits, plans, investments, and withdrawals.

`artifacts/mockup-sandbox` is a separate UI prototyping tool. Its HTML title is Mockup Canvas. That title is not the name of this product.

The root `package.json` requires Node.js `>=20.19.0` and runs the workspace with pnpm. Firebase configuration is in `firebase.json`, with Firestore and Storage rules in the repository.

## Features

Confirmed by files under `artifacts/roi-platform/src/pages` and `artifacts/api-server/src`:

- Public home, plans, about, contact, vision, privacy, and terms pages
- Login, registration, and forgot-password pages
- User investments, add fund, transfer funds, withdrawals, and income history
- Binary tree, sponsor tree, and level views
- Admin pages for users, deposits, plans, investments, withdrawals, and settings
- API route modules for auth, plans, investments, withdrawals, growth plan, referrals, and health

## Tech Stack

| Technology | Where it shows up |
|---|---|
| TypeScript | Root `tsconfig.json` and the workspace packages |
| React 19 | pnpm catalog and `artifacts/roi-platform` |
| Vite | `artifacts/roi-platform` dev script |
| Tailwind CSS | pnpm catalog |
| Firebase | `firebase.json`, `artifacts/roi-platform/src/lib/firebase.ts` |
| Node.js API | `artifacts/api-server` |
| pnpm | `pnpm-workspace.yaml` and the root `preinstall` check |

## Architecture

React app in `artifacts/roi-platform` → HTTP API in `artifacts/api-server` → Firebase and Firestore libraries in that API (`firebase-admin.ts`, `firestore-db.ts`).

## Project Structure

```text
Telugu-Earning-Hub/
├── artifacts/roi-platform/
├── artifacts/api-server/
├── artifacts/mockup-sandbox/
├── lib/
├── firebase/
├── firebase.json
├── package.json
└── pnpm-workspace.yaml
```

## Prerequisites

- Node.js 20.19.0 or newer, from `package.json` `engines`
- pnpm, enforced by `enforce-pnpm.cjs`

## Installation

```bash
git clone https://github.com/Bannysukumar/Telugu-Earning-Hub.git
cd Telugu-Earning-Hub
pnpm install
pnpm dev
```

`pnpm dev` runs `node ./dev-all.mjs`. The ROI platform's own dev script starts Vite on port 5173 and proxies API calls to `http://127.0.0.1:3001`.

## Configuration

The ROI platform dev script sets `VITE_API_PROXY_TARGET` to the local API. Firebase project files are `firebase.json`, `.firebaserc`, `firestore.rules`, and `storage.rules`. Do not commit service-account keys.

## Usage

Use the public plans page and the login page in `artifacts/roi-platform`. After sign-in, the user routes expose investments, funding, withdrawals, and tree views. Admin routes live under `src/pages/admin`.

## API

Route modules in `artifacts/api-server/src/routes`:

- `auth.ts`
- `plans.ts`
- `investments.ts`
- `withdrawals.ts`
- `growth-plan.ts`
- `referral-public.ts`
- `user.ts`
- `admin.ts`
- `health.ts`
- `cron.ts`

## Testing

Unit tests next to the API library include `investment-cap.test.ts`, `investment-mlm-binary.test.ts`, `level-income.test.ts`, and `level-income-config.test.ts`.

## Deployment

`package.json` includes `firebase:deploy-functions`, which runs `node ./scripts/firebase-deploy-functions.mjs`. `firebase.json` is in the repository root.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## License

Licensed under MIT. See [LICENSE](LICENSE).

## Author

Banny Sukumar

GitHub: https://github.com/Bannysukumar
