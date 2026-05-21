import { PreSatori } from "@/utils/pre-satori";
import {
	CloudIcon,
	FogIcon,
	PrecipitationIcon,
	RainIcon,
	SnowIcon,
	SunIcon,
	TempDown,
	TempUp,
	ThunderIcon,
	WindIcon,
} from "../weather/icons";
import type { ForecastDay } from "./getData";

interface WeatherForecastProps {
	temperature?: string;
	description?: string;
	location?: string;
	lastUpdated?: string;
	highTemp?: string;
	lowTemp?: string;
	windSpeed?: string;
	precipitation?: string;
	forecast?: ForecastDay[];
	width?: number;
	height?: number;
}

function getWeatherIcon(desc: string, size: number) {
	const d = desc.toLowerCase();
	if (d.includes("rain") || d.includes("drizzle"))
		return <RainIcon size={size} />;
	if (d.includes("snow")) return <SnowIcon size={size} />;
	if (d.includes("cloud")) return <CloudIcon size={size} />;
	if (d.includes("clear") || d.includes("sun")) return <SunIcon size={size} />;
	if (d.includes("fog") || d.includes("mist")) return <FogIcon size={size} />;
	if (d.includes("thunder")) return <ThunderIcon size={size} />;
	return <CloudIcon size={size} />;
}

