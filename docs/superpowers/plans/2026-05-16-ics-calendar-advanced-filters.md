# ICS Calendar Advanced Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two optional filter params to the ICS calendar recipe: `lookAheadDays` (cap how far into the future events are shown) and `maxRecurrences` (cap how many instances of any single recurring event appear).

**Architecture:** `lookAheadDays` is purely a `getData.ts` concern — it narrows `rangeEnd` from the 2-year default. `maxRecurrences` is a parser concern — it adds a per-event occurrence counter inside `parseICS`. Both params flow from `screens.json` → `CalendarParams` → `getData.ts` → `parseICS`. Sentinel value: `0` (or blank) means "no limit" for both.

**Tech Stack:** Next.js 16, TypeScript, `ical.js`

---

## File Map

| Action | Path | Change |
|--------|------|--------|
| Modify | `lib/recipes/ics-parser.ts` | Add `maxRecurrences?: number` param to `parseICS`; add per-event occurrence counter in the recurring loop |
| Modify | `app/(app)/recipes/screens/ics-calendar/getData.ts` | Add `lookAheadDays` + `maxRecurrences` to `CalendarParams`; compute `rangeEnd` from `lookAheadDays`; pass `maxRecurrences` through to `parseICS` |
| Modify | `app/(app)/recipes/screens.json` | Add `lookAheadDays` and `maxRecurrences` params to the `"ics-calendar"` entry |

---

## Task 1: Add `maxRecurrences` to `parseICS` in `ics-parser.ts`

**Files:**
- Modify: `lib/recipes/ics-parser.ts`

**What changes:** `parseICS` gets a new optional 4th parameter `maxRecurrences?: number`. Inside the `isRecurring()` branch, a per-event `occurrenceCount` variable tracks how many future occurrences have been collected. When `occurrenceCount` reaches `maxRecurrences`, the while loop breaks early for that event. Non-recurring events are unaffected.

- [ ] **Step 1: Update the `parseICS` function signature and recurring loop**

In `lib/recipes/ics-parser.ts`, make these two changes:

**Change 1** — add `maxRecurrences` param to the function signature (line 16–19):

```typescript
export function parseICS(
	icsText: string,
	rangeStart: Date,
	rangeEnd: Date,
	maxRecurrences?: number,
): CalendarEvent[] {
```

**Change 2** — inside the `if (event.isRecurring())` block, add `occurrenceCount` and the break condition. Replace the current recurring block (lines 39–58):

```typescript
		if (event.isRecurring()) {
			// Do NOT fast-forward with iterator(icalStart) — it skips UNTIL/EXDATE
			// validation for past occurrences, producing phantom events from expired series.
			const iterator = event.iterator();
			let next: ICAL.Time | null = iterator.next();
			let safetyCount = 0;
			let occurrenceCount = 0;
			while (next && next.compare(icalEnd) <= 0 && safetyCount < 500) {
				safetyCount++;
				if (next.compare(icalStart) >= 0) {
					if (maxRecurrences !== undefined && maxRecurrences > 0 && occurrenceCount >= maxRecurrences) break;
					occurrenceCount++;
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
		}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/daniel/byos_next && npx tsc --noEmit 2>&1 | grep "ics-parser" | head -5
```

Expected: no output (zero errors).

- [ ] **Step 3: Commit**

```bash
cd /home/daniel/byos_next
git add lib/recipes/ics-parser.ts
git commit -m "feat(recipes): add maxRecurrences per-event limit to parseICS"
```

---

## Task 2: Wire `lookAheadDays` + `maxRecurrences` through `getData.ts` and `screens.json`

**Files:**
- Modify: `app/(app)/recipes/screens/ics-calendar/getData.ts`
- Modify: `app/(app)/recipes/screens.json`

