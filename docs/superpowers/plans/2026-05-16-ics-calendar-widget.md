# ICS Multi-Column Calendar Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a TRMNL recipe that fetches up to 5 ICS calendar URLs and renders each as a schedule-view column on the 800×480 e-ink display, with dynamic column count based on how many URLs are configured.

**Architecture:** A `getData.ts` fetches all configured ICS URLs in parallel, parses each using `ical.js`, groups events by day for a configurable look-ahead window, and returns structured column data. The React component renders a flex-row of columns (1–5), each with a header and a scrollable-style event list grouped by date.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, `ical.js` (ICS parsing + RRULE recurring events), `PreSatori` (e-ink render wrapper), `unstable_cache` (Next.js data caching)

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Install | `package.json` | Add `ical.js` dependency |
| Create | `lib/recipes/ics-parser.ts` | Pure ICS text → structured events; reusable utility |
| Create | `app/(app)/recipes/screens/ics-calendar/getData.ts` | Fetch calendars in parallel, parse, group by day |
| Create | `app/(app)/recipes/screens/ics-calendar/ics-calendar.tsx` | Multi-column schedule view component |
| Modify | `app/(app)/recipes/screens.json` | Register the recipe with params |

---

## Task 1: Install ical.js

**Files:** `package.json` (modified by pnpm)

- [ ] **Step 1: Install the package**

```bash
cd /home/daniel/byos_next
pnpm add ical.js
```

Expected: `package.json` gains `"ical.js": "^2.0.x"` in dependencies, lockfile updated.

- [ ] **Step 2: Verify TypeScript types are included**

```bash
ls node_modules/ical.js/lib/*.d.ts 2>/dev/null || echo "No bundled types"
pnpm ls ical.js
```

Expected: Version printed, no install errors.

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(deps): add ical.js for ICS calendar parsing"
```

---

## Task 2: ICS Parser Utility

**Files:**
- Create: `lib/recipes/ics-parser.ts`

This module is a pure utility: given raw ICS text and a date range, returns a sorted list of events. Keeps `getData.ts` clean and makes the parser independently testable.

- [ ] **Step 1: Create the utility file**

Create `lib/recipes/ics-parser.ts`:

```typescript
import ICAL from "ical.js";

export interface CalendarEvent {
  title: string;
  start: string;  // ISO 8601 string
  end: string;    // ISO 8601 string
  allDay: boolean;
  description?: string;
}

/**
 * Parse raw ICS text and return events within [rangeStart, rangeEnd].
 * Handles recurring events (RRULE) and all-day events.
 * Events are sorted ascending by start time.
 */
export function parseICS(
  icsText: string,
  rangeStart: Date,
  rangeEnd: Date,
): CalendarEvent[] {
  let jcalData: ICAL.jCal;
  try {
    jcalData = ICAL.parse(icsText);
  } catch {
    return [];
  }

  const comp = new ICAL.Component(jcalData);
  const vevents = comp.getAllSubcomponents("vevent");
  const results: CalendarEvent[] = [];

  const icalStart = ICAL.Time.fromJSDate(rangeStart, true);
  const icalEnd = ICAL.Time.fromJSDate(rangeEnd, true);

  for (const vevent of vevents) {
    const event = new ICAL.Event(vevent);
    if (!event.startDate) continue;

    if (event.isRecurring()) {
      const iterator = event.iterator();
      let next: ICAL.Time | null = iterator.next();
      while (next && next.compare(icalEnd) <= 0) {
        if (next.compare(icalStart) >= 0) {
          const occurrence = event.getOccurrenceDetails(next);
          results.push({
            title: occurrence.item.summary?.trim() || "Untitled",
            start: occurrence.startDate.toJSDate().toISOString(),
            end: occurrence.endDate.toJSDate().toISOString(),
            allDay: occurrence.startDate.isDate,
            description: occurrence.item.description?.trim(),
          });
        }
        next = iterator.next();
      }
    } else {
      const startJS = event.startDate.toJSDate();
      if (startJS >= rangeStart && startJS <= rangeEnd) {
        results.push({
          title: event.summary?.trim() || "Untitled",
          start: event.startDate.toJSDate().toISOString(),
          end: event.endDate?.toJSDate().toISOString() ?? event.startDate.toJSDate().toISOString(),
          allDay: event.startDate.isDate,
          description: event.description?.trim(),
        });
      }
    }
  }

  return results.sort((a, b) => a.start.localeCompare(b.start));
}

