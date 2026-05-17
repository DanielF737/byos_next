# ICS Calendar Fixes & Layout Improvements Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix phantom recurring events, replace days-ahead with next-N-events, show end times, fix column layout collapse, and add configurable font sizes.

**Architecture:** Four targeted edits. Parser fix removes the RRULE iterator fast-forward. getData.ts switches to maxEvents + passes fontSize through. The component gets a full layout rewrite fixing flex column collapse (`min-w-0`, remove `h-full`, `flex-shrink-0` on header) plus a configurable font-size system based on column count and a user param. screens.json gets two new params.

**Tech Stack:** Next.js 16, React 19, TypeScript, `ical.js`, Tailwind CSS, PreSatori (Takumi/Satori renderer)

**Renderer constraints (critical):**
- `display: grid` is NOT supported — Satori converts it to flex silently, Takumi may break. Always use `flex flex-row` + `flex-1` for equal-width columns.
- `min-w-0` is required on `flex-1` children in a row — without it, `min-width: auto` lets content force column widths beyond their flex target.
- `h-full` on a nested `flex-1` child is redundant and can cause collapse — only the root div gets `h-full`.
- `flex-shrink-0` must be used on headers so they don't get squeezed by the content area below.
- `overflow-hidden` on the events container is the correct way to clip excess content.
- Minimum legible font size on 800×480 is `text-xs` (12px). Never go below this.

---

## File Map

| Action | Path | Change |
|--------|------|--------|
| Modify | `lib/recipes/ics-parser.ts` | Remove `icalStart` fast-forward; add 500-occurrence safety cap |
| Modify | `app/(app)/recipes/screens/ics-calendar/getData.ts` | Replace `daysAhead` → `maxEvents`; add `fontSize` passthrough; 2-year rangeEnd; slice to maxEvents |
| Modify | `app/(app)/recipes/screens/ics-calendar/ics-calendar.tsx` | Full layout rewrite: `min-w-0`, remove `h-full`, `flex-shrink-0` header, end times, fontSize-driven type scale |
| Modify | `app/(app)/recipes/screens.json` | Replace `daysAhead` with `maxEvents`; add `fontSize` param |

---

## Task 1: Fix RRULE phantom events in `ics-parser.ts`

**Files:**
- Modify: `lib/recipes/ics-parser.ts` (lines 39–54)

**Root cause:** `event.iterator(icalStart)` fast-forwards past previous occurrences, skipping UNTIL/EXDATE validation for dates before `icalStart`. A recurring event with `RRULE:UNTIL=20251231` produces 2026 occurrences when the iterator jumps to 2026. Iterating from the beginning is slower but correctly respects all termination rules. The 500-cap prevents infinite loops on unbounded daily recurrences.

- [ ] **Step 1: Replace the recurring-event iterator block**

In `lib/recipes/ics-parser.ts`, replace the `if (event.isRecurring())` block:

**Before (lines 39–54):**
```typescript
		if (event.isRecurring()) {
			const iterator = event.iterator(icalStart);
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
		}
```

**After:**
```typescript
		if (event.isRecurring()) {
			// Do NOT fast-forward with iterator(icalStart) — it skips UNTIL/EXDATE
			// validation for past occurrences, producing phantom events from expired series.
			const iterator = event.iterator();
			let next: ICAL.Time | null = iterator.next();
			let safetyCount = 0;
			while (next && next.compare(icalEnd) < 0 && safetyCount < 500) {
				safetyCount++;
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
		}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/daniel/byos_next && npx tsc --noEmit 2>&1 | grep "ics-parser" | head -10
```

Expected: no output (zero errors).

- [ ] **Step 3: Commit**

```bash
cd /home/daniel/byos_next
git add lib/recipes/ics-parser.ts
git commit -m "fix(recipes): fix RRULE phantom events by removing iterator fast-forward"
```

---

## Task 2: Replace `daysAhead` with `maxEvents` + add `fontSize` passthrough in `getData.ts`

**Files:**
- Modify: `app/(app)/recipes/screens/ics-calendar/getData.ts`

The `fontSize` param is user-controlled but doesn't affect data fetching — it's passed through from params to the returned `CalendarData` so the component can use it without needing a separate data fetch.

