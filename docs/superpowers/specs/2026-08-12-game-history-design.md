# Game History Design

## Goal

Turn the existing game-history records into a complete host-facing feature without changing the `GameHistory` database model or expanding into round analytics, search, CSV exports, or charts.

## Backend API

`GET /api/history` remains protected by `requireAuth` and accepts `page` and `limit` query parameters. Both values are positive integers; invalid values return `400`, and `limit` is capped at 50. Defaults are `page=1` and `limit=10`.

The query always filters by the authenticated `hostUserId` and uses the stable newest-first order `createdAt DESC, id DESC`. The response contains:

```ts
{
  history: GameHistoryItem[];
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
```

`DELETE /api/history` remains the sole clear-all backend flow and deletes records only for the authenticated host.

## Shared Frontend Model

The frontend API service owns the typed history item and paginated response. A small shared result component renders the same semantics on the Dashboard and full history page:

- `WINNER`: crown icon, winner name, and final score;
- `DRAW`: neutral draw label, without a crown or invented winner;
- `NO_WINNER`: neutral no-winner label, without a crown or invented winner.

Unexpected result strings are displayed as `NO_WINNER` rather than inventing winner data.

## Full History Page

The lazy-loaded `/history` route performs the same server-backed host check as the existing Dashboard and Settings pages. An invalid session redirects to `/login`.

The page uses `DashboardLayout` and shows:

- local date and time;
- room code;
- participant count;
- correctly rendered result;
- previous/next pagination controls and the current page position;
- loading, empty, error with retry, and clear-all states.

Entries use responsive cards so 375 px screens have no horizontal scrolling. Interactive targets remain at least 44 px high, errors use `role="alert"`, and loading/clear actions expose visible progress.

Clear-all requires the existing confirmation word `ОЧИСТИТЬ`. Success empties the page and count; failure keeps the dialog actionable and reports the error.

## Dashboard and Navigation

The Dashboard requests only the five newest records, keeps the total count, and links to `/history`. Its compact list uses the shared result renderer so all result types are correct.

The disabled desktop history item becomes an active navigation control with the correct selected state. Mobile gets a labelled history control alongside the existing Dashboard/Settings access; icon-only controls receive accessible names.

## Marketing Copy

The tariff feature `Детальная история проведенных игр` becomes `История проведённых игр`, matching the stored final-result data.

## Verification

Backend integration tests cover pagination defaults and validation, stable newest-first ordering, host isolation, and host-scoped deletion. Frontend tests cover all three result types, Dashboard correctness, loading, empty, error/retry, pagination, navigation, mobile access, and guarded clearing. Playwright covers protected routing, desktop and mobile navigation, responsive layout, and real clear-all behavior.

Iteration 1 must pass the complete requested verification set before iteration 2 begins.
