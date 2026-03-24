import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from 'react-query';
import { useSearchParams } from 'react-router-dom-v5-compat';
import { VerticalAlignTopOutlined } from '@ant-design/icons';
import { Button, Tooltip, Typography } from 'antd';
import logEvent from 'api/common/logEvent';
import {
	getHostLists,
	HostListPayload,
	HostListResponse,
} from 'api/infraMonitoring/getHostLists';
import HostMetricDetail from 'components/HostMetricsDetail';
import QuickFilters from 'components/QuickFilters/QuickFilters';
import { QuickFiltersSource } from 'components/QuickFilters/types';
import { InfraMonitoringEvents } from 'constants/events';
import {
	getFiltersFromParams,
	getOrderByFromParams,
} from 'container/InfraMonitoringK8s/commonUtils';
import { INFRA_MONITORING_K8S_PARAMS_KEYS } from 'container/InfraMonitoringK8s/constants';
import { usePageSize } from 'container/InfraMonitoringK8s/utils';
import { useQueryBuilder } from 'hooks/queryBuilder/useQueryBuilder';
import { useQueryOperations } from 'hooks/queryBuilder/useQueryBuilderOperations';
import { Filter } from 'lucide-react';
import { useGlobalTimeStore } from 'store/globalTime';
import { ErrorResponse, SuccessResponse } from 'types/api';
import {
	IBuilderQuery,
	Query,
	TagFilter,
} from 'types/api/queryBuilder/queryBuilderData';

import { FeatureKeys } from '../../constants/features';
import { REACT_QUERY_KEY } from '../../constants/reactQueryKeys';
import { useAppContext } from '../../providers/App/App';
import HostsListControls from './HostsListControls';
import HostsListTable from './HostsListTable';
import { getHostListsQuery, GetHostsQuickFiltersConfig } from './utils';

import './InfraMonitoring.styles.scss';

const defaultFilters: TagFilter = { items: [], op: 'and' };
const baseQuery = getHostListsQuery();

