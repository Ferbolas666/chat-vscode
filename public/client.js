// client.js
document.addEventListener('DOMContentLoaded', () => {
    // garante que o Socket.IO já foi carregado
    if (typeof io === 'undefined') {
        console.error('Socket.IO não foi carregado!');
        return;
    }

    const socket = io("http://127.0.0.1:3000");

    // Pegar ou pedir o nome do usuário
    let username = localStorage.getItem('chat_username') || '';
    if (!username) {
        username = prompt('Como deseja ser chamado?') || `User-${Math.floor(Math.random() * 9000) + 1000}`;
        localStorage.setItem('chat_username', username);
    }

    const usernameDisplay = document.getElementById('usernameDisplay');
    if (usernameDisplay) usernameDisplay.textContent = username;

    // avisar o servidor que entrou
    socket.emit('join', username);

    const chatWindow = document.getElementById('chatWindow');
    const form = document.getElementById('formMsg');
    const input = document.getElementById('inputMsg');

    function appendSystem(text) {
        const el = document.createElement('div');
        el.className = 'system';
        el.textContent = text;
        chatWindow.appendChild(el);
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }

    function appendMessage({ username, message, ts }) {
        const el = document.createElement('div');
        el.className = 'message';
        el.innerHTML = `<div class="meta">${username} · ${new Date(ts).toLocaleTimeString()}</div>
                        <div class="text">${escapeHtml(message)}</div>`;
        chatWindow.appendChild(el);
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }

    function escapeHtml(unsafe) {
        return unsafe.replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
    }

    // Eventos do servidor
    socket.on('systemMessage', (txt) => appendSystem(txt));
    socket.on('chatMessage', (payload) => appendMessage(payload));

    // Envio de mensagem
    form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const val = input.value.trim();
        if (!val) return;
        socket.emit('chatMessage', val);
        input.value = '';
    });
});
