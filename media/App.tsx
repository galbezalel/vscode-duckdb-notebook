import React, { useState, useEffect, useCallback, useRef } from 'react';
import Notebook from './components/Notebook';
import SettingsModal from './components/SettingsModal';
import { Play, Plus, RefreshCw, Copy, Settings as SettingsIcon } from 'lucide-react';

// Define types for our data structures
export interface CellData {
    id: string;
    query: string;
    status: 'idle' | 'running' | 'success' | 'error';
    error?: string;
    columns?: string[];
    columnTypes?: string[];
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

    const [showSettings, setShowSettings] = useState(false);
    const [settings, setSettings] = useState({
        showDescribe: true,
        previewLimit: 5,
        forceJsonParsing: false,
        allowExternalFileAccess: false // Default, will be overwritten by Extension Host
    });

    // File Access Request Handling
    const pendingRequests = useRef<Map<string, { resolve: (value: any) => void, reject: (reason: any) => void }>>(new Map());

    const requestFileAccess = (filePath: string): Promise<Uint8Array> => {
        return new Promise((resolve, reject) => {
            pendingRequests.current.set(filePath, { resolve, reject });
            vscode.postMessage({ type: 'requestFileAccess', filePath });
        });
    };

    useEffect(() => {
        const saved = localStorage.getItem('duckdb-settings');
        if (saved) {
            try {
                // Merge saved local settings with defaults
                // We exclude allowExternalFileAccess from local storage as it is managed by VS Code
                const parsed = JSON.parse(saved);
                setSettings(prev => ({ ...prev, ...parsed, allowExternalFileAccess: prev.allowExternalFileAccess }));
            } catch { }
        }
    }, []);

    const saveSettings = (newSettings: typeof settings) => {
        // Separate local vs extension settings
        const { allowExternalFileAccess, ...localSettings } = newSettings;

        // Update local settings
        setSettings(newSettings);
        localStorage.setItem('duckdb-settings', JSON.stringify(localSettings));
        setShowSettings(false);

        // Update extension setting if changed (checking against current state might be good, 
        // but 'settings' here is the old state? No, 'newSettings' is passed in).
        // We always send the update to be safe, or check against ref.
        vscode.postMessage({
            type: 'updateConfiguration',
            key: 'allowExternalFileAccess',
            value: allowExternalFileAccess
        });
    };

    // We'll keep the db instance in a ref or outside React state since it's not render-related directly
    // but for simplicity in this single-file view, we can manage connection state here.
    // In a real app, we might use a Context or a custom hook.

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;
            switch (message.type) {
                case 'loadData':
                    // Initialize DB and load data
                    // We need to pass current settings, but since this is an event listener
                    // registered on mount, 'settings' state will be stale (initial state).
                    // We should use a ref for settings to access latest values in the callback
                    // OR rely on the fact that loadData usually happens once or re-triggers initialization with fresh state if we structured it differently.
                    // However, to fix the stale closure issue without re-registering the listener repeatedly,
                    // let's use a ref.
                    initializeDuckDB(message);
                    break;
                case 'fileAccessGranted':
                    {
                        const { filePath, data } = message;
                        const request = pendingRequests.current.get(filePath);
                        if (request) {
                            request.resolve(data);
                            pendingRequests.current.delete(filePath);
                        }
                    }
                    break;
                case 'fileAccessDenied':
                    {
                        const { filePath, error } = message;
                        const request = pendingRequests.current.get(filePath);
                        if (request) {
                            request.reject(new Error(error));
                            pendingRequests.current.delete(filePath);
                        }
                    }
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

    // Ref to access latest settings in initializeDuckDB without re-binding
    const settingsRef = React.useRef(settings);
    useEffect(() => {
        settingsRef.current = settings;
    }, [settings]);

    // Store initial load message for re-initialization
    const initialMessageRef = useRef<any>(null);

    const initializeDuckDB = async (message: any) => {
        try {
            initialMessageRef.current = message;
            const { fileName, filePath, extension, data, config } = message;

            // Update settings from config if provided
            if (config) {
                setSettings(prev => ({ ...prev, ...config }));
            }

            // Get latest settings (after update above? No, setState is async. 
            // We should use the merged value for immediate use if needed, 
            // but for DB init we likely don't need allowExternalFileAccess immediately 
            // unless we eagerly load something. 'showDescribe' etc come from local state which is already set.
            // But wait, if we just called setSettings, 'settingsRef.current' wont be updated yet in this synchronous block.
            // However, showDescribe/previewLimit come from localStorage/defaults.
            // allowExternalFileAccess comes from message. 
            // We don't use allowExternalFileAccess in initializeDuckDB directly, only later in query execution.
            // So calling setSettings here is fine for UI.)

            const currentSettings = settingsRef.current;

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
            (window as any).duckdbWorker = worker; // Store worker for termination

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
                readCommand = `read_csv_auto('${filePath}', allow_quoted_nulls=false, header=true)`;
            }

            // Cell 1: Setup & Load
            const cell1Id = `cell-${Date.now()}`;
            const setupQuery = [
                `CREATE OR REPLACE TABLE ${tableName} AS SELECT * FROM ${readCommand};`,
                `-- COPY ${tableName} TO '${fileName}_backup.parquet';`
            ].join('\n');

            const initialCells: CellData[] = [
                { id: cell1Id, query: setupQuery, status: 'idle' }
            ];

            // Cell 2: Structure (Conditional)
            if (currentSettings.showDescribe) {
                const cell2Id = `cell-${Date.now() + 1}`;
                initialCells.push({
                    id: cell2Id,
                    query: `DESCRIBE ${tableName};`,
                    status: 'idle'
                });
            }

            // Cell 3: Preview
            const cell3Id = `cell-${Date.now() + 2}`;
            const previewQuery = `SELECT * FROM ${tableName} LIMIT ${currentSettings.previewLimit};`;
            initialCells.push({
                id: cell3Id,
                query: previewQuery,
                status: 'idle'
            });

            // Cell 4: Empty
            const cell4Id = `cell-${Date.now() + 3}`;
            initialCells.push({ id: cell4Id, query: '', status: 'idle' });

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

            // Execute remaining cells sequentially
            // We need to find the IDs we just created.
            // Since initialCells is local, we can iterate it (skipping first which is setup)

            for (let i = 1; i < initialCells.length; i++) {
                const cell = initialCells[i];
                if (!cell.query) continue; // Skip empty last cell

                let cellState: Partial<CellData> = { status: 'running' };
                setCells(prev => prev.map(c => c.id === cell.id ? { ...c, ...cellState } : c));

                try {
                    const s = performance.now();
                    const res = await conn.query(cell.query);
                    const rows = res.toArray().map((r: any) => r.toJSON());
                    const columns = res.schema.fields.map((f: any) => f.name);
                    const columnTypes = res.schema.fields.map((f: any) => String(f.type));
                    cellState = { status: 'success', rows, columns, columnTypes, executionTime: performance.now() - s };
                } catch (e: any) {
                    cellState = { status: 'error', error: e.message };
                }
                setCells(prev => prev.map(c => c.id === cell.id ? { ...c, ...cellState } : c));
            }

        } catch (err: any) {
            console.error(err);
            setDbError(err.message);
        }
    };


