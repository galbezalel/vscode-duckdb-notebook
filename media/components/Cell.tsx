import React from 'react';
import { Play, Trash2, Clock, AlertCircle, CheckCircle2, Download, FileOutput } from 'lucide-react';
import { CellData } from '../App';
import SqlEditor from './SqlEditor';
import ResultTable from './ResultTable';

interface CellProps {
    data: CellData;
    autoFocus?: boolean;
    onRun: () => void;
    onRunAndAdd: () => void;
    onUpdate: (data: Partial<CellData>) => void;
    onRemove: () => void;
    onExport: (format: 'csv' | 'parquet') => void;
    onOpenUrl: (url: string) => void;
    isLast: boolean;
}

const Cell: React.FC<CellProps> = ({ data, autoFocus, onRun, onRunAndAdd, onUpdate, onRemove, onExport, onOpenUrl }) => {
    return (
        <div className={`cell ${data.status}`}>
            <div className="cell-header">
                <div className="cell-status">
                    {data.status === 'running' && <div className="spinner" />}
                    {data.status === 'success' && <CheckCircle2 size={14} className="text-success" />}
                    {data.status === 'error' && <AlertCircle size={14} className="text-error" />}
                    <span className="status-text">
                        {data.status === 'idle' ? 'Ready' :
                            data.status === 'running' ? 'Running...' :
                                data.status === 'success' ? `Finished in ${data.executionTime?.toFixed(2)}ms` : 'Error'}
                    </span>
                </div>
                <div className="cell-actions">
                    {data.status === 'success' && (
                        <>
                            <button onClick={() => onExport('csv')} title="Export as CSV">
                                <FileOutput size={14} />
                                <span>.csv</span>
                            </button>
                            <button onClick={() => onExport('parquet')} title="Export as Parquet">
                                <Download size={14} />
                                <span>.parquet</span>
                            </button>
                            <div className="divider" />
                        </>
                    )}
                    <button onClick={onRun} className="icon-btn run-btn" title="Run (Cmd+Enter)">
                        <Play size={14} />
                    </button>
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
                    onRunAndAdd={onRunAndAdd}
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
                        <ResultTable columns={data.columns} rows={data.rows || []} onOpenUrl={onOpenUrl} />
                    </div>
                )
            }
        </div >
    );
};

export default Cell;