export default function WeatherForecast({
	temperature = "Loading...",
	description = "Loading...",
	location = "Loading...",
	lastUpdated = "Loading...",
	highTemp = "N/A",
	lowTemp = "N/A",
	windSpeed = "N/A",
	precipitation = "N/A",
	forecast = [],
	width = 800,
	height = 480,
}: WeatherForecastProps) {
	const isNarrow = width < 350;
	const isCompact = width < 600;

	// Size tokens — numeric, used in style= to avoid Tailwind interpolation
	const mainIconSize = isNarrow ? 48 : isCompact ? 72 : 96;
	const rowIconSize = isNarrow ? 20 : isCompact ? 30 : 36;
	const arrowSize = isNarrow ? 16 : isCompact ? 20 : 22;
	const statIconSize = isNarrow ? 16 : isCompact ? 20 : 24;
	const sideMargin = isNarrow ? 4 : isCompact ? 8 : 12;
	const dayLabelMinWidth = isNarrow ? 46 : isCompact ? 64 : 76;
	const windMinWidth = isCompact ? 80 : 100;
	const precipMinWidth = isNarrow ? 44 : isCompact ? 60 : 72;

	// Calendar-style single-line threshold: below 450px compact, stack wind+precip on row 2
	const rowSingleLine = !isCompact || isNarrow || width >= 450;

	// Precomputed Tailwind class strings — no interpolation
	const tempClass = isNarrow ? "text-4xl" : isCompact ? "text-6xl" : "text-8xl";
	const hiLoClass = isNarrow ? "text-sm" : isCompact ? "text-lg" : "text-xl";
	const descClass = isNarrow ? "text-sm font-inter" : "text-base font-inter";
	const dayLabelClass = isNarrow ? "text-xs font-inter" : "text-sm font-inter";
	const rowTempClass = isNarrow ? "text-base font-inter" : "text-xl font-inter";
	const statClass = isNarrow ? "text-sm font-inter" : "text-base font-inter";
	const footerClass = isNarrow
		? "flex-col text-sm font-inter p-1"
		: isCompact
			? "flex-col text-base font-inter p-2"
			: "flex-row justify-between text-base font-inter p-2";
	const headerPad = isNarrow ? "p-1" : "p-3";
	const outerPad = isNarrow
		? "px-1 pb-1"
		: isCompact
			? "px-2 pb-2"
			: "px-3 pb-3";
	const rowGap = isNarrow ? "gap-1" : isCompact ? "gap-2" : "gap-3";
	const rowPad = isNarrow
		? "py-0.5 px-1"
		: isCompact
			? "py-1 px-2"
			: "py-1.5 px-3";
	const todayStatPad = isNarrow
		? "4px 6px"
		: isCompact
			? "6px 10px"
			: "8px 12px";

	return (
		<PreSatori width={width} height={height}>
			<div className="flex flex-col w-full h-full bg-white text-black">
				{/* Header: current conditions */}
				<div
					className={`flex flex-row ${headerPad} items-center justify-between`}
				>
					<div className="flex flex-col flex-1">
						<span className={`font-inter ${tempClass} leading-none`}>
							{temperature}°C
						</span>
						<div className={`${hiLoClass} flex flex-row items-center mt-0.5`}>
							<TempUp size={arrowSize} />
							<span className="ml-0.5 font-inter">{highTemp}°</span>
							<TempDown size={arrowSize} />
							<span className="ml-0.5 font-inter">{lowTemp}°</span>
						</div>
						<span className={`${descClass} mt-0.5 text-gray-600`}>
							{description}
						</span>
					</div>
					<div className="flex-shrink-0">
						{getWeatherIcon(description, mainIconSize)}
					</div>
				</div>

				{/* Today's stats bar */}
				<div
					className={`flex flex-row items-center ${rowGap} rounded-lg bg-gray-100`}
					style={{
						margin: `0 ${sideMargin}px ${sideMargin}px`,
						padding: todayStatPad,
					}}
				>
					<div className={`flex flex-row items-center ${rowGap}`}>
						<WindIcon size={statIconSize} />
						<span className={statClass}>{windSpeed} km/h</span>
					</div>
					<div
						className="bg-gray-400"
						style={{ width: 1, alignSelf: "stretch" }}
					/>
					<div className={`flex flex-row items-center ${rowGap}`}>
						<PrecipitationIcon size={statIconSize} />
						<span className={statClass}>{precipitation} mm</span>
					</div>
				</div>

				{/* Forecast rows */}
				<div
					className={`${outerPad} flex flex-col flex-1 justify-between gap-1`}
					style={{ overflow: "hidden" }}
				>
					{forecast.map((day, i) => (
						<div
							key={i}
							className={`flex flex-col w-full ${rowPad} rounded-lg`}
							style={{ border: "1px solid #d1d5db" }}
						>
							{/* Top line: day label + icon + hi/lo temps */}
							<div className={`flex flex-row items-center ${rowGap}`}>
								<span
									className={dayLabelClass}
									style={{ minWidth: dayLabelMinWidth }}
								>
									{day.dateLabel}
								</span>

								<span style={{ marginLeft: 4 }}>
									{getWeatherIcon(day.description, rowIconSize)}
								</span>

								<div
									className={`flex flex-row items-center flex-1 ${rowGap}`}
									style={{ marginLeft: 4 }}
								>
									<TempUp size={arrowSize} />
									<span className={rowTempClass}>{day.highTemp}°</span>
									<TempDown size={arrowSize} />
									<span className={rowTempClass}>{day.lowTemp}°</span>
								</div>

								{rowSingleLine && !isNarrow && (
									<div
										className={`flex flex-row items-center ${rowGap}`}
										style={{ marginLeft: 8, minWidth: windMinWidth }}
									>
										<WindIcon size={statIconSize} />
										<span className={rowTempClass}>
											{day.windSpeedMax} km/h
										</span>
									</div>
								)}

								{rowSingleLine && (
									<div
										className={`flex flex-row items-center ${rowGap}`}
										style={{ marginLeft: 4, minWidth: precipMinWidth }}
									>
										<PrecipitationIcon size={statIconSize} />
										<span className={rowTempClass}>{day.precipitation} mm</span>
									</div>
								)}
							</div>

							{/* Second line for wind + precip when compact and tight (< 450px) */}
							{!rowSingleLine && (
								<div
									className="flex flex-row items-center gap-2"
									style={{ marginTop: 2, marginLeft: 4 }}
								>
									<WindIcon size={statIconSize} />
									<span className={rowTempClass}>{day.windSpeedMax} km/h</span>
									<div
										className="bg-gray-400"
										style={{ width: 1, alignSelf: "stretch" }}
									/>
									<PrecipitationIcon size={statIconSize} />
									<span className={rowTempClass}>{day.precipitation} mm</span>
								</div>
							)}
						</div>
					))}
				</div>

				{/* Footer */}
				<div
					className={`flex ${footerClass} items-center text-white rounded-lg bg-gray-500`}
					style={{ margin: `0 ${sideMargin}px ${sideMargin}px` }}
				>
					<span className="font-inter">{location}</span>
					{lastUpdated && <span className="font-inter">Updated: {lastUpdated}</span>}
				</div>
			</div>
		</PreSatori>
	);
}