    const stopCell = async (id: string) => {
        const cell = cells.find(c => c.id === id);
        if (!cell || cell.status !== 'running') return;

        // Visual update immediately
        updateCell(id, { status: 'idle', error: 'Execution cancelled' });

        // Terminate worker
        try {
            const worker = (window as any).duckdbWorker;
            if (worker) {
                worker.terminate();
            }
            const db = (window as any).duckdbInstance;
            if (db) {
                await db.terminate();
            }
        } catch (e) {
            console.error("Error terminating worker:", e);
        }

        setDbReady(false);
        (window as any).duckdbConnection = null;
        (window as any).duckdbInstance = null;
        (window as any).duckdbWorker = null;

        // Re-initialize if we have the initial data
        if (initialMessageRef.current) {
            // Small delay to ensure clean termination
            setTimeout(() => {
                initializeDuckDB(initialMessageRef.current);
            }, 100);
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

            const executeQuery = async (): Promise<any> => {
                try {
                    return await conn.query(cell.query);
                } catch (err: any) {
                    const errorMsg = err.message || '';
                    // IO Error: No files found that match the pattern "/Users/..."
                    const match = errorMsg.match(/IO Error: No files found that match the pattern "([^"]+)"/);
                    if (match && match[1]) {
                        // Found external file access attempt
                        const filePath = match[1];
                        console.log(`Intercepted file access request: ${filePath}`);

                        // Request access from extension host
                        try {
                            // 1. Request file content
                            const buffer = await requestFileAccess(filePath);

                            // 2. Register file in DuckDB
                            const db = (window as any).duckdbInstance;
                            await db.registerFileBuffer(filePath, buffer);

                            // 3. Retry query
                            return await conn.query(cell.query);
                        } catch (accessErr: any) {
                            // User denied or failed
                            throw new Error(`File Access Denied: ${accessErr.message}`);
                        }
                    } else {
                        throw err;
                    }
                }
            };

            const result = await executeQuery();

            // Check if it's a command that doesn't return rows (like CREATE VIEW)
            // DuckDB WASM result might still have toArray but empty
            const rows = result.toArray().map((row: any) => row.toJSON());
            const columns = result.schema.fields.map((f: any) => f.name);
            const columnTypes = result.schema.fields.map((f: any) => String(f.type));

            updateCell(id, {
                status: 'success',
                rows,
                columns,
                columnTypes,
                executionTime: performance.now() - startTime
            });

            // Check for COPY command to handle file export to local disk
            // Regex to capture filename in: COPY ... TO 'filename' ...
            const copyMatch = cell.query.match(/COPY\s+(?:.*|\(.*?\))\s+TO\s+'([^']+)'/i);
            if (copyMatch && copyMatch[1]) {
                const fileName = copyMatch[1];
                try {
                    const db = (window as any).duckdbInstance;
                    if (db) {
                        const buffer = await db.copyFileToBuffer(fileName);
                        console.log(`[App] Copied ${fileName} from DB, size=${buffer.length}`);

                        // Chunked Transfer
                        const CHUNK_SIZE = 1024 * 1024; // 1MB
                        const totalSize = buffer.length;
                        const chunks = Math.ceil(totalSize / CHUNK_SIZE);

                        // Start
                        vscode.postMessage({ type: 'saveFileStart', name: fileName });

                        // Send Chunks
                        for (let i = 0; i < chunks; i++) {
                            const start = i * CHUNK_SIZE;
                            const end = Math.min(start + CHUNK_SIZE, totalSize);
                            const chunk = buffer.slice(start, end);
                            console.log(`[App] Sending chunk ${i + 1}/${chunks} for ${fileName}, size=${chunk.length}`);
                            vscode.postMessage({
                                type: 'saveFileChunk',
                                name: fileName,
                                data: chunk
                            });
                            // Allow UI loop to breathe slightly
                            await new Promise(r => setTimeout(r, 10));
                        }

                        // End
                        vscode.postMessage({ type: 'saveFileEnd', name: fileName });

                        await db.dropFile(fileName);
                    }
                } catch (e) {
                    console.error("Failed to export COPY file:", e);
                    // Don't fail the cell execution, just log/notify
                }
            }
        } catch (err: any) {
            updateCell(id, {
                status: 'error',
                error: err.message
            });
        }
    };

    const handleReorder = (activeId: string, overId: string) => {
        setCells((items) => {
            const oldIndex = items.findIndex((c) => c.id === activeId);
            const newIndex = items.findIndex((c) => c.id === overId);

            // Basic array move logic since we can't import arrayMove here easily without adding it to App deps too,
            // or we just implement it. It's simple.
            const newItems = [...items];
            const [movedItem] = newItems.splice(oldIndex, 1);
            newItems.splice(newIndex, 0, movedItem);
            return newItems;
        });
    };

    const runCellAndAdvance = async (id: string) => {
        await runCell(id);

        const index = cells.findIndex(c => c.id === id);
        if (index === -1) return;

        if (index < cells.length - 1) {
            setFocusId(cells[index + 1].id);
        } else {
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
            const cleanQuery = cell.query.trim().replace(/;$/, '');
            const copyQuery = `COPY (${cleanQuery}) TO '${fileName}' (FORMAT ${format.toUpperCase()})`;

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

    const copyCell = async (id: string,) => {
        const cell = cells.find(c => c.id === id);
        if (!cell || !cell.columns || !cell.rows) return;

        try {
            const escapeCsvValue = (val: any): string => {
                if (val === null || val === undefined) return '';
                let str = String(val);
                if (typeof val === 'object') {
                    try { str = JSON.stringify(val); } catch { }
                }

                if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
                    return `"${str.replace(/"/g, '""')}"`;
                }
                return str;
            };

            const header = cell.columns.map(escapeCsvValue).join(',');
            const body = cell.rows.map(row => {
                return cell.columns!.map(col => escapeCsvValue(row[col])).join(',');
            }).join('\n');

            const text = header + '\n' + body;

            // Send to extension host
            vscode.postMessage({
                type: 'copyToClipboard',
                value: text
            });
        } catch (err: any) {
            console.error("Copy failed:", err);
            setDbError("Copy failed: " + err.message);
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
                    <button onClick={() => vscode.postMessage({ type: 'requestRefresh' })} title="Reload File" className="icon-btn">
                        <RefreshCw size={16} />
                    </button>
                    <div className="divider" />
                    <button onClick={() => setShowSettings(true)} title="Settings" className="icon-btn">
                        <SettingsIcon size={16} />
                    </button>
                </div>
            </header>
            <main className="notebook-container">
                <Notebook
                    cells={cells}
                    focusId={focusId}
                    onRun={runCell}
                    onStop={stopCell} // Pass stop handler
                    onRunAndAdvance={runCellAndAdvance}
                    onUpdate={updateCell}
                    onRemove={removeCell}
                    onExport={exportCell}
                    onOpenUrl={handleOpenUrl}
                    onCopy={copyCell}
                    onAdd={addCell}
                    onReorder={handleReorder}
                    forceJsonParsing={settings.forceJsonParsing}
                />
            </main>
            <SettingsModal
                isOpen={showSettings}
                onClose={() => setShowSettings(false)}
                settings={settings}
                onSave={saveSettings}
            />
        </div>
    );
};

export default App;
