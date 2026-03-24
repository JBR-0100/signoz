import { create } from 'zustand';

import { IGlobalTimeStoreActions, IGlobalTimeStoreState } from './types';
import { isCustomTimeRange, parseSelectedTime } from './utils';

export type IGlobalTimeStore = IGlobalTimeStoreState & IGlobalTimeStoreActions;

export const useGlobalTimeStore = create<IGlobalTimeStore>((set, get) => ({
	// Initial state
	selectedTime: '30s',
	isRefreshEnabled: false,
	refreshInterval: 0,

	// Actions
	setSelectedTime: (selectedTime, refreshInterval): void => {
		set((state) => {
			const newRefreshInterval = refreshInterval ?? state.refreshInterval;
			const isCustom = isCustomTimeRange(selectedTime);

			return {
				selectedTime,
				refreshInterval: newRefreshInterval,
				isRefreshEnabled: !isCustom && newRefreshInterval > 0,
			};
		});
	},

	getMinMaxTime: (): { minTime: number; maxTime: number } => {
		const { selectedTime } = get();
		return parseSelectedTime(selectedTime);
	},
}));
