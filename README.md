# Trello Time Tracker Power-Up

A free, open-source Trello Power-Up for time tracking. Track time per card, per person, view reports with charts and date filtering, and export to CSV/JSON.

## Features

- **Start/stop timer** on any Trello card with one click
- **Per-person tracking** – each member logs time under their own identity
- **Multi-user timer control** – start and stop timers for other board members from the same popup
- **Visual badge** on cards (green = timer running)
- **Manual time entry** – add or subtract time with custom date and member selection
- **Adjust time for others** – log time on behalf of other board members
- **Board-level reports** with:
  - Date filtering (today, yesterday, this/last week, this/last month, this year, custom range)
  - Grouping by card, person, or label
  - "Active cards" column when grouping by person
  - Table and chart views (bar chart, pie chart)
  - CSV and JSON export
- **Multi-board support** – each board has isolated data

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
2. Go to **SQL Editor** and run:

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

3. Go to **Project Settings** → **API** and copy the **Project URL** and **Publishable Key**

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
│   │   ├── storage.js      # All data operations (start/stop/adjust/report)
│   │   ├── time.js         # Time formatting and parsing
│   │   └── export.js       # CSV and JSON export
│   ├── timer/
│   │   ├── main.jsx        # Timer popup entry point
│   │   └── TimerApp.jsx    # Timer UI (start/stop, manual entry, member list)
│   ├── report/
│   │   ├── main.jsx        # Report modal entry point
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
├── vite.config.js          # Vite config with env injection plugin
├── package.json
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

## License

This project is licensed under the [MIT License](LICENSE).
