import { Color } from '@signozhq/design-tokens';
import { Ghost } from 'lucide-react';

import styles from './HostMetricLogs.module.scss';

export default function NoLogsContainer(): React.ReactElement {
	return (
		<div className={styles.noLogsFound}>
			<p>
				<Ghost size={24} color={Color.BG_AMBER_500} /> No logs found for this host
				in the selected time range.
			</p>
		</div>
	);
}
