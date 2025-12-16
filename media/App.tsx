import React, { useState, useEffect, useCallback } from 'react';
import Notebook from './components/Notebook';
import { Play, Plus, RefreshCw, Copy } from 'lucide-react';

// Define types for our data structures
export interface CellData {
    id: string;
    query: string;
    status: 'idle' | 'running' | 'success' | 'error';
    error?: string;
    columns?: string[];
    rows?: any[];
    executionTime?: number;
}

export interface FileInfo {
    fileName: string;
    extension: string;
}

declare global {
    interface Window {
        acquireVsCodeApi: () => any;
        __duckdbPaths: {
            worker: string;
            wasm: string;
        };
    }
}

const vscode = window.acquireVsCodeApi();

const App: React.FC = () => {
    const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
    const [dbReady, setDbReady] = useState(false);
    const [dbError, setDbError] = useState<string | null>(null);
    const [cells, setCells] = useState<CellData[]>([]);
    const [focusId, setFocusId] = useState<string | null>(null);

    // We'll keep the db instance in a ref or outside React state since it's not render-related directly
    // but for simplicity in this single-file view, we can manage connection state here.
    // In a real app, we might use a Context or a custom hook.

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;
            switch (message.type) {
                case 'loadData':
                    // Initialize DB and load data
                    initializeDuckDB(message);
                    break;
            }
        };

        window.addEventListener('message', handleMessage);

        // Signal ready
        vscode.postMessage({ type: 'ready' });

        return () => {
            window.removeEventListener('message', handleMessage);
        };
    }, []);

    const initializeDuckDB = async (message: any) => {
        try {
            const { fileName, filePath, extension, data } = message;

            // Dynamic import
            const duckdb = await import('@duckdb/duckdb-wasm');
            const paths = window.__duckdbPaths;

            const bundle = {
                mainModule: paths.wasm,
                mainWorker: paths.worker,
            };

            const workerUrl = URL.createObjectURL(
                new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' })
            );
            const worker = new Worker(workerUrl);
            URL.revokeObjectURL(workerUrl);

            const logger = new duckdb.ConsoleLogger();
            const db = new duckdb.AsyncDuckDB(logger, worker);
            await db.instantiate(bundle.mainModule);

            const conn = await db.connect();

            // Store db instance globally
            (window as any).duckdbConnection = conn;
            (window as any).duckdbInstance = db;

            // Register the file using its original path to allow "read_...('path')"
            // Note: DuckDB WASM virtual FS handles basic paths.
            await db.registerFileBuffer(filePath, new Uint8Array(data));

            const tableName = 'data';
            const ext = extension.toLowerCase();
            let readCommand = '';

            // Construct read command based on extension
            if (ext === '.parquet') {
                readCommand = `read_parquet('${filePath}')`;
            } else {
                // assume CSV
                readCommand = `read_csv_auto('${filePath}')`;
            }

            // Cell 1: Setup & Load
            const cell1Id = `cell-${Date.now()}`;
            const setupQuery = [

                `CREATE OR REPLACE TABLE ${tableName} AS SELECT * FROM ${readCommand};`,
                `-- COPY ${tableName} TO '${fileName}_backup.parquet';`
            ].join('\n');

            // Cell 2: Structure
            const cell2Id = `cell-${Date.now() + 1}`;
            const structureQuery = `DESCRIBE ${tableName};`;

            // Cell 3: Preview
            const cell3Id = `cell-${Date.now() + 2}`;
            const previewQuery = `SELECT * FROM ${tableName} LIMIT 5;`;

            // Cell 4: Empty
            const cell4Id = `cell-${Date.now() + 3}`;

            const initialCells: CellData[] = [
                { id: cell1Id, query: setupQuery, status: 'idle' },
                { id: cell2Id, query: structureQuery, status: 'idle' },
                { id: cell3Id, query: previewQuery, status: 'idle' },
                { id: cell4Id, query: '', status: 'idle' }
            ];

            setCells(initialCells);
            setFocusId(cell4Id);
            setFileInfo({ fileName, extension });
            setDbReady(true);

            // Execute Chain
            // 1. Setup
            let cell1State: Partial<CellData> = { status: 'running' };
            setCells(prev => prev.map(c => c.id === cell1Id ? { ...c, ...cell1State } : c));

            try {
                const s1 = performance.now();
                await conn.query(setupQuery);
                cell1State = { status: 'success', executionTime: performance.now() - s1 };
            } catch (e: any) {
                cell1State = { status: 'error', error: e.message };
            }

            // Update Cell 1 Result
            setCells(prev => prev.map(c => c.id === cell1Id ? { ...c, ...cell1State } : c));

            if (cell1State.status !== 'success') return; // Stop if setup failed

            // 2. Structure
            let cell2State: Partial<CellData> = { status: 'running' };
            setCells(prev => prev.map(c => c.id === cell2Id ? { ...c, ...cell2State } : c));

            try {
                const s2 = performance.now();
                const res = await conn.query(structureQuery);
                const rows = res.toArray().map((r: any) => r.toJSON());
                const columns = res.schema.fields.map((f: any) => f.name);
                cell2State = { status: 'success', rows, columns, executionTime: performance.now() - s2 };
            } catch (e: any) {
                cell2State = { status: 'error', error: e.message };
            }
            setCells(prev => prev.map(c => c.id === cell2Id ? { ...c, ...cell2State } : c));

            // 3. Preview
            let cell3State: Partial<CellData> = { status: 'running' };
            setCells(prev => prev.map(c => c.id === cell3Id ? { ...c, ...cell3State } : c));

            try {
                const s3 = performance.now();
                const res = await conn.query(previewQuery);
                const rows = res.toArray().map((r: any) => r.toJSON());
                const columns = res.schema.fields.map((f: any) => f.name);
                cell3State = { status: 'success', rows, columns, executionTime: performance.now() - s3 };
            } catch (e: any) {
                cell3State = { status: 'error', error: e.message };
            }
            setCells(prev => prev.map(c => c.id === cell3Id ? { ...c, ...cell3State } : c));


        } catch (err: any) {
            console.error(err);
            setDbError(err.message);
        }
    };


    const addCell = (index?: number) => {
        const newId = `cell-${Date.now()}`;
        const newCell: CellData = {
            id: newId,
            query: '',
            status: 'idle'
        };

        setCells(prev => {
            if (index !== undefined) {
                const newCells = [...prev];
                newCells.splice(index, 0, newCell);
                return newCells;
            }
            return [...prev, newCell];
        });
        setFocusId(newId);
    };

    const removeCell = (id: string) => {
        setCells(prev => prev.filter(c => c.id !== id));
    };

    const updateCell = (id: string, updates: Partial<CellData>) => {
        setCells(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    };

    const runCell = async (id: string) => {
        // We need to get the latest cell state, but since runCell is a closure, 
        // we rely on the id lookup in the current 'cells' state if we were to use it directly.
        // However, 'cells' in this closure is stale if not careful.
        // Better to use functional update or ref for latest state if needed, 
        // but here we just need the query which shouldn't change *during* the run initiation 
        // unless user types fast. 
        // Actually, 'cells' is from the render scope, so it might be stale if runCell is not recreated.
        // But 'runCell' is passed down. Let's use a ref for cells or just trust React re-renders.
        // For safety, let's find the cell in the current render scope 'cells'.

        const cell = cells.find(c => c.id === id);
        if (!cell || !dbReady) return;

        updateCell(id, { status: 'running', error: undefined });
        const startTime = performance.now();

        try {
            const conn = (window as any).duckdbConnection;
            if (!conn) throw new Error("Database not connected");

            // If the query is empty, just return
            if (!cell.query.trim()) {
                updateCell(id, { status: 'idle' });
                return;
            }

            const result = await conn.query(cell.query);

            // Check if it's a command that doesn't return rows (like CREATE VIEW)
            // DuckDB WASM result might still have toArray but empty
            const rows = result.toArray().map((row: any) => row.toJSON());
            const columns = result.schema.fields.map((f: any) => f.name);

            updateCell(id, {
                status: 'success',
                rows,
                columns,
                executionTime: performance.now() - startTime
            });
        } catch (err: any) {
            updateCell(id, {
                status: 'error',
                error: err.message
            });
        }
    };

    const runCellAndAdd = async (id: string) => {
        await runCell(id);

        // We need to check if we need to add a cell. 
        // Since runCell is async, 'cells' might be stale here if we rely on closure.
        // But we can check the index based on the *current* cells when this function was created.
        // Ideally, we should use a functional update to be safe or check against latest.
        // But for now, let's just check the index.

        const index = cells.findIndex(c => c.id === id);
        if (index === -1) return;

        if (index === cells.length - 1) {
            addCell();
        }
    };

    const exportCell = async (id: string, format: 'csv' | 'parquet') => {
        const cell = cells.find(c => c.id === id);
        if (!cell || !dbReady) return;

        try {
            const conn = (window as any).duckdbConnection;
            if (!conn) throw new Error("Database not connected");

            const fileName = `export_${Date.now()}.${format}`;
            const copyQuery = `COPY (${cell.query}) TO '${fileName}' (FORMAT ${format.toUpperCase()})`;

            await conn.query(copyQuery);

            // Read the file back from DuckDB WASM filesystem
            // We need access to the DuckDB instance, not just connection
            // But we can use the connection to read_blob if available, or register/read via db instance
            // The db instance was local to initializeDuckDB. We should have saved it.
            // Let's attach db to window as well.

            const db = (window as any).duckdbInstance;
            if (!db) throw new Error("Database instance not found");

            const buffer = await db.copyFileToBuffer(fileName);

            // Send to extension host
            vscode.postMessage({
                type: 'exportData',
                data: buffer,
                format,
                defaultName: `result.${format}`
            });

            // Cleanup
            await db.dropFile(fileName);

        } catch (err: any) {
            console.error("Export failed:", err);
            setDbError("Export failed: " + err.message);
        }
    };

    const handleOpenUrl = (url: string) => {
        vscode.postMessage({ type: 'openUrl', url });
    };

    if (dbError) {
        return <div className="error-screen">Failed to initialize DuckDB: {dbError}</div>;
    }

    if (!dbReady) {
        return <div className="loading-screen">Loading DuckDB...</div>;
    }

    return (
        <div className="app-container">
            <header className="toolbar">
                <div className="file-info">
                    <span className="file-name">{fileInfo?.fileName}</span>
                    <span className="badge">DuckDB</span>
                </div>
                <div className="actions">
                    <button onClick={() => vscode.postMessage({ type: 'requestRefresh' })} title="Reload File">
                        <RefreshCw size={16} />
                        <span>Reload</span>
                    </button>
                    <button onClick={() => addCell()} className="primary">
                        <Plus size={16} />
                        <span>New Cell</span>
                    </button>
                </div>
            </header>
            <main className="notebook-container">
                <Notebook
                    cells={cells}
                    focusId={focusId}
                    onRun={runCell}
                    onRunAndAdd={runCellAndAdd}
                    onUpdate={updateCell}
                    onRemove={removeCell}
                    onExport={exportCell}
                    onOpenUrl={handleOpenUrl}
                    onAdd={addCell}
                />
            </main>
        </div>
    );
};

export default App;
