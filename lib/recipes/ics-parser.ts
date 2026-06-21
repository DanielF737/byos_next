import ICAL from "ical.js";

export interface CalendarEvent {
	title: string;
	start: string; // ISO 8601 string
	end: string; // ISO 8601 string
	allDay: boolean;
	description?: string;
}

/**
 * Convert an ICAL.Time to an ISO string for storage.
 *
 * All-day values (VALUE=DATE) are floating calendar dates. `toJSDate()` would
 * resolve them against the server's local zone, shifting the date a day in
 * positive-offset zones. Instead we encode the literal Y-M-D as UTC midnight so
 * the date part survives `.slice(0, 10)` regardless of server zone.
 */
function icalTimeToISO(time: ICAL.Time): string {
	if (time.isDate) {
		const y = String(time.year).padStart(4, "0");
		const m = String(time.month).padStart(2, "0");
		const d = String(time.day).padStart(2, "0");
		return `${y}-${m}-${d}T00:00:00.000Z`;
	}
	return time.toJSDate().toISOString();
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
	maxRecurrences?: number,
): CalendarEvent[] {
	let jcalData: ReturnType<typeof ICAL.parse>;
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
			// Do not pass icalStart to iterator() — it skips UNTIL/EXDATE validation for past occurrences.
			const iterator = event.iterator();
			let next: ICAL.Time | null = iterator.next();
			let safetyCount = 0;
			let occurrenceCount = 0;
			while (next && next.compare(icalEnd) <= 0 && safetyCount < 500) {
				safetyCount++;
				if (next.compare(icalStart) >= 0) {
					if (
						maxRecurrences !== undefined &&
						maxRecurrences > 0 &&
						occurrenceCount >= maxRecurrences
					)
						break;
					occurrenceCount++;
					const occurrence = event.getOccurrenceDetails(next);
					results.push({
						title: occurrence.item.summary?.trim() || "Untitled",
						start: icalTimeToISO(occurrence.startDate),
						end: icalTimeToISO(occurrence.endDate),
						allDay: occurrence.startDate.isDate,
						description: occurrence.item.description?.trim(),
					});
				}
				next = iterator.next();
			}
		} else {
			const startISO = icalTimeToISO(event.startDate);
			const endISO = event.endDate ? icalTimeToISO(event.endDate) : startISO;
			const startJS = new Date(startISO);
			const endJS = new Date(endISO);
			// Overlap test (not start-in-range): include events that intersect the
			// window so in-progress multi-day events still appear.
			if (endJS > rangeStart && startJS < rangeEnd) {
				results.push({
					title: event.summary?.trim() || "Untitled",
					start: startISO,
					end: endISO,
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
/** One day's occurrence of an event, annotated with its position in the span. */
export interface DayEvent extends CalendarEvent {
	dayIndex: number; // 1-based position within the event's full span
	dayCount: number; // total days the event spans
}

export interface DayGroup {
	dateLabel: string; // e.g. "Mon, May 16"
	dateISO: string; // e.g. "2026-05-16"
	events: DayEvent[];
}

/** Add `days` to a YYYY-MM-DD string, returning a YYYY-MM-DD string. */
function addDaysISO(iso: string, days: number): string {
	const d = new Date(`${iso}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

/** Local calendar date (YYYY-MM-DD) of an instant in the given zone. */
function localDateISO(instant: string, timeZone: string): string {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(new Date(instant));
}

/** Local time-of-day as HH:mm (24h) of an instant in the given zone. */
function localTimeHM(instant: string, timeZone: string): string {
	return new Intl.DateTimeFormat("en-GB", {
		timeZone,
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	}).format(new Date(instant));
}

/**
 * Every local calendar date (YYYY-MM-DD), in order, that an event covers.
 *
 * All-day events use literal dates with an exclusive DTEND (so May16->May19
 * covers 16/17/18). Timed events are resolved per day in the display zone; an
 * end at exactly local midnight does not extend into that day.
 */
function coveredDates(event: CalendarEvent, timeZone: string): string[] {
	let firstISO: string;
	let lastISO: string;
	if (event.allDay) {
		firstISO = event.start.slice(0, 10);
		const endExclusive = event.end ? event.end.slice(0, 10) : firstISO;
		lastISO = addDaysISO(endExclusive, -1);
		if (lastISO < firstISO) lastISO = firstISO;
	} else {
		firstISO = localDateISO(event.start, timeZone);
		lastISO = event.end ? localDateISO(event.end, timeZone) : firstISO;
		if (
			event.end &&
			lastISO > firstISO &&
			localTimeHM(event.end, timeZone) === "00:00"
		) {
			lastISO = addDaysISO(lastISO, -1);
		}
		if (lastISO < firstISO) lastISO = firstISO;
	}
	const dates: string[] = [];
	for (let iso = firstISO; iso <= lastISO; iso = addDaysISO(iso, 1)) {
		dates.push(iso);
	}
	return dates;
}

export function groupEventsByDay(
	events: CalendarEvent[],
	timeZone: string,
	windowStartISO?: string,
): DayGroup[] {
	const map = new Map<string, DayEvent[]>();

	for (const event of events) {
		const dates = coveredDates(event, timeZone);
		const dayCount = dates.length;
		dates.forEach((iso, idx) => {
			// Clip days before today; keep the true day number across the span.
			if (windowStartISO && iso < windowStartISO) return;
			const occ: DayEvent = { ...event, dayIndex: idx + 1, dayCount };
			if (!map.has(iso)) map.set(iso, []);
			map.get(iso)?.push(occ);
		});
	}

	const currentYear = new Date().getFullYear();
	const result: DayGroup[] = [];
	for (const [iso, evts] of map) {
		const d = new Date(`${iso}T00:00:00Z`);
		const eventYear = Number(iso.slice(0, 4));
		const options: Intl.DateTimeFormatOptions = {
			// Render in UTC so the label always matches its bucket key, independent
			// of the server's process timezone.
			timeZone: "UTC",
			weekday: "short",
			month: "short",
			day: "numeric",
			...(eventYear !== currentYear ? { year: "numeric" } : {}),
		};
		result.push({
			dateISO: iso,
			dateLabel: d.toLocaleDateString("en-US", options),
			events: evts,
		});
	}

	return result.sort((a, b) => a.dateISO.localeCompare(b.dateISO));
}
