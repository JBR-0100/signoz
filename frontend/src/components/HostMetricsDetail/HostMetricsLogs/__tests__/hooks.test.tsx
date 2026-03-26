import { QueryClient, QueryClientProvider } from 'react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ENVIRONMENT } from 'constants/env';
import { server } from 'mocks-server/server';
import { rest } from 'msw';

import { useInfiniteHostMetricLogs } from '../hooks';

const QUERY_RANGE_URL = `${ENVIRONMENT.baseURL}/api/v5/query_range`;

const createLogsResponse = ({
	offset = 0,
	pageSize = 100,
	hasMore = true,
}: {
	offset?: number;
	pageSize?: number;
	hasMore?: boolean;
}): any => {
	const itemsForThisPage = hasMore ? pageSize : pageSize / 2;

	return {
		data: {
			type: 'raw',
			data: {
				results: [
					{
						queryName: 'A',
						rows: Array.from({ length: itemsForThisPage }, (_, index) => {
							const cumulativeIndex = offset + index;
							return {
								timestamp: new Date(Date.now() - cumulativeIndex * 1000).toISOString(),
								data: {
									body: `Log message ${cumulativeIndex}`,
									id: `log-${cumulativeIndex}`,
									severity_text: 'INFO',
								},
							};
						}),
					},
				],
			},
		},
	};
};

const createEmptyResponse = (): any => ({
	data: {
		type: 'raw',
		data: {
			results: [
				{
					queryName: 'A',
					rows: [],
				},
			],
		},
	},
});

const createWrapper = (): React.FC<{ children: React.ReactNode }> => {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				retry: false,
			},
		},
	});

	return function Wrapper({
		children,
	}: {
		children: React.ReactNode;
	}): JSX.Element {
		return (
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		);
	};
};

describe('useInfiniteHostMetricLogs', () => {
	const defaultParams = {
		expression: 'host_name = "test-host"',
		startTime: 1708000000,
		endTime: 1708003600,
	};

	describe('initial state', () => {
		it('should return initial loading state', () => {
			server.use(
				rest.post(QUERY_RANGE_URL, (_, res, ctx) =>
					res(ctx.delay(100), ctx.status(200), ctx.json(createLogsResponse({}))),
				),
			);

			const { result } = renderHook(
				() => useInfiniteHostMetricLogs(defaultParams),
				{
					wrapper: createWrapper(),
				},
			);

			expect(result.current.isLoading).toBe(true);
			expect(result.current.logs).toEqual([]);
		});
	});

	describe('successful data fetching', () => {
		it('should return logs after successful fetch', async () => {
			server.use(
				rest.post(QUERY_RANGE_URL, (_, res, ctx) =>
					res(ctx.status(200), ctx.json(createLogsResponse({ pageSize: 5 }))),
				),
			);

			const { result } = renderHook(
				() => useInfiniteHostMetricLogs(defaultParams),
				{
					wrapper: createWrapper(),
				},
			);

			await waitFor(() => {
				expect(result.current.isLoading).toBe(false);
			});

			expect(result.current.logs.length).toBe(5);
			expect(result.current.isError).toBe(false);
		});

		it('should set hasNextPage based on response size', async () => {
			server.use(
				rest.post(QUERY_RANGE_URL, (_, res, ctx) =>
					res(
						ctx.status(200),
						ctx.json(createLogsResponse({ pageSize: 100, hasMore: true })),
					),
				),
			);

			const { result } = renderHook(
				() => useInfiniteHostMetricLogs(defaultParams),
				{
					wrapper: createWrapper(),
				},
			);

			await waitFor(() => {
				expect(result.current.isLoading).toBe(false);
			});

			expect(result.current.hasNextPage).toBe(true);
		});

		it('should not have next page when response is smaller than page size', async () => {
			server.use(
				rest.post(QUERY_RANGE_URL, (_, res, ctx) =>
					res(
						ctx.status(200),
						ctx.json(createLogsResponse({ pageSize: 100, hasMore: false })),
					),
				),
			);

			const { result } = renderHook(
				() => useInfiniteHostMetricLogs(defaultParams),
				{
					wrapper: createWrapper(),
				},
			);

			await waitFor(() => {
				expect(result.current.isLoading).toBe(false);
			});

			expect(result.current.hasNextPage).toBe(false);
		});
	});

	describe('empty state', () => {
		it('should return empty logs array when no data', async () => {
			server.use(
				rest.post(QUERY_RANGE_URL, (_, res, ctx) =>
					res(ctx.status(200), ctx.json(createEmptyResponse())),
				),
			);

			const { result } = renderHook(
				() => useInfiniteHostMetricLogs(defaultParams),
				{
					wrapper: createWrapper(),
				},
			);

			await waitFor(() => {
				expect(result.current.isLoading).toBe(false);
			});

			expect(result.current.logs).toEqual([]);
			expect(result.current.hasNextPage).toBe(false);
		});
	});

	describe('error handling', () => {
		it('should set isError on API failure', async () => {
			server.use(
				rest.post(QUERY_RANGE_URL, (_, res, ctx) =>
					res(ctx.status(500), ctx.json({ error: 'Internal Server Error' })),
				),
			);

			const { result } = renderHook(
				() => useInfiniteHostMetricLogs(defaultParams),
				{
					wrapper: createWrapper(),
				},
			);

			await waitFor(() => {
				expect(result.current.isError).toBe(true);
			});

			expect(result.current.logs).toEqual([]);
		});
	});

	describe('query disabled state', () => {
		it('should not fetch when expression is empty', async () => {
			const requestCount = { count: 0 };

			server.use(
				rest.post(QUERY_RANGE_URL, (_, res, ctx) => {
					requestCount.count += 1;
					return res(ctx.status(200), ctx.json(createLogsResponse({})));
				}),
			);

			const { result } = renderHook(
				() =>
					useInfiniteHostMetricLogs({
						...defaultParams,
						expression: '',
					}),
				{
					wrapper: createWrapper(),
				},
			);

			// Wait a bit to ensure no request is made
			await new Promise((resolve) => {
				setTimeout(resolve, 300);
			});

			expect(requestCount.count).toBe(0);
			expect(result.current.isLoading).toBe(false);
		});
	});

	describe('load more functionality', () => {
		it('should fetch next page when loadMoreLogs is called', async () => {
			const requestCount = { count: 0 };

			server.use(
				rest.post(QUERY_RANGE_URL, (_, res, ctx) => {
					requestCount.count += 1;
					if (requestCount.count === 1) {
						return res(
							ctx.status(200),
							ctx.json(
								createLogsResponse({ offset: 0, pageSize: 100, hasMore: true }),
							),
						);
					}

					return res(
						ctx.status(200),
						ctx.json(
							createLogsResponse({ offset: 100, pageSize: 100, hasMore: false }),
						),
					);
				}),
			);

			const { result } = renderHook(
				() => useInfiniteHostMetricLogs(defaultParams),
				{
					wrapper: createWrapper(),
				},
			);

			await waitFor(() => {
				expect(result.current.isLoading).toBe(false);
			});

			expect(result.current.logs.length).toBe(100);
			expect(result.current.hasNextPage).toBe(true);
			expect(requestCount.count).toBe(1);

			act(() => {
				result.current.loadMoreLogs();
			});

			await waitFor(() => {
				expect(result.current.logs.length).toBe(150);
			});

			expect(result.current.hasNextPage).toBe(false);
			expect(requestCount.count).toBe(2);
		});
	});
});
