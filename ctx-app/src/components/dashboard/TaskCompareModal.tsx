import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface TaskCompareModalProps {
    currentTask: string;
    historyTask: string;
    historyVersionText: string;
    onClose: () => void;
    onRestore: () => void;
}

export function TaskCompareModal({ currentTask, historyTask, historyVersionText, onClose, onRestore }: TaskCompareModalProps) {
    // Simple word diff logic
    const diffWords = (oldText: string, newText: string) => {
        // This is a naive split by space. Real diffing requires a library, but this provides visual feedback
        const oldWords = oldText.split(/\s+/);
        const newWords = newText.split(/\s+/);

        // Fallback: if texts are vastly different, just show side by side
        return { oldWords, newWords };
    };

    return (
        <AnimatePresence>
            <div className="modal-backdrop" onClick={onClose} style={{
                position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
                <motion.div
                    onClick={(e) => e.stopPropagation()}
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    style={{
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        width: '800px',
                        maxWidth: '90vw',
                        maxHeight: '85vh',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                        boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                        <h3 style={{ margin: 0 }}>Сравнение версий задачи</h3>
                        <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>
                            <X size={20} />
                        </button>
                    </div>

                    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                        {/* Left side: History version */}
                        <div style={{ flex: 1, padding: '16px', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                            <h4 style={{ margin: '0 0 12px 0', color: 'var(--muted)', fontSize: '13px' }}>
                                Версия из истории: <span style={{ color: 'var(--text)' }}>{historyVersionText}</span>
                            </h4>
                            <div style={{
                                background: 'rgba(239, 68, 68, 0.05)',
                                border: '1px solid rgba(239, 68, 68, 0.2)',
                                borderRadius: '6px',
                                padding: '12px',
                                flex: 1,
                                fontSize: '13px',
                                lineHeight: 1.5,
                                whiteSpace: 'pre-wrap',
                                fontFamily: 'monospace'
                            }}>
                                {historyTask}
                            </div>
                        </div>

                        {/* Right side: Current version */}
                        <div style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                            <h4 style={{ margin: '0 0 12px 0', color: 'var(--muted)', fontSize: '13px' }}>
                                Текущая версия
                            </h4>
                            <div style={{
                                background: 'rgba(34, 197, 94, 0.05)',
                                border: '1px solid rgba(34, 197, 94, 0.2)',
                                borderRadius: '6px',
                                padding: '12px',
                                flex: 1,
                                fontSize: '13px',
                                lineHeight: 1.5,
                                whiteSpace: 'pre-wrap',
                                fontFamily: 'monospace'
                            }}>
                                {currentTask}
                            </div>
                        </div>
                    </div>

                    <div style={{ padding: '16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '12px', background: 'var(--surface-alt)' }}>
                        <button type="button" onClick={onClose} style={{ background: 'transparent', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', border: '1px solid var(--border)', color: 'var(--text)' }}>
                            Закрыть
                        </button>
                        <button type="button" onClick={() => { onRestore(); onClose(); }} style={{ background: 'var(--primary)', color: 'white', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', border: 'none', fontWeight: 500 }}>
                            Восстановить старую версию
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
