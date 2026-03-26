import { VirtuosoMockContext } from 'react-virtuoso';
import { ENVIRONMENT } from 'constants/env';
import { server } from 'mocks-server/server';
import { rest } from 'msw';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { act, render, screen, userEvent, waitFor } from 'tests/test-utils';

import HostMetricsLogs from '../HostMetricsLogs';

jest.mock('react-virtuoso', () => {
	const actual = jest.requireActual('react-virtuoso');
	return {
		...actual,
		Virtuoso: ({
			data,
			itemContent,
			endReached,
			components,
			className,
		}: {
			data?: any[];
			itemContent?: (index: number, item: any) => React.ReactNode;
			endReached?: (index: number) => void;
			components?: { Footer?: React.ComponentType };
			className?: string;
		}): JSX.Element => (
			<div data-testid="virtuoso-mock" className={className}>
				{Array.isArray(data) &&
					data.map((item, index) => (
						<div key={item?.id ?? index} data-testid={`virtuoso-item-${index}`}>
							{itemContent?.(index, item)}
						</div>
					))}
				<button
					type="button"
					data-testid="virtuoso-end-reached"
					onClick={(): void => endReached?.((data?.length || 0) - 1)}
				>
					endReached
				</button>
				{components?.Footer ? <components.Footer /> : null}
			</div>
		),
	};
});

const QUERY_RANGE_URL = `${ENVIRONMENT.baseURL}/api/v5/query_range`;
const FIELDS_KEYS_URL = `${ENVIRONMENT.baseURL}/api/v1/fields/keys`;
const FIELDS_VALUES_URL = `${ENVIRONMENT.baseURL}/api/v1/fields/values`;

// Creates a V5 API response structure for raw logs data
// The API response is wrapped in { data: { type: '...', data: { results: [...] } } }
const createLogsResponse = ({
	offset = 0,
	pageSize = 100,
	hasMore = true,
}: {
	offset?: number;
	pageSize?: number;
	hasMore?: boolean;
}): any => {
	const itemsForThisPage = hasMore ? pageSize : Math.min(pageSize / 2, 10);

	return {
		data: {
			type: 'raw',
			data: {
				results: [
					{
						queryName: 'A',
						rows: Array.from({ length: itemsForThisPage }, (_, index) => {
							const cumulativeIndex = offset + index;
							const baseTimestamp = new Date('2024-02-15T21:20:22Z').getTime();
							const currentTimestamp = new Date(
								baseTimestamp - cumulativeIndex * 1000,
							);
							const timestampString = currentTimestamp.toISOString();
							const id = `log-id-${cumulativeIndex}`;
							const logLevel = ['INFO', 'WARN', 'ERROR'][cumulativeIndex % 3];
							const service = ['frontend', 'backend', 'database'][cumulativeIndex % 3];

							return {
								timestamp: timestampString,
								data: {
									attributes_bool: {},
									attributes_float64: {},
									attributes_int64: {},
									attributes_string: {
										host_name: 'test-host',
										log_level: logLevel,
										service,
									},
									body: `${timestampString} ${logLevel} ${service} Log message ${cumulativeIndex}`,
									id,
									resources_string: {
										'host.name': 'test-host',
									},
									severity_number: [9, 13, 17][cumulativeIndex % 3],
									severity_text: logLevel,
									span_id: `span-${cumulativeIndex}`,
									trace_flags: 0,
									trace_id: `trace-${cumulativeIndex}`,
								},
							};
						}),
					},
				],
			},
		},
	};
};

