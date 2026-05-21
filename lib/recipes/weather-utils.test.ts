// lib/recipes/weather-utils.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	clampForecastDays,
	formatDayLabel,
	formatDateTime,
	formatTime,
	getWeatherDescription,
	isPrerendError,
	parseLocationParam,
	roundNum,
	roundOneDecimal,
} from "./weather-utils";

describe("getWeatherDescription", () => {
	it("returns 'Clear sky' for code 0", () => {
		expect(getWeatherDescription(0)).toBe("Clear sky");
	});
	it("returns 'Thunderstorm' for code 95", () => {
		expect(getWeatherDescription(95)).toBe("Thunderstorm");
	});
	it("returns 'Unknown' for an unmapped code", () => {
		expect(getWeatherDescription(999)).toBe("Unknown");
	});
	it("returns 'Moderate rain' for code 63", () => {
		expect(getWeatherDescription(63)).toBe("Moderate rain");
	});
});

describe("parseLocationParam", () => {
	it("returns locationName only when no separator", () => {
		expect(parseLocationParam("San Francisco")).toEqual({
			locationName: "San Francisco",
		});
	});
	it("extracts display name and coordinates from encoded param", () => {
		expect(parseLocationParam("San Francisco, CA||37.7749,-122.4194")).toEqual({
			locationName: "San Francisco, CA",
			latitude: 37.7749,
			longitude: -122.4194,
		});
	});
	it("falls back to locationName only when coords are NaN", () => {
		expect(parseLocationParam("Nowhere||bad,coords")).toEqual({
			locationName: "Nowhere",
		});
	});
});

describe("clampForecastDays", () => {
	it("returns 5 when undefined", () => {
		expect(clampForecastDays(undefined)).toBe(5);
	});
	it("returns 5 for string 'undefined'", () => {
		expect(clampForecastDays("undefined")).toBe(5);
	});
	it("clamps to minimum 3 for input 1", () => {
		expect(clampForecastDays(1)).toBe(3);
	});
	it("clamps to maximum 10 for input 99", () => {
		expect(clampForecastDays(99)).toBe(10);
	});
	it("passes through 7 unchanged", () => {
		expect(clampForecastDays(7)).toBe(7);
	});
	it("handles string '5'", () => {
		expect(clampForecastDays("5")).toBe(5);
	});
});

describe("formatDayLabel", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-05-21T12:00:00Z"));
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("returns 'Today' for today's date", () => {
		expect(formatDayLabel("2026-05-21")).toBe("Today");
	});
	it("returns short weekday for tomorrow", () => {
		expect(formatDayLabel("2026-05-22")).toBe("Fri");
	});
	it("returns short weekday for a future date", () => {
		expect(formatDayLabel("2026-05-25")).toBe("Mon");
	});
});

describe("roundNum", () => {
	it("rounds 22.6 to '23'", () => {
		expect(roundNum(22.6)).toBe("23");
	});
	it("rounds 22.4 to '22'", () => {
		expect(roundNum(22.4)).toBe("22");
	});
});

describe("roundOneDecimal", () => {
	it("formats 2.34 as '2.3'", () => {
		expect(roundOneDecimal(2.34)).toBe("2.3");
	});
	it("formats 0 as '0.0'", () => {
		expect(roundOneDecimal(0)).toBe("0.0");
	});
});

describe("isPrerendError", () => {
	it("returns true for prerender message", () => {
		expect(isPrerendError(new Error("prerender is complete"))).toBe(true);
	});
	it("returns true for HANGING_PROMISE_REJECTION", () => {
		expect(isPrerendError(new Error("HANGING_PROMISE_REJECTION"))).toBe(true);
	});
	it("returns false for a normal error", () => {
		expect(isPrerendError(new Error("Network timeout"))).toBe(false);
	});
});

describe("formatTime", () => {
	it("formats an ISO time string to HH:MM AM/PM", () => {
		const result = formatTime("2026-05-21T14:30:00");
		expect(result).toMatch(/04:30 AM/i);
	});
});

describe("formatDateTime", () => {
	it("includes month, day, hour, minute", () => {
		const result = formatDateTime("2026-05-21T14:30:00");
		expect(result).toMatch(/May/);
		expect(result).toMatch(/21/);
	});
});
