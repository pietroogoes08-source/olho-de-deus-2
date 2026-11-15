
// Controla sessão, bloqueio da interface e o estado de recuperação de senha.
// Regras:
// 1) startSession é idempotente: o listener é registrado uma única vez.
// 2) O callback do Supabase não chama o Supabase; só atualiza a tela e agenda trabalho.
// 3) O estado de recuperação é único: a interface só mostra a tela de nova senha
//    quando setRecovery(true) for chamado. Ele volta a false com sessão encerrada,
//    com sessão confirmada após salvar a senha, ou por cancelamento.
import { supabase } from '../supabase.js';
import { CONFIG_READY } from '../config.js';

const RECOVERY_KEY = 'od_recovery_pending';
const overlay = document.getElementById('auth');

let started = false;
let callbackSeen = false;
let recoveryPending = readRecoveryFlag();
const recoveryListeners = [];

function readRecoveryFlag() {
  try { return sessionStorage.getItem(RECOVERY_KEY) === '1'; } catch { return false; }
}

function writeRecoveryFlag(on) {
  try {
    if (on) sessionStorage.setItem(RECOVERY_KEY, '1');
    else sessionStorage.removeItem(RECOVERY_KEY);
  } catch {
    // Sem sessionStorage, o estado continua na memória desta aba.
  }
}

function setRecovery(on) {
  if (recoveryPending === on) return;
  recoveryPending = on;
  writeRecoveryFlag(on);
  recoveryListeners.forEach(fn => {
    try { fn(on); } catch (e) { console.error(e); }
  });
}

// locked = true → overlay visível e interface oculta.
export function setLocked(locked) {
  document.body.classList.toggle('locked', locked);
  if (overlay) overlay.classList.toggle('open', locked);
}

export function isRecoveryPending() {
  return recoveryPending;
}

// Recebe true/false sempre que o estado de recuperação muda, e o valor atual na hora.
export function onRecoveryChange(fn) {
  recoveryListeners.push(fn);
  fn(recoveryPending);
}

// Registro de atividade feito fora do callback, em tarefa separada.
function scheduleActivityLog(userId, eventType, description) {
  setTimeout(async () => {
    if (!supabase || !userId) return;
    try {
      const { error } = await supabase.from('activity_logs').insert({
        user_id: userId,
        event_type: eventType,
        description,
        metadata: { client: 'web', at: new Date().toISOString() },
      });
      if (error) console.warn('Registro de atividade não gravado:', error.message);
    } catch (e) {
      console.warn('Registro de atividade não gravado.', e);
    }
  }, 0);
}

// Chamado depois que a nova senha foi salva.
// Só libera a interface com sessão confirmada. Em qualquer outro caso mantém bloqueado.
export async function completeRecovery() {
  if (!supabase) return { ok: false, reason: 'not_configured' };

  let data = null;
  let error = null;
  try {
    ({ data, error } = await supabase.auth.getSession());
  } catch (e) {
    error = e;
  }

  if (error) {
    // Erro de rede ou servidor: continua na recuperação para o usuário tentar de novo.
    setLocked(true);
    return { ok: false, reason: 'error' };
  }
  if (!data?.session) {
    // Sem sessão: o link expirou ou foi invalidado. Volta para o login.
    setRecovery(false);
    setLocked(true);
    return { ok: false, reason: 'no_session' };
  }

  setRecovery(false);
  setLocked(false);
  return { ok: true };
}

export async function startSession() {
  if (started) return;
  started = true;

  if (!CONFIG_READY || !supabase) {
    setLocked(true);
    return;
  }

  // 1) Listener primeiro, para não perder nenhum evento.
  supabase.auth.onAuthStateChange((event, session) => {
    callbackSeen = true;

    if (event === 'PASSWORD_RECOVERY') {
      setRecovery(true);
      setLocked(true);
    } else if (recoveryPending && !session) {
      // Recuperação pendente sem sessão: não há o que concluir.
      setRecovery(false);
      setLocked(true);
    } else {
      setLocked(recoveryPending || !session);
      if (event === 'SIGNED_IN' && !recoveryPending && session?.user) {
        scheduleActivityLog(session.user.id, 'auth.signed_in', 'Entrada confirmada');
      }
    }
  });

  // 2) Consulta de apoio, só se o callback ainda não informou o estado.
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (callbackSeen) return;

    if (!data.session) {
      setRecovery(false);
      setLocked(true);
      return;
    }
    setLocked(recoveryPending);
  } catch (e) {
    console.error(e);
    if (!callbackSeen) setLocked(true);
  }
}
