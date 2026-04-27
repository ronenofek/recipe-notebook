'use client';

import { Download } from 'lucide-react';

export default function ExportButton({ recipeId, recipeTitle }: { recipeId: number; recipeTitle: string }) {
  const handleExport = async () => {
    const res = await fetch(`/api/export/${recipeId}`);
    if (!res.ok) {
      alert('Export failed');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${recipeTitle.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      onClick={handleExport}
      className="flex items-center gap-2 px-4 py-2 bg-white border border-stone-300 rounded-lg text-sm text-stone-700 hover:bg-stone-50 transition-colors"
    >
      <Download className="w-4 h-4" />
      Export PDF
    </button>
  );
}
