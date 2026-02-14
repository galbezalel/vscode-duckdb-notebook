import React from 'react';
import { Play, Trash2, Clock, AlertCircle, CheckCircle2, Download, FileOutput, Copy, Square } from 'lucide-react';
import { CellData } from '../App';
import SqlEditor from './SqlEditor';
import ResultTable from './ResultTable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface CellProps {
    data: CellData;
    autoFocus?: boolean;
    onRun: () => void;
    onStop: () => void;
    onRunAndAdvance: () => void;
    onUpdate: (data: Partial<CellData>) => void;
    onRemove: () => void;
    onExport: (format: 'csv' | 'parquet') => void;
    onCopy: () => void;
    onOpenUrl: (url: string) => void;
    isLast: boolean;
    forceJsonParsing: boolean;
    enableTextWrap: boolean;
}

const Cell: React.FC<CellProps> = ({ data, autoFocus, onRun, onStop, onRunAndAdvance, onUpdate, onRemove, onExport, onCopy, onOpenUrl, forceJsonParsing, enableTextWrap }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: data.id });

    const cellRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if (autoFocus && cellRef.current) {
            // Scroll to the cell when it gets focus
            cellRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [autoFocus]);

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 999 : 'auto',
        position: 'relative' as const,
    };

    // Combine dnd-kit ref and local ref
    const setRefs = (node: HTMLDivElement | null) => {
        setNodeRef(node);
        cellRef.current = node;
    };

    return (
        <div ref={setRefs} style={style} className={`cell ${data.status}`}>
            <div className="cell-header" {...attributes} {...listeners} style={{ cursor: 'grab' }}>
                <div className="cell-status">
                    {data.status === 'running' && <div className="spinner" />}
                    {data.status === 'success' && <CheckCircle2 size={14} className="text-success" />}
                    {data.status === 'error' && <AlertCircle size={14} className="text-error" />}
                    <span className="status-text">
                        {data.status === 'idle' ? 'Ready' :
                            data.status === 'running' ? 'Running...' :
                                data.status === 'success' ? `Finished in ${data.executionTime?.toFixed(2)}ms ${data.rows ? `(${data.rows.length} rows)` : ''}` : 'Error'}
                    </span>
                </div>
                <div className="cell-actions" onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                    {data.status === 'running' ? (
                        <button onClick={onStop} className="icon-btn stop-btn" title="Stop Execution">
                            <Square size={14} fill="currentColor" />
                        </button>
                    ) : (data.status === 'success' && (
                        <>
                            <button onClick={() => onExport('csv')} title="Export as CSV">
                                <FileOutput size={14} />
                                <span>.csv</span>
                            </button>
                            <button onClick={() => onExport('parquet')} title="Export as Parquet">
                                <Download size={14} />
                                <span>.parquet</span>
                            </button>
                            <button onClick={onCopy} title="Copy as CSV">
                                <Copy size={14} />
                                <span>copy</span>
                            </button>
                            <div className="divider" />
                        </>
                    ))}
                    {data.status !== 'running' && (
                        <button onClick={onRun} className="icon-btn run-btn" title="Run (Cmd+Enter)">
                            <Play size={14} />
                        </button>
                    )}
                    <button onClick={onRemove} className="icon-btn delete-btn" title="Delete Cell">
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>

            <div className="cell-editor">
                <SqlEditor
                    value={data.query}
                    autoFocus={autoFocus}
                    onChange={(val) => onUpdate({ query: val })}
                    onRun={onRun}
                    onRunAndAdvance={onRunAndAdvance}
                />
            </div>

            {
                data.error && (
                    <div className="cell-error">
                        <AlertCircle size={16} />
                        <pre>{data.error}</pre>
                    </div>
                )
            }

            {
                data.status === 'success' && data.columns && (
                    <div className="cell-results">
                        <ResultTable columns={data.columns} rows={data.rows || []} columnTypes={data.columnTypes} onOpenUrl={onOpenUrl} forceJsonParsing={forceJsonParsing} enableTextWrap={enableTextWrap} />
                    </div>
                )
            }
        </div >
    );
};

export default Cell;