const createEmptyLogsResponse = (): any => ({
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

const defaultProps = {
	initialExpression: 'host_name = "test-host"',
	timeRange: {
		startTime: 1708000000,
		endTime: 1708003600,
	},
	isModalTimeSelection: false,
	handleTimeChange: jest.fn(),
	selectedInterval: '15m' as const,
};

// Mock OverlayScrollbar to avoid scroll behavior issues in tests
jest.mock('components/OverlayScrollbar/OverlayScrollbar', () => ({
	__esModule: true,
	default: ({ children }: { children: React.ReactNode }): JSX.Element => (
		<div>{children}</div>
	),
}));

jest.mock('container/TopNav/DateTimeSelectionV2/index.tsx', () => ({
	__esModule: true,
	default: ({
		onTimeChange,
	}: {
		onTimeChange?: (interval: string, dateTimeRange?: [number, number]) => void;
	}): JSX.Element => {
		return (
			<div className="datetime-section" data-testid="datetime-selection">
				<button
					data-testid="time-picker-btn"
					onClick={(): void => {
						onTimeChange?.('5m');
					}}
				>
					Select Time
				</button>
			</div>
		);
	},
}));

const createFieldKeysResponse = (): any => ({
	status: 'success',
	data: {
		complete: true,
		keys: {},
	},
});

const createFieldValuesResponse = (): any => ({
	status: 'success',
	data: {
		values: {
			stringValues: [],
			numberValues: [],
			boolValues: [],
		},
	},
});

const renderComponent = (
	props = defaultProps,
	searchParams?: Record<string, string>,
): ReturnType<typeof render> =>
	render(
		<NuqsTestingAdapter searchParams={searchParams} hasMemory>
			<VirtuosoMockContext.Provider
				value={{ viewportHeight: 600, itemHeight: 50 }}
			>
				<HostMetricsLogs {...props} />
			</VirtuosoMockContext.Provider>
		</NuqsTestingAdapter>,
	);

describe('HostMetricsLogs', () => {
	beforeEach(() => {
		window.history.pushState({}, 'Test', '/');
		server.use(
			rest.get(FIELDS_KEYS_URL, (_, res, ctx) =>
				res(ctx.status(200), ctx.json(createFieldKeysResponse())),
			),
			rest.get(FIELDS_VALUES_URL, (_, res, ctx) =>
				res(ctx.status(200), ctx.json(createFieldValuesResponse())),
			),
		);
	});

	describe('loading state', () => {
		it('should show loading state while fetching logs', async () => {
			let resolveRequest: (value: any) => void;
			const pendingPromise = new Promise((resolve) => {
				resolveRequest = resolve;
			});

			server.use(
				rest.post(QUERY_RANGE_URL, async (_, res, ctx) => {
					await pendingPromise;
					return res(ctx.status(200), ctx.json(createLogsResponse({})));
				}),
			);

			renderComponent();

			expect(screen.getByText('pending_data_placeholder')).toBeInTheDocument();

			act(() => {
				resolveRequest!(true);
			});
		});
	});

	describe('empty state', () => {
		it('should show no logs message when no logs are returned', async () => {
			server.use(
				rest.post(QUERY_RANGE_URL, (_, res, ctx) =>
					res(ctx.status(200), ctx.json(createEmptyLogsResponse())),
				),
			);

			renderComponent();

			await waitFor(() => {
				expect(
					screen.getByText(/No logs found for this host/i),
				).toBeInTheDocument();
			});
		});
	});

	describe('error state', () => {
		it('should show error state when API returns error', async () => {
			server.use(
				rest.post(QUERY_RANGE_URL, (_, res, ctx) =>
					res(ctx.status(500), ctx.json({ error: 'Internal Server Error' })),
				),
			);

			renderComponent();

			await waitFor(() => {
				expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
			});
		});
	});

	describe('success state', () => {
		it('should render logs when API returns data', async () => {
			server.use(
				rest.post(QUERY_RANGE_URL, (_, res, ctx) =>
					res(ctx.status(200), ctx.json(createLogsResponse({ pageSize: 5 }))),
				),
			);

			renderComponent();

			await waitFor(() => {
				expect(screen.getByText(/Log message 0/)).toBeInTheDocument();
			});
		});

		it('should render initial expression in QuerySearch editor', async () => {
			server.use(
				rest.post(QUERY_RANGE_URL, (_, res, ctx) =>
					res(ctx.status(200), ctx.json(createLogsResponse({ pageSize: 5 }))),
				),
			);

			renderComponent();

			await waitFor(() => {
				const editorText =
					document.querySelector('.query-where-clause-editor')?.textContent || '';
				expect(editorText).toContain('host_name');
				expect(editorText).toContain('test-host');
			});
		});

		it('should render the filter section', async () => {
			server.use(
				rest.post(QUERY_RANGE_URL, (_, res, ctx) =>
					res(ctx.status(200), ctx.json(createLogsResponse({ pageSize: 5 }))),
				),
			);

			renderComponent();

			await waitFor(() => {
				expect(
					document.querySelector('.code-mirror-where-clause'),
				).toBeInTheDocument();
			});
		});

		it('should render date time selection component', async () => {
			server.use(
				rest.post(QUERY_RANGE_URL, (_, res, ctx) =>
					res(ctx.status(200), ctx.json(createLogsResponse({ pageSize: 5 }))),
				),
			);

			renderComponent();

			await waitFor(() => {
				// DateTimeSelectionV2 renders a time picker button
				expect(document.querySelector('.datetime-section')).toBeInTheDocument();
			});
		});
	});

	describe('pagination', () => {
		it('should send correct offset for pagination', async () => {
			const requestPayloads: any[] = [];

			server.use(
				rest.post(QUERY_RANGE_URL, async (req, res, ctx) => {
					const payload = await req.json();
					requestPayloads.push(payload);

					const querySpec = payload.compositeQuery?.queries?.[0]?.spec;
					const offset = querySpec?.offset ?? 0;

					return res(
						ctx.status(200),
						ctx.json(
							createLogsResponse({
								offset,
								pageSize: 100,
								hasMore: offset === 0,
							}),
						),
					);
				}),
			);

			renderComponent();

			await waitFor(() => {
				expect(requestPayloads.length).toBeGreaterThanOrEqual(1);
			});

			const firstPayload = requestPayloads[0];
			const querySpec = firstPayload.compositeQuery?.queries?.[0]?.spec;
			expect(querySpec?.offset).toBe(0);
		});

		it('should fetch next page when virtuoso endReached is triggered', async () => {
			const requestPayloads: any[] = [];

			server.use(
				rest.post(QUERY_RANGE_URL, async (req, res, ctx) => {
					const payload = await req.json();
					requestPayloads.push(payload);

					const querySpec = payload.compositeQuery?.queries?.[0]?.spec;
					const offset = querySpec?.offset ?? 0;

					return res(
						ctx.status(200),
						ctx.json(
							createLogsResponse({
								offset,
								pageSize: 100,
								hasMore: offset === 0,
							}),
						),
					);
				}),
			);

			renderComponent();

			await waitFor(() => {
				expect(screen.getByText(/Log message 0/)).toBeInTheDocument();
			});

			expect(requestPayloads[0]?.compositeQuery?.queries?.[0]?.spec?.offset).toBe(
				0,
			);

			await userEvent.click(screen.getByTestId('virtuoso-end-reached'));

			await waitFor(() => {
				expect(requestPayloads.length).toBeGreaterThanOrEqual(2);
			});

			expect(requestPayloads[1]?.compositeQuery?.queries?.[0]?.spec?.offset).toBe(
				100,
			);
		});
	});

	describe('filter expression', () => {
		it('should include initial expression in the query', async () => {
			const requestPayloads: any[] = [];

			server.use(
				rest.post(QUERY_RANGE_URL, async (req, res, ctx) => {
					const payload = await req.json();
					requestPayloads.push(payload);

					return res(ctx.status(200), ctx.json(createLogsResponse({ pageSize: 5 })));
				}),
			);

			renderComponent();

			await waitFor(() => {
				expect(requestPayloads.length).toBeGreaterThanOrEqual(1);
			});

			const firstPayload = requestPayloads[0];
			const querySpec = firstPayload.compositeQuery?.queries?.[0]?.spec;

			expect(querySpec?.filter?.expression).toContain('host_name = "test-host"');
		});

		it('should load expression from URL and persist it in the query', async () => {
			const requestPayloads: any[] = [];

			server.use(
				rest.post(QUERY_RANGE_URL, async (req, res, ctx) => {
					const payload = await req.json();
					requestPayloads.push(payload);

					const querySpec = payload.compositeQuery?.queries?.[0]?.spec;
					const offset = querySpec?.offset ?? 0;

					return res(
						ctx.status(200),
						ctx.json(
							createLogsResponse({
								offset,
								pageSize: 100,
								hasMore: offset === 0,
							}),
						),
					);
				}),
			);

			const urlExpression = 'service = "from-url"';

			renderComponent(defaultProps, { hostMetricsLogsExpr: urlExpression });

			await waitFor(() => {
				expect(requestPayloads.length).toBeGreaterThanOrEqual(1);
			});

			expect(
				requestPayloads[0]?.compositeQuery?.queries?.[0]?.spec?.filter?.expression,
			).toContain(urlExpression);

			await userEvent.click(screen.getByTestId('virtuoso-end-reached'));

			await waitFor(() => {
				expect(requestPayloads.length).toBeGreaterThanOrEqual(2);
			});

			expect(
				requestPayloads[1]?.compositeQuery?.queries?.[0]?.spec?.filter?.expression,
			).toContain(urlExpression);
		});

		it('should use custom expression when provided', async () => {
			const requestPayloads: any[] = [];

			server.use(
				rest.post(QUERY_RANGE_URL, async (req, res, ctx) => {
					const payload = await req.json();
					requestPayloads.push(payload);

					return res(ctx.status(200), ctx.json(createLogsResponse({ pageSize: 5 })));
				}),
			);

			const customExpression = 'service = "custom-service"';

			renderComponent({
				...defaultProps,
				initialExpression: customExpression,
			});

			// Wait for debounce and potential re-renders to settle
			await waitFor(
				() => {
					const hasCustomExpression = requestPayloads.some((payload) => {
						const querySpec = payload.compositeQuery?.queries?.[0]?.spec;
						return querySpec?.filter?.expression?.includes('custom-service');
					});
					expect(hasCustomExpression).toBe(true);
				},
				{ timeout: 2000 },
			);
		});
	});

	describe('time range', () => {
		it('should include correct time range in the query', async () => {
			const requestPayloads: any[] = [];

			server.use(
				rest.post(QUERY_RANGE_URL, async (req, res, ctx) => {
					const payload = await req.json();
					requestPayloads.push(payload);

					return res(ctx.status(200), ctx.json(createLogsResponse({ pageSize: 5 })));
				}),
			);

			const customTimeRange = {
				startTime: 1700000000,
				endTime: 1700003600,
			};

			renderComponent({
				...defaultProps,
				timeRange: customTimeRange,
			});

			await waitFor(() => {
				expect(requestPayloads.length).toBeGreaterThanOrEqual(1);
			});

			const firstPayload = requestPayloads[0];

			// V5 API expects milliseconds (seconds * 1000)
			expect(firstPayload.start).toBe(customTimeRange.startTime * 1000);
			expect(firstPayload.end).toBe(customTimeRange.endTime * 1000);
		});
	});

	describe('query structure', () => {
		it('should send correct query structure to the API', async () => {
			const requestPayloads: any[] = [];

			server.use(
				rest.post(QUERY_RANGE_URL, async (req, res, ctx) => {
					const payload = await req.json();
					requestPayloads.push(payload);

					return res(ctx.status(200), ctx.json(createLogsResponse({ pageSize: 5 })));
				}),
			);

			renderComponent();

			await waitFor(() => {
				expect(requestPayloads.length).toBeGreaterThanOrEqual(1);
			});

			const firstPayload = requestPayloads[0];
			const querySpec = firstPayload.compositeQuery?.queries?.[0]?.spec;

			expect(querySpec?.signal).toBe('logs');
			expect(querySpec?.order).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						key: expect.objectContaining({ name: 'timestamp' }),
						direction: 'desc',
					}),
				]),
			);
		});

		it('should send request type as raw for logs list', async () => {
			const requestPayloads: any[] = [];

			server.use(
				rest.post(QUERY_RANGE_URL, async (req, res, ctx) => {
					const payload = await req.json();
					requestPayloads.push(payload);

					return res(ctx.status(200), ctx.json(createLogsResponse({ pageSize: 5 })));
				}),
			);

			renderComponent();

			await waitFor(() => {
				expect(requestPayloads.length).toBeGreaterThanOrEqual(1);
			});

			const firstPayload = requestPayloads[0];
			expect(firstPayload.requestType).toBe('raw');
		});

		it('should include pageSize in the query', async () => {
			const requestPayloads: any[] = [];

			server.use(
				rest.post(QUERY_RANGE_URL, async (req, res, ctx) => {
					const payload = await req.json();
					requestPayloads.push(payload);

					return res(ctx.status(200), ctx.json(createLogsResponse({ pageSize: 5 })));
				}),
			);

			renderComponent();

			await waitFor(() => {
				expect(requestPayloads.length).toBeGreaterThanOrEqual(1);
			});

			const firstPayload = requestPayloads[0];
			const querySpec = firstPayload.compositeQuery?.queries?.[0]?.spec;

			// Should have a limit set for pagination
			expect(querySpec?.limit).toBeDefined();
			expect(typeof querySpec?.limit).toBe('number');
		});
	});

	describe('component props', () => {
		it('should render datetime section with isModalTimeSelection', async () => {
			server.use(
				rest.post(QUERY_RANGE_URL, (_, res, ctx) =>
					res(ctx.status(200), ctx.json(createLogsResponse({ pageSize: 5 }))),
				),
			);

			renderComponent({
				...defaultProps,
				isModalTimeSelection: true,
			});

			await waitFor(() => {
				expect(document.querySelector('.datetime-section')).toBeInTheDocument();
			});
		});

		it('should render component with handleTimeChange', async () => {
			const mockHandleTimeChange = jest.fn();

			server.use(
				rest.post(QUERY_RANGE_URL, (_, res, ctx) =>
					res(ctx.status(200), ctx.json(createLogsResponse({ pageSize: 5 }))),
				),
			);

			renderComponent({
				...defaultProps,
				handleTimeChange: mockHandleTimeChange,
			});

			await waitFor(() => {
				expect(document.querySelector('.datetime-section')).toBeInTheDocument();
			});
		});
	});

	describe('log detail interactions', () => {
		it('should open log detail drawer when clicking on a log', async () => {
			server.use(
				rest.post(QUERY_RANGE_URL, (_, res, ctx) =>
					res(ctx.status(200), ctx.json(createLogsResponse({ pageSize: 5 }))),
				),
			);

			renderComponent();

			// Wait for logs to render
			await waitFor(() => {
				expect(screen.getByText(/Log message 0/)).toBeInTheDocument();
			});

			// Click on the first log
			const logElement = screen.getByText(/Log message 0/);
			await userEvent.click(logElement);

			// Log detail drawer should open - it contains "Log details" title
			await waitFor(() => {
				expect(screen.getByText('Log details')).toBeInTheDocument();
			});
		});

		it('should close log detail drawer when clicking on the same log again', async () => {
			server.use(
				rest.post(QUERY_RANGE_URL, (_, res, ctx) =>
					res(ctx.status(200), ctx.json(createLogsResponse({ pageSize: 5 }))),
				),
			);

			renderComponent();

			// Wait for logs to render
			await waitFor(() => {
				expect(screen.getByText(/Log message 0/)).toBeInTheDocument();
			});

			// Click on the first log to open
			const logElement = screen.getByText(/Log message 0/);
			await userEvent.click(logElement);

			// Wait for drawer to open
			await waitFor(() => {
				expect(screen.getByText('Log details')).toBeInTheDocument();
			});

			// Click on the same log to close (through the close button)
			const closeButton = document.querySelector('.ant-drawer-close');
			if (closeButton) {
				await userEvent.click(closeButton);
			}

			// Drawer should close
			await waitFor(() => {
				expect(screen.queryByText('Log details')).not.toBeInTheDocument();
			});
		});

		it('should display log body in detail drawer', async () => {
			server.use(
				rest.post(QUERY_RANGE_URL, (_, res, ctx) =>
					res(ctx.status(200), ctx.json(createLogsResponse({ pageSize: 5 }))),
				),
			);

			renderComponent();

			// Wait for logs to render
			await waitFor(() => {
				expect(screen.getByText(/Log message 0/)).toBeInTheDocument();
			});

			// Click on the first log to open drawer
			const logElement = screen.getByText(/Log message 0/);
			await userEvent.click(logElement);

			// Wait for drawer to open
			await waitFor(() => {
				expect(screen.getByText('Log details')).toBeInTheDocument();
			});

			// Verify the drawer tabs are displayed
			// The drawer should show the Overview tab
			await waitFor(() => {
				expect(screen.getByText('Overview')).toBeInTheDocument();
			});

			// Verify other tabs are present
			expect(screen.getByText('JSON')).toBeInTheDocument();
			expect(screen.getByText('Context')).toBeInTheDocument();
		});
	});

	describe('log detail filter actions', () => {
		it('should apply filter-in from log detail and close the drawer', async () => {
			const requestPayloads: any[] = [];

			server.use(
				rest.post(QUERY_RANGE_URL, async (req, res, ctx) => {
					const payload = await req.json();
					requestPayloads.push(payload);
					return res(ctx.status(200), ctx.json(createLogsResponse({ pageSize: 5 })));
				}),
			);

			renderComponent();

			await waitFor(() => {
				expect(screen.getByText(/Log message 0/)).toBeInTheDocument();
			});

			await userEvent.click(screen.getByText(/Log message 0/));

			await waitFor(() => {
				expect(screen.getByText('Log details')).toBeInTheDocument();
			});

			const serviceRow = await waitFor(() => {
				const attributeNameCells = Array.from(
					document.querySelectorAll('.attribute-name'),
				);
				const serviceCell = attributeNameCells.find((cell) =>
					(cell.textContent || '').toLowerCase().includes('service'),
				);
				const row = serviceCell?.closest('tr');
				if (!row) {
					throw new Error('Service attribute row not found');
				}
				return row;
			});

			const filterButtons = serviceRow.querySelectorAll('button.filter-btn');
			expect(filterButtons?.length).toBeGreaterThanOrEqual(2);

			await userEvent.click(filterButtons[0] as HTMLButtonElement);

			await waitFor(() => {
				expect(screen.queryByText('Log details')).not.toBeInTheDocument();
			});

			await waitFor(
				() => {
					const matched = requestPayloads.some((payload) => {
						const expression =
							payload.compositeQuery?.queries?.[0]?.spec?.filter?.expression || '';
						return (
							(expression.includes('attributes_string.service') ||
								expression.includes('service')) &&
							expression.includes("('frontend')") &&
							expression.includes('IN')
						);
					});
					expect(matched).toBe(true);
				},
				{ timeout: 2500 },
			);
		});

		it('should apply filter-out from log detail and close the drawer', async () => {
			const requestPayloads: any[] = [];

			server.use(
				rest.post(QUERY_RANGE_URL, async (req, res, ctx) => {
					const payload = await req.json();
					requestPayloads.push(payload);
					return res(ctx.status(200), ctx.json(createLogsResponse({ pageSize: 5 })));
				}),
			);

			renderComponent();

			await waitFor(() => {
				expect(screen.getByText(/Log message 0/)).toBeInTheDocument();
			});

			await userEvent.click(screen.getByText(/Log message 0/));

			await waitFor(() => {
				expect(screen.getByText('Log details')).toBeInTheDocument();
			});

			const serviceRow = await waitFor(() => {
				const attributeNameCells = Array.from(
					document.querySelectorAll('.attribute-name'),
				);
				const serviceCell = attributeNameCells.find((cell) =>
					(cell.textContent || '').toLowerCase().includes('service'),
				);
				const row = serviceCell?.closest('tr');
				if (!row) {
					throw new Error('Service attribute row not found');
				}
				return row;
			});

			const filterButtons = serviceRow.querySelectorAll('button.filter-btn');
			expect(filterButtons?.length).toBeGreaterThanOrEqual(2);

			// the second button that represents filter out
			await userEvent.click(filterButtons[1] as HTMLButtonElement);

			await waitFor(() => {
				expect(screen.queryByText('Log details')).not.toBeInTheDocument();
			});

			await waitFor(
				() => {
					const matched = requestPayloads.some((payload) => {
						const expression =
							payload.compositeQuery?.queries?.[0]?.spec?.filter?.expression || '';
						return (
							(expression.includes('attributes_string.service') ||
								expression.includes('service')) &&
							expression.includes("('frontend')") &&
							(expression.includes('NIN') || expression.includes('NOT_IN'))
						);
					});
					expect(matched).toBe(true);
				},
				{ timeout: 2500 },
			);
		});
	});

	describe('time range change', () => {
		it('should use different time ranges for different renders', async () => {
			const requestPayloads: any[] = [];

			server.use(
				rest.post(QUERY_RANGE_URL, async (req, res, ctx) => {
					const payload = await req.json();
					requestPayloads.push(payload);
					return res(ctx.status(200), ctx.json(createLogsResponse({ pageSize: 5 })));
				}),
			);

			// First render with initial time range
			const { unmount } = renderComponent();

			// Wait for initial fetch
			await waitFor(() => {
				expect(requestPayloads.length).toBeGreaterThanOrEqual(1);
			});

			const firstStartTime = requestPayloads[0].start;
			expect(firstStartTime).toBe(defaultProps.timeRange.startTime * 1000);

			// Unmount and render again with different time range
			unmount();

			const newTimeRange = {
				startTime: 1709000000,
				endTime: 1709003600,
			};

			renderComponent({
				...defaultProps,
				timeRange: newTimeRange,
			});

			// Wait for fetch with new time range
			await waitFor(() => {
				const hasNewTimeRange = requestPayloads.some(
					(p) => p.start === newTimeRange.startTime * 1000,
				);
				expect(hasNewTimeRange).toBe(true);
			});
		});

		it('should call handleTimeChange callback when time picker is clicked', async () => {
			const mockHandleTimeChange = jest.fn();

			server.use(
				rest.post(QUERY_RANGE_URL, (_, res, ctx) =>
					res(ctx.status(200), ctx.json(createLogsResponse({ pageSize: 5 }))),
				),
			);

			renderComponent({
				...defaultProps,
				handleTimeChange: mockHandleTimeChange,
			});

			// Wait for component to render
			await waitFor(() => {
				expect(screen.getByTestId('time-picker-btn')).toBeInTheDocument();
			});

			// Click the time picker button (from mock)
			await userEvent.click(screen.getByTestId('time-picker-btn'));

			// Verify the callback was called
			expect(mockHandleTimeChange).toHaveBeenCalledWith('5m');
		});
	});
});
