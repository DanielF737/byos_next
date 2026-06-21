import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { groupEventsByDay, parseICS } from "./ics-parser";

const ALLDAY_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//test//EN
BEGIN:VEVENT
UID:single-allday
SUMMARY:Holiday
DTSTART;VALUE=DATE:20260516
DTEND;VALUE=DATE:20260517
END:VEVENT
END:VCALENDAR`;

function makeEvent(isoDate: string) {
	return {
		title: "Test",
		start: `${isoDate}T10:00:00.000Z`,
		end: `${isoDate}T11:00:00.000Z`,
		allDay: false,
	};
}

describe("groupEventsByDay dateLabel formatting", () => {
	beforeEach(() => {
		// Fix "today" to 2026-05-21 so tests don't depend on wall-clock year
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-05-21T12:00:00Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("omits year for an event in the current year", () => {
		const groups = groupEventsByDay([makeEvent("2026-07-04")], "UTC");
		expect(groups[0].dateLabel).toBe("Sat, Jul 4");
	});

	it("includes year for an event in a future year", () => {
		const groups = groupEventsByDay([makeEvent("2027-01-15")], "UTC");
		expect(groups[0].dateLabel).toBe("Fri, Jan 15, 2027");
	});

	it("includes year for an event in a past year", () => {
		const groups = groupEventsByDay([makeEvent("2025-12-25")], "UTC");
		expect(groups[0].dateLabel).toBe("Thu, Dec 25, 2025");
	});
});

describe("groupEventsByDay timezone bucketing", () => {
	it("buckets a timed event by its local day, not its UTC day", () => {
		// 8pm America/New_York (UTC-4 in summer) = 2026-05-16T00:00:00Z.
		// The event belongs to May 16 locally, even though its UTC date is May 17.
		const event = {
			title: "Dinner",
			start: "2026-05-17T00:00:00.000Z",
			end: "2026-05-17T01:00:00.000Z",
			allDay: false,
		};
		const groups = groupEventsByDay([event], "America/New_York");
		expect(groups[0].dateISO).toBe("2026-05-16");
	});

	it("buckets an early event in a positive-offset zone by its local day", () => {
		// 1am Australia/Sydney (UTC+10) = 2026-05-15T15:00:00Z -> still May 16 local.
		const event = {
			title: "Early",
			start: "2026-05-15T15:00:00.000Z",
			end: "2026-05-15T16:00:00.000Z",
			allDay: false,
		};
		const groups = groupEventsByDay([event], "Australia/Sydney");
		expect(groups[0].dateISO).toBe("2026-05-16");
	});

	it("keeps an all-day event on its literal date regardless of zone", () => {
		const event = {
			title: "Holiday",
			start: "2026-05-16T00:00:00.000Z",
			end: "2026-05-17T00:00:00.000Z",
			allDay: true,
		};
		const groups = groupEventsByDay([event], "America/New_York");
		expect(groups[0].dateISO).toBe("2026-05-16");
	});

	it("renders a label that matches its bucket date", () => {
		const event = {
			title: "Dinner",
			start: "2026-05-17T00:00:00.000Z",
			end: "2026-05-17T01:00:00.000Z",
			allDay: false,
		};
		const groups = groupEventsByDay([event], "America/New_York");
		// dateISO 2026-05-16 -> label must read May 16, not May 17.
		expect(groups[0].dateISO).toBe("2026-05-16");
		expect(groups[0].dateLabel).toContain("May 16");
	});
});

describe("parseICS all-day dates", () => {
	it("preserves the literal all-day date regardless of server timezone", () => {
		const events = parseICS(
			ALLDAY_ICS,
			new Date("2026-01-01T00:00:00Z"),
			new Date("2027-01-01T00:00:00Z"),
		);
		expect(events).toHaveLength(1);
		expect(events[0].allDay).toBe(true);
		// Must stay May 16 even when the process zone is UTC+10.
		expect(events[0].start).toBe("2026-05-16T00:00:00.000Z");
		expect(events[0].end).toBe("2026-05-17T00:00:00.000Z");
		expect(groupEventsByDay(events, "Australia/Sydney")[0].dateISO).toBe(
			"2026-05-16",
		);
	});

	it("includes an event already in progress at the window start", () => {
		// Event May 16-18; window starts May 17. It overlaps, so it must appear.
		const events = parseICS(
			`BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//test//EN
