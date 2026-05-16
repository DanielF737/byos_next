import { PreSatori } from "@/utils/pre-satori";
import type { CalendarData } from "./getData";

interface IcsCalendarProps extends Partial<CalendarData> {
	width?: number;
	height?: number;
}

function formatTime(isoString: string): string {
	return new Date(isoString).toLocaleTimeString("en-US", {
		hour: "numeric",
		minute: "2-digit",
		hour12: true,
	});
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

// Computes the pixel width for the time column based on actual available column content width.
// Time is always rendered at text-xs (~12px Inter). Thresholds are derived from estimated
// character widths: "12:00 AM – 12:00 PM" ≈ 124px; "12:00 AM –" ≈ 68px.
function getTimeColumnWidth(
	totalWidth: number,
	colCount: number,
	padding: string,
): string {
	const paddingPx = padding === "p-2" ? 8 : 4;
	const separatorsPx = 2 * Math.max(0, colCount - 1);
	const colContentWidth =
		Math.floor((totalWidth - separatorsPx) / colCount) - paddingPx * 2;

	// If the column is wide enough to fit the full time range on one line (124px)
	// and still leave at least 60px for the event title, use single-line width.
	return colContentWidth >= 184 ? "124px" : "68px";
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
							const timeColWidth = getTimeColumnWidth(
								width,
								columns.length,
								padding,
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
														{group.events.map((event, ei) => {
															const startStr = event.allDay
																? null
																: formatTime(event.start);
															const endStr =
																event.allDay ||
																!event.end ||
																event.start === event.end
																	? null
																	: formatTime(event.end);
															const isRange =
																endStr !== null && endStr !== startStr;

															return (
																<div
																	key={ei}
																	className="flex flex-row leading-tight"
																	style={{ paddingTop: "2px" }}
																>
																	<span
																		className="text-xs leading-tight"
																		style={{
																			width: timeColWidth,
																			flexShrink: 0,
																			flexWrap: "wrap",
																			alignContent: "flex-start",
																			columnGap: "3px",
																		}}
																	>
																		{event.allDay ? (
																			<span style={{ whiteSpace: "nowrap" }}>
																				all day
																			</span>
																		) : isRange ? (
																			<>
																				<span
																					style={{ whiteSpace: "nowrap" }}
																				>
																					{startStr} –
																				</span>
																				<span
																					style={{ whiteSpace: "nowrap" }}
																				>
																					{endStr}
																				</span>
																			</>
																		) : (
																			<span style={{ whiteSpace: "nowrap" }}>
																				{startStr}
																			</span>
																		)}
																	</span>
																	<span
																		className={`${body} leading-tight`}
																		style={{ flex: 1, paddingLeft: "4px" }}
																	>
																		{event.title}
																	</span>
																</div>
															);
														})}
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