- [ ] **Step 1: Replace the full content of `getData.ts`**

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
		const allEvents = parseICS(icsText, rangeStart, rangeEnd);
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
		? (params!.fontSize as string)
		: "medium";

	const now = new Date();
	const rangeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	// 2-year lookahead ensures the iterator always finds enough upcoming events
	const rangeEnd = new Date(
		rangeStart.getTime() + 730 * 24 * 60 * 60 * 1000,
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
			fetchAndParseCalendar(e.url, e.name, rangeStart, rangeEnd, maxEvents),
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

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/daniel/byos_next && npx tsc --noEmit 2>&1 | grep "ics-calendar" | head -10
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
cd /home/daniel/byos_next
git add "app/(app)/recipes/screens/ics-calendar/getData.ts"
git commit -m "feat(recipes): replace daysAhead with maxEvents, add fontSize passthrough"
```

---

## Task 3: Full component rewrite — layout fix, end times, font scale

**Files:**
- Modify: `app/(app)/recipes/screens/ics-calendar/ics-calendar.tsx`

**Layout fixes applied:**
- `min-w-0` on each column div — prevents `min-width: auto` from letting content blow out column widths in a flex row
- Remove `h-full` from column div — redundant when parent is `flex-1 overflow-hidden`; was causing collapse
- `flex-shrink-0` on the column header — prevents it from being squeezed by the content area below
- Root structure: `flex flex-col w-full h-full` → inner `flex flex-row flex-1 overflow-hidden` → columns with `flex flex-col flex-1 min-w-0 overflow-hidden`

**Font size system:**
Three-level param (`small` / `medium` / `large`) cross-referenced against column count. Legibility floor: `text-xs` (12px) — never smaller. Column header always gets one size larger than body text.

| fontSize \ cols | 1–2 cols | 3 cols | 4–5 cols |
|-----------------|----------|--------|----------|
| **large** | header: `text-2xl`, body: `text-base` | header: `text-xl`, body: `text-sm` | header: `text-lg`, body: `text-xs` |
| **medium** (default) | header: `text-xl`, body: `text-sm` | header: `text-lg`, body: `text-xs` | header: `text-base`, body: `text-xs` |
| **small** | header: `text-lg`, body: `text-sm` | header: `text-base`, body: `text-xs` | header: `text-sm`, body: `text-xs` |

**End time display:** New `formatTimeRange(start, end, allDay)` returns `"10:00 AM – 11:30 AM"`, `"all day"`, or just start when start equals end. Time span switches from fixed `w-12` to `shrink-0`.

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

// Returns Tailwind classes based on font size preference and column count.
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
		// min-w-0 prevents content from forcing this column wider than its flex-1 share.
		// overflow-hidden clips text that would otherwise break out of the column.
		// Do NOT add h-full here — the parent flex-1 already controls height.
		<div
			className={`flex flex-col flex-1 min-w-0 overflow-hidden${!isLast ? " border-r border-black" : ""}`}
		>
			{/* flex-shrink-0 ensures the header never collapses under long event lists */}
			<div
				className={`flex-shrink-0 border-b border-black ${padding} font-blockkie ${header} leading-tight`}
				style={{ overflow: "hidden" }}
			>
				{column.name}
			</div>

			<div className={`flex flex-col flex-1 overflow-hidden ${padding}`}>
				{column.error ? (
					<div className={`${body} text-gray-500 mt-1`}>
						Error: {column.error}
					</div>
				) : column.dayGroups.length === 0 ? (
					<div className={`${body} text-gray-400 mt-1`}>
						No upcoming events
					</div>
				) : (
					column.dayGroups.map((group) => (
						<div key={group.dateISO} className="mb-1 flex-shrink-0">
							<div
								className={`${body} font-bold leading-tight border-b border-gray-300 mb-0.5`}
							>
								{group.dateLabel}
							</div>
							{group.events.map((event, i) => (
								<div
									key={i}
									className="flex flex-row gap-1 leading-tight mb-0.5"
								>
									<span
										className={`text-xs text-gray-500 shrink-0 leading-tight`}
									>
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
				{/* flex-1 + overflow-hidden: this div fills all space between root and footer */}
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
								fontSize={fontSize}
							/>
						))
					)}
				</div>

				{fetchedAt && (
					<div className="flex-shrink-0 border-t border-gray-200 px-2 py-0.5 flex flex-row justify-end">
						<span className="text-xs text-gray-400">Updated {fetchedAt}</span>
					</div>
				)}
			</div>
		</PreSatori>
	);
}
```

**Key changes from previous version:**
- `min-w-0` added to column div — the critical fix for column collapse
- `h-full` removed from column div — was causing sizing conflicts
- `flex-shrink-0` on column header and day-group rows — prevents squeezing
- `style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}` on event title — inline styles are more reliable than Tailwind `truncate` in the Takumi renderer
- `fontSize` prop wired through `getFontClasses()`
- `formatTimeRange()` replaces bare `formatTime()` for end-time display
- Footer gets `flex-shrink-0` — prevents it from being squeezed off-screen

- [ ] **Step 2: Run Biome lint/format**

```bash
cd /home/daniel/byos_next
npx @biomejs/biome check --write "app/(app)/recipes/screens/ics-calendar/ics-calendar.tsx" 2>&1 | tail -5
```

Expected: `Fixed N files.` or `Checked 1 file.`

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /home/daniel/byos_next && npx tsc --noEmit 2>&1 | grep "ics-calendar" | head -10
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
cd /home/daniel/byos_next
git add "app/(app)/recipes/screens/ics-calendar/ics-calendar.tsx"
git commit -m "feat(recipes): fix column layout, add fontSize scale, show end times"
```

---

## Task 4: Update `screens.json` params

**Files:**
- Modify: `app/(app)/recipes/screens.json`

- [ ] **Step 1: In the `"ics-calendar"` entry, replace the `"daysAhead"` param with `"maxEvents"` and add `"fontSize"`**

Find the `"daysAhead"` block:
```json
    "daysAhead": {
      "type": "number",
      "label": "Days ahead to show",
      "description": "How many days of upcoming events to fetch (1-30)",
      "default": 7,
      "placeholder": "7"
    }
```

Replace with:
```json
    "maxEvents": {
      "type": "number",
      "label": "Events per calendar",
      "description": "How many upcoming events to show per column (5–50)",
      "default": 15,
      "placeholder": "15"
    },
    "fontSize": {
      "type": "string",
      "label": "Font size",
      "description": "Text size across the calendar columns: small, medium, or large",
      "default": "medium",
      "placeholder": "medium"
    }
```

- [ ] **Step 2: Validate JSON**

```bash
cd /home/daniel/byos_next
node -e "const s=require('./app/(app)/recipes/screens.json'); const p=s['ics-calendar'].params; console.log('params:', Object.keys(p).join(', '))"
```

Expected output includes: `..., maxEvents, fontSize`

- [ ] **Step 3: Commit**

```bash
cd /home/daniel/byos_next
git add "app/(app)/recipes/screens.json"
git commit -m "feat(recipes): add maxEvents and fontSize params to ics-calendar"
```

---

## Verification

After all four tasks complete:

```bash
# Zero TypeScript errors
cd /home/daniel/byos_next && npx tsc --noEmit 2>&1 | grep -c "error TS" || echo "0 errors"

# Lint clean
npx @biomejs/biome check lib/recipes/ics-parser.ts "app/(app)/recipes/screens/ics-calendar/" 2>&1 | tail -3

# JSON valid with correct params
node -e "const s=require('./app/(app)/recipes/screens.json'); const p=s['ics-calendar'].params; console.log(Object.keys(p).join(', '))"
```

Start dev server:
```bash
docker compose up -d postgres && pnpm dev
```

Test at `http://localhost:3000/recipes/ics-calendar`:
- [ ] 1 calendar configured → single column fills the full 800px width, text is clear
- [ ] 2 calendars → two equal-width columns, no collapse, clear divider line
- [ ] 5 calendars → five equal columns (160px each), `text-xs` body, `text-base` header, columns don't overlap
- [ ] Events show `"10:00 AM – 11:30 AM"` for timed events, `"all day"` for all-day
- [ ] No phantom events from past recurring series
- [ ] fontSize=large → noticeably bigger text; fontSize=small → more compact
- [ ] `maxEvents=5` → only 5 events per column shown
