import React, { useState, useMemo } from 'react';
import { Member, Expense } from '../types';
import { Plus, Trash2, Link, Copy, Check, Users, ShieldAlert, Award, ArrowUpRight, Send, MessageCircle, ExternalLink, Share2, UserCheck, ChevronDown, ChevronUp, Receipt } from 'lucide-react';

interface MembersTabProps {
  members: Member[];
  expenses: Expense[];
  onAddMember: (name: string) => Promise<void>;
  onDeleteMember: (id: string) => Promise<void>;
  currentMonth: string;
  hideValues?: boolean;
}

export default function MembersTab({
  members,
  expenses,
  onAddMember,
  onDeleteMember,
  currentMonth,
  hideValues = false
}: MembersTabProps) {
  const [name, setName] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string>('');
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);

  // Update selectedMemberId when members change if not set
  const activeSelectedMember = useMemo(() => {
    if (!members.length) return null;
    return members.find(m => m.id === selectedMemberId) || members[0];
  }, [members, selectedMemberId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await onAddMember(name);
      setName('');
    } catch (err) {
      alert("Erro ao cadastrar integrante.");
    }
  };

  const handleCopyLink = (member: Member) => {
    const shareUrl = `${window.location.origin}/?shareToken=${member.shareToken}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopiedId(member.id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const handleSendWhatsApp = (member: Member) => {
    const shareUrl = `${window.location.origin}/?shareToken=${member.shareToken}`;
    const text = encodeURIComponent(`Olá ${member.name}, aqui está o seu link exclusivo para visualizar suas despesas em tempo real:\n${shareUrl}`);
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  };

  // Cost Division Calculations (for the current selected month)
  const coSpendingBreakdown = useMemo(() => {
    if (members.length === 0) return [];

    // Filter to third-party expenses for the current month
    const thirdPartyExpenses = expenses.filter(
      exp => exp.type === 'third_party' && exp.transactionDate.startsWith(currentMonth)
    );

    // Initialize balance sheet for each member
    const balanceSheet = members.map(m => ({
      id: m.id,
      name: m.name,
      shareToken: m.shareToken,
      assignedExpenses: [] as Expense[], // expenses they are solely responsible for
      splitExpenses: [] as Expense[],    // expenses split with everyone
      totalOwedShare: 0,                 // sum of their exact share of all items
    }));

    thirdPartyExpenses.forEach(exp => {
      if (exp.responsibleMemberId === 'all') {
        // Shared equally
        const exactShare = exp.amount / members.length;
        balanceSheet.forEach(mb => {
          mb.splitExpenses.push(exp);
          mb.totalOwedShare += exactShare;
        });
      } else {
        // Assigned solely to this member
        const mb = balanceSheet.find(b => b.id === exp.responsibleMemberId);
        if (mb) {
          mb.assignedExpenses.push(exp);
          mb.totalOwedShare += exp.amount;
        }
      }
    });

    return balanceSheet.map(mb => ({
      ...mb,
      totalOwedShare: parseFloat(mb.totalOwedShare.toFixed(2))
    }));
  }, [members, expenses, currentMonth]);

  // Overall Total co-spending this month
  const totalCoSpending = useMemo(() => {
    return coSpendingBreakdown.reduce((acc, curr) => acc + curr.totalOwedShare, 0);
  }, [coSpendingBreakdown]);

  return (
    <div className="space-y-6" id="members-tab">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-900 font-display">Equipe e Divisão de Contas</h2>
          <p className="text-xs text-slate-500 font-medium">
            Gerencie integrantes e veja o rateio de despesas de terceiros para o período de {currentMonth}
          </p>
        </div>
      </div>

      {/* Grid of Add Member and Share Links */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Side: Register and Members List */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-bold text-slate-900 mb-4 font-display uppercase tracking-wider flex items-center gap-1.5">
              <Plus size={14} className="text-indigo-600" /> Cadastrar Integrante
            </h3>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="flex flex-col space-y-1">
                <input
                  type="text"
                  required
                  placeholder="Nome do integrante..."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 w-full"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-indigo-600 text-white text-xs font-bold py-2 rounded-lg hover:bg-indigo-700 transition shadow-sm"
              >
                Cadastrar Membro
              </button>
            </form>

            <hr className="my-6 border-slate-200" />

            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">
              Membros Ativos ({members.length})
            </h3>

            {members.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">Nenhum membro cadastrado.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {members.map(member => (
                  <div key={member.id} className="flex justify-between items-center p-2.5 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 group transition-colors">
                    <div className="flex items-center space-x-2">
                      <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-[10px]">
                        {member.name[0].toUpperCase()}
                      </div>
                      <span className="text-xs font-semibold text-slate-700">{member.name}</span>
                    </div>
                    <button
                      onClick={() => onDeleteMember(member.id)}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Remover integrante"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Share Links Panel */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-5" id="share-links-section">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-xs font-bold text-slate-900 font-display uppercase tracking-wider flex items-center gap-1.5">
                <Share2 size={15} className="text-indigo-600" /> Links de Compartilhamento (Apenas Visualização)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 font-medium">
                Selecione um integrante para enviar seu link exclusivo. O convidado verá apenas as suas despesas em tempo real, sem necessidade de login.
              </p>
            </div>

            {members.length > 0 && (
              <div className="flex items-center space-x-2 flex-shrink-0">
                <label className="text-xs font-bold text-slate-600">Relacionar Integrante:</label>
                <select
                  value={activeSelectedMember?.id || ''}
                  onChange={(e) => setSelectedMemberId(e.target.value)}
                  className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  {members.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {members.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 rounded-xl text-xs text-slate-400 border border-slate-200">
              Cadastre integrantes no painel ao lado para gerar os links de compartilhamento.
            </div>
          ) : (
            <div className="space-y-5">
              {/* Featured Card for Selected Member */}
              {activeSelectedMember && (
                <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white shadow-md border border-indigo-500/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center space-x-3.5 min-w-0">
                    <div className="w-12 h-12 rounded-full bg-indigo-600 text-white font-black text-lg flex items-center justify-center flex-shrink-0 shadow-inner border border-indigo-400/30">
                      {activeSelectedMember.name[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="text-[10px] font-black uppercase tracking-wider text-indigo-300 bg-indigo-900/80 px-2 py-0.5 rounded border border-indigo-700/50">
                          Link Exclusivo
                        </span>
                        <span className="text-xs text-slate-400 font-mono">Modo Convidado</span>
                      </div>
                      <h4 className="text-base font-black text-white font-display truncate mt-0.5">
                        {activeSelectedMember.name}
                      </h4>
                      <p className="text-[11px] text-slate-300 font-mono truncate max-w-md mt-0.5">
                        {`${window.location.origin}/?shareToken=${activeSelectedMember.shareToken}`}
                      </p>
                    </div>
                  </div>

                  {/* Direct Actions */}
                  <div className="flex items-center gap-2 flex-wrap md:flex-nowrap flex-shrink-0">
                    <button
                      onClick={() => handleCopyLink(activeSelectedMember)}
                      className="flex-1 md:flex-none px-3.5 py-2.5 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl border border-white/20 transition flex items-center justify-center space-x-2"
                      title="Copiar link"
                    >
                      {copiedId === activeSelectedMember.id ? (
                        <>
                          <Check size={14} className="text-emerald-400" />
                          <span className="text-emerald-300">Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy size={14} />
                          <span>Copiar Link</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => handleSendWhatsApp(activeSelectedMember)}
                      className="flex-1 md:flex-none px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition shadow-sm flex items-center justify-center space-x-2 border border-emerald-400/30"
                      title="Enviar via WhatsApp"
                    >
                      <MessageCircle size={15} />
                      <span>Enviar no WhatsApp</span>
                    </button>

                    <a
                      href={`${window.location.origin}/?shareToken=${activeSelectedMember.shareToken}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl transition shadow-sm flex items-center justify-center space-x-1.5 border border-indigo-400/30"
                      title="Abrir como convidado"
                    >
                      <ExternalLink size={14} />
                      <span>Testar Link</span>
                    </a>
                  </div>
                </div>
              )}

              {/* List Table of All Members */}
              <div>
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Lista Completa de Integrantes ({members.length})
                </h4>
                <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 bg-white">
                  {members.map(member => {
                    const shareUrl = `${window.location.origin}/?shareToken=${member.shareToken}`;
                    const isSelected = activeSelectedMember?.id === member.id;

                    return (
                      <div
                        key={member.id}
                        onClick={() => setSelectedMemberId(member.id)}
                        className={`p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors cursor-pointer ${
                          isSelected ? 'bg-indigo-50/70' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center space-x-3 min-w-0">
                          <div className={`w-8 h-8 rounded-full font-bold flex items-center justify-center text-xs flex-shrink-0 ${
                            isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'
                          }`}>
                            {member.name[0].toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center space-x-2">
                              <span className="text-xs font-bold text-slate-900 truncate">{member.name}</span>
                              {isSelected && (
                                <span className="text-[9px] font-bold text-indigo-700 bg-indigo-100 px-1.5 py-0.2 rounded-full flex items-center gap-0.5">
                                  <UserCheck size={10} /> Selecionado
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono truncate block max-w-xs">
                              {shareUrl}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2 self-end sm:self-center flex-shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyLink(member);
                            }}
                            className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center space-x-1.5 shadow-sm transition"
                            title="Copiar Link"
                          >
                            {copiedId === member.id ? (
                              <Check size={13} className="text-emerald-600" />
                            ) : (
                              <Copy size={13} className="text-slate-500" />
                            )}
                            <span>Copiar</span>
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSendWhatsApp(member);
                            }}
                            className="px-2.5 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100 text-xs font-semibold flex items-center space-x-1.5 transition shadow-sm"
                            title="Enviar pelo WhatsApp"
                          >
                            <MessageCircle size={13} className="text-emerald-600" />
                            <span>WhatsApp</span>
                          </button>

                          <a
                            href={shareUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="p-1.5 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-lg hover:bg-indigo-100 transition shadow-sm"
                            title="Abrir no navegador"
                          >
                            <ArrowUpRight size={14} />
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Rateio / Division breakdown (Now Below Grid) */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
        <div>
          <div className="flex justify-between items-baseline mb-4">
            <h3 className="text-xs font-bold text-slate-900 font-display uppercase tracking-wider flex items-center gap-1.5">
              <Users size={14} className="text-indigo-600" /> Rateio Automático das Despesas de Terceiros
            </h3>
            <span className="font-mono text-xs text-slate-500 font-bold">
              Total: R$ {totalCoSpending.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          {members.length === 0 ? (
            <div className="p-12 text-center bg-slate-50 rounded-lg text-xs text-slate-400 border border-slate-200">
              Cadastre membros para visualizar a divisão automática de gastos em tempo real!
            </div>
          ) : (
            <div className="space-y-3 max-h-[26rem] overflow-y-auto pr-2">
              {coSpendingBreakdown.map((item) => {
                const percentOfTotal = totalCoSpending > 0 ? (item.totalOwedShare / totalCoSpending) * 100 : 0;
                const isExpanded = expandedMemberId === item.id;
                const hasExpenses = item.assignedExpenses.length > 0 || item.splitExpenses.length > 0;

                return (
                  <div 
                    key={item.id} 
                    className={`p-4 rounded-xl border transition-all ${
                      isExpanded ? 'bg-indigo-50/40 border-indigo-300 shadow-sm' : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex justify-between items-center cursor-pointer" onClick={() => setExpandedMemberId(isExpanded ? null : item.id)}>
                      <div className="flex items-center space-x-3">
                        <div className="w-9 h-9 rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center text-indigo-700 font-bold text-xs shadow-xs">
                          {item.name[0].toUpperCase()}
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                            {item.name}
                            {hasExpenses && (
                              <span className="text-[10px] text-indigo-600 font-semibold bg-indigo-100/80 px-1.5 py-0.2 rounded">
                                Ver detalhamento
                              </span>
                            )}
                          </h4>
                          <p className="text-[10px] text-slate-500 font-medium mt-0.5">
                            {item.assignedExpenses.length} individuais, {item.splitExpenses.length} divididas com a casa
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-3">
                        <div className="text-right">
                          <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Cota do Mês</span>
                          <p className="font-mono text-xs font-bold text-slate-900">
                            R$ {item.totalOwedShare.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                        </div>
                        <button className="p-1 text-slate-400 hover:text-slate-600 rounded-lg bg-white border border-slate-200">
                          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      </div>
                    </div>

                    {/* ProgressBar */}
                    <div className="w-full bg-slate-200/80 h-1.5 rounded-full overflow-hidden mt-3">
                      <div 
                        className="bg-indigo-600 h-full rounded-full transition-all duration-500"
                        style={{ width: `${percentOfTotal}%` }}
                      ></div>
                    </div>

                    {/* Expanded Expenses List */}
                    {isExpanded && (
                      <div className="mt-4 pt-3 border-t border-slate-200/80 space-y-2">
                        <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 mb-1">
                          <span className="flex items-center gap-1">
                            <Receipt size={13} className="text-indigo-600" /> Despesas compostas na cota de {item.name}:
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            Período: {currentMonth}
                          </span>
                        </div>

                        {!hasExpenses ? (
                          <p className="text-xs text-slate-400 italic py-2">
                            Nenhuma despesa atribuída ou dividida para este integrante neste mês.
                          </p>
                        ) : (
                          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                            {/* Assigned (100%) */}
                            {item.assignedExpenses.map(exp => (
                              <div key={exp.id} className="p-2 bg-white rounded-lg border border-slate-200 flex justify-between items-center text-xs">
                                <div className="min-w-0 pr-2">
                                  <div className="flex items-center space-x-1.5">
                                    <span className="font-bold text-slate-800 truncate">{exp.description}</span>
                                    <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded-full uppercase">
                                      Individuais
                                    </span>
                                  </div>
                                  <span className="text-[10px] text-slate-400 block font-mono">
                                    Categoria: {exp.category} • Vencimento: {exp.dueDate}
                                  </span>
                                </div>
                                <div className="text-right flex-shrink-0">
                                  <span className="font-mono font-bold text-slate-900 block">
                                    R$ {exp.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                  <span className="text-[9px] text-slate-400">100% sob responsabilidade</span>
                                </div>
                              </div>
                            ))}

                            {/* Split (1/N share) */}
                            {item.splitExpenses.map(exp => {
                              const shareValue = exp.amount / members.length;
                              return (
                                <div key={exp.id} className="p-2 bg-white rounded-lg border border-slate-200 flex justify-between items-center text-xs">
                                  <div className="min-w-0 pr-2">
                                    <div className="flex items-center space-x-1.5">
                                      <span className="font-bold text-slate-800 truncate">{exp.description}</span>
                                      <span className="text-[9px] font-bold bg-indigo-100 text-indigo-800 px-1.5 py-0.2 rounded-full uppercase">
                                        Dividida ({members.length}x)
                                      </span>
                                    </div>
                                    <span className="text-[10px] text-slate-400 block font-mono">
                                      Valor Total da Conta: R$ {exp.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </span>
                                  </div>
                                  <div className="text-right flex-shrink-0">
                                    <span className="font-mono font-bold text-indigo-700 block">
                                      R$ {shareValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                    <span className="text-[9px] text-slate-400">Sua cota (1/{members.length})</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
