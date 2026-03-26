import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { Card } from 'antd';
import logEvent from 'api/common/logEvent';
import LogDetail from 'components/LogDetail';
import RawLogView from 'components/Logs/RawLogView';
import OverlayScrollbar from 'components/OverlayScrollbar/OverlayScrollbar';
import QuerySearch from 'components/QueryBuilderV2/QueryV2/QuerySearch/QuerySearch';
import { InfraMonitoringEvents } from 'constants/events';
import LogsError from 'container/LogsError/LogsError';
import { LogsLoading } from 'container/LogsLoading/LogsLoading';
import { FontSize } from 'container/OptionsMenu/types';
import DateTimeSelectionV2 from 'container/TopNav/DateTimeSelectionV2';
import {
	CustomTimeType,
	Time,
} from 'container/TopNav/DateTimeSelectionV2/types';
import { getOldLogsOperatorFromNew } from 'hooks/logs/useActiveLog';
import useLogDetailHandlers from 'hooks/logs/useLogDetailHandlers';
import useScrollToLog from 'hooks/logs/useScrollToLog';
import useDebounce from 'hooks/useDebounce';
import { generateFilterQuery } from 'lib/logs/generateFilterQuery';
import { parseAsString, useQueryState } from 'nuqs';
import { ILog } from 'types/api/logs/log';
import { DataSource } from 'types/common/queryBuilder';
import { validateQuery } from 'utils/queryValidationUtils';

import {
	getHostLogsQueryPayload,
	HOST_METRICS_LOGS_EXPR_QUERY_KEY,
} from './constants';
import { useInfiniteHostMetricLogs } from './hooks';
import NoLogsContainer from './NoLogsContainer';

import styles from './HostMetricLogs.module.scss';

interface Props {
	initialExpression: string;
	timeRange: {
		startTime: number;
		endTime: number;
	};
	isModalTimeSelection: boolean;
	handleTimeChange: (
		interval: Time | CustomTimeType,
		dateTimeRange?: [number, number],
	) => void;
	selectedInterval: Time;
}

const EXPRESSION_DEBOUNCE_TIME_MS = 300;