BEGIN:VEVENT
UID:in-progress
SUMMARY:Vacation
DTSTART;VALUE=DATE:20260516
DTEND;VALUE=DATE:20260519
END:VEVENT
END:VCALENDAR`,
			new Date("2026-05-17T00:00:00Z"),
			new Date("2026-06-01T00:00:00Z"),
		);
		expect(events).toHaveLength(1);
		expect(events[0].title).toBe("Vacation");
	});
});

describe("groupEventsByDay multi-day expansion", () => {
	const multiAllDay = {
		title: "Vacation",
		start: "2026-05-16T00:00:00.000Z",
		end: "2026-05-19T00:00:00.000Z", // DTEND exclusive -> covers 16,17,18
		allDay: true,
	};

	it("expands a multi-day all-day event onto each covered day", () => {
		const groups = groupEventsByDay([multiAllDay], "UTC");
		expect(groups.map((g) => g.dateISO)).toEqual([
			"2026-05-16",
			"2026-05-17",
			"2026-05-18",
		]);
	});

	it("numbers each spanned day as day N/M of the full span", () => {
		const groups = groupEventsByDay([multiAllDay], "UTC");
		expect(groups[0].events[0]).toMatchObject({ dayIndex: 1, dayCount: 3 });
		expect(groups[1].events[0]).toMatchObject({ dayIndex: 2, dayCount: 3 });
		expect(groups[2].events[0]).toMatchObject({ dayIndex: 3, dayCount: 3 });
	});

	it("treats DTEND as exclusive for a single all-day event (dayCount 1)", () => {
		const single = {
			title: "Holiday",
			start: "2026-05-16T00:00:00.000Z",
			end: "2026-05-17T00:00:00.000Z",
			allDay: true,
		};
		const groups = groupEventsByDay([single], "UTC");
		expect(groups.map((g) => g.dateISO)).toEqual(["2026-05-16"]);
		expect(groups[0].events[0]).toMatchObject({ dayIndex: 1, dayCount: 1 });
	});

	it("clips days before the window start but keeps the true day numbers", () => {
		// Viewed on May 17: only 17 and 18 show, numbered 2/3 and 3/3.
		const groups = groupEventsByDay([multiAllDay], "UTC", "2026-05-17");
		expect(groups.map((g) => g.dateISO)).toEqual(["2026-05-17", "2026-05-18"]);
		expect(groups[0].events[0]).toMatchObject({ dayIndex: 2, dayCount: 3 });
		expect(groups[1].events[0]).toMatchObject({ dayIndex: 3, dayCount: 3 });
	});

	it("expands a timed event spanning days in the display zone", () => {
		// 8pm May 16 -> 9am May 18 (UTC): covers 16, 17, 18.
		const timed = {
			title: "Conference",
			start: "2026-05-16T20:00:00.000Z",
			end: "2026-05-18T09:00:00.000Z",
			allDay: false,
		};
		const groups = groupEventsByDay([timed], "UTC");
		expect(groups.map((g) => g.dateISO)).toEqual([
			"2026-05-16",
			"2026-05-17",
			"2026-05-18",
		]);
		expect(groups[2].events[0]).toMatchObject({ dayIndex: 3, dayCount: 3 });
	});

	it("does not bleed a timed event into a day it ends at local midnight", () => {
		const timed = {
			title: "Overnight",
			start: "2026-05-16T20:00:00.000Z",
			end: "2026-05-17T00:00:00.000Z", // ends exactly at midnight UTC
			allDay: false,
		};
		const groups = groupEventsByDay([timed], "UTC");
		expect(groups.map((g) => g.dateISO)).toEqual(["2026-05-16"]);
	});
});
