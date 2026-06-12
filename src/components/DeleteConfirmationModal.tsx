import React from 'react';
import { X, AlertTriangle } from 'lucide-react';

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function DeleteConfirmationModal({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel
}: DeleteConfirmationModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-gray-200 rounded max-w-md w-full shadow-2xl p-6 space-y-4 animate-scale-in">
        <div className="flex justify-between items-start">
          <div className="flex gap-3 items-center text-red-600">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <h3 className="font-bold text-sm font-mono uppercase tracking-wider">{title}</h3>
          </div>
          <button
            onClick={onCancel}
            className="text-gray-405 text-gray-400 hover:text-black p-1 hover:bg-gray-100 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-gray-600 font-sans leading-relaxed">
          {message}
        </p>

        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-gray-205 border-gray-200 hover:bg-gray-50 text-black text-xs font-mono font-bold rounded transition-colors"
          >
            CANCEL
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-red-650 bg-red-600 hover:bg-red-700 text-white text-xs font-mono font-bold rounded transition-colors"
          >
            CONFIRM DELETE
          </button>
        </div>
      </div>
    </div>
  );
}
