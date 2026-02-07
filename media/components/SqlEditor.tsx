import React, { useEffect, useRef } from 'react';
import { EditorView, keymap } from '@codemirror/view';
import { EditorState, Prec } from '@codemirror/state';
import { sql } from '@codemirror/lang-sql';
import { oneDark } from '@codemirror/theme-one-dark';
import { defaultKeymap } from '@codemirror/commands';
import { basicSetup } from 'codemirror';

interface SqlEditorProps {
    value: string;
    autoFocus?: boolean;
    onChange: (value: string) => void;
    onRun: () => void;
    onRunAndAdvance: () => void;
}

const SqlEditor: React.FC<SqlEditorProps> = ({ value, autoFocus, onChange, onRun, onRunAndAdvance }) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);

    // Use refs for callbacks to avoid stale closures in the effect
    const onChangeRef = useRef(onChange);
    const onRunRef = useRef(onRun);
    const onRunAndAdvanceRef = useRef(onRunAndAdvance);

    useEffect(() => {
        onChangeRef.current = onChange;
        onRunRef.current = onRun;
        onRunAndAdvanceRef.current = onRunAndAdvance;
    }, [onChange, onRun, onRunAndAdvance]);

    useEffect(() => {
        if (!editorRef.current) return;

        const state = EditorState.create({
            doc: value,
            extensions: [
                basicSetup,
                sql(),
                oneDark,
                Prec.highest(keymap.of([
                    {
                        key: "Mod-Enter",
                        run: () => {
                            onRunRef.current();
                            return true;
                        },
                        preventDefault: true
                    },
                    {
                        key: "Shift-Enter",
                        run: () => {
                            onRunAndAdvanceRef.current();
                            return true;
                        },
                        preventDefault: true
                    }
                ])),
                EditorView.updateListener.of((update) => {
                    if (update.docChanged) {
                        onChangeRef.current(update.state.doc.toString());
                    }
                }),
                EditorView.theme({
                    "&": { height: "auto", minHeight: "50px" },
                    ".cm-scroller": { overflow: "hidden" }
                })
            ]
        });

        const view = new EditorView({
            state,
            parent: editorRef.current
        });

        viewRef.current = view;

        if (autoFocus) {
            view.focus();
        }

        return () => {
            view.destroy();
        };
    }, []); // Init once

    // Handle autoFocus updates if it changes later (e.g. new cell added)
    useEffect(() => {
        if (autoFocus && viewRef.current) {
            viewRef.current.focus();
        }
    }, [autoFocus]);

    return <div ref={editorRef} className="sql-editor-container" />;
};

export default SqlEditor;