function HostsList(): JSX.Element {
	const [searchParams, setSearchParams] = useSearchParams();

	const [currentPage, setCurrentPage] = useState(1);

	const [filters, setFilters] = useState<IBuilderQuery['filters']>(() => {
		const filtersFromParams = getFiltersFromParams(
			searchParams,
			INFRA_MONITORING_K8S_PARAMS_KEYS.FILTERS,
		);
		return filtersFromParams ?? defaultFilters;
	});
	const [showFilters, setShowFilters] = useState<boolean>(true);

	const [orderBy, setOrderBy] = useState<{
		columnName: string;
		order: 'asc' | 'desc';
	} | null>(() => getOrderByFromParams(searchParams));

	const handleOrderByChange = (
		orderBy: {
			columnName: string;
			order: 'asc' | 'desc';
		} | null,
	): void => {
		setOrderBy(orderBy);
		setSearchParams({
			...Object.fromEntries(searchParams.entries()),
			[INFRA_MONITORING_K8S_PARAMS_KEYS.ORDER_BY]: JSON.stringify(orderBy),
		});
	};

	const [selectedHostName, setSelectedHostName] = useState<string | null>(() => {
		const hostName = searchParams.get('hostName');
		return hostName || null;
	});

	const handleHostClick = (hostName: string): void => {
		setSelectedHostName(hostName);
		setSearchParams({ ...searchParams, hostName });
	};

	const { pageSize, setPageSize } = usePageSize('hosts');

	const selectedTime = useGlobalTimeStore((store) => store.selectedTime);
	const isRefreshEnabled = useGlobalTimeStore((s) => s.isRefreshEnabled);
	const refreshInterval = useGlobalTimeStore((s) => s.refreshInterval);
	const getMinMaxTime = useGlobalTimeStore((s) => s.getMinMaxTime);

	const queryKey = useMemo(
		() => [
			REACT_QUERY_KEY.AUTO_REFRESH_QUERY,
			REACT_QUERY_KEY.GET_HOST_LIST,
			String(pageSize),
			String(currentPage),
			JSON.stringify(filters),
			JSON.stringify(orderBy),
			selectedTime,
		],
		[pageSize, currentPage, filters, orderBy, selectedTime],
	);

	const { data, isFetching, isLoading, isError } = useQuery<
		SuccessResponse<HostListResponse> | ErrorResponse,
		Error
	>({
		queryKey,
		queryFn: ({ signal }) => {
			const { minTime, maxTime } = getMinMaxTime();

			const payload: HostListPayload = {
				...baseQuery,
				limit: pageSize,
				offset: (currentPage - 1) * pageSize,
				filters: filters ?? defaultFilters,
				orderBy,
				start: Math.floor(minTime / 1000000),
				end: Math.floor(maxTime / 1000000),
			};

			return getHostLists(payload, signal);
		},
		enabled: true,
		refetchInterval: isRefreshEnabled ? refreshInterval : false,
	});

	const hostMetricsData = useMemo(() => data?.payload?.data?.records || [], [
		data,
	]);

	const { currentQuery } = useQueryBuilder();

	const { handleChangeQueryData } = useQueryOperations({
		index: 0,
		query: currentQuery.builder.queryData[0],
		entityVersion: '',
	});

	const { featureFlags } = useAppContext();
	const dotMetricsEnabled =
		featureFlags?.find((flag) => flag.name === FeatureKeys.DOT_METRICS_ENABLED)
			?.active || false;

	const handleFiltersChange = useCallback(
		(value: IBuilderQuery['filters']): void => {
			const isNewFilterAdded = value?.items?.length !== filters?.items?.length;
			setFilters(value);
			handleChangeQueryData('filters', value);
			setSearchParams({
				...Object.fromEntries(searchParams.entries()),
				[INFRA_MONITORING_K8S_PARAMS_KEYS.FILTERS]: JSON.stringify(value),
			});
			if (isNewFilterAdded) {
				setCurrentPage(1);

				if (value?.items && value?.items?.length > 0) {
					logEvent(InfraMonitoringEvents.FilterApplied, {
						entity: InfraMonitoringEvents.HostEntity,
						page: InfraMonitoringEvents.ListPage,
					});
				}
			}
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[filters],
	);

	useEffect(() => {
		logEvent(InfraMonitoringEvents.PageVisited, {
			total: data?.payload?.data?.total,
			entity: InfraMonitoringEvents.HostEntity,
			page: InfraMonitoringEvents.ListPage,
		});
	}, [data?.payload?.data?.total]);

	const selectedHostData = useMemo(() => {
		if (!selectedHostName) {
			return null;
		}
		return (
			hostMetricsData.find((host) => host.hostName === selectedHostName) || null
		);
	}, [selectedHostName, hostMetricsData]);

	const handleCloseHostDetail = (): void => {
		setSelectedHostName(null);
	};

	const handleFilterVisibilityChange = (): void => {
		setShowFilters(!showFilters);
	};

	const handleQuickFiltersChange = (query: Query): void => {
		handleChangeQueryData('filters', query.builder.queryData[0].filters);
		handleFiltersChange(query.builder.queryData[0].filters);
	};

	return (
		<div className="hosts-list">
			<div className="hosts-list-content">
				{showFilters && (
					<div className="hosts-quick-filters-container">
						<div className="hosts-quick-filters-container-header">
							<Typography.Text>Filters</Typography.Text>
							<Tooltip title="Collapse Filters">
								<VerticalAlignTopOutlined
									rotate={270}
									onClick={handleFilterVisibilityChange}
								/>
							</Tooltip>
						</div>
						<QuickFilters
							source={QuickFiltersSource.INFRA_MONITORING}
							config={GetHostsQuickFiltersConfig(dotMetricsEnabled)}
							handleFilterVisibilityChange={handleFilterVisibilityChange}
							onFilterChange={handleQuickFiltersChange}
						/>
					</div>
				)}
				<div className="hosts-list-table-container">
					<div className="hosts-list-table-header">
						{!showFilters && (
							<div className="quick-filters-toggle-container">
								<Button
									className="periscope-btn ghost"
									type="text"
									size="small"
									onClick={handleFilterVisibilityChange}
								>
									<Filter size={14} />
								</Button>
							</div>
						)}
						<HostsListControls
							filters={filters}
							handleFiltersChange={handleFiltersChange}
							showAutoRefresh={!selectedHostData}
						/>
					</div>
					<HostsListTable
						isLoading={isLoading}
						isFetching={isFetching}
						isError={isError}
						tableData={data}
						hostMetricsData={hostMetricsData}
						filters={filters ?? defaultFilters}
						currentPage={currentPage}
						setCurrentPage={setCurrentPage}
						onHostClick={handleHostClick}
						pageSize={pageSize}
						setPageSize={setPageSize}
						setOrderBy={handleOrderByChange}
					/>
				</div>
			</div>
			<HostMetricDetail
				host={selectedHostData}
				isModalTimeSelection
				onClose={handleCloseHostDetail}
			/>
		</div>
	);
}

export default HostsList;
