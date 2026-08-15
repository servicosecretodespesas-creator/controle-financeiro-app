import React, { useState, useEffect } from 'react';
import { 
  auth, 
  db, 
  googleProvider,
  cleanUndefined
} from '../firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  sendPasswordResetEmail, 
  signInWithPopup, 
  updateProfile 
} from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  collection, 
  query, 
  where, 
  getDocs 
} from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Mail, 
  Lock, 
  Phone, 
  User as UserIcon, 
  Calendar, 
  ArrowRight, 
  ArrowLeft, 
  CheckCircle2, 
  AlertTriangle, 
  Eye, 
  EyeOff, 
  KeyRound, 
  Sparkles,
  Info,
  Smartphone
} from 'lucide-react';
import { SecretLogo } from './SecretLogo';

interface AuthScreenProps {
  // Option to allow custom fallback success if needed, but onAuthStateChanged will handle most of it
  onAuthSuccess?: () => void;
}

export default function AuthScreen({ onAuthSuccess }: AuthScreenProps) {
  // Tabs: 'login' | 'register' | 'forgot_password'
  const [activeTab, setActiveTab] = useState<'login' | 'register' | 'forgot_password'>('login');
  
  // Loading & Error States
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form States - Login
  const [loginIdentifier, setLoginIdentifier] = useState(''); // Email or Phone number
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Form States - Register
  const [regNome, setRegNome] = useState('');
  const [regSobrenome, setRegSobrenome] = useState('');
  const [regBirthDate, setRegBirthDate] = useState('');
  const [regContato, setRegContato] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);

  // Verification Code States (Email confirmation)
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [generatedCode, setGeneratedCode] = useState('');
  const [enteredCode, setEnteredCode] = useState('');
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [showSimulatedCodeToast, setShowSimulatedCodeToast] = useState(false);

  // Forgot Password States
  const [resetEmail, setResetEmail] = useState('');

  // Firebase API Key Diagnostics States
  const [isApiKeyInvalid, setIsApiKeyInvalid] = useState(false);
  const [checkingKey, setCheckingKey] = useState(false);
  const [ignoreWarning, setIgnoreWarning] = useState(false);

  const verifyApiKey = async () => {
    setCheckingKey(true);
    try {
      const apiKey = auth.app?.options?.apiKey;
      if (!apiKey) return;
      const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (data && data.error && data.error.message === 'API key not valid. Please pass a valid API key.') {
        setIsApiKeyInvalid(true);
      } else {
        setIsApiKeyInvalid(false);
      }
    } catch (err) {
      console.error('Error verifying API Key:', err);
    } finally {
      setCheckingKey(false);
    }
  };

  useEffect(() => {
    verifyApiKey();
  }, []);

  // If API Key is restricted/invalid, render a gorgeous step-by-step diagnostic guide
  if (isApiKeyInvalid && !ignoreWarning) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-4 relative overflow-hidden select-none">
        {/* Decorative blur elements */}
        <div className="absolute top-0 left-0 w-80 h-80 bg-indigo-500/10 rounded-full filter blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full filter blur-3xl translate-x-1/3 translate-y-1/3 pointer-events-none" />

        <div className="w-full max-w-xl bg-slate-950 rounded-3xl shadow-2xl border border-slate-800/80 overflow-hidden relative z-10">
          {/* Header */}
          <div className="bg-gradient-to-r from-rose-950/60 to-slate-900/90 p-8 border-b border-slate-800/80 text-center relative">
            <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/10 rounded-full filter blur-xl" />
            <div className="relative space-y-3 flex flex-col items-center">
              <div className="w-12 h-12 bg-rose-600/20 text-rose-400 rounded-2xl flex items-center justify-center border border-rose-500/30">
                <AlertTriangle size={24} />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight text-white font-display">
                  Configuração de Chave de API Pendente
                </h2>
                <p className="text-xs text-rose-300 font-medium tracking-wide mt-1">
                  A chave de API do seu projeto Firebase <code className="bg-rose-950/60 px-1.5 py-0.5 rounded text-rose-200 border border-rose-900/50">studio-4104101043-5a546</code> está restrita.
                </p>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="p-8 space-y-6">
            <p className="text-xs text-slate-400 leading-relaxed">
              O Firebase retornou o erro <span className="font-semibold text-rose-400">API key not valid</span>. Isso é muito comum e acontece quando a chave de API possui restrições de segurança que bloqueiam chamadas externas de autenticação. Siga os passos simples abaixo para liberar o acesso:
            </p>

            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="w-6 h-6 bg-indigo-600/10 text-indigo-400 rounded-lg flex items-center justify-center font-bold text-xs border border-indigo-500/20 flex-shrink-0 mt-0.5">
                  1
                </div>
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-white">Ative os Métodos de Login</h4>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Acesse o seu painel do <span className="text-slate-200 font-semibold">Firebase Console &rarr; Authentication &rarr; Sign-in method</span> e certifique-se de que os provedores de <span className="text-indigo-400 font-semibold">E-mail/Senha</span> e <span className="text-indigo-400 font-semibold">Google</span> estão ativos.
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="w-6 h-6 bg-indigo-600/10 text-indigo-400 rounded-lg flex items-center justify-center font-bold text-xs border border-indigo-500/20 flex-shrink-0 mt-0.5">
                  2
                </div>
                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold text-white">Ajuste as Restrições no Google Cloud</h4>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Acesse o Console do Google Cloud clicando no link abaixo:
                  </p>
                  <a
                    href="https://console.cloud.google.com/apis/credentials?project=studio-4104101043-5a546"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 font-bold transition hover:underline"
                  >
                    <span>Credenciais do Google Cloud ↗</span>
                  </a>
                  <p className="text-[11px] text-slate-400 leading-relaxed mt-1">
                    Clique para editar a chave de API do seu app (geralmente chamada de <code className="bg-slate-900 px-1 py-0.5 rounded text-indigo-300 font-mono">Browser key (auto-created by Firebase)</code>):
                  </p>
                  <ul className="list-disc pl-4 space-y-1 text-[10.5px] text-slate-400 leading-relaxed">
                    <li>
                      Em <span className="text-slate-200 font-semibold">Restrições de chave</span> (Key restrictions), selecione <span className="text-slate-200 font-semibold">"Nenhuma restrição"</span> para testar.
                    </li>
                    <li>
                      Ou se estiver em <span className="text-slate-200 font-semibold">Restrições de API</span>, marque a <span className="text-slate-200 font-semibold">Identity Toolkit API</span> e a <span className="text-slate-200 font-semibold">Token Service API</span> como permitidas.
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800 flex flex-col sm:flex-row gap-3">
              <button
                onClick={verifyApiKey}
                disabled={checkingKey}
                className="flex-grow flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-4 rounded-xl shadow-md transition cursor-pointer text-xs"
              >
                {checkingKey ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span>Reverificar Chave de API</span>
                )}
              </button>
              <button
                onClick={() => setIgnoreWarning(true)}
                className="flex-grow flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-slate-300 font-bold py-2.5 px-4 rounded-xl border border-slate-800 hover:border-slate-700 transition cursor-pointer text-xs"
              >
                <span>Prosseguir mesmo assim</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Helper: Extract only digits from phone number
  const cleanPhone = (phone: string) => phone.replace(/\D/g, '');

  // Handle Google Login
  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
      if (onAuthSuccess) onAuthSuccess();
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/operation-not-allowed') {
        setError("O login com Google não está ativado no Firebase Console. Por favor, acesse o Firebase Console -> Authentication -> Sign-in method -> Adicionar novo provedor -> Google e ative-o.");
      } else {
        setError("Falha no login com Google. Verifique sua conexão.");
      }
    } finally {
      setLoading(false);
    }
  };

  // Handle Login (Email or Phone number)
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginIdentifier.trim() || !loginPassword) {
      setError("Por favor, preencha todos os campos.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let finalEmail = loginIdentifier.trim();
      const isEmail = finalEmail.includes('@');

      // If it's a phone number, look up the corresponding email in Firestore 'users' collection
      if (!isEmail) {
        const cleanedInputDigits = cleanPhone(finalEmail);
        if (cleanedInputDigits.length < 8) {
          setError("Digite um e-mail válido ou telefone com DDD.");
          setLoading(false);
          return;
        }

        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('cleanContato', '==', cleanedInputDigits));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
          setError("Nenhuma conta encontrada com este número de telefone.");
          setLoading(false);
          return;
        }

        // Use the email found on the first matching user document
        const userDoc = querySnapshot.docs[0].data();
        finalEmail = userDoc.email;
      }

      // Perform Firebase Auth standard email/password sign-in
      await signInWithEmailAndPassword(auth, finalEmail, loginPassword);
      if (onAuthSuccess) onAuthSuccess();
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError("Senha incorreta ou credenciais inválidas.");
      } else if (err.code === 'auth/user-not-found') {
        setError("Nenhum usuário encontrado com este e-mail.");
      } else if (err.code === 'auth/operation-not-allowed') {
        setError("O login com E-mail/Senha não está habilitado no Firebase Console. Por favor, ative-o em: Firebase Console -> Authentication -> Sign-in method -> E-mail/Senha.");
      } else {
        setError("Erro ao autenticar. Verifique seus dados e sua conexão.");
      }
    } finally {
      setLoading(false);
    }
  };

  // Handle Register click - initiates verification code
  const handleRegisterInitiate = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validations
    if (!regNome.trim() || !regSobrenome.trim() || !regBirthDate || !regContato.trim() || !regEmail.trim() || !regPassword || !regConfirmPassword) {
      setError("Todos os campos de cadastro são obrigatórios.");
      return;
    }

    if (!regEmail.includes('@') || regEmail.indexOf('.') === -1) {
      setError("Por favor, insira um endereço de e-mail válido.");
      return;
    }

    const cleanedContact = cleanPhone(regContato);
    if (cleanedContact.length < 10) {
      setError("Por favor, insira um telefone de contato válido com DDD (mínimo 10 dígitos).");
      return;
    }

    if (regPassword.length < 6) {
      setError("A senha deve conter no mínimo 6 caracteres.");
      return;
    }

    if (regPassword !== regConfirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    // Generate simulated 6-digit numeric verification code
    const randomCode = Math.floor(100000 + Math.random() * 900000).toString();
    setGeneratedCode(randomCode);
    setEnteredCode('');
    setIsVerifyingCode(true);
    setShowSimulatedCodeToast(true);
    setVerificationError(null);
  };

  // Confirm code and complete Firebase Auth account creation
  const handleVerifyAndCompleteRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerificationError(null);

    if (enteredCode.trim() !== generatedCode) {
      setVerificationError("Código inválido. Verifique o código exibido e tente novamente.");
      return;
    }

    setLoading(true);
    try {
      // 1. Create User Auth
      const userCredential = await createUserWithEmailAndPassword(auth, regEmail, regPassword);
      const firebaseUser = userCredential.user;

      // 2. Set display name in Firebase Auth
      const fullName = `${regNome.trim()} ${regSobrenome.trim()}`;
      await updateProfile(firebaseUser, { displayName: fullName });

      // 3. Save custom user profile metadata to Firestore users collection
      const userDocRef = doc(db, 'users', firebaseUser.uid);
      await setDoc(userDocRef, cleanUndefined({
        nome: regNome.trim(),
        sobrenome: regSobrenome.trim(),
        dataNascimento: regBirthDate,
        contato: regContato.trim(),
        cleanContato: cleanPhone(regContato),
        email: regEmail.trim().toLowerCase(),
        createdAt: new Date().toISOString()
      }));

      // Success
      setShowSimulatedCodeToast(false);
      setIsVerifyingCode(false);
      if (onAuthSuccess) onAuthSuccess();
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/email-already-in-use') {
        setVerificationError("O e-mail informado já está em uso.");
      } else if (err.code === 'auth/weak-password') {
        setVerificationError("A senha informada é fraca demais.");
      } else if (err.code === 'auth/operation-not-allowed') {
        setVerificationError("O registro com E-mail/Senha não está habilitado no Firebase. Vá em Firebase Console -> Authentication -> Sign-in method -> E-mail/Senha e ative-o.");
      } else {
        setVerificationError("Ocorreu um erro ao registrar sua conta. Tente novamente.");
      }
    } finally {
      setLoading(false);
    }
  };

  // Resend code simulator
  const handleResendCode = () => {
    const randomCode = Math.floor(100000 + Math.random() * 900000).toString();
    setGeneratedCode(randomCode);
    setEnteredCode('');
    setVerificationError(null);
    setShowSimulatedCodeToast(true);
  };

  // Handle Password Reset
  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim()) {
      setError("Por favor, preencha o seu e-mail.");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      await sendPasswordResetEmail(auth, resetEmail.trim());
      setSuccessMsg("E-mail de redefinição de senha enviado com sucesso! Verifique sua caixa de entrada.");
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/user-not-found') {
        setError("Nenhum usuário cadastrado com este endereço de e-mail.");
      } else {
        setError("Erro ao solicitar redefinição. Verifique o e-mail digitado.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 relative overflow-hidden select-none">
      {/* Background Decorative Blur Gradients */}
      <div className="absolute top-0 left-0 w-80 h-80 bg-indigo-200/40 rounded-full filter blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-indigo-100/50 rounded-full filter blur-3xl translate-x-1/3 translate-y-1/3 pointer-events-none" />

      {/* Simulated Email Verification Code Top Banner Toast */}
      <AnimatePresence>
        {showSimulatedCodeToast && isVerifyingCode && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -50, scale: 0.95 }}
            className="fixed top-4 left-4 right-4 md:left-auto md:right-4 md:max-w-md z-50 bg-indigo-900 text-white rounded-2xl p-4 shadow-2xl border border-indigo-700/50 flex flex-col space-y-3"
          >
            <div className="flex items-start space-x-3">
              <div className="p-1.5 bg-indigo-800 text-indigo-200 rounded-lg">
                <Mail size={18} className="animate-bounce" />
              </div>
              <div className="flex-1">
                <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-300 block">E-mail de Cadastro Simulador</span>
                <p className="text-xs font-semibold text-slate-100 leading-snug mt-0.5">
                  Como estamos no ambiente de testes, o código de confirmação foi exibido na tela abaixo para facilitar o teste:
                </p>
              </div>
            </div>
            
            <div className="bg-indigo-950 p-2.5 rounded-xl border border-indigo-800 flex justify-between items-center">
              <span className="text-[10px] text-indigo-400 font-bold">Código de Acesso:</span>
              <span className="text-lg font-mono font-bold tracking-[0.2em] text-emerald-400 bg-emerald-950/50 px-3 py-1 rounded-lg border border-emerald-900/50">
                {generatedCode}
              </span>
            </div>

            <button 
              onClick={() => setShowSimulatedCodeToast(false)}
              className="text-[10px] font-bold text-indigo-300 hover:text-white transition text-right cursor-pointer self-end"
            >
              Entendi, ocultar esta caixa
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Auth Container Card */}
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-xl border border-slate-200/80 overflow-hidden relative z-10">
        
        {/* Banner header inside card */}
        <div className="bg-slate-900 p-8 text-white text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-tr from-indigo-950/80 to-slate-900/90" />
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-600/20 rounded-full filter blur-xl" />
          
          <div className="relative space-y-3 flex flex-col items-center">
            <SecretLogo size="lg" dark={true} variant="full" />
            <p className="text-[10px] text-slate-400 font-medium tracking-wide uppercase mt-1">
              Plataforma de Gestão e Divisão de Contas
            </p>
          </div>
        </div>

        {/* Dynamic Screens View */}
        <div className="p-8">
          
          <AnimatePresence mode="wait">
            {/* SCREEN 1: VERIFYING REGISTRATION CODE */}
            {isVerifyingCode ? (
              <motion.div
                key="code-verification"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="space-y-1.5 text-center">
                  <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-2">
                    <Mail size={20} />
                  </div>
                  <h3 className="text-base font-bold text-slate-900">Verifique seu E-mail</h3>
                  <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
                    Insira o código de confirmação de 6 dígitos enviado para <span className="font-semibold text-slate-800">{regEmail}</span>.
                  </p>
                </div>

                <form onSubmit={handleVerifyAndCompleteRegister} className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block text-center">
                      Código de Verificação
                    </label>
                    <div className="flex justify-center">
                      <input
                        type="text"
                        maxLength={6}
                        placeholder="000000"
                        value={enteredCode}
                        onChange={(e) => setEnteredCode(e.target.value.replace(/\D/g, ''))}
                        className="text-center font-mono text-2xl tracking-[0.5em] px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl w-full max-w-[180px] focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition shadow-sm"
                        disabled={loading}
                        required
                      />
                    </div>
                  </div>

                  {verificationError && (
                    <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl flex items-start space-x-2 text-rose-600 text-xs font-semibold animate-shake">
                      <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                      <span>{verificationError}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-xl shadow-md shadow-indigo-100 hover:shadow-lg transition cursor-pointer text-xs"
                  >
                    {loading ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <span>Confirmar e Ativar Conta</span>
                        <ArrowRight size={14} />
                      </>
                    )}
                  </button>
                </form>

                <div className="flex flex-col items-center space-y-2 pt-2 border-t border-slate-100">
                  <button
                    onClick={handleResendCode}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition cursor-pointer"
                  >
                    Reenviar Código por E-mail
                  </button>
                  <button
                    onClick={() => {
                      setIsVerifyingCode(false);
                      setShowSimulatedCodeToast(false);
                    }}
                    className="flex items-center space-x-1 text-[10px] text-slate-400 font-semibold hover:text-slate-600 transition cursor-pointer"
                  >
                    <ArrowLeft size={10} />
                    <span>Voltar para o formulário de cadastro</span>
                  </button>
                </div>
              </motion.div>
            ) : activeTab === 'forgot_password' ? (
              /* SCREEN 2: FORGOT PASSWORD FORM */
              <motion.div
                key="forgot-password"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-6"
              >
                <div className="space-y-1 text-center">
                  <h3 className="text-base font-bold text-slate-900">Esqueceu sua senha?</h3>
                  <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
                    Insira o seu e-mail de cadastro. Enviaremos um link seguro para você redefinir sua senha.
                  </p>
                </div>

                <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block">
                      E-mail Registrado
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <Mail size={16} />
                      </div>
                      <input
                        type="email"
                        placeholder="nome@email.com"
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        className="pl-10 pr-4 py-2.5 w-full bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition shadow-sm font-medium"
                        disabled={loading}
                        required
                      />
                    </div>
                  </div>

                  {error && (
                    <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl flex items-start space-x-2 text-rose-600 text-xs font-semibold animate-shake">
                      <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                      <span>{error}</span>
                    </div>
                  )}

                  {successMsg && (
                    <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl flex items-start space-x-2 text-emerald-700 text-xs font-semibold">
                      <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" />
                      <span>{successMsg}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-4 rounded-xl shadow-md hover:shadow-lg transition cursor-pointer text-xs"
                  >
                    {loading ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <span>Solicitar Redefinição</span>
                        <ArrowRight size={14} />
                      </>
                    )}
                  </button>
                </form>

                <div className="pt-2 border-t border-slate-100 text-center">
                  <button
                    onClick={() => {
                      setActiveTab('login');
                      setError(null);
                      setSuccessMsg(null);
                    }}
                    className="flex items-center space-x-1.5 mx-auto text-xs font-bold text-indigo-600 hover:text-indigo-800 transition cursor-pointer"
                  >
                    <ArrowLeft size={12} />
                    <span>Voltar para o Login</span>
                  </button>
                </div>
              </motion.div>
            ) : activeTab === 'login' ? (
              /* SCREEN 3: LOGIN FORM */
              <motion.div
                key="login-form"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                {/* Switch Login / Register Tabs */}
                <div className="flex bg-slate-100 p-1.5 rounded-xl border border-slate-200/50">
                  <button
                    onClick={() => { setActiveTab('login'); setError(null); }}
                    className="flex-1 text-center py-2 text-xs font-bold rounded-lg transition cursor-pointer bg-white text-slate-900 shadow-sm"
                  >
                    Acessar Conta
                  </button>
                  <button
                    onClick={() => { setActiveTab('register'); setError(null); }}
                    className="flex-1 text-center py-2 text-xs font-bold rounded-lg transition cursor-pointer text-slate-500 hover:text-slate-800"
                  >
                    Cadastrar-se
                  </button>
                </div>

                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  
                  {/* Email or Phone field */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block">
                      E-mail ou Celular
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <Mail size={16} />
                      </div>
                      <input
                        type="text"
                        placeholder="exemplo@email.com ou 11999999999"
                        value={loginIdentifier}
                        onChange={(e) => setLoginIdentifier(e.target.value)}
                        className="pl-10 pr-4 py-2.5 w-full bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition shadow-sm font-medium"
                        disabled={loading}
                        required
                      />
                    </div>
                  </div>

                  {/* Password field */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                        Sua Senha
                      </label>
                      <button
                        type="button"
                        onClick={() => setActiveTab('forgot_password')}
                        className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 transition cursor-pointer"
                      >
                        Esqueceu a senha?
                      </button>
                    </div>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <Lock size={16} />
                      </div>
                      <input
                        type={showLoginPassword ? "text" : "password"}
                        placeholder="Digite sua senha"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        className="pl-10 pr-10 py-2.5 w-full bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition shadow-sm font-medium"
                        disabled={loading}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowLoginPassword(!showLoginPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition cursor-pointer"
                      >
                        {showLoginPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl flex items-start space-x-2 text-rose-600 text-xs font-semibold animate-shake">
                      <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                      <span>{error}</span>
                    </div>
                  )}

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-4 rounded-xl shadow-md shadow-indigo-100 hover:shadow-lg transition cursor-pointer text-xs mt-2"
                  >
                    {loading ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <span>Entrar na Plataforma</span>
                        <ArrowRight size={14} />
                      </>
                    )}
                  </button>
                </form>

                {/* Divider */}
                <div className="relative flex py-2 items-center">
                  <div className="flex-grow border-t border-slate-150"></div>
                  <span className="flex-shrink mx-3 text-[10px] text-slate-400 font-bold uppercase tracking-wide">Ou acesse com</span>
                  <div className="flex-grow border-t border-slate-150"></div>
                </div>

                {/* Google login alternate */}
                <button
                  onClick={handleGoogleLogin}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold py-2.5 px-4 rounded-xl shadow-sm hover:shadow-md transition cursor-pointer text-xs"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path fill="#EA4335" d="M12 5.04c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.76 14.97.67 12 .67c-4.3 0-8.01 2.47-9.82 6.06l3.66 2.85c.87-2.6 3.3-4.54 6.16-4.54z" />
                    <path fill="#4285F4" d="M23.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31l3.57 2.77c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55.99 10.22.99 12s.44 3.45 1.19 4.94l3.66-2.85z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  </svg>
                  <span>Entrar com o Google</span>
                </button>
              </motion.div>
            ) : (
              /* SCREEN 4: REGISTER FORM */
              <motion.div
                key="register-form"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                {/* Switch Login / Register Tabs */}
                <div className="flex bg-slate-100 p-1.5 rounded-xl border border-slate-200/50">
                  <button
                    onClick={() => { setActiveTab('login'); setError(null); }}
                    className="flex-1 text-center py-2 text-xs font-bold rounded-lg transition cursor-pointer text-slate-500 hover:text-slate-800"
                  >
                    Acessar Conta
                  </button>
                  <button
                    onClick={() => { setActiveTab('register'); setError(null); }}
                    className="flex-1 text-center py-2 text-xs font-bold rounded-lg transition cursor-pointer bg-white text-slate-900 shadow-sm"
                  >
                    Cadastrar-se
                  </button>
                </div>

                <form onSubmit={handleRegisterInitiate} className="space-y-4">
                  
                  {/* Row 1: Nome & Sobrenome */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block">
                        Nome
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                          <UserIcon size={14} />
                        </div>
                        <input
                          type="text"
                          placeholder="João"
                          value={regNome}
                          onChange={(e) => setRegNome(e.target.value)}
                          className="pl-8 pr-3 py-2 w-full bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition shadow-sm font-medium"
                          disabled={loading}
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block">
                        Sobrenome
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                          <UserIcon size={14} />
                        </div>
                        <input
                          type="text"
                          placeholder="Silva"
                          value={regSobrenome}
                          onChange={(e) => setRegSobrenome(e.target.value)}
                          className="pl-8 pr-3 py-2 w-full bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition shadow-sm font-medium"
                          disabled={loading}
                          required
                        />
                      </div>
                    </div>
                  </div>

                  {/* Row 2: Nascimento & Contato */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block">
                        Data de Nascimento
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                          <Calendar size={14} />
                        </div>
                        <input
                          type="date"
                          value={regBirthDate}
                          onChange={(e) => setRegBirthDate(e.target.value)}
                          className="pl-8 pr-3 py-2 w-full bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition shadow-sm font-medium"
                          disabled={loading}
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block">
                        Celular / Contato
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                          <Smartphone size={14} />
                        </div>
                        <input
                          type="tel"
                          placeholder="(11) 99999-9999"
                          value={regContato}
                          onChange={(e) => setRegContato(e.target.value)}
                          className="pl-8 pr-3 py-2 w-full bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition shadow-sm font-medium"
                          disabled={loading}
                          required
                        />
                      </div>
                    </div>
                  </div>

                  {/* Email field */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block">
                      Endereço de E-mail
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <Mail size={14} />
                      </div>
                      <input
                        type="email"
                        placeholder="exemplo@email.com"
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                        className="pl-10 pr-4 py-2 w-full bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition shadow-sm font-medium"
                        disabled={loading}
                        required
                      />
                    </div>
                  </div>

                  {/* Passwords grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block">
                        Definir Senha
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                          <Lock size={14} />
                        </div>
                        <input
                          type={showRegPassword ? "text" : "password"}
                          placeholder="Mín. 6 dígitos"
                          value={regPassword}
                          onChange={(e) => setRegPassword(e.target.value)}
                          className="pl-8 pr-8 py-2 w-full bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition shadow-sm font-medium"
                          disabled={loading}
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowRegPassword(!showRegPassword)}
                          className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600 transition cursor-pointer"
                        >
                          {showRegPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block">
                        Confirmar Senha
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                          <Lock size={14} />
                        </div>
                        <input
                          type={showRegPassword ? "text" : "password"}
                          placeholder="Repita a senha"
                          value={regConfirmPassword}
                          onChange={(e) => setRegConfirmPassword(e.target.value)}
                          className="pl-8 pr-3 py-2 w-full bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition shadow-sm font-medium"
                          disabled={loading}
                          required
                        />
                      </div>
                    </div>
                  </div>

                  {error && (
                    <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl flex items-start space-x-2 text-rose-600 text-xs font-semibold animate-shake">
                      <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                      <span>{error}</span>
                    </div>
                  )}

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-4 rounded-xl shadow-md hover:shadow-lg transition cursor-pointer text-xs mt-2"
                  >
                    <span>Prosseguir para Confirmação</span>
                    <ArrowRight size={14} />
                  </button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </div>
      
      {/* Platform Info footer message */}
      <div className="mt-6 flex items-center space-x-2 text-slate-400 font-medium">
        <Sparkles size={12} className="text-indigo-400" />
        <span className="text-[10px] tracking-wide uppercase">Desenvolvido com Segurança Firebase e Nuvem</span>
      </div>
    </div>
  );
}
