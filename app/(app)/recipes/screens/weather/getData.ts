// app/(app)/recipes/screens/weather/getData.ts
import { unstable_cache } from "next/cache";
import {
	formatDateTime,
	formatTime,
	geocodeLocation,
	getWeatherDescription,
	isPrerendError,
	parseLocationParam,
	roundNum,
} from "@/lib/recipes/weather-utils";

export const dynamic = "force-dynamic";

interface WeatherData {
	temperature: string;
	feelsLike: string;
	humidity: string;
	windSpeed: string;
	description: string;
	location: string;
	lastUpdated: string;
	highTemp: string;
	lowTemp: string;
	pressure: string;
	sunset: string;
	sunrise: string;
	latitude: number;
	longitude: number;
}

type WeatherParams = {
	location?: string;
	latitude?: number;
	longitude?: number;
};

interface OpenMeteoResponse {
	current: {
		time: string;
		temperature_2m: number;
		apparent_temperature: number;
		relative_humidity_2m: number;
		wind_speed_10m: number;
		surface_pressure: number;
		weather_code: number;
	};
	daily: {
		time: string[];
		temperature_2m_max: number[];
		temperature_2m_min: number[];
		sunset: string[];
		sunrise: string[];
	};
}

async function getWeatherData(
	latitude?: number,
	longitude?: number,
	locationName?: string,
): Promise<WeatherData | null> {
	try {
		if ((!latitude || !longitude) && !locationName) {
			throw new Error("Latitude, longitude, or location name are required");
		}

		if (locationName) {
			const geocoded = await geocodeLocation(locationName);
			if (geocoded) {
				latitude = geocoded.latitude;
				longitude = geocoded.longitude;
			}
		}

		const response = await fetch(
			`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,surface_pressure,weather_code&daily=temperature_2m_max,temperature_2m_min,sunset,sunrise&timezone=auto`,
			{ headers: { Accept: "application/json" }, next: { revalidate: 0 } },
		);
		if (!response.ok) throw new Error(`Open-Meteo API: ${response.status}`);

		const data: OpenMeteoResponse = await response.json();
		if (!data.current) throw new Error("No current weather data available");

		const { current, daily } = data;

		return {
			temperature: roundNum(current.temperature_2m),
			feelsLike: roundNum(current.apparent_temperature),
			humidity: roundNum(current.relative_humidity_2m),
			windSpeed: roundNum(current.wind_speed_10m),
			description: getWeatherDescription(current.weather_code),
			location: locationName || "San Francisco, CA",
			lastUpdated: formatDateTime(current.time),
			highTemp: roundNum(daily.temperature_2m_max[0]),
			lowTemp: roundNum(daily.temperature_2m_min[0]),
			pressure: roundNum(current.surface_pressure),
			sunset: formatTime(daily.sunset[0]),
			sunrise: formatTime(daily.sunrise[0]),
			latitude: latitude || 0,
			longitude: longitude || 0,
		};
	} catch (error) {
		if (isPrerendError(error)) return null;
		console.error("Error fetching weather data:", error);
		return null;
	}
}

function nullWeather(params?: WeatherParams): WeatherData {
	return {
		temperature: "N/A",
		feelsLike: "N/A",
		humidity: "N/A",
		windSpeed: "N/A",
		description: "N/A",
		location: "N/A",
		lastUpdated: "N/A",
		highTemp: "N/A",
		lowTemp: "N/A",
		pressure: "N/A",
		sunset: "N/A",
		sunrise: "N/A",
		latitude: params?.latitude || 0,
		longitude: params?.longitude || 0,
	};
}

const getCachedWeatherData = unstable_cache(
	async (params?: WeatherParams): Promise<WeatherData> => {
		const data = await getWeatherData(
			params?.latitude,
			params?.longitude,
			params?.location,
		);
		if (!data) throw new Error("Empty or invalid data - skip caching");
		return data;
	},
	["weather-data"],
	{ tags: ["weather", "open-meteo"], revalidate: 900 },
);

export default async function getData(
	params?: WeatherParams,
): Promise<WeatherData> {
	const rawLocation = params?.location || "San Francisco";
	const parsed = parseLocationParam(rawLocation);

	let finalLatitude: number | undefined = params?.latitude ?? parsed.latitude;
	let finalLongitude: number | undefined =
		params?.longitude ?? parsed.longitude;
	let finalLocationName = parsed.locationName;

	try {
		if (finalLocationName && !finalLatitude && !finalLongitude) {
			const geocoded = await geocodeLocation(finalLocationName);
			if (geocoded) {
				finalLatitude = geocoded.latitude;
				finalLongitude = geocoded.longitude;
				finalLocationName = geocoded.name;
			}
		}
		return await getCachedWeatherData({
			latitude: finalLatitude,
			longitude: finalLongitude,
			location: finalLocationName,
		});
	} catch (error) {
		console.log("Cache skipped or error:", error);
		console.log(
			"Fallback to non-cached data:",
			finalLatitude,
			finalLongitude,
			finalLocationName,
		);
		const data = await getWeatherData(
			finalLatitude,
			finalLongitude,
			finalLocationName,
		);
		return (
			data ??
			nullWeather({ latitude: finalLatitude, longitude: finalLongitude })
		);
	}
}
