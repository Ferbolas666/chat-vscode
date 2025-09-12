const socket = io();


// pedir nome do usuário
let username = localStorage.getItem('chat_username') || '';
if (!username) {
username = prompt('Como deseja ser chamado?') || `User-${Math.floor(Math.random()*9000)+1000}`;
localStorage.setItem('chat_username', username);
}


document.getElementById('usernameDisplay').textContent = username;


socket.emit('join', username);


const chatWindow = document.getElementById('chatWindow');
const form = document.getElementById('formMsg');
const input = document.getElementById('inputMsg');


function appendSystem(text){
const el = document.createElement('div');
el.className = 'system';
el.textContent = text;
chatWindow.appendChild(el);
chatWindow.scrollTop = chatWindow.scrollHeight;
}


function appendMessage({username, message, ts}){
const el = document.createElement('div');
el.className = 'message';
el.innerHTML = `<div class="meta">${username} · ${new Date(ts).toLocaleTimeString()}</div><div class="text">${escapeHtml(message)}</div>`;
chatWindow.appendChild(el);
chatWindow.scrollTop = chatWindow.scrollHeight;
}


function escapeHtml(unsafe) {
return unsafe.replace(/[&<>"']/g, function(m) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[m]; });
}


socket.on('systemMessage', (txt) => appendSystem(txt));
socket.on('chatMessage', (payload) => appendMessage(payload));


form.addEventListener('submit', (ev) => {
ev.preventDefault();
const val = input.value.trim();
if (!val) return;
socket.emit('chatMessage', val);
input.value = '';
});