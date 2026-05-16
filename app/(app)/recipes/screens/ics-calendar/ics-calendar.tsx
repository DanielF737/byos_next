import { PreSatori } from "@/utils/pre-satori";
import type { CalendarData } from "./getData";

interface IcsCalendarProps extends Partial<CalendarData> {
	width?: number;
	height?: number;
}

function formatTime(isoString: string): string {
	return new Date(isoString)
		.toLocaleTimeString("en-US", {
			hour: "numeric",
			minute: "2-digit",
			hour12: true,
		})
		.replace(/ (AM|PM)$/, " $1");
}

function formatTimeRange(
	startISO: string,
	endISO: string,
	allDay: boolean,
): string {
	if (allDay) return "all day";
	if (!endISO || startISO === endISO) return formatTime(startISO);
	const startStr = formatTime(startISO);
	const endStr = formatTime(endISO);
	return startStr === endStr ? startStr : `${startStr} – ${endStr}`;
}

function getFontClasses(
	colCount: number,
	fontSize: string,
): { header: string; body: string; padding: string } {
	if (fontSize === "large") {
		if (colCount <= 2)
			return { header: "text-2xl", body: "text-base", padding: "p-2" };
		if (colCount === 3)
			return { header: "text-xl", body: "text-sm", padding: "p-2" };
		return { header: "text-lg", body: "text-xs", padding: "p-1" };
	}
	if (fontSize === "small") {
		if (colCount <= 2)
			return { header: "text-lg", body: "text-sm", padding: "p-2" };
		if (colCount === 3)
			return { header: "text-base", body: "text-xs", padding: "p-1" };
		return { header: "text-sm", body: "text-xs", padding: "p-1" };
	}
	// medium (default)
	if (colCount <= 2)
		return { header: "text-xl", body: "text-sm", padding: "p-2" };
	if (colCount === 3)
		return { header: "text-lg", body: "text-xs", padding: "p-2" };
	return { header: "text-base", body: "text-xs", padding: "p-1" };
}

function getTimeColumnWidth(colCount: number, fontSize: string): string {
	// Time is always text-xs, but at large font sizes fewer columns fit comfortably
	// so we start wrapping the time range earlier (at 2 cols instead of 3).
	if (fontSize === "large") {
		if (colCount <= 1) return "135px";
		return "70px";
	}
	if (fontSize === "small") {
		if (colCount <= 3) return "135px";
		return "65px";
	}
	// medium
	if (colCount <= 2) return "135px";
	if (colCount === 3) return "70px";
	return "65px";
}

export default function IcsCalendar({
	columns = [],
	fetchedAt = "",
	fontSize = "medium",
	width = 800,
	height = 480,
}: IcsCalendarProps) {
	return (
		<PreSatori width={width} height={height}>
			<div className="flex flex-col w-full h-full bg-white text-black">
				<div className="flex-1 flex flex-row">
					{columns.length === 0 ? (
						<div className="flex-1 flex items-center justify-center text-2xl font-blockkie">
							No calendars configured
						</div>
					) : (
						columns.map((col, i) => {
							const { header, body, padding } = getFontClasses(
								columns.length,
								fontSize,
							);
							return (
								<div key={col.name || i} className="flex-1 flex flex-row">
									{i > 0 && (
										<div className="bg-black" style={{ width: "2px" }} />
									)}
									<div className="flex-1 flex flex-col">
										<div
											className={`bg-black text-white ${padding} font-blockkie ${header} leading-tight`}
										>
											{col.name}
										</div>
										<div className={`flex-1 ${padding}`}>
											{col.error ? (
												<div className={body}>Error: {col.error}</div>
											) : col.dayGroups.length === 0 ? (
												<div className={body}>No upcoming events</div>
											) : (
												col.dayGroups.map((group, gi) => (
													<div
														key={group.dateISO}
														style={{ paddingTop: gi > 0 ? "8px" : "0px" }}
													>
														<div className={`font-inter ${body} leading-tight`}>
															{group.dateLabel}
														</div>
														{group.events.map((event, ei) => (
															<div
																key={ei}
																className="flex flex-row leading-tight"
																style={{ paddingTop: "2px" }}
															>
																<span
																	className="text-xs leading-tight"
																	style={{
																		width: getTimeColumnWidth(columns.length, fontSize),
																		flexShrink: 0,
																	}}
																>
																	{formatTimeRange(
																		event.start,
																		event.end,
																		event.allDay,
																	)}
																</span>
																<span
																	className={`${body} leading-tight`}
																	style={{ flex: 1, paddingLeft: "4px" }}
																>
																	{event.title}
																</span>
															</div>
														))}
													</div>
												))
											)}
										</div>
									</div>
								</div>
							);
						})
					)}
				</div>

				{fetchedAt && (
					<div className="bg-black text-white px-2 py-1 flex flex-row justify-end">
						<span className="text-xs">Updated {fetchedAt}</span>
					</div>
				)}
			</div>
		</PreSatori>
	);
}
