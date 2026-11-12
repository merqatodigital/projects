# Projects

A private dashboard for tracking projects across GitHub accounts and Vercel teams. It brings repository activity, deployments, live sites, and review decisions into one place.

## What it does today

- Browse and filter repositories and deployments by account, project family, and review status.
- See each inventoried repository's last code push, its linked deployments, and available code evidence.
- Run website checks and save decisions and notes about which projects to keep, investigate, or archive.
- Remove a row from the dashboard. This hides the row across reloads and inventory imports.
- Delete an actual GitHub repository through a separate, owner-only action. It requires the exact repository name and a scoped GitHub token with repository administration write access.
- Manage a portfolio of selected projects, including live links and uploaded images.

Inventory updates use a saved JSON snapshot. Website checks run on demand. Vercel deployment information is shown for review. Vercel project deletion is a future feature.

## Who it is for

The current version is for personal use. The longer-term product is a workspace for solo builders and teams that manage multiple GitHub accounts, Vercel teams, and other tools. Team access and commercial availability are future decisions.

## Tech stack

| Layer | Current implementation |
| --- | --- |
| Interface | HTML, CSS, and vanilla JavaScript |
| Backend | Cloudflare Worker using the Fetch API |
| Storage | R2 for inventory, review notes, website check results, dashboard removals, GitHub deletion receipts, portfolio records, and uploaded images |
| Access | Private ChatGPT Sites hosting, with owner checks on repository and dashboard removal actions |
| Integrations | GitHub REST API and imported GitHub/Vercel inventory |
| Build and preview | Python 3 builds the worker bundle. Node.js runs the local preview and regression checks. |

## Code tree

```text
.
├── admin.html                   # Private inventory and review dashboard
├── page.html                    # Portfolio and project management
├── server.js                    # Worker routes and storage operations
├── inventory.json               # Seed inventory snapshot
├── build.py                     # Combines HTML, seed data, and worker code
├── preview.mjs                  # Local HTTP preview with in-memory storage
├── package.json                 # Node.js project and preview command
├── check.mjs                    # Core project management regression checks
├── *-check.mjs                  # Inventory, UI, import, and GitHub deletion checks
├── .openai/hosting.json         # Current Sites hosting and R2 binding
└── dist/
    ├── .openai/hosting.json     # Generated deployment metadata
    └── server/index.js          # Generated worker bundle
```

## Run locally

```sh
python3 build.py
PORT=3000 npm run dev
```

Open `http://localhost:3000/admin` for the inventory and `http://localhost:3000/` for the portfolio. The local preview uses in-memory storage and lacks the production sign-in layer.

```sh
for check in *-check.mjs check.mjs; do node "$check" || exit 1; done
```

## Personal Vercel deployment

The current deployment uses a Sites-specific R2 binding and sign-in headers. To run privately on a Vercel URL:

1. Add a Vercel Function entry point and connect it to durable storage. Keeping R2 is an option if we can provision and access the destination bucket.
2. Protect the dashboard and its APIs with server-side owner authentication and test access from a signed-out browser.
3. Export and restore the live R2 data, including images, decisions, removal markers, and deletion receipts. The repository contains a seed snapshot and app code.
4. Verify inventory, portfolio, images, and saved decisions on the private Vercel deployment before considering a custom domain.

## Improvements to prioritize

- Add a complete backup and restore flow and a way to restore dashboard-only removals.
- Sync connected accounts on demand and show the last successful sync.
- Add Vercel project management with dependency checks and explicit confirmation for destructive actions.
- Before team use, add workspace isolation, roles, and an audit history.
