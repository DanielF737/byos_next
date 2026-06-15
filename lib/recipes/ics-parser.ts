import ICAL from "ical.js";

export interface CalendarEvent {
	title: string;
	start: string; // ISO 8601 string
	end: string; // ISO 8601 string
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
			if (startJS >= rangeStart && startJS < rangeEnd) {
				results.push({
					title: event.summary?.trim() || "Untitled",
					start: event.startDate.toJSDate().toISOString(),
					end:
						event.endDate?.toJSDate().toISOString() ??
						event.startDate.toJSDate().toISOString(),
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
	dateLabel: string; // e.g. "Mon, May 16"
	dateISO: string; // e.g. "2026-05-16"
	events: CalendarEvent[];
}

/**
 * Compute the calendar date (YYYY-MM-DD) an event belongs to.
 *
 * All-day events are floating dates: they happen on their literal calendar date
 * regardless of timezone, so we read the date part of the stored value directly.
 * Timed events are absolute instants and must be resolved in the viewer's
 * timezone — bucketing by UTC instead would push evening / early-morning events
 * onto the wrong day whenever they cross the UTC date boundary.
 */
function eventDateISO(event: CalendarEvent, timeZone: string): string {
	if (event.allDay) {
		// e.g. "2026-05-16T00:00:00.000Z" -> "2026-05-16"
		return event.start.slice(0, 10);
	}
	// en-CA renders as YYYY-MM-DD, giving an ISO date in the target zone.
	return new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(new Date(event.start));
}

export function groupEventsByDay(
	events: CalendarEvent[],
	timeZone: string,
): DayGroup[] {
	const map = new Map<string, CalendarEvent[]>();

	for (const event of events) {
		const iso = eventDateISO(event, timeZone);
		if (!map.has(iso)) map.set(iso, []);
		map.get(iso)?.push(event);
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
