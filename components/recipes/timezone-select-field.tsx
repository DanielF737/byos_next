"use client";

import { Check, ChevronsUpDown, Clock } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface TimeZoneSelectFieldProps {
	id: string;
	value: unknown;
	/**
	 * Zone the recipe falls back to when no value is set. Resolved on the server
	 * (where the data fetch runs) and passed down so the form shows what "default"
	 * actually means.
	 */
	serverTimeZone: string;
	onChange: (value: string) => void;
}

const SERVER_DEFAULT = "";

/** Full IANA list, straight from the runtime — no hardcoded table to maintain. */
function getTimeZones(): string[] {
	try {
		return Intl.supportedValuesOf("timeZone");
	} catch {
		return [];
	}
}

export function TimeZoneSelectField({
	id,
	value,
	serverTimeZone,
	onChange,
}: TimeZoneSelectFieldProps) {
	const [open, setOpen] = useState(false);
	const zones = useMemo(getTimeZones, []);
	const current = typeof value === "string" ? value : SERVER_DEFAULT;

	const defaultLabel = `Server default (${serverTimeZone})`;
	const triggerLabel = current === SERVER_DEFAULT ? defaultLabel : current;

	const handleSelect = (next: string) => {
		onChange(next);
		setOpen(false);
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					id={id}
					type="button"
					variant="outline"
					role="combobox"
					aria-expanded={open}
					className="h-9 w-full justify-between font-normal"
				>
					<span className="flex items-center gap-2 truncate">
						<Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
						<span className="truncate">{triggerLabel}</span>
					</span>
					<ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				className="w-[--radix-popover-trigger-width] p-0"
				align="start"
			>
				<Command>
					<CommandInput placeholder="Search time zones…" />
					<CommandList>
						<CommandEmpty>No time zones found.</CommandEmpty>
						<CommandGroup>
							<CommandItem
								value={defaultLabel}
								onSelect={() => handleSelect(SERVER_DEFAULT)}
								className="cursor-pointer"
							>
								<Check
									className={cn(
										"mr-2 h-3.5 w-3.5",
										current === SERVER_DEFAULT ? "opacity-100" : "opacity-0",
									)}
								/>
								{defaultLabel}
							</CommandItem>
							{zones.map((zone) => (
								<CommandItem
									key={zone}
									value={zone}
									onSelect={() => handleSelect(zone)}
									className="cursor-pointer"
								>
									<Check
										className={cn(
											"mr-2 h-3.5 w-3.5",
											current === zone ? "opacity-100" : "opacity-0",
										)}
									/>
									{zone}
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
