import { Time } from 'container/TopNav/DateTimeSelectionV2/types';
import { getMinMaxForSelectedTime } from 'lib/getMinMax';

import { ParsedTimeRange } from './types';

/**
 * Custom time range separator used in the selectedTime string
 */
export const CUSTOM_TIME_SEPARATOR = '||_||';

/**
 * Check if selectedTime represents a custom time range
 */
export function isCustomTimeRange(selectedTime: string): boolean {
	return selectedTime.includes(CUSTOM_TIME_SEPARATOR);
}

/**
 * Create a custom time range string from min/max times (in nanoseconds)
 */
export function createCustomTimeRange(
	minTime: number,
	maxTime: number,
): string {
	return `${minTime}${CUSTOM_TIME_SEPARATOR}${maxTime}`;
}

/**
 * Parse the custom time range string to get min/max times (in nanoseconds)
 */
export function parseCustomTimeRange(
	selectedTime: string,
): ParsedTimeRange | null {
	if (!isCustomTimeRange(selectedTime)) {
		return null;
	}

	const [minStr, maxStr] = selectedTime.split(CUSTOM_TIME_SEPARATOR);
	const minTime = parseInt(minStr, 10);
	const maxTime = parseInt(maxStr, 10);

	if (Number.isNaN(minTime) || Number.isNaN(maxTime)) {
		return null;
	}

	return { minTime, maxTime };
}

const fallbackDuration = 30 * 1000 * 1000000; // 30s

/**
 * Parse the selectedTime string to get min/max time values.
 * For relative times, computes fresh values based on Date.now().
 * For custom times, extracts the stored min/max values.
 */
export function parseSelectedTime(selectedTime: string): ParsedTimeRange {
	if (isCustomTimeRange(selectedTime)) {
		const parsed = parseCustomTimeRange(selectedTime);
		if (parsed) {
			return parsed;
		}
		// Fallback to current time if parsing fails
		const now = Date.now() * 1000000;
		return { minTime: now - fallbackDuration, maxTime: now };
	}

	// It's a relative time like '15m', '1h', etc.
	// Use getMinMaxForSelectedTime which computes from Date.now()
	return getMinMaxForSelectedTime(selectedTime as Time, 0, 0);
}
