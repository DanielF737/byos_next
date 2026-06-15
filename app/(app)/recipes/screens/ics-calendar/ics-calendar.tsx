import { PreSatori } from "@/utils/pre-satori";
import type { CalendarData } from "./getData";

interface IcsCalendarProps extends Partial<CalendarData> {
	width?: number;
	height?: number;
}

function formatTime(isoString: string, timeZone: string): string {
	return new Date(isoString).toLocaleTimeString("en-US", {
		timeZone,
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

export default function IcsCalendar({
	columns = [],
	fetchedAt = "",
	fontSize = "medium",
	timeZone = "UTC",
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
							const paddingPx = padding === "p-2" ? 8 : 4;
							const separatorsPx = 2 * Math.max(0, columns.length - 1);
							const colContentWidth =
								Math.floor((width - separatorsPx) / columns.length) -
								paddingPx * 2;
							const singleLine = colContentWidth >= 200;
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
												// Single grid for the entire column — all day groups
												// share the same auto time column so titles align
												// consistently across groups, not just within them.
												<div
													style={{
														display: "grid",
														gridTemplateColumns: "auto 1fr",
														columnGap: "4px",
														alignItems: "start",
													}}
												>
													{col.dayGroups.flatMap((group, gi) => {
														const dayLabel = (
															<div
																key={`label-${group.dateISO}`}
																className={`font-inter ${body} leading-tight`}
																style={{
																	gridColumn: "1 / -1",
																	paddingTop: gi > 0 ? "8px" : "0px",
																}}
															>
																{group.dateLabel}
															</div>
														);

														const eventCells = group.events.flatMap(
															(event, ei) => {
																const startStr = event.allDay
																	? null
																	: formatTime(event.start, timeZone);
																const endStr =
																	event.allDay ||
																	!event.end ||
																	event.start === event.end
																		? null
																		: formatTime(event.end, timeZone);
																const isRange =
																	endStr !== null && endStr !== startStr;

																return [
																	<span
																		key={`time-${group.dateISO}-${ei}`}
																		className="text-xs leading-tight"
																		style={{ paddingTop: "2px" }}
																	>
																		{event.allDay ? (
																			<span style={{ whiteSpace: "nowrap" }}>
																				all day
																			</span>
																		) : isRange && !singleLine ? (
																			<span
																				style={{
																					display: "flex",
																					flexDirection: "column",
																				}}
																			>
																				<span style={{ whiteSpace: "nowrap" }}>
																					{startStr} –
																				</span>
																				<span style={{ whiteSpace: "nowrap" }}>
																					{endStr}
																				</span>
																			</span>
																		) : isRange ? (
																			<span style={{ whiteSpace: "nowrap" }}>
																				{startStr} – {endStr}
																			</span>
																		) : (
																			<span style={{ whiteSpace: "nowrap" }}>
																				{startStr}
																			</span>
																		)}
																	</span>,
																	<span
																		key={`title-${group.dateISO}-${ei}`}
																		className={`${body} leading-tight`}
																		style={{ paddingTop: "2px" }}
																	>
																		{event.title}
																	</span>,
																];
															},
														);

														return [dayLabel, ...eventCells];
													})}
												</div>
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
						<span className="text-xs">
							Updated {fetchedAt} · {timeZone}
						</span>
					</div>
				)}
			</div>
		</PreSatori>
	);
}
