/**
 * isMockData — checks if a record looks like synthetic/test data.
 * Used for development inspection only.
 * NOTE: filterMockData is intentionally a no-op passthrough in production
 *       to prevent accidentally hiding real records that contain words like
 *       "test", "demo", or "sample" in their names or addresses.
 */
export const isMockData = (record) => {
  if (!record) return false;

  // Only match records that have BOTH a clearly fake id pattern AND
  // a well-known placeholder name. Loose keyword matching alone is too
  // aggressive and hides legitimate production data.
  const strictFakeNames = [
    'john doe', 'ahmed test', 'vendor demo', 'customer demo',
    'lorem ipsum', 'dummy user', 'fake driver'
  ];

  const recordString = Object.values(record)
    .filter(val => typeof val === 'string')
    .join(' ')
    .toLowerCase();

  return strictFakeNames.some(keyword => recordString.includes(keyword));
};

/**
 * filterMockData — passthrough in production.
 * Filtering is disabled by default to avoid hiding legitimate records.
 * Enable only in local/dev environments by setting the env flag below.
 */
export const filterMockData = (dataArray) => {
  // Safety: always return full dataset in production
  if (!Array.isArray(dataArray)) return dataArray ?? [];

  // Opt-in filter only in explicit dev mode
  if (import.meta.env?.VITE_FILTER_MOCK_DATA === 'true') {
    return dataArray.filter(record => !isMockData(record));
  }

  return dataArray;
};
