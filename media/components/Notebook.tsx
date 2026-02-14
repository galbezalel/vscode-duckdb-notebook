import React from 'react';
import Cell from './Cell';
import { CellData } from '../App';

import { Plus } from 'lucide-react';

import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';

interface NotebookProps {
    cells: CellData[];
    focusId: string | null;
    onRun: (id: string) => void;
    onStop: (id: string) => void;
    onRunAndAdvance: (id: string) => void;
    onUpdate: (id: string, data: Partial<CellData>) => void;
    onRemove: (id: string) => void;
    onExport: (id: string, format: 'csv' | 'parquet') => void;
    onCopy: (id: string) => void;
    onOpenUrl: (url: string) => void;
    onAdd: (index: number) => void;
    onReorder: (activeId: string, overId: string) => void;
    forceJsonParsing: boolean;
    enableTextWrap: boolean;
}

const Notebook: React.FC<NotebookProps> = ({ cells, focusId, onRun, onStop, onRunAndAdvance, onUpdate, onRemove, onExport, onCopy, onOpenUrl, onAdd, onReorder, forceJsonParsing, enableTextWrap }) => {
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            onReorder(active.id as string, over.id as string);
        }
    };

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
        >
            <SortableContext
                items={cells.map(c => c.id)}
                strategy={verticalListSortingStrategy}
            >
                <div className="notebook">
                    {cells.map((cell, index) => (
                        <React.Fragment key={cell.id}>
                            <Cell
                                data={cell}
                                autoFocus={cell.id === focusId}
                                onRun={() => onRun(cell.id)}
                                onStop={() => onStop(cell.id)}
                                onRunAndAdvance={() => onRunAndAdvance(cell.id)}
                                onUpdate={(updates) => onUpdate(cell.id, updates)}
                                onRemove={() => onRemove(cell.id)}
                                onExport={(format) => onExport(cell.id, format)}
                                onCopy={() => onCopy(cell.id)}
                                onOpenUrl={onOpenUrl}
                                isLast={index === cells.length - 1}
                                forceJsonParsing={forceJsonParsing}
                                enableTextWrap={enableTextWrap}
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
            </SortableContext>
        </DndContext>
    );
};

export default Notebook;
