
// Liga os botões do overlay e do painel SISTEMAS às funções reais.
// Confirma antes que todos os elementos existem. Se algum faltar, não registra nada.
import { CONFIG_READY, CONFIG_ERROR } from '../config.js';
import { signInWithPasskey, registerPasskey, passkeyErrorMessage } from './passkeys.js';
import {
  signInWithPassword, sendPasswordReset, updatePassword, signOut,
  passwordErrorMessage, resetErrorMessage, updateErrorMessage, signOutErrorMessage,
} from './authentication.js';
import { completeRecovery, onRecoveryChange } from './session.js';

const REQUIRED_IDS = [
  'authMsg', 'authSub', 'viewLogin', 'viewNewPassword', 'formPassword',
  'authEmail', 'authPassword', 'btnPasskey', 'btnShowPassword',
  'btnPasswordLogin', 'btnReset', 'newPassword', 'newPasswordConfirm',
  'btnSaveNewPassword', 'btnCancelRecovery', 'btnRegisterPasskey', 'btnLogout',
];

export function initAuthUI({ openPanel, closePanel }) {
  const el = {};
  const missing = [];
  for (const id of REQUIRED_IDS) {
    const node = document.getElementById(id);
    if (node) el[id] = node;
    else missing.push(id);
  }
  if (missing.length) {
    console.error('Elementos ausentes na interface de autenticação:', missing);
    const msg = document.getElementById('authMsg');
    if (msg) msg.textContent = 'Erro ao carregar a tela de acesso. Atualize a página.';
    return false;
  }

  const setMsg = t => { el.authMsg.textContent = t; };

  const busy = (btn, on, label) => {
    if (on) {
      btn.dataset.label = btn.dataset.label || btn.textContent;
      btn.textContent = label;
      btn.disabled = true;
    } else {
      btn.textContent = btn.dataset.label || btn.textContent;
      btn.disabled = false;
    }
  };

  const showRecovery = () => {
    el.viewLogin.style.display = 'none';
    el.viewNewPassword.classList.add('open');
    el.authSub.textContent = 'DEFINA UMA NOVA SENHA';
    setMsg('');
  };

  const showLogin = () => {
    el.viewNewPassword.classList.remove('open');
    el.viewLogin.style.display = '';
    el.authSub.textContent = 'IDENTIFIQUE-SE PARA ENTRAR NO NÚCLEO';
  };

  // A interface segue o estado de recuperação, nunca uma suposição própria.
  onRecoveryChange(on => (on ? showRecovery() : showLogin()));

  if (!CONFIG_READY) {
    setMsg(CONFIG_ERROR);
    ['btnPasskey', 'btnPasswordLogin', 'btnReset', 'btnSaveNewPassword'].forEach(k => {
      el[k].disabled = true;
    });
  }

  // ----- Passkey -----
  el.btnPasskey.onclick = async () => {
    const btn = el.btnPasskey;
    setMsg('');
    busy(btn, true, 'AGUARDANDO...');
    try {
      await signInWithPasskey();
    } catch (e) {
      console.error(e);
      setMsg(passkeyErrorMessage(e));
    } finally {
      busy(btn, false);
    }
  };

  // ----- E-mail e senha -----
  el.btnShowPassword.onclick = () => {
    el.formPassword.classList.toggle('open');
    setMsg('');
  };

  el.btnPasswordLogin.onclick = async () => {
    const btn = el.btnPasswordLogin;
    const email = el.authEmail.value.trim();
    const password = el.authPassword.value;
    if (!email || !password) return setMsg('Informe e-mail e senha.');
    setMsg('');
    busy(btn, true, 'VERIFICANDO...');
    try {
      await signInWithPassword(email, password);
      el.authPassword.value = '';
    } catch (e) {
      console.error(e);
      setMsg(passwordErrorMessage(e));
    } finally {
      busy(btn, false);
    }
  };

  el.btnReset.onclick = async () => {
    const btn = el.btnReset;
    const email = el.authEmail.value.trim();
    if (!email) return setMsg('Digite seu e-mail primeiro.');
    setMsg('');
    busy(btn, true, 'ENVIANDO...');
    try {
      await sendPasswordReset(email);
      setMsg('Se o e-mail estiver cadastrado, você receberá o link de redefinição.');
    } catch (e) {
      console.error(e);
      setMsg(resetErrorMessage(e));
    } finally {
      busy(btn, false);
    }
  };

  // ----- Nova senha -----
  el.btnSaveNewPassword.onclick = async () => {
    const btn = el.btnSaveNewPassword;
    const p1 = el.newPassword.value;
    const p2 = el.newPasswordConfirm.value;
    if (p1.length < 8) return setMsg('A senha precisa ter pelo menos 8 caracteres.');
    if (p1 !== p2) return setMsg('As senhas não coincidem.');
    setMsg('');
    busy(btn, true, 'SALVANDO...');
    try {
      await updatePassword(p1);
      el.newPassword.value = '';
      el.newPasswordConfirm.value = '';
      const result = await completeRecovery();
      if (!result.ok) {
        if (result.reason === 'no_session') {
          setMsg('Sua sessão de recuperação expirou. Solicite um novo link.');
        } else {
          setMsg('Senha salva, mas não foi possível confirmar sua sessão. Tente novamente.');
        }
      }
    } catch (e) {
      console.error(e);
      setMsg(updateErrorMessage(e));
    } finally {
      busy(btn, false);
    }
  };

  // Cancelar encerra a sessão. O SIGNED_OUT limpa o estado de recuperação.
  el.btnCancelRecovery.onclick = async () => {
    const btn = el.btnCancelRecovery;
    busy(btn, true, 'SAINDO...');
    try {
      await signOut();
      el.newPassword.value = '';
      el.newPasswordConfirm.value = '';
      setMsg('');
    } catch (e) {
      console.error(e);
      setMsg(signOutErrorMessage());
    } finally {
      busy(btn, false);
    }
  };

  // ----- Painel SISTEMAS -----
  el.btnRegisterPasskey.onclick = async () => {
    try {
      await registerPasskey();
      openPanel('PASSKEY', 'Passkey registrada com sucesso neste aparelho.');
    } catch (e) {
      console.error(e);
      openPanel('PASSKEY', passkeyErrorMessage(e));
    }
  };

  el.btnLogout.onclick = async () => {
    try {
      await signOut();
      closePanel();
    } catch (e) {
      console.error(e);
      openPanel('SAIR', signOutErrorMessage());
    }
  };

  return true;
}
