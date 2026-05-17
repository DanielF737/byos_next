# ICS Calendar Layout Fix — Mirror Working Recipe Patterns

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `ics-calendar.tsx` to use the exact same layout primitives as `responsive-example.tsx` and `weather.tsx`, which render correctly in Takumi.

**Architecture:** Root cause was CSS properties (`overflow-hidden`, `min-w-0`, `flex-shrink-0`) that Takumi doesn't support — all absent from working recipes. The fix copies the responsive-example panel pattern exactly: `flex-1 flex flex-row` for the columns container, `flex-1 flex flex-col` for each column. No overflow control, no min-width, no shrink manipulation anywhere.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, PreSatori (Takumi renderer)

---

## Root Cause Evidence

| Property | `responsive-example` | `weather` | `ics-calendar` (broken) |
|---|---|---|---|
| `overflow-hidden` | ❌ never | ❌ never | ✅ on columns container |
| `min-w-0` | ❌ never | ❌ never | ✅ on each column |
| `flex-shrink-0` | ❌ never | ❌ never | ✅ on header + footer |
| Columns container | `flex-1 flex flex-row` | n/a | `flex flex-row flex-1 overflow-hidden` ← broken |
| Each panel/column | `flex-1 flex flex-col` | `flex-1` | `flex flex-col flex-1 min-w-0 overflow-hidden` ← broken |

**Working pattern from `responsive-example.tsx` (lines 22–31):**
```tsx
{/* Container: flex-1 FIRST, then flex direction */}
<div className="flex-1 flex flex-col md:flex-row gap-1 sm:gap-2 p-1 sm:p-2">
  {/* Each panel: just flex-1 and content classes, nothing else */}
  <div className="bg-red-500 flex items-center justify-center ... flex-1 ...">Panel 1</div>
  <div className="bg-green-500 flex items-center justify-center ... flex-1 ...">Panel 2</div>
</div>
{/* Footer: explicit height, not flex-shrink-0 */}
<div className="bg-purple-500 flex items-center justify-center ... h-20 ...">Footer</div>
```

---

## File Map

| Action | Path | Change |
|--------|------|--------|
| Modify | `app/(app)/recipes/screens/ics-calendar/ics-calendar.tsx` | Full rewrite following responsive-example pattern |

---

## Task 1: Rewrite `ics-calendar.tsx` following working recipe patterns

**Files:**
- Modify: `app/(app)/recipes/screens/ics-calendar/ics-calendar.tsx`

**Rules (derived from working recipes — do not deviate):**
- ✅ Root: `flex flex-col w-full h-full bg-white text-black` (same as weather + responsive-example)
- ✅ Columns container: `flex-1 flex flex-row` — `flex-1` comes FIRST, no overflow-hidden
- ✅ Each column: `flex-1 flex flex-col` — just these two classes (+ optional border)
- ✅ Column header: natural height driven by padding only — no flex-shrink-0
- ✅ Column content: `flex-1` — just this, nothing else
- ✅ Footer: explicit padding `py-1` — no flex-shrink-0, no overflow-hidden
- ❌ Never use `overflow-hidden` — not used in any working recipe
- ❌ Never use `min-w-0` — not used in any working recipe  
- ❌ Never use `flex-shrink-0` — not used in any working recipe
- ❌ Never use inline `style` for layout (overflow, flex) — not used in working recipes
- ✅ Text can wrap naturally — do not try to truncate with overflow/ellipsis

- [ ] **Step 1: Write the new file**

Write this EXACT content to `app/(app)/recipes/screens/ics-calendar/ics-calendar.tsx`:

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

