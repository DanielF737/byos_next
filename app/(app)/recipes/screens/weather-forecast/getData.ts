import { unstable_cache } from "next/cache";
import {
	clampForecastDays,
	formatDateTime,
	formatDayLabel,
	geocodeLocation,
	getWeatherDescription,
	isPrerendError,
	parseLocationParam,
	roundNum,
	roundOneDecimal,
} from "@/lib/recipes/weather-utils";

export const dynamic = "force-dynamic";

export interface ForecastDay {
	dateLabel: string;
	weatherCode: number;
	highTemp: string;
	lowTemp: string;
	windSpeedMax: string;
	precipitation: string;
	description: string;
}

export interface WeatherForecastData {
	temperature: string;
	description: string;
	weatherCode: number;
	location: string;
	lastUpdated: string;
	highTemp: string;
	lowTemp: string;
	windSpeed: string;
	precipitation: string;
	forecast: ForecastDay[];
	latitude: number;
	longitude: number;
}

type WeatherForecastParams = {
	location?: string;
	forecastDays?: number | string;
};

interface OpenMeteoForecastResponse {
	current: {
		time: string;
		temperature_2m: number;
		wind_speed_10m: number;
		weather_code: number;
		precipitation: number;
	};
	daily: {
		time: string[];
		temperature_2m_max: number[];
		temperature_2m_min: number[];
		weather_code: number[];
		precipitation_sum: number[];
		wind_speed_10m_max: number[];
	};
}

function buildNullResponse(
	locationName: string,
	latitude: number,
	longitude: number,
): WeatherForecastData {
	return {
		temperature: "N/A",
		description: "N/A",
		weatherCode: 0,
		location: locationName || "N/A",
		lastUpdated: "N/A",
		highTemp: "N/A",
		lowTemp: "N/A",
		windSpeed: "N/A",
		precipitation: "N/A",
		forecast: [],
		latitude,
		longitude,
	};
}

async function fetchForecastData(
	latitude: number,
	longitude: number,
	locationName: string,
	forecastDays: number,
): Promise<WeatherForecastData | null> {
	try {
		const url = new URL("https://api.open-meteo.com/v1/forecast");
		url.searchParams.set("latitude", String(latitude));
		url.searchParams.set("longitude", String(longitude));
		url.searchParams.set(
			"current",
			"temperature_2m,wind_speed_10m,weather_code,precipitation",
		);
		url.searchParams.set(
			"daily",
			"temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum,wind_speed_10m_max",
		);
		url.searchParams.set("timezone", "auto");
		url.searchParams.set("forecast_days", String(forecastDays));

		const response = await fetch(url.toString(), {
			headers: { Accept: "application/json" },
			next: { revalidate: 0 },
		});
		if (!response.ok) throw new Error(`Open-Meteo API: ${response.status}`);

		const data: OpenMeteoForecastResponse = await response.json();
		if (!data.current || !data.daily) throw new Error("Invalid API response");

		const { current, daily } = data;

		const forecast: ForecastDay[] = daily.time.slice(1).map((dateStr, i) => ({
			dateLabel: formatDayLabel(dateStr),
			weatherCode: daily.weather_code[i + 1],
			highTemp: roundNum(daily.temperature_2m_max[i + 1]),
			lowTemp: roundNum(daily.temperature_2m_min[i + 1]),
			windSpeedMax: roundNum(daily.wind_speed_10m_max[i + 1]),
			precipitation: roundOneDecimal(daily.precipitation_sum[i + 1]),
			description: getWeatherDescription(daily.weather_code[i + 1]),
		}));

		return {
			temperature: roundNum(current.temperature_2m),
			description: getWeatherDescription(current.weather_code),
			weatherCode: current.weather_code,
			location: locationName,
			lastUpdated: formatDateTime(current.time),
			highTemp: roundNum(daily.temperature_2m_max[0]),
			lowTemp: roundNum(daily.temperature_2m_min[0]),
			windSpeed: roundNum(current.wind_speed_10m),
			precipitation: roundOneDecimal(daily.precipitation_sum[0]),
			forecast,
			latitude,
			longitude,
		};
	} catch (error) {
		if (isPrerendError(error)) return null;
		console.error("Error fetching forecast data:", error);
		return null;
	}
}

const getCachedForecastData = unstable_cache(
	async (
		latitude: number,
		longitude: number,
		locationName: string,
		forecastDays: number,
	): Promise<WeatherForecastData> => {
		const data = await fetchForecastData(
			latitude,
			longitude,
			locationName,
			forecastDays,
		);
		if (!data) throw new Error("Empty or invalid data - skip caching");
		return data;
	},
	["weather-forecast-data"],
	{ tags: ["weather", "open-meteo", "weather-forecast"], revalidate: 900 },
);

export default async function getData(
	params?: WeatherForecastParams,
): Promise<WeatherForecastData> {
	const rawLocation = params?.location || "San Francisco";
	const parsed = parseLocationParam(rawLocation);
	const forecastDays = clampForecastDays(params?.forecastDays);

	let latitude: number | undefined = parsed.latitude;
	let longitude: number | undefined = parsed.longitude;
	let locationName = parsed.locationName;

	try {
		if (locationName && !latitude && !longitude) {
			const geocoded = await geocodeLocation(locationName);
			if (geocoded) {
				latitude = geocoded.latitude;
				longitude = geocoded.longitude;
				locationName = geocoded.name;
			}
		}
		if (!latitude || !longitude) {
			return buildNullResponse(locationName, 0, 0);
		}
		return await getCachedForecastData(
			latitude,
			longitude,
			locationName,
			forecastDays,
		);
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		if (msg !== "Empty or invalid data - skip caching") {
			console.error("Unexpected error in getCachedForecastData:", error);
		}
		const data = await fetchForecastData(
			latitude ?? 0,
			longitude ?? 0,
			locationName,
			forecastDays,
		);
		return (
			data ?? buildNullResponse(locationName, latitude ?? 0, longitude ?? 0)
		);
	}
}
