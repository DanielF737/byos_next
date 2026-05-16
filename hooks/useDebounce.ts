import { useCallback, useRef } from "react";

export function useDebounce<T extends unknown[]>(
	fn: (...args: T) => void,
	delay: number,
): (...args: T) => void {
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const fnRef = useRef(fn);
	fnRef.current = fn;

	return useCallback(
		(...args: T) => {
			if (timerRef.current) clearTimeout(timerRef.current);
			timerRef.current = setTimeout(() => fnRef.current(...args), delay);
		},
		[delay],
	);
}
