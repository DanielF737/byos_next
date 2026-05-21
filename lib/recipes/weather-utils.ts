const WEATHER_CODES: Record<number, string> = {
	0: "Clear sky",
	1: "Mainly clear",
	2: "Partly cloudy",
	3: "Overcast",
	45: "Foggy",
	48: "Depositing rime fog",
	51: "Light drizzle",
	53: "Moderate drizzle",
	55: "Dense drizzle",
	56: "Light freezing drizzle",
	57: "Dense freezing drizzle",
	61: "Slight rain",
	63: "Moderate rain",
	65: "Heavy rain",
	66: "Light freezing rain",
	67: "Heavy freezing rain",
	71: "Slight snow fall",
	73: "Moderate snow fall",
	75: "Heavy snow fall",
	77: "Snow grains",
	80: "Slight rain showers",
	81: "Moderate rain showers",
	82: "Violent rain showers",
	85: "Slight snow showers",
	86: "Heavy snow showers",
	95: "Thunderstorm",
	96: "Thunderstorm with slight hail",
	99: "Thunderstorm with heavy hail",
};

export function getWeatherDescription(code: number): string {
	return WEATHER_CODES[code] ?? "Unknown";
}

export function parseLocationParam(location: string): {
	locationName: string;
	latitude?: number;
	longitude?: number;
} {
	const sepIdx = location.indexOf("||");
	if (sepIdx === -1) return { locationName: location };
	const displayName = location.slice(0, sepIdx);
	const parts = location.slice(sepIdx + 2).split(",");
	const lat = Number.parseFloat(parts[0]);
	const lon = Number.parseFloat(parts[1]);
	if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
		return { locationName: displayName, latitude: lat, longitude: lon };
	}
	return { locationName: displayName };
}

export function formatDayLabel(dateStr: string): string {
	const today = new Date().toISOString().slice(0, 10);
	if (dateStr === today) return "Today";
	const date = new Date(`${dateStr}T12:00:00Z`);
	return date.toLocaleDateString("en-US", {
		weekday: "short",
		timeZone: "UTC",
	});
}

export function clampForecastDays(n: number | string | undefined): number {
	const parsed = typeof n === "string" ? parseInt(n, 10) : n;
	if (parsed === undefined || Number.isNaN(parsed)) return 5;
	return Math.min(10, Math.max(3, parsed));
}

export function roundNum(n: number): string {
	return Math.round(n).toString();
}

export function roundOneDecimal(n: number): string {
	return n.toFixed(1);
}

export function formatTime(timeString: string): string {
	const date = new Date(timeString);
	return date.toLocaleString("en-US", {
		hour: "2-digit",
		minute: "2-digit",
		timeZone: "UTC",
	});
}

export function formatDateTime(dateString: string): string {
	const date = new Date(dateString);
	return date.toLocaleString("en-US", {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		timeZone: "UTC",
	});
}

// Shared error filter: suppress Next.js prerendering promise rejections
export function isPrerendError(error: unknown): boolean {
	const msg = error instanceof Error ? error.message : String(error);
	return (
		msg.includes("prerender") ||
		msg.includes("HANGING_PROMISE_REJECTION") ||
		msg.includes("prerender is complete")
	);
}

export interface GeocodingResult {
	latitude: number;
	longitude: number;
	name: string;
}

export async function geocodeLocation(
	locationName: string,
): Promise<GeocodingResult | null> {
	try {
		const response = await fetch(
			`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(locationName)}&count=1&language=en&format=json`,
			{ headers: { Accept: "application/json" }, next: { revalidate: 0 } },
		);
		if (!response.ok) throw new Error(`Geocoding API: ${response.status}`);
		const data = await response.json();
		if (data.results?.length > 0) {
			const r = data.results[0];
			return {
				latitude: r.latitude,
				longitude: r.longitude,
				name: `${r.name}, ${r.country}`,
			};
		}
		return null;
	} catch (error) {
		if (isPrerendError(error)) return null;
		console.error("Error geocoding location:", error);
		return null;
	}
}