**What changes in `getData.ts`:**
- `CalendarParams` gets `lookAheadDays?: number | string` and `maxRecurrences?: number | string`
- `buildCalendarData` computes `rangeEnd`: if `lookAheadDays > 0`, use `lookAheadDays` days; else use 730 days (2-year fallback)
- `maxRecurrences` is parsed (0 = no limit → `undefined`) and passed to `fetchAndParseCalendar`
- `fetchAndParseCalendar` receives `maxRecurrences?: number` and passes it to `parseICS`

- [ ] **Step 1: Update `getData.ts`**

Replace the full content of `app/(app)/recipes/screens/ics-calendar/getData.ts` with:

```typescript
import { unstable_cache } from "next/cache";
import {
	type DayGroup,
	extractCalendarName,
	groupEventsByDay,
	parseICS,
} from "@/lib/recipes/ics-parser";

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
	maxEvents?: number | string;
	fontSize?: string;
	lookAheadDays?: number | string;
	maxRecurrences?: number | string;
}

export interface CalendarColumn {
	name: string;
	dayGroups: DayGroup[];
	error?: string;
}

export interface CalendarData {
	columns: CalendarColumn[];
	fetchedAt: string;
	fontSize: string;
}

async function fetchAndParseCalendar(
	url: string,
	name: string | undefined,
	rangeStart: Date,
	rangeEnd: Date,
	maxEvents: number,
	maxRecurrences?: number,
): Promise<CalendarColumn> {
	try {
		const response = await fetch(url, {
			headers: { Accept: "text/calendar, text/plain, */*" },
			next: { revalidate: 0 },
			signal: AbortSignal.timeout(10_000),
		});

		if (!response.ok) {
			return {
				name: name || "Calendar",
				dayGroups: [],
				error: `HTTP ${response.status}`,
			};
		}

		const icsText = await response.text();
		if (!icsText.includes("BEGIN:VCALENDAR")) {
			return {
				name: name || "Calendar",
				dayGroups: [],
				error: "URL did not return a valid ICS calendar",
			};
		}
		const resolvedName =
			name?.trim() || extractCalendarName(icsText) || "Calendar";
		const allEvents = parseICS(icsText, rangeStart, rangeEnd, maxRecurrences);
		const events = allEvents.slice(0, maxEvents);
		const dayGroups = groupEventsByDay(events);

		return { name: resolvedName, dayGroups };
	} catch (err) {
		const msg = err instanceof Error ? err.message : "Fetch failed";
		return { name: name || "Calendar", dayGroups: [], error: msg };
	}
}

async function buildCalendarData(
	params?: CalendarParams,
): Promise<CalendarData> {
	const maxEvents = Math.max(
		5,
		Math.min(50, Number(params?.maxEvents ?? 15) || 15),
	);
	const fontSize = ["small", "medium", "large"].includes(params?.fontSize ?? "")
		? (params?.fontSize as string)
		: "medium";

	// lookAheadDays: 0 or blank = use 2-year fallback ("infinite")
	const lookAheadDays = Math.max(0, Number(params?.lookAheadDays ?? 0) || 0);
	// maxRecurrences: 0 or blank = no per-event limit (undefined)
	const rawMaxRecurrences = Math.max(0, Number(params?.maxRecurrences ?? 0) || 0);
	const maxRecurrences = rawMaxRecurrences > 0 ? rawMaxRecurrences : undefined;

	const now = new Date();
	const rangeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const rangeEnd = new Date(
		rangeStart.getTime() +
			(lookAheadDays > 0 ? lookAheadDays : 730) * 24 * 60 * 60 * 1000,
	);

	const entries: Array<{ url: string; name?: string }> = [
		{ url: params?.calendarUrl1 ?? "", name: params?.calendarName1 },
		{ url: params?.calendarUrl2 ?? "", name: params?.calendarName2 },
		{ url: params?.calendarUrl3 ?? "", name: params?.calendarName3 },
		{ url: params?.calendarUrl4 ?? "", name: params?.calendarName4 },
		{ url: params?.calendarUrl5 ?? "", name: params?.calendarName5 },
	].filter((e) => e.url.trim().length > 0);

	const fetchedAt = now.toLocaleTimeString("en-US", {
		hour: "2-digit",
		minute: "2-digit",
	});

	if (entries.length === 0) {
		return { columns: [], fetchedAt, fontSize };
	}

	const columns = await Promise.all(
		entries.map((e) =>
			fetchAndParseCalendar(
				e.url,
				e.name,
				rangeStart,
				rangeEnd,
				maxEvents,
				maxRecurrences,
			),
		),
	);

	return { columns, fetchedAt, fontSize };
}

const getCachedCalendarData = unstable_cache(
	async (params?: CalendarParams): Promise<CalendarData> => {
		const data = await buildCalendarData(params);
		if (data.columns.length === 0)
			throw new Error("No calendars configured — skip cache");
		return data;
	},
	["ics-calendar-data"],
	{ tags: ["ics-calendar"], revalidate: 900 },
);

export default async function getData(
	params?: CalendarParams,
): Promise<CalendarData> {
	try {
		return await getCachedCalendarData(params);
	} catch {
		return buildCalendarData(params);
	}
}
```

