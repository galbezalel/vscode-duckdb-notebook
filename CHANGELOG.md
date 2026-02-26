# Changelog

All notable changes to the DuckDB Notebook extension will be documented in this file.

## [0.0.45] - 2026-02-27

### Added
- **Multi-cursor Editing**: Support for adding multiple cursors in the SQL editor using `Alt+Click` or `Alt+ArrowUp`/`Alt+ArrowDown`.
- **Notebook State Persistence**: Notebook state (queries and cells) is now automatically saved and restored when reopening files.

## [0.0.44] - 2026-02-17

### Added
- **Customize Download Directory**: The export save dialog now defaults to the current document's directory when downloading CSV or Parquet files instead of the workspace root.
- **Dependencies**: Updated package dependencies.

## [0.0.43] - 2026-02-15

### Added
- **Text Wrapping Setting**: Implement text wrapping for result table cells with an overflow tooltip, controlled by a new setting.
- **Documentation**: Added a demo image, enhanced README feature descriptions, and moved development instructions to CONTRIBUTING.md.

## [0.0.41 - 0.0.42] - 2026-02-07

### Changed
- Added and updated the extension application icon.

## [0.0.3] - 2026-02-07

### Added
- **Cell Management**: Implement drag-and-drop cell reordering and refine cell execution advancement logic.
- **Query Management**: Implement cell execution stopping and `COPY` commands optimization.
- **Settings**: Add settings modal, refine toolbar, and improve data presentation.
- **Security**: Introduce a configuration setting and user prompts to manage external file access for DuckDB operations.

### Fixed
- Process file save operations sequentially using a promise queue and add detailed transfer logging.

## [0.0.2] - 2026-01-25

### Added
- **Clipboard Support**: Add functionality to copy cell results to clipboard as CSV and clean export queries by trimming and removing trailing semicolons.
- **JSON Viewer**: Add a JSON tree viewer for object and array cells in the result table.
- **CSV Improvements**: Enhance CSV parsing with explicit header and null options, and visually distinguish null values in result tables.
- **General**: Implement general infra, UI, and UX improvements.

## [0.0.1] - 2025-11-30

### Added
- **Notebook UI**: Initial release utilizing a Notebook UI instead of a basic SQL editor.
- **Editor**: Integrated CodeMirror for an enhanced SQL editing experience.
- **Auto-focus**: Implement auto-focus for new cells and pre-populate initial notebook with executed queries.
- **Resizing**: Implement resizable table columns.
- **Export**: Add data export functionality for query results.
- **Metadata**: Add MIT license, build instructions, publisher, repository, and custom editor activation events.

### Fixed
- Escape single quotes in virtual file names and add `header=TRUE` to CSV auto-detection.
- Prevent horizontal overflow in tables and improve file parsing for special characters and CSV headers.
- Fix DuckDB WASM integration and improve UI usability.