function HostMetricsLogs({
	initialExpression,
	timeRange,
	isModalTimeSelection,
	handleTimeChange,
	selectedInterval,
}: Props): JSX.Element {
	const virtuosoRef = useRef<VirtuosoHandle>(null);

	const [filterExpression, setFilterExpression] = useQueryState(
		HOST_METRICS_LOGS_EXPR_QUERY_KEY,
		parseAsString,
	);

	const [inputExpression, setInputExpression] = useState(
		filterExpression || initialExpression,
	);

	useEffect(() => {
		// If expression is present in the URL, prefer it and don't override it.
		// Otherwise, initialize URL state from the host's default expression.
		if (filterExpression) {
			setInputExpression(filterExpression);
			return;
		}

		setInputExpression(initialExpression);
		setFilterExpression(initialExpression);
	}, [filterExpression, initialExpression, setFilterExpression]);

	const debouncedFilterExpression = useDebounce(
		filterExpression?.trim() || initialExpression,
		EXPRESSION_DEBOUNCE_TIME_MS,
	);

	const {
		activeLog,
		selectedTab,
		handleSetActiveLog,
		handleCloseLogDetail,
	} = useLogDetailHandlers();

	const onAddToQuery = useCallback(
		(fieldKey: string, fieldValue: string, operator: string): void => {
			handleCloseLogDetail();

			const partExpression = generateFilterQuery({
				fieldKey,
				fieldValue,
				type: getOldLogsOperatorFromNew(operator),
			});

			const newExpression = inputExpression.trim()
				? `${inputExpression} AND ${partExpression}`
				: partExpression;

			setInputExpression(newExpression);
			setFilterExpression(newExpression);
		},
		[inputExpression, setFilterExpression, handleCloseLogDetail],
	);

	const handleFilterChange = useCallback(
		(expression: string): void => {
			setInputExpression(expression);

			const validation = validateQuery(expression);
			if (validation.isValid) {
				setFilterExpression(expression);

				logEvent(InfraMonitoringEvents.FilterApplied, {
					entity: InfraMonitoringEvents.HostEntity,
					view: InfraMonitoringEvents.LogsView,
					page: InfraMonitoringEvents.DetailedPage,
				});
			}
		},
		[setFilterExpression],
	);

	const queryData = useMemo(
		() =>
			getHostLogsQueryPayload({
				start: timeRange.startTime,
				end: timeRange.endTime,
				// this should use inputExpression to show suggestions correctly
				// while we don't accept the final expression yet
				expression: inputExpression,
			}).queryData,
		[timeRange.startTime, timeRange.endTime, inputExpression],
	);

	const {
		logs,
		loadMoreLogs,
		hasNextPage,
		isFetchingNextPage,
		isLoading,
		isFetching,
		isError,
	} = useInfiniteHostMetricLogs({
		expression: debouncedFilterExpression,
		startTime: timeRange.startTime,
		endTime: timeRange.endTime,
	});

	const handleScrollToLog = useScrollToLog({
		logs,
		virtuosoRef,
	});

	const getItemContent = useCallback(
		(_: number, logToRender: ILog): JSX.Element => {
			return (
				<div key={logToRender.id}>
					<RawLogView
						isTextOverflowEllipsisDisabled
						data={logToRender}
						linesPerRow={5}
						fontSize={FontSize.MEDIUM}
						selectedFields={[
							{
								dataType: 'string',
								type: '',
								name: 'body',
							},
							{
								dataType: 'string',
								type: '',
								name: 'timestamp',
							},
						]}
						onSetActiveLog={handleSetActiveLog}
						onClearActiveLog={handleCloseLogDetail}
						isActiveLog={activeLog?.id === logToRender.id}
					/>
				</div>
			);
		},
		[activeLog, handleSetActiveLog, handleCloseLogDetail],
	);

	const renderFooter = useCallback(
		(): JSX.Element | null => (
			<>
				{isFetchingNextPage ? (
					<div className={styles.logsLoadingSkeleton}> Loading more logs ... </div>
				) : !hasNextPage && logs.length > 0 ? (
					<div className={styles.logsLoadingSkeleton}> *** End *** </div>
				) : null}
			</>
		),
		[isFetchingNextPage, hasNextPage, logs.length],
	);

	const renderContent = useMemo(
		() => (
			<Card bordered={false} className={styles.listCard}>
				<OverlayScrollbar isVirtuoso>
					<Virtuoso
						key="host-metrics-logs-virtuoso"
						ref={virtuosoRef}
						data={logs}
						endReached={loadMoreLogs}
						totalCount={logs.length}
						itemContent={getItemContent}
						overscan={200}
						components={{
							Footer: renderFooter,
						}}
					/>
				</OverlayScrollbar>
			</Card>
		),
		[logs, loadMoreLogs, getItemContent, renderFooter],
	);

	const showInitialLoading = isLoading || (isFetching && logs.length === 0);

	return (
		<>
			<div className={styles.header}>
				<DateTimeSelectionV2
					showAutoRefresh
					showRefreshText={false}
					hideShareModal
					isModalTimeSelection={isModalTimeSelection}
					onTimeChange={handleTimeChange}
					defaultRelativeTime="5m"
					modalSelectedInterval={selectedInterval}
					modalInitialStartTime={timeRange.startTime * 1000}
					modalInitialEndTime={timeRange.endTime * 1000}
				/>
			</div>

			<QuerySearch
				queryData={queryData}
				onChange={handleFilterChange}
				dataSource={DataSource.LOGS}
			/>

			<div className={styles.logs}>
				{showInitialLoading && <LogsLoading />}
				{!showInitialLoading && !isError && logs.length === 0 && (
					<NoLogsContainer />
				)}
				{isError && !showInitialLoading && <LogsError />}
				{!showInitialLoading && !isError && logs.length > 0 && (
					<div className={styles.listContainer} data-log-detail-ignore="true">
						{renderContent}
					</div>
				)}
				{selectedTab && activeLog && (
					<LogDetail
						log={activeLog}
						onClose={handleCloseLogDetail}
						logs={logs}
						onNavigateLog={handleSetActiveLog}
						selectedTab={selectedTab}
						onAddToQuery={onAddToQuery}
						onClickActionItem={onAddToQuery}
						onScrollToLog={handleScrollToLog}
					/>
				)}
			</div>
		</>
	);
}

export default HostMetricsLogs;
