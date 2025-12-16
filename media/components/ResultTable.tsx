import React, { useEffect, useRef } from 'react';

interface ResultTableProps {
    columns: string[];
    rows: any[];
    onOpenUrl: (url: string) => void;
}

const isUrl = (text: string): boolean => {
    // Simple regex for URL detection
    return /^https?:\/\/\S+$/.test(text);
};

const ResultTable: React.FC<ResultTableProps> = ({ columns, rows, onOpenUrl }) => {
    const [colWidths, setColWidths] = React.useState<number[]>([]);

    const calculateColumnWidths = (cols: string[], data: any[]) => {
        const MIN_WIDTH = 100;
        const MAX_WIDTH = 500;
        const AVG_CHAR_WIDTH = 8.5; // Approximation for font width
        const PADDING = 24; // 10px padding left/right + border

        return cols.map(col => {
            // Check header length
            let maxLen = col.length;

            // Check first 10 rows
            const sampleSize = Math.min(data.length, 10);
            for (let i = 0; i < sampleSize; i++) {
                const val = String(data[i][col] ?? '');
                if (val.length > maxLen) maxLen = val.length;
            }

            const estimatedWidth = (maxLen * AVG_CHAR_WIDTH) + PADDING;
            return Math.min(Math.max(estimatedWidth, MIN_WIDTH), MAX_WIDTH);
        });
    };

    useEffect(() => {
        // Initialize widths based on content
        setColWidths(calculateColumnWidths(columns, rows));
    }, [columns, rows]);

    const handleResize = (index: number, newWidth: number) => {
        setColWidths(prev => {
            const next = [...prev];
            next[index] = Math.max(100, newWidth); // Enforce min width of 100px
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
                                    {columns.map((col, j) => {
                                        const cellValue = String(row[col] ?? '').trim();
                                        const isCellUrl = isUrl(cellValue);
                                        return (
                                            <td key={j} title={cellValue}>
                                                {isCellUrl ? (
                                                    <a
                                                        href={cellValue}
                                                        className="table-link"
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            onOpenUrl(cellValue);
                                                        }}
                                                    >
                                                        {cellValue}
                                                    </a>
                                                ) : (
                                                    cellValue
                                                )}
                                            </td>
                                        );
                                    })}
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
