import React from 'react';
import { X, Save } from 'lucide-react';

interface Settings {
    showDescribe: boolean;
    previewLimit: number;
    forceJsonParsing: boolean;
}

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    settings: Settings;
    onSave: (newSettings: Settings) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, settings, onSave }) => {
    const [localSettings, setLocalSettings] = React.useState<Settings>(settings);

    React.useEffect(() => {
        setLocalSettings(settings);
    }, [settings, isOpen]);

    if (!isOpen) return null;

    const handleSave = () => {
        onSave(localSettings);
        onClose();
    };

    const handleChange = (key: keyof Settings, value: any) => {
        setLocalSettings(prev => ({ ...prev, [key]: value }));
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <div className="modal-header">
                    <h2>Settings</h2>
                    <button className="icon-btn" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>
                <div className="modal-body">
                    <div className="settings-section">
                        <h3>Preview</h3>
                        <div className="setting-item">
                            <label className="checkbox-label">
                                <input
                                    type="checkbox"
                                    checked={localSettings.showDescribe}
                                    onChange={(e) => handleChange('showDescribe', e.target.checked)}
                                />
                                Show Describe Statement
                            </label>
                            <p className="setting-desc">Automatically add a DESCRIBE query cell.</p>
                        </div>
                        <div className="setting-item">
                            <label>Preview Limit</label>
                            <input
                                type="number"
                                value={localSettings.previewLimit}
                                onChange={(e) => handleChange('previewLimit', parseInt(e.target.value) || 0)}
                                min="1"
                                className="number-input"
                            />
                            <p className="setting-desc">Number of rows to fetch in the initial preview.</p>
                        </div>
                    </div>

                    <div className="settings-section">
                        <h3>View Options</h3>
                        <div className="setting-item">
                            <label className="checkbox-label">
                                <input
                                    type="checkbox"
                                    checked={localSettings.forceJsonParsing}
                                    onChange={(e) => handleChange('forceJsonParsing', e.target.checked)}
                                />
                                Force JSON Parsing
                            </label>
                            <p className="setting-desc">
                                If enabled, string columns containing JSON will be parsed and displayed as interactive trees. 
                                If disabled, only native structural types are displayed as trees.
                            </p>
                        </div>
                    </div>
                </div>
                <div className="modal-footer">
                    <button className="cancel-btn" onClick={onClose}>Cancel</button>
                    <button className="save-btn" onClick={handleSave}>
                        <Save size={16} />
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
