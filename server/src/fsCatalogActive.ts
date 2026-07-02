/** SQL fragment: row is not soft-deleted. */
export const FS_CATALOG_ACTIVE_SQL = 'COALESCE(is_deleted, 0) = 0';
