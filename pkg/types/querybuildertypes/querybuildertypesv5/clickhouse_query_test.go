package querybuildertypesv5

import (
	"testing"
)

func TestClickHouseQuery_Copy(t *testing.T) {
	q := ClickHouseQuery{Name: "A", Query: "SELECT 1", Disabled: true, Legend: "my legend"}
	got := q.Copy()
	if got != q {
		t.Errorf("Copy() = %+v, want %+v", got, q)
	}
}

// TestClickHouseQuery_Validate_DeprecatedTables covers every deprecated table entry,
// verifying both rejection and the correct error message (with or without a replacement hint).
func TestClickHouseQuery_Validate_DeprecatedTables(t *testing.T) {
	tests := []struct {
		table      string
		query      string
		wantErrMsg string // substring expected in error
	}{
		// Traces V2 → V3 (distributed)
		{
			"distributed_signoz_index_v2",
			"SELECT * FROM distributed_signoz_index_v2 LIMIT 10",
			`use "distributed_signoz_index_v3"`,
		},
		{
			"distributed_signoz_error_index_v2",
			"SELECT * FROM distributed_signoz_error_index_v2",
			`use "distributed_signoz_index_v3"`,
		},
		{
			"distributed_dependency_graph_minutes_v2",
			"SELECT * FROM distributed_dependency_graph_minutes_v2",
			`deprecated table "distributed_dependency_graph_minutes_v2"`,
		},
		{
			"distributed_signoz_operations",
			"SELECT * FROM distributed_signoz_operations",
			`use "distributed_top_level_operations"`,
		},
		{
			"distributed_durationSort",
			"SELECT * FROM distributed_durationSort",
			`use "distributed_signoz_index_v3"`,
		},
		{
			"distributed_usage_explorer",
			"SELECT * FROM distributed_usage_explorer",
			`deprecated table "distributed_usage_explorer"`,
		},
		{
			"distributed_signoz_spans",
			"SELECT * FROM distributed_signoz_spans",
			`deprecated table "distributed_signoz_spans"`,
		},
		// Traces V2 → V3 (local)
		{
			"signoz_index_v2",
			"SELECT * FROM signoz_index_v2",
			`use "distributed_signoz_index_v3"`,
		},
		{
			"signoz_error_index_v2",
			"SELECT * FROM signoz_error_index_v2",
			`use "distributed_signoz_index_v3"`,
		},
		{
			"dependency_graph_minutes_v2",
			"SELECT * FROM dependency_graph_minutes_v2",
			`deprecated table "dependency_graph_minutes_v2"`,
		},
		{
			"signoz_operations",
			"SELECT * FROM signoz_operations",
			`use "distributed_top_level_operations"`,
		},
		{
			"durationSort",
			"SELECT * FROM durationSort",
			`use "distributed_signoz_index_v3"`,
		},
		{
			"usage_explorer",
			"SELECT * FROM usage_explorer",
			`deprecated table "usage_explorer"`,
		},
		{
			"signoz_spans",
			"SELECT * FROM signoz_spans LIMIT 10",
			`deprecated table "signoz_spans"`,
		},
		// Logs V1 → V2
		{
			"distributed_logs",
			"SELECT * FROM signoz_logs.distributed_logs WHERE timestamp > now() - INTERVAL 1 HOUR",
			`use "distributed_logs_v2"`,
		},
		{
			"logs",
			"SELECT body FROM logs LIMIT 100",
			`use "distributed_logs_v2"`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.table, func(t *testing.T) {
			q := ClickHouseQuery{Name: "A", Query: tt.query}
			err := q.Validate()
			if err == nil {
				t.Fatalf("Validate() expected error for deprecated table %q but got none", tt.table)
			}
			if !contains(err.Error(), tt.wantErrMsg) {
				t.Errorf("Validate() error = %q, want to contain %q", err.Error(), tt.wantErrMsg)
			}
		})
	}
}

// TestClickHouseQuery_Validate_LocalTables covers every local-table entry,
// verifying rejection and the correct "use distributed table X instead" message.
func TestClickHouseQuery_Validate_LocalTables(t *testing.T) {
	tests := []struct {
		table string
		query string
		dist  string // expected distributed replacement in error
	}{
		// Traces
		{"signoz_index_v3", "SELECT * FROM signoz_index_v3", "distributed_signoz_index_v3"},
		{"tag_attributes_v2", "SELECT * FROM tag_attributes_v2", "distributed_tag_attributes_v2"},
		// Logs
		{"logs_v2", "SELECT body FROM logs_v2 LIMIT 50", "distributed_logs_v2"},
		{"logs_v2_resource", "SELECT * FROM logs_v2_resource", "distributed_logs_v2_resource"},
		// Metrics
		{"samples_v4", "SELECT * FROM samples_v4 WHERE unix_milli >= 1000", "distributed_samples_v4"},
		{"samples_v4_agg_5m", "SELECT * FROM samples_v4_agg_5m", "distributed_samples_v4_agg_5m"},
		{"samples_v4_agg_30m", "SELECT * FROM samples_v4_agg_30m", "distributed_samples_v4_agg_30m"},
		{"exp_hist", "SELECT * FROM exp_hist", "distributed_exp_hist"},
		{"time_series_v4", "SELECT * FROM time_series_v4", "distributed_time_series_v4"},
		{"time_series_v4_6hrs", "SELECT * FROM time_series_v4_6hrs", "distributed_time_series_v4_6hrs"},
		{"time_series_v4_1day", "SELECT * FROM time_series_v4_1day", "distributed_time_series_v4_1day"},
		{"time_series_v4_1week", "SELECT * FROM time_series_v4_1week", "distributed_time_series_v4_1week"},
		{"updated_metadata", "SELECT * FROM updated_metadata", "distributed_updated_metadata"},
		{"metadata", "SELECT * FROM metadata", "distributed_metadata"},
		// Meter
		{"samples", "SELECT * FROM samples WHERE unix_milli >= 1000", "distributed_samples"},
		{"samples_agg_1d", "SELECT * FROM samples_agg_1d", "distributed_samples_agg_1d"},
		// Metadata
		{"attributes_metadata", "SELECT * FROM attributes_metadata", "distributed_attributes_metadata"},
	}

	for _, tt := range tests {
		t.Run(tt.table, func(t *testing.T) {
			q := ClickHouseQuery{Name: "A", Query: tt.query}
			err := q.Validate()
			if err == nil {
				t.Fatalf("Validate() expected error for local table %q but got none", tt.table)
			}
			wantFragment := `use distributed table "` + tt.dist + `"`
			if !contains(err.Error(), wantFragment) {
				t.Errorf("Validate() error = %q, want to contain %q", err.Error(), wantFragment)
			}
		})
	}
}

