import React from 'react';
import Cell from './Cell';
import { CellData } from '../App';

import { Plus } from 'lucide-react';

interface NotebookProps {
    cells: CellData[];
    focusId: string | null;
    onRun: (id: string) => void;
    onRunAndAdd: (id: string) => void;
    onUpdate: (id: string, data: Partial<CellData>) => void;
    onRemove: (id: string) => void;
    onExport: (id: string, format: 'csv' | 'parquet') => void;
    onCopy: (id: string) => void;
    onOpenUrl: (url: string) => void;
    onAdd: (index: number) => void;
}

const Notebook: React.FC<NotebookProps> = ({ cells, focusId, onRun, onRunAndAdd, onUpdate, onRemove, onExport, onCopy, onOpenUrl, onAdd }) => {
    return (
        <div className="notebook">
            {cells.map((cell, index) => (
                <React.Fragment key={cell.id}>
                    <Cell
                        data={cell}
                        autoFocus={cell.id === focusId}
                        onRun={() => onRun(cell.id)}
                        onRunAndAdd={() => onRunAndAdd(cell.id)}
                        onUpdate={(updates) => onUpdate(cell.id, updates)}
                        onRemove={() => onRemove(cell.id)}
                        onExport={(format) => onExport(cell.id, format)}
                        onCopy={() => onCopy(cell.id)}
                        onOpenUrl={onOpenUrl}
                        isLast={index === cells.length - 1}
                    />
                    <div className="cell-separator" onClick={() => onAdd(index + 1)}>
                        <div className="separator-line" />
                        <div className="separator-actions">
                            <Plus size={12} />
                            <span>Add Cell</span>
                        </div>
                    </div>
                </React.Fragment>
            ))}
        </div>
    );
};

export default Notebook;