// Legibility floor: text-xs (12px) on 800×480 e-ink.
function getFontClasses(
	colCount: number,
	fontSize: string,
): { header: string; body: string; padding: string } {
	if (fontSize === "large") {
		if (colCount <= 2)
			return { header: "text-2xl", body: "text-base", padding: "p-2" };
		if (colCount === 3)
			return { header: "text-xl", body: "text-sm", padding: "p-2" };
		return { header: "text-lg", body: "text-xs", padding: "p-1" };
	}
	if (fontSize === "small") {
		if (colCount <= 2)
			return { header: "text-lg", body: "text-sm", padding: "p-2" };
		if (colCount === 3)
			return { header: "text-base", body: "text-xs", padding: "p-1" };
		return { header: "text-sm", body: "text-xs", padding: "p-1" };
	}
	// medium (default)
	if (colCount <= 2)
		return { header: "text-xl", body: "text-sm", padding: "p-2" };
	if (colCount === 3)
		return { header: "text-lg", body: "text-xs", padding: "p-2" };
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

	// Pattern: exactly mirrors responsive-example panel — "flex-1 flex flex-col"
	// NO overflow-hidden, NO min-w-0, NO flex-shrink-0 (absent from all working recipes)
	return (
		<div
			className={`flex-1 flex flex-col${!isLast ? " border-r border-solid border-black" : ""}`}
		>
			{/* Header: natural height from padding, like weather's header divs */}
			<div
				className={`border-b border-solid border-black ${padding} font-blockkie ${header} leading-tight`}
			>
				{column.name}
			</div>

			{/* Content: flex-1 fills remaining column height, like weather's "flex flex-col flex-1" */}
			<div className={`flex-1 ${padding}`}>
				{column.error ? (
					<div className={`${body} mt-1`}>Error: {column.error}</div>
				) : column.dayGroups.length === 0 ? (
					<div className={`${body} mt-1`}>No upcoming events</div>
				) : (
					column.dayGroups.map((group) => (
						<div key={group.dateISO} className="mt-2">
							<div className={`${body} font-bold leading-tight mb-1`}>
								{group.dateLabel}
							</div>
							{group.events.map((event, i) => (
								<div key={i} className="flex flex-row gap-1 leading-tight mb-1">
									<span className="text-xs leading-tight">
										{formatTimeRange(event.start, event.end, event.allDay)}
									</span>
									<span className={`${body} leading-tight`}>
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
			{/* Root: identical to weather.tsx and responsive-example.tsx */}
			<div className="flex flex-col w-full h-full bg-white text-black">

				{/* Columns container: mirrors responsive-example "flex-1 flex flex-col md:flex-row"
				    but we're always flex-row (no responsive needed — dimensions are known) */}
				<div className="flex-1 flex flex-row">
					{columns.length === 0 ? (
						<div className="flex-1 flex items-center justify-center text-2xl font-blockkie">
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

				{/* Footer: explicit padding like responsive-example "h-20", NOT flex-shrink-0 */}
				{fetchedAt && (
					<div className="border-t border-solid border-black px-2 py-1 flex flex-row justify-end">
						<span className="text-xs">Updated {fetchedAt}</span>
					</div>
				)}
			</div>
		</PreSatori>
	);
}
```

- [ ] **Step 2: Run Biome**

```bash
cd /home/daniel/byos_next
npx @biomejs/biome check --write "app/(app)/recipes/screens/ics-calendar/ics-calendar.tsx" 2>&1 | tail -3
```

Expected: `Checked 1 file.` or `Fixed N files.`

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /home/daniel/byos_next && npx tsc --noEmit 2>&1 | grep "ics-calendar" | head -5
```

Expected: no output (zero errors).

- [ ] **Step 4: Commit**

```bash
cd /home/daniel/byos_next
git add "app/(app)/recipes/screens/ics-calendar/ics-calendar.tsx"
git commit -m "fix(recipes): rewrite layout following working recipe patterns (no overflow/min-w-0/shrink)"
```

---

## Verification

Start dev server and test the BMP output:

```bash
docker compose up -d postgres
pnpm dev
```

- [ ] Open `http://localhost:3000/recipes/ics-calendar` — click the BMP tab
- [ ] Column dividers (vertical black lines) are visible
- [ ] Column headers have bottom border (horizontal black line)
- [ ] Events are visible with consistent spacing
- [ ] Footer line is visible
- [ ] With 1 calendar: single column fills the width
- [ ] With 2 calendars: two equal columns side by side (mirrors responsive-example panels)
- [ ] With 5 calendars: five equal narrow columns

If still broken after this fix: the architecture of using a separate `ColumnView` component may itself be the issue (Takumi may not resolve flex context correctly across component boundaries). In that case, inline the column JSX directly in `IcsCalendar` without a sub-component.
