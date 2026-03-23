from datetime import datetime, timezone
from http import HTTPStatus
from typing import Callable

import pytest

from fixtures import types
from fixtures.auth import USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD
from fixtures.querier import make_query_request


def test_clickhouse_sql_valid_query(
    signoz: types.SigNoz,
    create_user_admin: None,  # pylint: disable=unused-argument
    get_token: Callable[[str, str], str],
) -> None:
    """
    A valid ClickHouse SQL query referencing a distributed table is accepted.
    No data insertion required — we only verify the request is not rejected.
    """
    token = get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)
    end = int(datetime.now(tz=timezone.utc).timestamp() * 1000)
    start = end - 60_000

    response = make_query_request(
        signoz,
        token,
        start,
        end,
        [
            {
                "type": "clickhouse_sql",
                "spec": {
                    "name": "A",
                    "query": "SELECT count() AS value FROM signoz_logs.distributed_logs_v2",
                },
            }
        ],
        request_type="scalar",
    )
    assert response.status_code == HTTPStatus.OK
    assert response.json()["status"] == "success"


@pytest.mark.parametrize(
    "query, expected_error",
    [
        (
            "SELECT * FROM signoz_logs.distributed_logs LIMIT 10",
            "deprecated table",
        ),
        (
            "SELECT count() AS value FROM signoz_logs.logs_v2",
            "local table",
        ),
    ],
)
def test_clickhouse_sql_rejected_tables(
    signoz: types.SigNoz,
    create_user_admin: None,  # pylint: disable=unused-argument
    get_token: Callable[[str, str], str],
    query: str,
    expected_error: str,
) -> None:
    """
    ClickHouse SQL queries referencing deprecated or local (non-distributed)
    tables are rejected with HTTP 400.
    """
    token = get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)
    end = int(datetime.now(tz=timezone.utc).timestamp() * 1000)
    start = end - 60_000

    response = make_query_request(
        signoz,
        token,
        start,
        end,
        [{"type": "clickhouse_sql", "spec": {"name": "A", "query": query}}],
        request_type="raw",
    )
    assert response.status_code == HTTPStatus.BAD_REQUEST
    body = response.json()
    assert body["status"] == "error"
    assert expected_error in body["error"]["message"]
