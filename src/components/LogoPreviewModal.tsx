import React, { useState } from 'react';
import { SecretLogo } from './SecretLogo';
import { X, Check, ShieldCheck, Download, Sparkles, Eye } from 'lucide-react';

interface LogoPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApprove?: () => void;
}

export const LogoPreviewModal: React.FC<LogoPreviewModalProps> = ({
  isOpen,
  onClose,
  onApprove,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const svgCode = `<svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="shieldGrad" x1="10" y1="10" x2="90" y2="90" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#4F46E5" />
      <stop offset="50%" stop-color="#3730A3" />
      <stop offset="100%" stop-color="#0F172A" />
    </linearGradient>
    <linearGradient id="goldGrad" x1="20" y1="20" x2="80" y2="80" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#F59E0B" />
      <stop offset="100%" stop-color="#D97706" />
    </linearGradient>
    <linearGradient id="cyanGrad" x1="0" y1="100" x2="100" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#06B6D4" />
      <stop offset="100%" stop-color="#10B981" />
    </linearGradient>
  </defs>
  <path d="M50 8 L85 24 V50 C85 71.5 70 88.5 50 94 C30 88.5 15 71.5 15 50 V24 L50 8 Z" fill="url(#shieldGrad)" stroke="url(#cyanGrad)" stroke-width="3" stroke-linejoin="round" />
  <path d="M50 16 L78 29.5 V50 C78 67.5 66 82 50 86.5 C34 82 22 67.5 22 50 V29.5 L50 16 Z" fill="none" stroke="url(#goldGrad)" stroke-width="1.5" stroke-dasharray="4 2" opacity="0.85" />
  <rect x="36" y="52" width="6" height="14" rx="2" fill="url(#cyanGrad)" opacity="0.9" />
  <rect x="47" y="44" width="6" height="22" rx="2" fill="url(#cyanGrad)" />
  <rect x="58" y="36" width="6" height="30" rx="2" fill="url(#goldGrad)" />
  <circle cx="50" cy="35" r="5" fill="#FFFFFF" />
  <path d="M47.5 37.5 L52.5 37.5 L54 47 L46 47 Z" fill="#FFFFFF" />
  <path d="M32 58 L45 46 L53 52 L68 34" fill="none" stroke="#FFFFFF" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
  <path d="M62 34 H68 V40" fill="none" stroke="#FFFFFF" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
</svg>`;

  const handleCopySvg = () => {
    navigator.clipboard.writeText(svgCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 text-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded-xl">
              <ShieldCheck size={22} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Proposta de Logo em SVG
                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                  Vetor HD
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Criada com as cores do sistema: Azul Índigo, Escudo de Segurança, Chaveiro/Cofre & Gráfico de Finanças.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Showcase */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Main Hero Showcase */}
          <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950/60 p-8 rounded-2xl border border-indigo-500/30 flex flex-col items-center justify-center text-center shadow-inner relative overflow-hidden group">
            <div className="absolute inset-0 bg-radial from-indigo-500/10 via-transparent to-transparent pointer-events-none" />
            
            <div className="relative mb-4 transform transition-transform duration-300 group-hover:scale-105">
              <SecretLogo size="xl" dark={true} variant="full" />
            </div>

            <p className="text-xs text-slate-300 max-w-md mt-2 font-medium">
              Símbolo em formato de <span className="text-indigo-400 font-bold">Escudo Secret Agent</span> com <span className="text-cyan-400 font-bold">detalhes neon e barras de controle financeiro</span>.
            </p>
          </div>

          {/* Variations grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Dark Theme Card */}
            <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 flex flex-col items-center justify-center space-y-3">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Aplicação em Fundo Escuro (Sidebar/Menu)
              </span>
              <div className="py-3">
                <SecretLogo size="lg" dark={true} variant="full" />
              </div>
            </div>

            {/* Light Theme Card */}
            <div className="p-5 rounded-xl bg-slate-100 text-slate-900 border border-slate-200 flex flex-col items-center justify-center space-y-3">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Aplicação em Fundo Claro (Relatórios/Doc)
              </span>
              <div className="py-3">
                <SecretLogo size="lg" dark={false} variant="full" />
              </div>
            </div>
          </div>

          {/* Icon Only and Badges */}
          <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/60 flex flex-wrap items-center justify-around gap-4">
            <div className="flex flex-col items-center gap-1">
              <span className="text-[10px] text-slate-400 font-bold uppercase">Ícone do App</span>
              <SecretLogo size="md" variant="icon" />
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="text-[10px] text-slate-400 font-bold uppercase">Badge Ícone Pequeno</span>
              <SecretLogo size="sm" variant="icon" />
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="text-[10px] text-slate-400 font-bold uppercase">Compacto</span>
              <SecretLogo size="sm" dark={true} variant="full" />
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-5 border-t border-slate-800 bg-slate-950 flex items-center justify-between gap-3 flex-wrap">
          <button
            onClick={handleCopySvg}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition cursor-pointer border border-slate-700"
          >
            {copied ? <Check size={16} className="text-emerald-400" /> : <Download size={16} />}
            <span>{copied ? 'Código SVG Copiado!' : 'Copiar Código SVG'}</span>
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition cursor-pointer"
            >
              Recusar / Ajustar
            </button>
            <button
              onClick={() => {
                if (onApprove) onApprove();
                onClose();
              }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition shadow-lg shadow-indigo-600/30 cursor-pointer"
            >
              <Check size={16} />
              <span>Aprovar e Aplicar no Sistema</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LogoPreviewModal;
