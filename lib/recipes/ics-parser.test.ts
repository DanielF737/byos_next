import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { groupEventsByDay } from "./ics-parser";

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
