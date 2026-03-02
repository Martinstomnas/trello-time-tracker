# Trello Time Tracker Power-Up

A free, open-source Trello Power-Up for time tracking and estimation. Track time per card, per person, set time estimates, view reports with charts and date filtering, and export to CSV.

## Features

### Time Tracking (Registrert tid)

- **Start/stop timer** on any Trello card with one click
- **Per-person tracking** – each member logs time under their own identity
- **Multi-user timer control** – start and stop timers for other board members from the same popup
- **Visual badge** on cards showing tracked time (green when a timer is running)
- **Live-updating badge** – card badges refresh every 30 seconds, showing seconds when a timer is active
- **Manual time entry** – add or subtract time with "Legg til tid" / "Trekk fra tid" buttons, with custom date and member selection
- **Enter key support** – press Enter in the manual time input to add time (same as clicking the button)
- **Adjust time for others** – log time on behalf of other board members
- **Smart member selection** – when returning to a card, members with active timers are automatically pre-selected
- **Negative time protection** – subtracting time never goes below zero
- **Labels sync live** – label changes in Trello are reflected in reports immediately (fetched at runtime, not stored)

### Time Estimation (Estimert tid)

- **Per-person estimates** – set time estimates for each member on a card
- **Re-estimation with history** – when an estimate changes, the original value is preserved and displayed (e.g. "2t (oppr. 4t)")
- **Grace period** – changes within 2 minutes of the last update are treated as corrections (no history logged)
- **Auto-calculated remaining time** – "Gjenstående" is always estimated − actual, no manual overrides
- **Estimate badge** on cards showing estimated time, with red indicator when actual exceeds estimate

### Board-Level Reports (Tidsrapport)

- **Date filtering** with presets: today, yesterday, this/last week, this/last month, this year, and custom range
- **Grouping** by card, person, or label/category
- **"Active cards" column** when grouping by person – shows which cards each person is actively tracking
- **Sorting** by time (most first) or name (A–Å)
- **Table and chart views** – bar chart and pie chart using Chart.js
- **Charts use Trello's actual label colors** (Atlassian Design System tokens)
- **Stable layout** with tabular numerals (`font-variant-numeric: tabular-nums`) for time columns
- **Live-updating times** – active timers tick in real-time with green dashed styling
- **Polling** – reports auto-refresh every 5–30 seconds to detect changes from other users
- **Reset time** – per-card "Tilbakestill tid" button with confirmation dialog (works even for archived/deleted cards)
- **Stop active tracking** – stop timers directly from the report view
- **CSV export**

### Estimation Reports (Tidsestimering)

- **Estimated vs actual comparison** with deviation, deviation %, and accuracy score
- **Summary cards** showing totals for estimated, actual, remaining time, and average accuracy
- **Grouping** by card, person, or label
- **Sorting** by deviation, estimated time, accuracy, or name
- **Original estimate tracking** – shows original values when re-estimated
- **Color-coded deviation** – green (≤10%), yellow (≤25%), red (>25%)
- **Date filtering** with the same presets as time reports
- **CSV export** including original estimate column

### Multi-Board Support

- Each board has isolated data – all rows include a `board_id`, and board-level reports are scoped by `board_id`

## Tech Stack

- **React 18** + **Vite**
- **Chart.js** + react-chartjs-2
- **Supabase** (PostgreSQL) for data storage
- **Trello Power-Up Client Library**
- **Netlify** for hosting

## Getting Started

### Prerequisites

