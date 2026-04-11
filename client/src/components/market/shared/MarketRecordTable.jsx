import { memo } from 'react';

function MarketRecordTableComponent({ table, tableHtmlBlocks, isLoadingMore, onLoadMore }) {
  if (Array.isArray(tableHtmlBlocks) && tableHtmlBlocks.length > 0) {
    return (
      <section className="market-table-wrap market-table-raw-wrap">
        {tableHtmlBlocks.map((blockHtml, index) => (
          <div
            key={`raw-table-${index}`}
            className="market-table-raw"
            dangerouslySetInnerHTML={{ __html: blockHtml }}
          />
        ))}
      </section>
    );
  }

  if (!table) {
    return null;
  }

  return (
    <section className="market-card market-table-wrap">
      <h2 className="market-table-title">{table.heading || 'Market Record'}</h2>

      <table className="market-table">
        {Array.isArray(table.columns) && table.columns.length > 0 ? (
          <thead>
            <tr>
              {table.columns.map((column, index) => (
                <th key={`${column}-${index}`}>{column}</th>
              ))}
            </tr>
          </thead>
        ) : null}

        <tbody>
          {table.rows?.map((row) => (
            <tr key={row.id}>
              {row.cells.map((cell) => (
                <td key={cell.id} className={cell.isHighlight ? 'is-highlight' : ''}>
                  {cell.text}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {table.hasMore ? (
        <button className="market-btn market-load-more" type="button" onClick={onLoadMore} disabled={isLoadingMore}>
          {isLoadingMore ? 'Loading More...' : `Load More (${table.totalRows - (table.offset + table.rows.length)})`}
        </button>
      ) : null}
    </section>
  );
}

export const MarketRecordTable = memo(MarketRecordTableComponent);
