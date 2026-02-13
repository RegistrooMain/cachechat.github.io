(function () {
  'use strict';

  const STORAGE_ACCOUNT = 'xd_account';
  const STORAGE_SESSION = 'xd_session';

  let supabase = null;
  let currentSession = null;
  let messagesSubscription = null;

  // ===== Init =====
  function init() {
    const config = window.APP_CONFIG;
    if (!config || !config.supabaseUrl || !config.supabaseAnonKey || config.supabaseUrl.includes('ВАШ')) {
      alert('Настройте config.js: укажите Supabase URL и anon key. См. README.');
      return;
    }
    supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

    bindNavigation();
    bindWelcome();
    bindAccount();
    bindMain();
    bindCreated();
    bindJoin();
    bindChat();

    const account = localStorage.getItem(STORAGE_ACCOUNT);
    if (account) {
      document.getElementById('current-account').textContent = account;
      showScreen('main');
    } else {
      showScreen('welcome');
    }
  }

  // ===== Screen navigation =====
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById('screen-' + id);
    if (el) el.classList.add('active');
    if (id === 'main') {
      const wrap = document.getElementById('continue-chat-wrap');
      if (wrap) wrap.style.display = localStorage.getItem(STORAGE_SESSION) ? 'block' : 'none';
    }
  }

  function bindNavigation() {
    document.querySelectorAll('.btn-back').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-back');
        if (target) showScreen(target);
      });
    });
  }

  // ===== Welcome =====
  function bindWelcome() {
    document.getElementById('btn-start').addEventListener('click', () => showScreen('account'));
  }

  // ===== Account =====
  function bindAccount() {
    const input = document.getElementById('input-account');
    const saved = localStorage.getItem(STORAGE_ACCOUNT);
    if (saved) input.value = saved;

    document.getElementById('btn-continue').addEventListener('click', () => {
      const account = input.value.trim();
      if (!account) {
        toast('Введите имя');
        return;
      }
      if (account.length < 2) {
        toast('Минимум 2 символа');
        return;
      }
      localStorage.setItem(STORAGE_ACCOUNT, account);
      document.getElementById('current-account').textContent = account;
      showScreen('main');
    });
  }

  // ===== Main =====
  function bindMain() {
    document.getElementById('btn-logout').addEventListener('click', () => {
      localStorage.removeItem(STORAGE_ACCOUNT);
      localStorage.removeItem(STORAGE_SESSION);
      showScreen('welcome');
    });

    document.getElementById('btn-create-chat').addEventListener('click', createChat);
    document.getElementById('btn-join-chat').addEventListener('click', () => showScreen('join'));

    const btnCont = document.getElementById('btn-continue-chat');
    if (btnCont) {
      btnCont.addEventListener('click', () => {
        const sess = localStorage.getItem(STORAGE_SESSION);
        if (sess) {
          currentSession = JSON.parse(sess);
          openChat(currentSession);
        }
      });
    }
  }

  // ===== Create chat =====
  async function createChat() {
    const account = localStorage.getItem(STORAGE_ACCOUNT);
    if (!account) return showScreen('account');

    const key = generateKey();
    try {
      const { data, error } = await supabase.from('sessions').insert({
        key,
        creator_account: account,
        created_at: new Date().toISOString()
      }).select('id').single();

      if (error) throw error;

      currentSession = { id: data.id, key, creator_account: account, my_account: account };
      localStorage.setItem(STORAGE_SESSION, JSON.stringify(currentSession));

      document.getElementById('share-account').textContent = account;
      document.getElementById('share-key').textContent = key;

      // Copy buttons
      document.querySelectorAll('.btn-copy').forEach(btn => {
        btn.onclick = () => {
          const what = btn.getAttribute('data-copy');
          const text = what === 'account' ? account : key;
          navigator.clipboard.writeText(text).then(() => toast('Скопировано'));
        };
      });

      showScreen('created');
    } catch (e) {
      console.error(e);
      toast('Ошибка: ' + (e.message || 'Не удалось создать чат'));
    }
  }

  function generateKey() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let key = '';
    for (let i = 0; i < 8; i++) key += chars[Math.floor(Math.random() * chars.length)];
    return key;
  }

  // ===== Created screen =====
  function bindCreated() {
    document.getElementById('btn-open-created-chat').addEventListener('click', () => {
      openChat(currentSession);
    });
  }

  // ===== Join =====
  function bindJoin() {
    document.getElementById('btn-do-join').addEventListener('click', async () => {
      const account = document.getElementById('input-join-account').value.trim();
      const key = document.getElementById('input-join-key').value.trim().toUpperCase();

      if (!account || !key) {
        toast('Заполните оба поля');
        return;
      }

      try {
        const { data, error } = await supabase
          .from('sessions')
          .select('id, creator_account')
          .eq('key', key)
          .eq('creator_account', account)
          .maybeSingle();

        if (error) throw error;
        if (!data) {
          toast('Чат не найден. Проверьте ключ и аккаунт.');
          return;
        }

        const myAccount = localStorage.getItem(STORAGE_ACCOUNT);
        currentSession = {
          id: data.id,
          key,
          creator_account: account,
          my_account: myAccount
        };
        localStorage.setItem(STORAGE_SESSION, JSON.stringify(currentSession));

        document.getElementById('input-join-account').value = '';
        document.getElementById('input-join-key').value = '';
        openChat(currentSession);
      } catch (e) {
        console.error(e);
        toast('Ошибка: ' + (e.message || 'Не удалось подключиться'));
      }
    });
  }

  // ===== Chat =====
  function openChat(session) {
    currentSession = session;
    const other = session.creator_account === session.my_account ? 'Ожидание...' : session.creator_account;
    document.getElementById('chat-with').textContent = other === 'Ожидание...' ? 'Чат' : 'Чат с ' + other;
    document.getElementById('chat-status').textContent = other === 'Ожидание...' ? 'Ждём собеседника' : '';

    loadMessages();
    subscribeMessages();
    showScreen('chat');

    document.getElementById('message-input').focus();
  }

  function bindChat() {
    const input = document.getElementById('message-input');
    const btn = document.getElementById('btn-send');

    function send() {
      const text = input.value.trim();
      if (!text || !currentSession) return;

      supabase.from('messages').insert({
        session_id: currentSession.id,
        sender: localStorage.getItem(STORAGE_ACCOUNT),
        content: text,
        created_at: new Date().toISOString()
      }).then(({ error }) => {
        if (error) {
          toast('Не удалось отправить');
          return;
        }
        input.value = '';
      });
    }

    btn.addEventListener('click', send);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    });
  }

  async function loadMessages() {
    if (!currentSession) return;

    const { data, error } = await supabase
      .from('messages')
      .select('id, sender, content, created_at')
      .eq('session_id', currentSession.id)
      .order('created_at', { ascending: true });

    const list = document.getElementById('messages-list');
    list.innerHTML = '';

    if (error) {
      list.innerHTML = '<p class="messages-empty">Ошибка загрузки</p>';
      return;
    }

    if (!data || data.length === 0) {
      list.innerHTML = '<p class="messages-empty">Нет сообщений. Напишите первым!</p>';
      return;
    }

    const myAccount = localStorage.getItem(STORAGE_ACCOUNT);
    data.forEach(m => {
      list.appendChild(renderMessage(m, m.sender === myAccount));
    });

    scrollToBottom();
  }

  function renderMessage(m, isSent) {
    const div = document.createElement('div');
    div.className = 'message ' + (isSent ? 'sent' : 'received');
    const time = new Date(m.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    div.innerHTML = `
      <div class="message-text">${escapeHtml(m.content)}</div>
      <div class="message-meta">${time}${!isSent ? ' · ' + escapeHtml(m.sender) : ''}</div>
    `;
    return div;
  }

  function subscribeMessages() {
    if (messagesSubscription) {
      supabase.removeChannel(messagesSubscription);
      messagesSubscription = null;
    }

    if (!currentSession) return;

    messagesSubscription = supabase
      .channel('messages-' + currentSession.id)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: 'session_id=eq.' + currentSession.id
      }, () => {
        loadMessages();
      })
      .subscribe();
  }

  function scrollToBottom() {
    const c = document.getElementById('messages-container');
    if (c) c.scrollTop = c.scrollHeight;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ===== Toast =====
  function toast(msg) {
    let el = document.querySelector('.toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 2500);
  }

  // ===== Start =====
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