/**
 * Extract calendar name from ICS text (X-WR-CALNAME property).
 * Returns null if not present.
 */
export function extractCalendarName(icsText: string): string | null {
  const match = icsText.match(/^X-WR-CALNAME:(.+)$/m);
  return match ? match[1].trim() : null;
}

/**
 * Group a sorted event list by calendar date string.
 */
export interface DayGroup {
  dateLabel: string;   // e.g. "Mon, May 16"
  dateISO: string;     // e.g. "2026-05-16"
  events: CalendarEvent[];
}

export function groupEventsByDay(events: CalendarEvent[]): DayGroup[] {
  const map = new Map<string, CalendarEvent[]>();

  for (const event of events) {
    const d = new Date(event.start);
    const iso = d.toISOString().slice(0, 10);
    if (!map.has(iso)) map.set(iso, []);
    map.get(iso)!.push(event);
  }

  const result: DayGroup[] = [];
  for (const [iso, evts] of map) {
    const d = new Date(`${iso}T00:00:00`);
    result.push({
      dateISO: iso,
      dateLabel: d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
      events: evts,
    });
  }

  return result.sort((a, b) => a.dateISO.localeCompare(b.dateISO));
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/daniel/byos_next
pnpm typecheck 2>&1 | grep ics-parser
```

Expected: No errors for `lib/recipes/ics-parser.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/recipes/ics-parser.ts
git commit -m "feat(recipes): add ICS parser utility for calendar recipe"
```

---

## Task 3: getData.ts — Fetch and Process Calendars

**Files:**
- Create: `app/(app)/recipes/screens/ics-calendar/getData.ts`

- [ ] **Step 1: Create getData.ts**

Create `app/(app)/recipes/screens/ics-calendar/getData.ts`:

```typescript
import { unstable_cache } from "next/cache";
import { parseICS, extractCalendarName, groupEventsByDay, type DayGroup } from "@/lib/recipes/ics-parser";

export const dynamic = "force-dynamic";

interface CalendarParams {
  calendarUrl1?: string;
  calendarUrl2?: string;
  calendarUrl3?: string;
  calendarUrl4?: string;
  calendarUrl5?: string;
  calendarName1?: string;
  calendarName2?: string;
  calendarName3?: string;
  calendarName4?: string;
  calendarName5?: string;
  daysAhead?: number | string;
}

export interface CalendarColumn {
  name: string;
  dayGroups: DayGroup[];
  error?: string;
}

export interface CalendarData {
  columns: CalendarColumn[];
  fetchedAt: string;
}

async function fetchAndParseCalendar(
  url: string,
  name: string | undefined,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<CalendarColumn> {
  try {
    const response = await fetch(url, {
      headers: { Accept: "text/calendar, text/plain, */*" },
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return { name: name || "Calendar", dayGroups: [], error: `HTTP ${response.status}` };
    }

    const icsText = await response.text();
    const resolvedName = name?.trim() || extractCalendarName(icsText) || "Calendar";
    const events = parseICS(icsText, rangeStart, rangeEnd);
    const dayGroups = groupEventsByDay(events);

    return { name: resolvedName, dayGroups };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Fetch failed";
    return { name: name || "Calendar", dayGroups: [], error: msg };
  }
}

async function buildCalendarData(params?: CalendarParams): Promise<CalendarData> {
  const daysAhead = Number(params?.daysAhead ?? 7);
  const now = new Date();
  const rangeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // start of today
  const rangeEnd = new Date(rangeStart.getTime() + daysAhead * 24 * 60 * 60 * 1000);

  const entries: Array<{ url: string; name?: string }> = [
    { url: params?.calendarUrl1 ?? "", name: params?.calendarName1 },
    { url: params?.calendarUrl2 ?? "", name: params?.calendarName2 },
    { url: params?.calendarUrl3 ?? "", name: params?.calendarName3 },
    { url: params?.calendarUrl4 ?? "", name: params?.calendarName4 },
    { url: params?.calendarUrl5 ?? "", name: params?.calendarName5 },
  ].filter((e) => e.url.trim().length > 0);

  if (entries.length === 0) {
    return {
      columns: [],
      fetchedAt: now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
    };
  }

  const columns = await Promise.all(
    entries.map((e) => fetchAndParseCalendar(e.url, e.name, rangeStart, rangeEnd)),
  );

  return {
    columns,
    fetchedAt: now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
  };
}

const getCachedCalendarData = unstable_cache(
  async (params?: CalendarParams): Promise<CalendarData> => {
    const data = await buildCalendarData(params);
    if (data.columns.length === 0) throw new Error("No calendars configured — skip cache");
    return data;
  },
  ["ics-calendar-data"],
  { tags: ["ics-calendar"], revalidate: 900 }, // 15 min cache
);

export default async function getData(params?: CalendarParams): Promise<CalendarData> {
  try {
    return await getCachedCalendarData(params);
  } catch {
    return buildCalendarData(params);
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/daniel/byos_next
pnpm typecheck 2>&1 | grep -E "(ics-calendar|ics-parser)"
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add app/\(app\)/recipes/screens/ics-calendar/getData.ts
git commit -m "feat(recipes): add ics-calendar getData — parallel ICS fetch and parse"
```

---

## Task 4: ics-calendar.tsx — Multi-Column Schedule Component

**Files:**
- Create: `app/(app)/recipes/screens/ics-calendar/ics-calendar.tsx`

The component renders 1–5 columns dynamically. Columns are separated by vertical dividers. Each column shows events grouped by day. Font sizes adapt based on column count.

- [ ] **Step 1: Create the component**

Create `app/(app)/recipes/screens/ics-calendar/ics-calendar.tsx`:

```typescript
import { PreSatori } from "@/utils/pre-satori";
import type { CalendarColumn, CalendarData } from "./getData";

interface IcsCalendarProps extends Partial<CalendarData> {
  width?: number;
  height?: number;
}

function formatTime(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function ColumnView({
  column,
  isLast,
  colCount,
}: {
  column: CalendarColumn;
  isLast: boolean;
  colCount: number;
}) {
  // Font size classes scale down as columns increase
  const headerSize = colCount <= 2 ? "text-xl" : colCount === 3 ? "text-lg" : "text-base";
  const daySize = colCount <= 2 ? "text-sm" : "text-xs";
  const eventTitleSize = colCount <= 2 ? "text-sm" : "text-xs";
  const timeSize = "text-xs";
  const padding = colCount <= 3 ? "p-2" : "p-1";

  return (
    <div
      className={`flex flex-col flex-1 h-full overflow-hidden ${!isLast ? "border-r border-black" : ""}`}
    >
      {/* Column header */}
      <div className={`border-b border-black ${padding} font-blockkie ${headerSize} truncate leading-tight`}>
        {column.name}
      </div>

      {/* Events area */}
      <div className={`flex flex-col flex-1 overflow-hidden ${padding} gap-0`}>
        {column.error ? (
          <div className={`${daySize} text-gray-500 mt-1`}>Error: {column.error}</div>
        ) : column.dayGroups.length === 0 ? (
          <div className={`${daySize} text-gray-400 mt-1`}>No upcoming events</div>
        ) : (
          column.dayGroups.map((group) => (
            <div key={group.dateISO} className="mb-1">
              {/* Day header */}
              <div className={`${daySize} font-bold leading-tight border-b border-gray-300 mb-0.5`}>
                {group.dateLabel}
              </div>
              {/* Events */}
              {group.events.map((event, i) => (
                <div key={i} className="flex flex-row gap-1 leading-tight mb-0.5">
                  <span className={`${timeSize} text-gray-500 shrink-0 w-12 text-right`}>
                    {event.allDay ? "all day" : formatTime(event.start)}
                  </span>
                  <span className={`${eventTitleSize} truncate flex-1`}>{event.title}</span>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function IcsCalendar({
  columns = [],
  fetchedAt = "",
  width = 800,
  height = 480,
}: IcsCalendarProps) {
  return (
    <PreSatori width={width} height={height}>
      <div className="flex flex-col w-full h-full bg-white text-black">
        {/* Main column area */}
        <div className="flex flex-row flex-1 overflow-hidden">
          {columns.length === 0 ? (
            <div className="flex items-center justify-center w-full h-full text-gray-400 text-2xl font-blockkie">
              No calendars configured
            </div>
          ) : (
            columns.map((col, i) => (
              <ColumnView
                key={i}
                column={col}
                isLast={i === columns.length - 1}
                colCount={columns.length}
              />
            ))
          )}
        </div>

        {/* Footer */}
        {fetchedAt && (
          <div className="border-t border-gray-200 px-2 py-0.5 flex flex-row justify-end">
            <span className="text-xs text-gray-400">Updated {fetchedAt}</span>
          </div>
        )}
      </div>
    </PreSatori>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/daniel/byos_next
pnpm typecheck 2>&1 | grep ics-calendar
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add app/\(app\)/recipes/screens/ics-calendar/ics-calendar.tsx
git commit -m "feat(recipes): add ics-calendar component with dynamic multi-column layout"
```

---

## Task 5: Register in screens.json

**Files:**
- Modify: `app/(app)/recipes/screens.json`

Add the entry inside the top-level JSON object (alongside existing recipes like `"weather"`, `"bitcoin-price"`, etc.).

- [ ] **Step 1: Add recipe entry to screens.json**

Open `app/(app)/recipes/screens.json` and add the following entry at the end of the JSON object (before the final `}`), with a comma after the previous entry:

```json
"ics-calendar": {
  "title": "ICS Multi-Column Calendar",
  "published": true,
  "createdAt": "2026-05-16T00:00:00Z",
  "updatedAt": "2026-05-16T00:00:00Z",
  "description": "Displays up to 5 ICS/iCalendar feeds as side-by-side schedule columns. Only columns with configured URLs are shown. Supports recurring events.",
  "componentPath": "./screens/ics-calendar",
  "hasDataFetch": true,
  "props": {
    "columns": [],
    "fetchedAt": ""
  },
  "params": {
    "calendarUrl1": {
      "type": "string",
      "label": "Calendar 1 URL",
      "description": "ICS/iCalendar URL for the first calendar column",
      "default": "",
      "placeholder": "https://example.com/calendar.ics"
    },
    "calendarName1": {
      "type": "string",
      "label": "Calendar 1 Name",
      "description": "Display name for calendar 1 (auto-detected from ICS if empty)",
      "default": "",
      "placeholder": "Work"
    },
    "calendarUrl2": {
      "type": "string",
      "label": "Calendar 2 URL",
      "description": "ICS/iCalendar URL for the second calendar column",
      "default": "",
      "placeholder": "https://example.com/calendar2.ics"
    },
    "calendarName2": {
      "type": "string",
      "label": "Calendar 2 Name",
      "description": "Display name for calendar 2 (auto-detected from ICS if empty)",
      "default": "",
      "placeholder": "Personal"
    },
    "calendarUrl3": {
      "type": "string",
      "label": "Calendar 3 URL",
      "description": "ICS/iCalendar URL for the third calendar column",
      "default": "",
      "placeholder": "https://example.com/calendar3.ics"
    },
    "calendarName3": {
      "type": "string",
      "label": "Calendar 3 Name",
      "description": "Display name for calendar 3 (auto-detected from ICS if empty)",
      "default": "",
      "placeholder": "Family"
    },
    "calendarUrl4": {
      "type": "string",
      "label": "Calendar 4 URL",
      "description": "ICS/iCalendar URL for the fourth calendar column",
      "default": "",
      "placeholder": "https://example.com/calendar4.ics"
    },
    "calendarName4": {
      "type": "string",
      "label": "Calendar 4 Name",
      "description": "Display name for calendar 4 (auto-detected from ICS if empty)",
      "default": "",
      "placeholder": "Team"
    },
    "calendarUrl5": {
      "type": "string",
      "label": "Calendar 5 URL",
      "description": "ICS/iCalendar URL for the fifth calendar column",
      "default": "",
      "placeholder": "https://example.com/calendar5.ics"
    },
    "calendarName5": {
      "type": "string",
      "label": "Calendar 5 Name",
      "description": "Display name for calendar 5 (auto-detected from ICS if empty)",
      "default": "",
      "placeholder": "Holidays"
    },
    "daysAhead": {
      "type": "number",
      "label": "Days ahead to show",
      "description": "How many days of upcoming events to fetch (1–30)",
      "default": 7,
      "placeholder": "7"
    }
  },
  "tags": ["calendar", "ics", "api", "live-data", "configurable", "multi-column"],
  "author": {
    "name": "Daniel Ferraro",
    "github": "daniel"
  },
  "renderSettings": {
    "doubleSizeForSharperText": false
  },
  "version": "0.1.0",
  "category": "display-components"
}
```

- [ ] **Step 2: Validate JSON is well-formed**

```bash
cd /home/daniel/byos_next
node -e "JSON.parse(require('fs').readFileSync('app/(app)/recipes/screens.json', 'utf8')); console.log('JSON valid')"
```

Expected: `JSON valid`

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/recipes/screens.json"
git commit -m "feat(recipes): register ics-calendar recipe in screens.json"
```

---

## Task 6: End-to-End Verification

- [ ] **Step 1: Start dev server**

```bash
cd /home/daniel/byos_next
pnpm dev
```

Expected: Server starts on `http://localhost:3000` with no TypeScript or module errors.

- [ ] **Step 2: Visit the recipe gallery**

Open `http://localhost:3000/recipes` in a browser.

Expected: The "ICS Multi-Column Calendar" card appears in the gallery.

- [ ] **Step 3: Open the recipe detail page**

Open `http://localhost:3000/recipes/ics-calendar`.

Expected: Preview renders "No calendars configured" placeholder (since no URLs set yet).

- [ ] **Step 4: Test with a real ICS URL**

In the parameter form on the recipe detail page, set:
- **Calendar 1 URL:** `https://www.thunderbird.net/media/caldata/holidays/US.ics` (public US holidays calendar)
- **Calendar 1 Name:** `US Holidays`
- **Days ahead:** `30`

Click Update / refresh preview.

Expected: Single column renders with upcoming US holidays grouped by date.

- [ ] **Step 5: Test with two calendars**

Add a second ICS URL in the Calendar 2 URL field.

Expected: Two columns appear side by side, each with their own events.

- [ ] **Step 6: Test the BMP endpoint**

```bash
curl -s -o /tmp/ics-cal.bmp "http://localhost:3000/api/bitmap/ics-calendar.bmp?width=800&height=480"
file /tmp/ics-cal.bmp
```

Expected: `BMP image data` or similar — confirms the e-ink bitmap renders.

- [ ] **Step 7: Test empty URL skipping**

Set Calendar 1 URL and Calendar 3 URL (leave 2, 4, 5 empty).

Expected: Only 2 columns render (not 5, not 3 in the wrong positions).

---

## Task 7: Enable Docker Image Publish on Push to main

**Files:**
- Modify: `.github/workflows/docker-publish.yml`

The existing workflow only fires on GitHub releases. Adding a `push` trigger to `main` and a `workflow_dispatch` trigger means every merge to main auto-publishes a fresh image to GHCR at `ghcr.io/danielf737/byos_next:main`, and you can also trigger a build manually from the GitHub Actions UI.

- [ ] **Step 1: Update the trigger block in docker-publish.yml**

Open `.github/workflows/docker-publish.yml` and replace the `on:` block (lines 3–5) with:

```yaml
on:
  push:
    branches: [main]
    paths-ignore:
      - "*.md"
      - "docs/**"
  workflow_dispatch:
  release:
    types: [published]
```

The full updated file should look like:

```yaml
name: Docker Build and Publish

on:
  push:
    branches: [main]
    paths-ignore:
      - "*.md"
      - "docs/**"
  workflow_dispatch:
  release:
    types: [published]

env:
  REGISTRY_GITHUB: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - name: Checkout repository
        uses: actions/checkout@v6

      - name: Set up QEMU
        uses: docker/setup-qemu-action@v3

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Extract metadata (tags, labels) for Docker
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: |
            ${{ env.REGISTRY_GITHUB }}/${{ env.IMAGE_NAME }}
          tags: |
            type=schedule
            type=ref,event=branch
            type=ref,event=pr
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=semver,pattern={{major}}
            type=sha

      - name: Log in to GitHub Container Registry
        if: github.event_name != 'pull_request'
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY_GITHUB }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push Docker image
        uses: docker/build-push-action@v6
        with:
          context: .
          push: ${{ github.event_name != 'pull_request' }}
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          platforms: linux/amd64,linux/arm64
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

Note: removed `REGISTRY_DOCKERHUB` from env since the existing build only pushes to GHCR.

- [ ] **Step 2: Commit and push**

```bash
git add .github/workflows/docker-publish.yml
git commit -m "ci: publish Docker image to GHCR on push to main"
git push origin main
```

- [ ] **Step 3: Verify the workflow triggered**

Go to `https://github.com/DanielF737/byos_next/actions` — you should see a "Docker Build and Publish" run appear within ~30 seconds of the push. Click into it and watch the "Build and push Docker image" step.

Expected: Green checkmarks on all steps. Build takes ~5–10 minutes the first time (no cache).

- [ ] **Step 4: Confirm the image is published**

Go to `https://github.com/DanielF737?tab=packages` — you should see `byos_next` listed as a package.

The image tag for a `main` push will be: `ghcr.io/danielf737/byos_next:main`

---

## Task 8: Make the Package Public and Pull on Your Server

GHCR packages are private by default. You need to make it public once so your server can pull without authentication.

- [ ] **Step 1: Make the package public on GitHub**

1. Go to `https://github.com/DanielF737/byos_next/pkgs/container/byos_next`
2. Click **Package settings** (gear icon, bottom-left of the page)
3. Scroll to **Danger Zone → Change visibility**
4. Select **Public** and confirm

Expected: The package page no longer shows a lock icon.

- [ ] **Step 2: Create a server-side docker-compose file**

On your server, create a directory and save this as `docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: byos_postgres
    restart: unless-stopped
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - POSTGRES_DB=byos_db
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - byos_network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  byos-next:
    image: ghcr.io/danielf737/byos_next:main
    ports:
      - "3000:3000"
    env_file:
      - .env
    environment:
      - DATABASE_URL=postgres://postgres:${POSTGRES_PASSWORD}@postgres:5432/byos_db?sslmode=disable
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped
    networks:
      - byos_network

volumes:
  postgres_data:
    driver: local

networks:
  byos_network:
    driver: bridge
```

- [ ] **Step 3: Create the server .env file**

On your server, in the same directory as `docker-compose.yml`, create `.env`:

```bash
POSTGRES_PASSWORD=<choose a strong password>
BETTER_AUTH_SECRET=<run: openssl rand -base64 32>
BETTER_AUTH_URL=http://<your-server-ip-or-domain>:3000
AUTH_ENABLED=false
REACT_RENDERER=takumi
NODE_ENV=production
TRMNL_PROXY_LIVE=false
ENABLE_EXTERNAL_CATALOG=false
```

- [ ] **Step 4: Start the stack on your server**

```bash
docker compose pull          # pulls ghcr.io/danielf737/byos_next:main
docker compose up -d         # starts postgres + byos-next
```

Expected: `docker compose ps` shows both containers as `running`.

- [ ] **Step 5: Verify the app is up**

```bash
curl -s http://localhost:3000/api/health | head -5
# or just:
curl -I http://localhost:3000
```

Expected: HTTP 200 (or 302 redirect to login page if auth is enabled).

Open `http://<server-ip>:3000/recipes` in a browser — you should see the recipe gallery including the ICS Calendar recipe.

- [ ] **Step 6: Update procedure for future deploys**

Whenever you push to `main` and the GitHub Actions build completes (~10 min), update your server with:

```bash
docker compose pull byos-next
docker compose up -d byos-next
```

This pulls the new `main` image and restarts only the app container (postgres keeps running, no data loss).

---

## Known Limitations / Future Work

- **VTIMEZONE:** `ical.js` resolves timezones using embedded VTIMEZONE definitions in the ICS file. Public calendars (Google, Apple, Outlook) include these. Calendars without VTIMEZONE blocks will treat times as UTC.
- **5-column layout:** At 5 columns (160px each), titles will be truncated. This is by design for e-ink density; the `truncate` class handles overflow.
- **Private calendars:** ICS URLs must be publicly accessible (no auth). Google Calendar "secret address" ICS URLs work.
- **Recurring event limit:** The iterator runs until `rangeEnd`; very long recurrences (no UNTIL/COUNT) are naturally bounded by the date range window.
- **GHCR image visibility:** If you later want private images, you'll need to add a `docker login ghcr.io` step on your server using a PAT with `read:packages` scope before running `docker compose pull`.
