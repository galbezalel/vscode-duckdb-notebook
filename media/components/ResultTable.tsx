import React, { useEffect, useRef } from 'react';

interface ResultTableProps {
    columns: string[];
    rows: any[];
}

const ResultTable: React.FC<ResultTableProps> = ({ columns, rows }) => {
    const [colWidths, setColWidths] = React.useState<number[]>([]);

    useEffect(() => {
        // Initialize widths
        setColWidths(new Array(columns.length).fill(150));
    }, [columns]);

    const handleResize = (index: number, newWidth: number) => {
        setColWidths(prev => {
            const next = [...prev];
            next[index] = Math.max(50, newWidth);
            return next;
        });
    };

    if (!columns.length) {
        return <div className="muted">No results</div>;
    }

    const totalWidth = colWidths.reduce((a, b) => a + b, 0);

    return (
        <div className="table-wrapper">
            <div className="table-inner" style={{ minWidth: totalWidth }}>
                <table className="header-table" style={{ width: totalWidth }}>
                    <colgroup>
                        {colWidths.map((w, i) => <col key={i} style={{ width: w }} />)}
                    </colgroup>
                    <thead>
                        <tr>
                            {columns.map((col, i) => (
                                <HeaderCell
                                    key={i}
                                    label={col}
                                    width={colWidths[i]}
                                    onResize={(w) => handleResize(i, w)}
                                />
                            ))}
                        </tr>
                    </thead>
                </table>
                <div className="body-scroll-container" style={{ overflowX: 'hidden' }}>
                    <table className="body-table" style={{ width: totalWidth }}>
                        <colgroup>
                            {colWidths.map((w, i) => <col key={i} style={{ width: w }} />)}
                        </colgroup>
                        <tbody>
                            {rows.map((row, i) => (
                                <tr key={i}>
                                    {columns.map((col, j) => (
                                        <td key={j} title={String(row[col] ?? '')}>
                                            {String(row[col] ?? '')}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

interface HeaderCellProps {
    label: string;
    width: number;
    onResize: (width: number) => void;
}

const HeaderCell: React.FC<HeaderCellProps> = ({ label, width, onResize }) => {
    const thRef = useRef<HTMLTableCellElement>(null);

    useEffect(() => {
        const th = thRef.current;
        if (!th) return;

        let startX: number;
        let startWidth: number;

        const onMouseMove = (e: MouseEvent) => {
            const newWidth = startWidth + (e.clientX - startX);
            onResize(newWidth);
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        const onMouseDown = (e: MouseEvent) => {
            const rect = th.getBoundingClientRect();
            if (e.clientX > rect.right - 10) {
                startX = e.clientX;
                startWidth = width;
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
                document.body.style.cursor = 'col-resize';
                document.body.style.userSelect = 'none';
                e.preventDefault();
            }
        };

        th.addEventListener('mousedown', onMouseDown);

        const onHover = (e: MouseEvent) => {
            const rect = th.getBoundingClientRect();
            th.style.cursor = e.clientX > rect.right - 10 ? 'col-resize' : 'default';
        };
        th.addEventListener('mousemove', onHover);

        return () => {
            th.removeEventListener('mousedown', onMouseDown);
            th.removeEventListener('mousemove', onHover);
        };
    }, [width, onResize]);

    return <th ref={thRef}>{label}</th>;
};

export default ResultTable;