- [ ] **Step 2: Add the two new params to `screens.json`**

In `app/(app)/recipes/screens.json`, find the `"ics-calendar"` params object and append two entries after `"fontSize"`:

```json
    "lookAheadDays": {
      "type": "number",
      "label": "Look-ahead limit (days)",
      "description": "Only show events within this many days. 0 or blank = no limit (2-year window). e.g. 30 for 1 month, 90 for 3 months.",
      "default": 0,
      "placeholder": "0"
    },
    "maxRecurrences": {
      "type": "number",
      "label": "Max recurrences per event",
      "description": "Max instances of any single recurring event. 0 or blank = no limit. e.g. 3 to show only the next 3 instances of a weekly meeting.",
      "default": 0,
      "placeholder": "0"
    }
```

- [ ] **Step 3: Validate JSON and typecheck**

```bash
cd /home/daniel/byos_next
node -e "const s=require('./app/(app)/recipes/screens.json'); const p=s['ics-calendar'].params; console.log('params:', Object.keys(p).join(', '))"
npx tsc --noEmit 2>&1 | grep "ics-calendar\|ics-parser" | head -10
```

Expected: params list includes `lookAheadDays` and `maxRecurrences`, zero TypeScript errors.

- [ ] **Step 4: Run Biome**

```bash
cd /home/daniel/byos_next
npx @biomejs/biome check --write "app/(app)/recipes/screens/ics-calendar/getData.ts" 2>&1 | tail -3
```

Expected: `Fixed N files.` or `Checked 1 file.`

- [ ] **Step 5: Commit**

```bash
cd /home/daniel/byos_next
git add "app/(app)/recipes/screens/ics-calendar/getData.ts" "app/(app)/recipes/screens.json"
git commit -m "feat(recipes): add lookAheadDays and maxRecurrences params to ics-calendar"
```

---

## Task 3: Fix rendering pipeline issues in `ics-calendar.tsx`

**Files:**
- Modify: `app/(app)/recipes/screens/ics-calendar/ics-calendar.tsx`

**Root causes identified by tracing JSX → PreSatori (`tw` prop) → Takumi → PNG → Floyd-Steinberg 1-bit BMP:**

