import React, { useState } from 'react';
import { Category } from '../types';
import { X, Plus, Edit2, Trash2, Check, Tag } from 'lucide-react';

interface CategoriesModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  defaultCategories: string[];
  onAddCategory: (name: string) => Promise<void>;
  onUpdateCategory: (id: string, name: string) => Promise<void>;
  onDeleteCategory: (id: string) => Promise<void>;
  customConfirm?: (title: string, message: string) => Promise<boolean>;
}

export default function CategoriesModal({
  isOpen,
  onClose,
  categories,
  defaultCategories,
  onAddCategory,
  onUpdateCategory,
  onDeleteCategory,
  customConfirm
}: CategoriesModalProps) {
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim() || loading) return;

    setLoading(true);
    try {
      // Check for duplicate in both default and custom
      const trimmed = newCategoryName.trim();
      const lower = trimmed.toLowerCase();
      const isDuplicate = 
        defaultCategories.some(c => c.toLowerCase() === lower) ||
        categories.some(c => c.name.toLowerCase() === lower);

      if (isDuplicate) {
        alert("Já existe uma categoria com este nome.");
        setLoading(false);
        return;
      }

      await onAddCategory(trimmed);
      setNewCategoryName('');
    } catch (err) {
      alert("Erro ao adicionar categoria.");
    } finally {
      setLoading(false);
    }
  };

  const handleStartEdit = (cat: Category) => {
    setEditingId(cat.id);
    setEditingName(cat.name);
  };

  const handleSaveEdit = async (id: string) => {
    if (!editingName.trim() || loading) return;
    setLoading(true);
    try {
      const trimmed = editingName.trim();
      await onUpdateCategory(id, trimmed);
      setEditingId(null);
    } catch (err) {
      alert("Erro ao salvar alteração.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    const confirmDelete = customConfirm 
      ? await customConfirm("Excluir Categoria", `Tem certeza que deseja excluir a categoria "${name}"?`)
      : window.confirm(`Tem certeza que deseja excluir a categoria "${name}"?`);

    if (!confirmDelete) return;

    setLoading(true);
    try {
      await onDeleteCategory(id);
    } catch (err) {
      alert("Erro ao excluir categoria.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md border border-slate-100 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-fade-in">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-indigo-600">
            <Tag size={18} />
            <h3 className="text-sm font-bold text-slate-800 font-display">Gerenciar Categorias</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-y-auto space-y-6">
          {/* Add Form */}
          <form onSubmit={handleAdd} className="flex gap-2">
            <input
              type="text"
              required
              placeholder="Nova categoria (Ex: Combustível)"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-medium"
            />
            <button
              type="submit"
              disabled={loading}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-sm transition flex items-center gap-1 disabled:opacity-50"
            >
              <Plus size={14} /> Adicionar
            </button>
          </form>

          {/* List of Custom Categories */}
          <div className="space-y-3">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Suas Categorias Personalizadas</h4>
            {categories.length === 0 ? (
              <p className="text-xs text-slate-400 italic text-center py-4">Nenhuma categoria personalizada criada ainda.</p>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden bg-slate-50/50">
                {categories.map((cat) => (
                  <div key={cat.id} className="px-4 py-2.5 flex items-center justify-between text-xs hover:bg-slate-50 transition">
                    {editingId === cat.id ? (
                      <div className="flex-1 flex gap-1.5 items-center">
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          className="flex-1 bg-white border border-slate-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-semibold"
                        />
                        <button
                          onClick={() => handleSaveEdit(cat.id)}
                          className="p-1 text-emerald-600 hover:bg-emerald-50 rounded transition"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="p-1 text-slate-400 hover:bg-slate-100 rounded transition"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="font-semibold text-slate-700">{cat.name}</span>
                        <div className="flex items-center space-x-1">
                          <button
                            onClick={() => handleStartEdit(cat)}
                            className="p-1 text-slate-400 hover:text-indigo-600 rounded hover:bg-slate-100 transition"
                            title="Editar nome"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={() => handleDelete(cat.id, cat.name)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-slate-100 transition"
                            title="Excluir categoria"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* List of Default Categories */}
          <div className="space-y-2">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Categorias Padrão (Leitura)</h4>
            <div className="flex flex-wrap gap-1.5">
              {defaultCategories.map((name) => (
                <span
                  key={name}
                  className="bg-slate-100 text-slate-600 text-[10px] font-semibold px-2.5 py-1 rounded-full border border-slate-200/50"
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 hover:bg-slate-50 transition"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
