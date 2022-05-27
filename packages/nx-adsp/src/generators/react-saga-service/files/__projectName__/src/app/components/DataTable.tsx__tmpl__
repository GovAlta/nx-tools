import React from 'react';
import styled from 'styled-components';

// eslint-disable-next-line
function DataTable({ children, ...props }): JSX.Element {

  if (props?.noScroll === true) {
    return <Table {...props}>{children}</Table>
  }

  return (
    <ScrollWrapper>
      <Table {...props}>{children}</Table>
    </ScrollWrapper>
  );
}

export default DataTable;

const ScrollWrapper = styled.div`
  width: 100%;
  overflow-x: auto;
`;

const Table = styled.table`
  --color-row-border: var(--color-gray-300);
  --color-header-border: var(--color-gray-300);
  --color-row--selected: var(--color-gray-200);
  --color-th: var(--color-gray-900);

  border-collapse: collapse;
  width: 100%;

  td {
    padding: 0.5rem;
  }

  tr + tr {
    border-top: 1px solid var(--color-row-border);
  }

  tr.selected {
    background-color: var(--color-row--selected);
  }

  th {
    border-bottom: 2px solid var(--color-header-border);
    color: var(--color-th);
    font-size: var(--fs-base);
    font-weight: var(--fw-bold);
    padding: 0.5rem;
    text-align: left;
    white-space: nowrap;
  }
`;
