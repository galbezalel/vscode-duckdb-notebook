import React from 'react';
import Cell from './Cell';
import { CellData } from '../App';

interface NotebookProps {
    cells: CellData[];
    focusId: string | null;
    onRun: (id: string) => void;
    onRunAndAdd: (id: string) => void;
    onUpdate: (id: string, data: Partial<CellData>) => void;
    onRemove: (id: string) => void;
    onExport: (id: string, format: 'csv' | 'parquet') => void;
}

const Notebook: React.FC<NotebookProps> = ({ cells, focusId, onRun, onRunAndAdd, onUpdate, onRemove, onExport }) => {
    return (
        <div className="notebook">
            {cells.map((cell, index) => (
                <Cell
                    key={cell.id}
                    data={cell}
                    autoFocus={cell.id === focusId}
                    onRun={() => onRun(cell.id)}
                    onRunAndAdd={() => onRunAndAdd(cell.id)}
                    onUpdate={(updates) => onUpdate(cell.id, updates)}
                    onRemove={() => onRemove(cell.id)}
                    onExport={(format) => onExport(cell.id, format)}
                    isLast={index === cells.length - 1}
                />
            ))}
        </div>
    );
};

export default Notebook;