- Node.js 18+
- A [Trello](https://trello.com) account
- A [Supabase](https://supabase.com) account (free tier)
- A [Netlify](https://netlify.com) account (free tier)

### 1. Clone the repo

```bash
git clone https://github.com/YOUR-USERNAME/trello-time-tracker.git
cd trello-time-tracker
npm install
```

### 2. Set up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the following to create the time tracking tables:

```sql
create table time_entries (
  id uuid primary key default gen_random_uuid(),
  board_id text not null,
  card_id text not null,
  card_name text,
  list_name text,
  member_id text not null,
  member_name text,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_ms bigint default 0,
  labels jsonb default '[]',
  created_at timestamptz default now()
);

create table active_timers (
  id uuid primary key default gen_random_uuid(),
  board_id text not null,
  card_id text not null,
  member_id text not null,
  member_name text,
  started_at timestamptz not null,
  unique(card_id, member_id)
);

create index idx_time_entries_board on time_entries(board_id);
create index idx_time_entries_card on time_entries(card_id);
create index idx_time_entries_member on time_entries(member_id);
create index idx_time_entries_dates on time_entries(started_at, ended_at);
create index idx_active_timers_card on active_timers(card_id);
create index idx_active_timers_board on active_timers(board_id);

alter table time_entries enable row level security;
alter table active_timers enable row level security;

create policy "Allow all on time_entries" on time_entries
  for all using (true) with check (true);

create policy "Allow all on active_timers" on active_timers
  for all using (true) with check (true);
```

3. Then run this to create the estimation tables:

```sql
create table time_estimates (
  id uuid primary key default gen_random_uuid(),
  board_id text not null,
  card_id text not null,
  member_id text,
  member_name text,
  estimated_ms bigint not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index idx_estimates_card_member
on time_estimates(card_id, member_id);
create index idx_estimates_board on time_estimates(board_id);
create index idx_estimates_card on time_estimates(card_id);

create table estimate_history (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid references time_estimates(id) on delete cascade,
  board_id text not null,
  card_id text not null,
  member_id text,
  member_name text,
  previous_ms bigint not null,
  new_ms bigint not null,
  reason text,
  changed_at timestamptz default now()
);

create index idx_estimate_history_card on estimate_history(card_id);
create index idx_estimate_history_estimate on estimate_history(estimate_id);

alter table time_estimates enable row level security;
alter table estimate_history enable row level security;

create policy "Allow all on time_estimates" on time_estimates
  for all using (true) with check (true);

create policy "Allow all on estimate_history" on estimate_history
  for all using (true) with check (true);
```

4. Go to **Project Settings** → **API** and copy the **Project URL** and **Publishable Key**

### 3. Configure environment variables

Create a `.env` file in the project root:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-key
```

### 4. Run locally (development)

```bash
npm run dev
```

This starts a local HTTPS server at `https://localhost:3000/`.

**First time:** Open `https://localhost:3000/connector.html` in your browser and accept the self-signed certificate warning.

**Trello setup for local dev:**

1. Go to [Power-Up Admin](https://trello.com/power-ups/admin)
2. Create a separate Power-Up (e.g. "Time Tracker DEV")
3. Set Iframe connector URL to: `https://localhost:3000/connector.html`
4. Enable the same 5 capabilities as the production Power-Up
5. Activate it on a test board

This keeps your production Power-Up unaffected while you develop.

### 5. Deploy to Netlify

1. Push to GitHub
2. Connect the repo in [Netlify](https://netlify.com)
3. Set build settings:
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
4. Add environment variables in Netlify (Site settings → Environment variables):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

### 6. Register the Power-Up in Trello

1. Go to [Trello Power-Up Admin](https://trello.com/power-ups/admin)
2. Create a new Power-Up
3. Set **Iframe connector URL** to: `https://your-site.netlify.app/connector.html`
4. Enable capabilities:
   - ✅ Card badges
   - ✅ Card detail badges
   - ✅ Card buttons
   - ✅ Board buttons
   - ✅ Show settings
5. Save

### 7. Activate on a board

Go to any board → Power-Ups → find "Time Tracker" → activate. All board members can now use it.

> **Note:** Registering a custom Power-Up requires workspace admin rights. Once registered, any member can activate it on their boards.

## Project Structure

```
trello-time-tracker/
├── public/
│   ├── connector.html      # Trello loads this in a hidden iframe
│   ├── connector.js        # Registers capabilities with Trello
│   ├── clock-icon.svg      # Icon for buttons and badges
│   └── manifest.json       # Power-Up manifest
├── src/
│   ├── utils/
│   │   ├── supabase.js     # Supabase client
│   │   ├── storage.js      # Time tracking operations (start/stop/adjust/report)
│   │   ├── estimateStorage.js # Estimate operations (set/remove/report/history)
│   │   ├── time.js         # Time formatting and parsing
│   │   └── export.js       # CSV export
│   ├── timer/
│   │   ├── main.jsx        # Timer popup entry point (tabbed: Registrert tid / Estimert tid)
│   │   └── TimerApp.jsx    # Timer UI (start/stop, manual entry, member list)
│   ├── estimate-card/
│   │   └── EstimateCardApp.jsx # Card-level estimate management
│   ├── estimate/
│   │   └── EstimateApp.jsx # Board-level estimation report
│   ├── report/
│   │   ├── main.jsx        # Report modal entry point (tabbed: Tidsrapport / Tidsestimering)
│   │   └── ReportApp.jsx   # Report UI (filters, table, charts, export)
│   ├── settings/
│   │   ├── main.jsx        # Settings popup entry point
│   │   └── SettingsApp.jsx # Settings UI
│   └── components/
│       └── ReportChart.jsx # Chart.js bar/pie chart wrapper
├── index.html              # Connector HTML (Vite entry)
├── timer.html              # Timer popup HTML
├── report.html             # Report modal HTML
├── settings.html           # Settings popup HTML
├── vite.config.js          # Vite config with HTTPS and env injection
├── package.json
├── LICENSE                 # MIT License
└── .env.example            # Template for environment variables
```

## Data Model

All data is stored in Supabase (PostgreSQL):

**`time_entries`** – One row per completed time session:

- `board_id`, `card_id`, `card_name`, `list_name`
- `member_id`, `member_name`
- `started_at`, `ended_at`, `duration_ms`
- `labels` (JSON array from Trello)

**`active_timers`** – One row per currently running timer:

- `board_id`, `card_id`, `member_id`, `member_name`, `started_at`

**`time_estimates`** – One row per member per card:

- `board_id`, `card_id`, `member_id`, `member_name`
- `estimated_ms`
- `created_at`, `updated_at`

**`estimate_history`** – Log of re-estimations (scope changes):

- `estimate_id` (FK → time_estimates), `board_id`, `card_id`, `member_id`, `member_name`
- `previous_ms`, `new_ms`, `reason`, `changed_at`

## License

This project is licensed under the [MIT License](LICENSE).
