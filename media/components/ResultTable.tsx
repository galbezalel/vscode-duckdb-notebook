import React, { useEffect, useRef, useState } from 'react';
import { X, ChevronRight, ChevronDown } from 'lucide-react';

interface ResultTableProps {
    columns: string[];
    columnTypes?: string[];
    rows: any[];
    onOpenUrl: (url: string) => void;
    forceJsonParsing: boolean;
    enableTextWrap: boolean;
}

const isUrl = (text: string): boolean => {
    // Simple regex for URL detection
    return /^https?:\/\/\S+$/.test(text);
};

// --- JSON Tree Viewer Component ---

interface JsonTreeProps {
    data: any;
    label?: string;
    expandAll?: boolean;
}

const JsonTree: React.FC<JsonTreeProps> = ({ data, label, expandAll = false }) => {
    const [expanded, setExpanded] = useState(expandAll);
    const isObject = data !== null && typeof data === 'object';
    const isArray = Array.isArray(data);
    const isEmpty = isObject && Object.keys(data).length === 0;

    const toggleExpand = (e: React.MouseEvent) => {
        e.stopPropagation();
        setExpanded(!expanded);
    };

    if (!isObject) {
        let valClass = '';
        if (typeof data === 'string') valClass = 'json-string';
        else if (typeof data === 'number') valClass = 'json-number';
        else if (typeof data === 'boolean') valClass = 'json-boolean';
        else if (data === null) valClass = 'json-null';

        const displayValue = data === null ? 'null' : String(data);
        const quotedValue = typeof data === 'string' ? `"${displayValue}"` : displayValue;

        return (
            <div className="json-leaf">
                {label && <span className="json-key">{label}: </span>}
                <span className={`json-value ${valClass}`}>{quotedValue}</span>
            </div>
        );
    }

    if (isEmpty) {
        return (
            <div className="json-leaf">
                {label && <span className="json-key">{label}: </span>}
                <span className="json-value strip">{isArray ? '[]' : '{}'}</span>
            </div>
        );
    }

    const keys = Object.keys(data);
    const itemLabel = isArray ? `Array(${keys.length})` : '{...}';

    return (
        <div className="json-node">
            <div className="json-node-header" onClick={toggleExpand}>
                <span className="toggle-icon">
                    {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </span>
                {label && <span className="json-key">{label}: </span>}
                <span className="json-preview">{!expanded && itemLabel}</span>
            </div>
            {expanded && (
                <div className="json-children">
                    {keys.map(key => (
                        <JsonTree
                            key={key}
                            data={data[key]}
                            label={isArray ? undefined : key} // Don't show index keys for arrays usually, creates noise. Or maybe we should? Let's show indices if array.
                        // Actually showing index for list items is good for tracking.
                        // But usually arrays are just list of values.
                        // Let's decide: if array, show index.
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

const ResultTable: React.FC<ResultTableProps> = ({ columns, rows, onOpenUrl, forceJsonParsing, columnTypes, enableTextWrap }) => {
    const [colWidths, setColWidths] = useState<number[]>([]);
    const [selectedData, setSelectedData] = useState<any | null>(null);
    const [tooltip, setTooltip] = useState<{ visible: boolean; x: number; y: number; content: string } | null>(null);

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
                const val = data[i][col];
                let len = 0;
                if (val !== null && typeof val === 'object') {
                    // For objects/arrays, we display a placeholder or JSON string rep
                    // Use a rough estimate or fixed width for complexity
                    len = 20; // "[Object]" or "{...}"
                } else {
                    len = String(val ?? '').length;
                }

                if (len > maxLen) maxLen = len;
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

    const handleCellMouseEnter = (e: React.MouseEvent, content: string) => {
        if (!content) return;

        // Check for overflow
        const element = e.currentTarget as HTMLElement;
        if (element.scrollWidth <= element.clientWidth) {
            return;
        }

        // Calculate position
        setTooltip({
            visible: true,
            x: e.clientX + 10,
            y: e.clientY + 10,
            content
        });
    };

    const handleCellMouseLeave = () => {
        setTooltip(null);
    };

    // Update tooltip position while moving mouse
    const handleCellMouseMove = (e: React.MouseEvent) => {
        if (tooltip?.visible) {
            setTooltip(prev => prev ? ({ ...prev, x: e.clientX + 10, y: e.clientY + 10 }) : null);
        }
    };

    if (!columns.length) {
        return <div className="muted">No results</div>;
    }

    const totalWidth = colWidths.reduce((a, b) => a + b, 0);

    // Helper to safely parse JSON if it's a string
    const getObjectValue = (val: any) => {
        if (val === null) return null;
        if (typeof val === 'object') return val;

        // Try parsing string if it looks like JSON - Only if forced
        if (forceJsonParsing && typeof val === 'string') {
            const trimmed = val.trim();
            if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
                (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
                try {
                    return JSON.parse(val);
                } catch {
                    return null;
                }
            }
        }
        return null;
    };

    return (
        <div className="table-result-container" style={{ position: 'relative' }}>
            {selectedData && (
                <div className="json-drawer">
                    <div className="json-drawer-header">
                        <span className="drawer-title">JSON Viewer</span>
                        <button className="icon-btn" onClick={() => setSelectedData(null)}>
                            <X size={16} />
                        </button>
                    </div>
                    <div className="json-drawer-content">
                        <JsonTree data={selectedData} expandAll={true} />
                    </div>
                </div>
            )}

            {tooltip && tooltip.visible && (
                <div
                    className="custom-tooltip"
                    style={{
                        top: tooltip.y,
                        left: tooltip.x,
                    }}
                >
                    {tooltip.content}
                </div>
            )}

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
                                            const rawValue = row[col];

                                            // Explicit check for null
                                            if (rawValue === null) {
                                                return (
                                                    <td
                                                        key={j}
                                                        className={enableTextWrap ? 'wrap-text' : ''}
                                                        onMouseEnter={(e) => handleCellMouseEnter(e, "NULL")}
                                                        onMouseLeave={handleCellMouseLeave}
                                                        onMouseMove={handleCellMouseMove}
                                                    >
                                                        <span className="null-value">NULL</span>
                                                    </td>
                                                );
                                            }

                                            // Check for Object/Array (nested data) or JSON-like string
                                            const objectValue = getObjectValue(rawValue);

                                            if (objectValue) {
                                                const isArray = Array.isArray(objectValue);
                                                const display = isArray ? `Array(${objectValue.length})` : '{...}';
                                                // Objects don't need text wrap usually, they are clickable
                                                return (
                                                    <td
                                                        key={j}
                                                        title="Click to view JSON"
                                                        className="clickable-cell"
                                                        onClick={() => setSelectedData(JSON.parse(JSON.stringify(objectValue)))}
                                                    >
                                                        <div className="json-cell-content">
                                                            <span className="json-badge">{display}</span>
                                                            <span className="json-snippet">
                                                                {typeof rawValue === 'string' ? rawValue : JSON.stringify(rawValue).slice(0, 50)}
                                                            </span>
                                                        </div>
                                                    </td>
                                                );
                                            }

                                            let cellValue = String(rawValue ?? '').trim();

                                            // Check for Timestamp type using columnTypes
                                            // DuckDB WASM types are strings like "TIMESTAMP", "DATE", etc.
                                            // or sometimes objects { logicalType: ... } but here we converted to String(f.type) in App.tsx
                                            // String(f.type) usually returns "TIMESTAMP" or similar for primitive types.
                                            // Let's check if we have types and if the current col index matches a timestamp type.
                                            const colType = columnTypes && columnTypes[j] ? columnTypes[j].toUpperCase() : '';
                                            const isTimestamp = colType.includes('TIMESTAMP') || colType.includes('DATE');

                                            if (isTimestamp && typeof rawValue === 'number') {
                                                try {
                                                    cellValue = new Date(rawValue).toISOString().replace('T', ' ').replace('Z', '');
                                                } catch { }
                                            }

                                            const isCellUrl = isUrl(cellValue);

                                            // Determine classes
                                            const cellClass = enableTextWrap ? 'wrap-text' : '';

                                            return (
                                                <td
                                                    key={j}
                                                    className={cellClass}
                                                    onMouseEnter={(e) => handleCellMouseEnter(e, cellValue)}
                                                    onMouseLeave={handleCellMouseLeave}
                                                    onMouseMove={handleCellMouseMove}
                                                >
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
            th.style.cursor = e.clientX > rect.right - 10 ? 'col-resize' : 'auto';
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
