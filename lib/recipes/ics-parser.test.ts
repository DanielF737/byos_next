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
		const groups = groupEventsByDay([makeEvent("2026-07-04")]);
		expect(groups[0].dateLabel).toBe("Sat, Jul 4");
	});

	it("includes year for an event in a future year", () => {
		const groups = groupEventsByDay([makeEvent("2027-01-15")]);
		expect(groups[0].dateLabel).toBe("Fri, Jan 15, 2027");
	});

	it("includes year for an event in a past year", () => {
		const groups = groupEventsByDay([makeEvent("2025-12-25")]);
		expect(groups[0].dateLabel).toBe("Thu, Dec 25, 2025");
	});
});
