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
	timeZone?: string;
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
	timeZone: string;
}

/**
 * Resolve a configured IANA timezone, falling back to the server's zone when the
 * value is blank or invalid. Every part of the recipe (range bounds, day
 * grouping, labels, times) is rendered in this single zone so days stay
 * consistent.
 */
function resolveTimeZone(value: string | undefined): string {
	const serverZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	const candidate = value?.trim();
	if (!candidate) return serverZone;
	try {
		// Throws RangeError for an unrecognised timezone.
		new Intl.DateTimeFormat(undefined, { timeZone: candidate });
		return candidate;
	} catch {
		return serverZone;
	}
}

/** Start of "today" in the given timezone, as a UTC-anchored Date. */
function startOfTodayInZone(timeZone: string): Date {
	const todayISO = new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(new Date());
	return new Date(`${todayISO}T00:00:00Z`);
}

async function fetchAndParseCalendar(
	url: string,
	name: string | undefined,
	rangeStart: Date,
	rangeEnd: Date,
	maxEvents: number,
	timeZone: string,
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
		const dayGroups = groupEventsByDay(events, timeZone);

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

	const lookAheadDays = Math.max(0, Number(params?.lookAheadDays ?? 0) || 0);
	const rawMaxRecurrences = Math.max(
		0,
		Number(params?.maxRecurrences ?? 0) || 0,
	);
	const maxRecurrences = rawMaxRecurrences > 0 ? rawMaxRecurrences : undefined;

	const timeZone = resolveTimeZone(params?.timeZone);

	const now = new Date();
	const rangeStart = startOfTodayInZone(timeZone);
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
		timeZone,
		hour: "2-digit",
		minute: "2-digit",
	});

	if (entries.length === 0) {
		return { columns: [], fetchedAt, fontSize, timeZone };
	}

	const columns = await Promise.all(
		entries.map((e) =>
			fetchAndParseCalendar(
				e.url,
				e.name,
				rangeStart,
				rangeEnd,
				maxEvents,
				timeZone,
				maxRecurrences,
			),
		),
	);

	return { columns, fetchedAt, fontSize, timeZone };
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
