export interface IGlobalTimeStoreState {
	/**
	 * The selected time range, can be:
	 * - Relative duration: '1m', '5m', '15m', '1h', '1d', etc.
	 * - Custom range: '<minTimeUnixNano>||_||<maxTimeUnixNano>' format
	 */
	selectedTime: string;

	/**
	 * Whether auto-refresh is enabled.
	 * Automatically computed: true for duration-based times, false for custom ranges.
	 */
	isRefreshEnabled: boolean;

	/**
	 * The refresh interval in milliseconds (e.g., 5000 for 5s, 30000 for 30s)
	 * Only used when isRefreshEnabled is true
	 */
	refreshInterval: number;
}

export interface ParsedTimeRange {
	minTime: number;
	maxTime: number;
}

export interface IGlobalTimeStoreActions {
	/**
	 * Set the selected time and optionally the refresh interval.
	 * isRefreshEnabled is automatically computed:
	 * - Custom time ranges: always false
	 * - Duration times with refreshInterval > 0: true
	 * - Duration times with refreshInterval = 0: false
	 */
	setSelectedTime: (selectedTime: string, refreshInterval?: number) => void;

	/**
	 * Get the current min/max time values parsed from selectedTime.
	 * For durations, computes fresh values based on Date.now().
	 * For custom ranges, extracts the stored values.
	 */
	getMinMaxTime: () => { minTime: number; maxTime: number };
}
