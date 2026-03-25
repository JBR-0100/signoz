import { useCallback, useMemo } from 'react';
import { useInfiniteQuery } from 'react-query';
import { ENTITY_VERSION_V5 } from 'constants/app';
import { DEFAULT_PER_PAGE_VALUE } from 'container/Controls/config';
import { GetMetricQueryRange } from 'lib/dashboard/getQueryResults';
import { ILog } from 'types/api/logs/log';

import { getHostLogsQueryPayload } from './constants';

export function useInfiniteHostMetricLogs({
	expression,
	startTime,
	endTime,
}: {
	expression: string;
	startTime: number;
	endTime: number;
}): {
	logs: ILog[];
	isLoading: boolean;
	isFetching: boolean;
	isFetchingNextPage: boolean;
	isError: boolean;
	hasNextPage: boolean;
	loadMoreLogs: () => void;
} {
	const {
		data,
		isLoading,
		isFetching,
		isFetchingNextPage,
		isError,
		hasNextPage,
		fetchNextPage,
	} = useInfiniteQuery({
		queryKey: ['hostMetricsLogs', startTime, endTime, expression],
		queryFn: async ({ pageParam = 0 }) => {
			const { query } = getHostLogsQueryPayload({
				start: startTime,
				end: endTime,
				expression,
				offset: pageParam,
				pageSize: DEFAULT_PER_PAGE_VALUE,
			});
			return GetMetricQueryRange(query, ENTITY_VERSION_V5);
		},
		getNextPageParam: (lastPage, allPages) => {
			const list = lastPage?.payload?.data?.newResult?.data?.result?.[0]?.list;
			if (!list || list.length < DEFAULT_PER_PAGE_VALUE) {
				return undefined;
			}
			return allPages.length * DEFAULT_PER_PAGE_VALUE;
		},
		enabled: !!expression,
	});

	const logs = useMemo<ILog[]>(() => {
		if (!data?.pages) {
			return [];
		}

		return data.pages.flatMap((page) => {
			const list = page?.payload?.data?.newResult?.data?.result?.[0]?.list;
			if (!list) {
				return [];
			}

			return list.map(
				(item) =>
					({
						...item.data,
						timestamp: item.timestamp,
					} as ILog),
			);
		});
	}, [data?.pages]);

	const loadMoreLogs = useCallback(() => {
		if (hasNextPage && !isFetchingNextPage) {
			fetchNextPage();
		}
	}, [hasNextPage, isFetchingNextPage, fetchNextPage]);

	return {
		logs,
		isLoading,
		isFetching,
		isFetchingNextPage,
		isError,
		hasNextPage: !!hasNextPage,
		loadMoreLogs,
	};
}