// TestClickHouseQuery_Validate_AllowedTables verifies that current-generation
// distributed tables are accepted without error.
func TestClickHouseQuery_Validate_AllowedTables(t *testing.T) {
	queries := []string{
		"SELECT * FROM distributed_signoz_index_v3",
		"SELECT * FROM distributed_tag_attributes_v2",
		"SELECT * FROM distributed_top_level_operations",
		"SELECT * FROM distributed_logs_v2",
		"SELECT * FROM distributed_logs_v2_resource",
		"SELECT * FROM distributed_samples_v4",
		"SELECT * FROM distributed_samples_v4_agg_5m",
		"SELECT * FROM distributed_samples_v4_agg_30m",
		"SELECT * FROM distributed_exp_hist",
		"SELECT * FROM distributed_time_series_v4",
		"SELECT * FROM distributed_time_series_v4_6hrs",
		"SELECT * FROM distributed_time_series_v4_1day",
		"SELECT * FROM distributed_time_series_v4_1week",
		"SELECT * FROM distributed_updated_metadata",
		"SELECT * FROM distributed_metadata",
		"SELECT * FROM distributed_samples",
		"SELECT * FROM distributed_samples_agg_1d",
		"SELECT * FROM distributed_attributes_metadata",
	}

	for _, q := range queries {
		t.Run(q, func(t *testing.T) {
			err := (ClickHouseQuery{Name: "A", Query: q}).Validate()
			if err != nil {
				t.Errorf("Validate() unexpected error = %v", err)
			}
		})
	}
}

// TestClickHouseQuery_Validate_WordBoundary ensures that table name patterns
// do not produce false positives when a deprecated/local name is a prefix of
// a longer allowed name.
func TestClickHouseQuery_Validate_WordBoundary(t *testing.T) {
	tests := []struct {
		name    string
		query   string
		wantErr bool
	}{
		// "logs" must not match "distributed_logs_v2" or "logs_v2"
		{"distributed_logs_v2 not flagged by 'logs' pattern", "SELECT * FROM distributed_logs_v2", false},
		// "distributed_logs" must not match "distributed_logs_v2"
		{"distributed_logs_v2 not flagged by 'distributed_logs' pattern", "SELECT * FROM signoz_logs.distributed_logs_v2", false},
		// "metadata" must not match "attributes_metadata" or "distributed_attributes_metadata"
		{"distributed_attributes_metadata not flagged by 'metadata' pattern", "SELECT * FROM distributed_attributes_metadata", false},
		{"attributes_metadata flagged by its own pattern", "SELECT * FROM attributes_metadata", true},
		// "samples" must not match "samples_v4" (caught by samples_v4 entry instead)
		{"distributed_samples_v4 not flagged by 'samples' pattern", "SELECT * FROM distributed_samples_v4", false},
		// "time_series_v4" must not match "time_series_v4_6hrs"
		{"distributed_time_series_v4_6hrs not flagged by 'time_series_v4' pattern", "SELECT * FROM distributed_time_series_v4_6hrs", false},
		// "signoz_index_v2" must not match "distributed_signoz_index_v2" (separate entry)
		{"distributed_signoz_index_v2 flagged by its own pattern", "SELECT * FROM distributed_signoz_index_v2", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := (ClickHouseQuery{Name: "A", Query: tt.query}).Validate()
			if tt.wantErr && err == nil {
				t.Errorf("Validate() expected error but got none")
			} else if !tt.wantErr && err != nil {
				t.Errorf("Validate() unexpected error = %v", err)
			}
		})
	}
}

// TestClickHouseQuery_Validate_CaseInsensitive verifies that table pattern
// matching is case-insensitive.
func TestClickHouseQuery_Validate_CaseInsensitive(t *testing.T) {
	tests := []struct {
		name  string
		query string
	}{
		{"deprecated table uppercase", "SELECT * FROM DISTRIBUTED_SIGNOZ_INDEX_V2"},
		{"deprecated table mixed case", "SELECT * FROM Distributed_SignoZ_Index_V2"},
		{"local table uppercase", "SELECT * FROM SAMPLES_V4"},
		{"local table mixed case", "SELECT * FROM Time_Series_V4"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := (ClickHouseQuery{Name: "A", Query: tt.query}).Validate()
			if err == nil {
				t.Errorf("Validate() expected error for %q but got none", tt.query)
			}
		})
	}
}
