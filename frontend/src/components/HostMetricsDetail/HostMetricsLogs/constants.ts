import { PANEL_TYPES } from 'constants/queryBuilder';
import { DEFAULT_PER_PAGE_VALUE } from 'container/Controls/config';
import { GetQueryResultsProps } from 'lib/dashboard/getQueryResults';
import { DataTypes } from 'types/api/queryBuilder/queryAutocompleteResponse';
import { IBuilderQuery } from 'types/api/queryBuilder/queryBuilderData';
import { EQueryType } from 'types/common/dashboard';
import { DataSource, ReduceOperators } from 'types/common/queryBuilder';
import { v4 as uuidv4 } from 'uuid';

export interface HostLogsQueryParams {
	start: number;
	end: number;
	expression: string;
	offset?: number;
	pageSize?: number;
}

export const getHostLogsQueryPayload = ({
	start,
	end,
	expression,
	offset = 0,
	pageSize = DEFAULT_PER_PAGE_VALUE,
}: HostLogsQueryParams): {
	query: GetQueryResultsProps;
	queryData: IBuilderQuery;
} => {
	const queryData: IBuilderQuery = {
		dataSource: DataSource.LOGS,
		queryName: 'A',
		aggregateOperator: 'noop',
		aggregateAttribute: {
			id: '------false',
			dataType: DataTypes.String,
			key: '',
			type: '',
		},
		timeAggregation: 'rate',
		spaceAggregation: 'sum',
		functions: [],
		filter: { expression },
		expression,
		having: {
			expression: '',
		},
		disabled: false,
		stepInterval: 60,
		limit: null,
		orderBy: [
			{
				columnName: 'timestamp',
				order: 'desc',
			},
			{
				columnName: 'id',
				order: 'desc',
			},
		],
		groupBy: [],
		legend: '',
		reduceTo: ReduceOperators.AVG,
		offset,
		pageSize,
	};

	return {
		query: {
			graphType: PANEL_TYPES.LIST,
			selectedTime: 'GLOBAL_TIME',
			query: {
				clickhouse_sql: [],
				promql: [],
				builder: {
					queryData: [queryData],
					queryFormulas: [],
					queryTraceOperator: [],
				},
				id: uuidv4(),
				queryType: EQueryType.QUERY_BUILDER,
			},
			start,
			end,
		},
		queryData,
	};
};

export const HOST_METRICS_LOGS_EXPR_QUERY_KEY = 'hostMetricsLogsExpr';