- **Gray borders invisible on BMP**: `border-gray-300` (#D1D5DB) and `border-gray-200` (#E5E7EB) are light enough to dither entirely to white in 2-level Floyd-Steinberg. They simply disappear in the output bitmap. Fix: remove gray borders; use margin/padding for day-group separation instead. Footer border → `border-black`.
- **Spacing collapse**: The inner events div uses `flex flex-col flex-1 overflow-hidden`. In Takumi's layout engine, `overflow-hidden` on a `flex-1` child causes the minimum height to be computed as 0, collapsing the content area. Fix: remove `overflow-hidden` from the events div — the outer column div's `overflow-hidden` is sufficient to clip column overflow.
- **`border-solid` missing**: `border-b`, `border-r`, `border-t` set width but not style. Takumi may not apply Tailwind's base layer `border-style: solid` reset. Fix: add `border-solid` explicitly to every border element.

- [ ] **Step 1: Replace the full content of `ics-calendar.tsx`**

```typescript
import { PreSatori } from "@/utils/pre-satori";
import type { CalendarColumn, CalendarData } from "./getData";

interface IcsCalendarProps extends Partial<CalendarData> {
	width?: number;
	height?: number;
}

function formatTime(isoString: string): string {
	return new Date(isoString).toLocaleTimeString("en-US", {
		hour: "numeric",
		minute: "2-digit",
		hour12: true,
	});
}

function formatTimeRange(
	startISO: string,
	endISO: string,
	allDay: boolean,
): string {
	if (allDay) return "all day";
	if (!endISO || startISO === endISO) return formatTime(startISO);
	const startStr = formatTime(startISO);
	const endStr = formatTime(endISO);
	return startStr === endStr ? startStr : `${startStr} – ${endStr}`;
}

// Legibility floor: text-xs (12px) — never smaller on an 800×480 e-ink display.
function getFontClasses(
	colCount: number,
	fontSize: string,
): { header: string; body: string; padding: string } {
	if (fontSize === "large") {
		if (colCount <= 2) return { header: "text-2xl", body: "text-base", padding: "p-2" };
		if (colCount === 3) return { header: "text-xl", body: "text-sm", padding: "p-2" };
		return { header: "text-lg", body: "text-xs", padding: "p-1" };
	}
	if (fontSize === "small") {
		if (colCount <= 2) return { header: "text-lg", body: "text-sm", padding: "p-2" };
		if (colCount === 3) return { header: "text-base", body: "text-xs", padding: "p-1" };
		return { header: "text-sm", body: "text-xs", padding: "p-1" };
	}
	// medium (default)
	if (colCount <= 2) return { header: "text-xl", body: "text-sm", padding: "p-2" };
	if (colCount === 3) return { header: "text-lg", body: "text-xs", padding: "p-2" };
	return { header: "text-base", body: "text-xs", padding: "p-1" };
}

function ColumnView({
	column,
	isLast,
	colCount,
	fontSize,
}: {
	column: CalendarColumn;
	isLast: boolean;
	colCount: number;
	fontSize: string;
}) {
	const { header, body, padding } = getFontClasses(colCount, fontSize);

	return (
		// min-w-0: prevents content forcing this column wider than its flex-1 share.
		// overflow-hidden: clips column content at this level — inner divs must NOT repeat it.
		<div
			className={`flex flex-col flex-1 min-w-0 overflow-hidden${!isLast ? " border-r border-solid border-black" : ""}`}
		>
			{/* flex-shrink-0 + border-solid: header never collapses; border-solid ensures Takumi renders the line */}
			<div
				className={`flex-shrink-0 border-b border-solid border-black ${padding} font-blockkie ${header} leading-tight`}
				style={{ overflow: "hidden" }}
			>
				{column.name}
			</div>

			{/* NO overflow-hidden here — it collapses flex-1 height in Takumi's layout engine */}
			<div className={`flex flex-col flex-1 ${padding}`}>
				{column.error ? (
					<div className={`${body} text-black mt-1`}>
						Error: {column.error}
					</div>
				) : column.dayGroups.length === 0 ? (
					<div className={`${body} text-black mt-1`}>
						No upcoming events
					</div>
				) : (
					column.dayGroups.map((group) => (
						// flex-shrink-0: day groups must not shrink; mt-2 replaces the gray border
						// (gray borders dither to white on 1-bit BMP — use spacing instead)
						<div key={group.dateISO} className="flex-shrink-0 mt-2">
							<div className={`${body} font-bold leading-tight mb-1`}>
								{group.dateLabel}
							</div>
							{group.events.map((event, i) => (
								<div
									key={i}
									className="flex flex-row gap-1 leading-tight mb-1"
								>
									<span className="text-xs text-black shrink-0 leading-tight">
										{formatTimeRange(event.start, event.end, event.allDay)}
									</span>
									<span
										className={`${body} leading-tight`}
										style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}
									>
										{event.title}
									</span>
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
	fontSize = "medium",
	width = 800,
	height = 480,
}: IcsCalendarProps) {
	return (
		<PreSatori width={width} height={height}>
			<div className="flex flex-col w-full h-full bg-white text-black">
				<div className="flex flex-row flex-1 overflow-hidden">
					{columns.length === 0 ? (
						<div className="flex items-center justify-center w-full h-full text-black text-2xl font-blockkie">
							No calendars configured
						</div>
					) : (
						columns.map((col, i) => (
							<ColumnView
								key={i}
								column={col}
								isLast={i === columns.length - 1}
								colCount={columns.length}
								fontSize={fontSize}
							/>
						))
					)}
				</div>

				{fetchedAt && (
					// border-solid ensures the footer line renders in Takumi
					<div className="flex-shrink-0 border-t border-solid border-black px-2 py-1 flex flex-row justify-end">
						<span className="text-xs text-black">Updated {fetchedAt}</span>
					</div>
				)}
			</div>
		</PreSatori>
	);
}
```

**Key changes vs. previous version:**
- All border elements now include `border-solid` (ensures Takumi renders the border-style)
- Inner events div: removed `overflow-hidden` (was collapsing flex-1 height in Takumi)
- Day group separator: replaced `border-b border-gray-300` with `mt-2` margin (gray → invisible on 1-bit BMP)
- Footer: changed `border-gray-200` → `border-black`; changed `py-0.5` → `py-1` (taller, more reliable)
- Event `mb-0.5` → `mb-1` (4px instead of 2px — less likely to vanish in rendering)
- `text-gray-400/500` → `text-black` (eliminates gray dithering uncertainty)
- First day group gets `mt-2` which adds visual space; subsequent groups also `mt-2` for consistent rhythm

- [ ] **Step 2: Run Biome**

```bash
cd /home/daniel/byos_next
npx @biomejs/biome check --write "app/(app)/recipes/screens/ics-calendar/ics-calendar.tsx" 2>&1 | tail -3
```

Expected: `Fixed N files.` or `Checked 1 file.`

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /home/daniel/byos_next && npx tsc --noEmit 2>&1 | grep "ics-calendar" | head -5
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
cd /home/daniel/byos_next
git add "app/(app)/recipes/screens/ics-calendar/ics-calendar.tsx"
git commit -m "fix(recipes): fix border rendering and spacing collapse in ics-calendar PNG output"
```

---

## Verification

```bash
cd /home/daniel/byos_next
npx tsc --noEmit 2>&1 | grep -c "error TS" || echo "0 errors"
npx @biomejs/biome check lib/recipes/ics-parser.ts "app/(app)/recipes/screens/ics-calendar/" 2>&1 | tail -2
```

Start dev server (`docker compose up -d postgres && pnpm dev`) and open `http://localhost:3000/recipes/ics-calendar`:

**Functional tests:**
- [ ] `lookAheadDays=30` → only events within 30 days appear; events 2+ months out disappear
- [ ] `lookAheadDays=0` → 2-year window (all foreseeable events appear)
- [ ] `maxRecurrences=1` → only the very next instance of each recurring event
- [ ] `maxRecurrences=3` → each recurring series shows at most 3 future instances
- [ ] `maxRecurrences=0` → no per-event cap
- [ ] Combined: `lookAheadDays=14` + `maxRecurrences=2` works correctly

**Rendering tests (PNG/BMP):**
- [ ] Click "BMP" tab on recipe preview — column dividers render as solid black vertical lines
- [ ] Column headers have visible bottom border (solid black horizontal line)
- [ ] Day groups have visible vertical spacing between them (no gray lines needed)
- [ ] Footer has a visible top border separating it from event content
- [ ] Event text is not clipped/truncated incorrectly
- [ ] Spacing between events is consistent and not collapsed
