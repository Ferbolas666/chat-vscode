const express = require('express');
const session = require('express-session');
const Firebird = require('node-firebird');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const app = express();

// CHAVE SECRETA (em produção, use variáveis de ambiente!)
const CRYPTO_KEY = crypto.scryptSync('minha-chave-super-secreta-chat-app-2024', 'salt', 32);
const ALGORITHM = 'aes-256-cbc';

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({ 
    secret: 'chatsecret', 
    resave: false, 
    saveUninitialized: true,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));
app.use(express.static('public'));

const dbOptions = {
    host: 'db-junior-demo.sp1.br.saveincloud.net.br',
    port: 13305,
    database: '/opt/firebird/data/dados_sposto_junior-remoto.fdb',
    user: 'SYSDBA',
    password: 'gmvgB9LwmvprEj1SLYm3',
    lowercase_keys: false,
    role: null,
    pageSize: 4096
};

// FUNÇÃO PARA CRIPTOGRAFAR MENSAGEM COM AES-256-CBC
function encryptMessage(message) {
    try {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(ALGORITHM, CRYPTO_KEY, iv);
        
        let encrypted = cipher.update(message, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        // Retornar IV + mensagem criptografada (IV é necessário para descriptografar)
        return iv.toString('hex') + ':' + encrypted;
    } catch (error) {
        console.error('Erro ao criptografar mensagem:', error);
        return message; // Fallback: retorna mensagem original em caso de erro
    }
}

// FUNÇÃO PARA DESCRIPTOGRAFAR MENSAGEM AES-256-CBC
function decryptMessage(encryptedMessage) {
    try {
        // Verificar se a mensagem está criptografada (formato IV:encrypted)
        if (!encryptedMessage.includes(':')) {
            return encryptedMessage; // Não está criptografada, retorna original
        }
        
        const parts = encryptedMessage.split(':');
        const iv = Buffer.from(parts[0], 'hex');
        const encrypted = parts[1];
        
        const decipher = crypto.createDecipheriv(ALGORITHM, CRYPTO_KEY, iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    } catch (error) {
        console.error('Erro ao descriptografar mensagem:', error);
        return "🔒 Mensagem criptografada (erro na descriptografia)";
    }
}

// Middleware para verificar autenticação
function requireAuth(req, res, next) {
    if (req.session.usuario_logado) {
        next();
    } else {
        res.redirect('/login');
    }
}

// GET login - carrega nomes do Firebird
app.get('/login', (req, res) => {
    if (req.session.usuario_logado) {
        return res.redirect('/chat.html');
    }

    Firebird.attach(dbOptions, (err, db) => {
        if (err) {
            console.error('Erro ao conectar ao banco:', err);
            return res.status(500).send('Erro no servidor');
        }

        db.query('SELECT cod_funcionario, nome FROM FUNCIONARIOS ORDER BY nome', (err, result) => {
            db.detach();
            
            if (err) {
                console.error('Erro na consulta:', err);
                return res.status(500).send('Erro no servidor');
            }

            let options = '';
            result.forEach(row => {
                options += `<option value="${row.COD_FUNCIONARIO}">${row.NOME}</option>`;
            });

            let html = fs.readFileSync(path.join('public', 'login.html'), 'utf8');
            html = html.replace('{{USUARIOS}}', options);
            res.send(html);
        });
    });
});

// POST login
app.post('/login', (req, res) => {
    const usuario = parseInt(req.body.usuario_logado);
    const senha = req.body.senha;

    Firebird.attach(dbOptions, function(err, db) {
        if (err) {
            console.error('Erro ao conectar ao banco:', err);
            return res.status(500).send('Erro no servidor');
        }

        const query = `
            SELECT f.cod_funcionario, f.nome, f.senha, n.nivel 
            FROM FUNCIONARIOS f
            LEFT JOIN NIVEL_USUARIO n ON f.cod_nivel = n.cod_nivel
            WHERE f.cod_funcionario = ?
        `;
        
        db.query(query, [usuario], (err, result) => {
            db.detach();
            
            if (err) {
                console.error('Erro na consulta:', err);
                return res.status(500).send('Erro no servidor');
            }

            if (result.length === 0) {
                return res.status(401).send('Usuário não encontrado');
            }

            const user = result[0];
            
            if (user.SENHA === senha) {
                req.session.usuario_logado = user.COD_FUNCIONARIO;
                req.session.usuario_nome = user.NOME;
                req.session.usuario_nivel = user.NIVEL || 'Usuário';
                
                const iniciais = user.NOME.split(' ')
                    .map(nome => nome[0])
                    .join('')
                    .toUpperCase()
                    .substring(0, 2);
                
                req.session.usuario_iniciais = iniciais;
                
                res.redirect('/chat.html');
            } else {
                res.status(401).send('Senha incorreta!');
            }
        });
    });
});

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Erro ao fazer logout:', err);
        }
        res.redirect('/login');
    });
});

// API para obter dados do usuário logado
app.get('/api/usuario', requireAuth, (req, res) => {
    res.json({
        id: req.session.usuario_logado,
        nome: req.session.usuario_nome,
        nivel: req.session.usuario_nivel,
        iniciais: req.session.usuario_iniciais
    });
});

// API para obter os níveis disponíveis (TODOS os níveis)
app.get('/api/niveis', requireAuth, (req, res) => {
    Firebird.attach(dbOptions, (err, db) => {
        if (err) {
            console.error('Erro ao conectar ao banco:', err);
            return res.status(500).json({ error: 'Erro no servidor' });
        }

        const query = 'SELECT cod_nivel, nivel FROM NIVEL_USUARIO ORDER BY cod_nivel';
        
        db.query(query, (err, result) => {
            db.detach();
            
            if (err) {
                console.error('Erro na consulta de níveis:', err);
                return res.status(500).json({ error: 'Erro no servidor' });
            }

            const niveis = result.map(row => ({
                cod_nivel: row.COD_NIVEL,
                nivel: row.NIVEL
            }));

            res.json(niveis);
        });
    });
});

// API para obter contatos por nível
app.get('/api/contatos', requireAuth, (req, res) => {
    const { nivel } = req.query;
    
    if (!nivel) {
        return res.status(400).json({ error: 'Parâmetro nível é obrigatório' });
    }

    Firebird.attach(dbOptions, (err, db) => {
        if (err) {
            console.error('Erro ao conectar ao banco:', err);
            return res.status(500).json({ error: 'Erro no servidor' });
        }

        const query = `
            SELECT f.cod_funcionario, f.nome, n.nivel
            FROM FUNCIONARIOS f
            INNER JOIN NIVEL_USUARIO n ON f.cod_nivel = n.cod_nivel
            WHERE f.cod_nivel = ?
            ORDER BY f.nome
        `;
        
        db.query(query, [nivel], (err, result) => {
            db.detach();
            
            if (err) {
                console.error('Erro na consulta de contatos:', err);
                return res.status(500).json({ error: 'Erro no servidor' });
            }

            const contatos = result.map(row => {
                const iniciais = row.NOME.split(' ')
                    .map(nome => nome[0])
                    .join('')
                    .toUpperCase()
                    .substring(0, 2);
                
                return {
                    id: row.COD_FUNCIONARIO,
                    nome: row.NOME,
                    nivel: row.NIVEL,
                    avatar: iniciais,
                    status: 'Online'
                };
            });

            res.json(contatos);
        });
    });
});

// NOVA API: Obter apenas níveis que possuem usuários
app.get('/api/niveis-com-usuarios', requireAuth, (req, res) => {
    Firebird.attach(dbOptions, (err, db) => {
        if (err) {
            console.error('Erro ao conectar ao banco:', err);
            return res.status(500).json({ error: 'Erro no servidor' });
        }

        // Buscar apenas níveis que possuem pelo menos um usuário
        const query = `
            SELECT DISTINCT n.cod_nivel, n.nivel
            FROM NIVEL_USUARIO n
            INNER JOIN FUNCIONARIOS f ON n.cod_nivel = f.cod_nivel
            ORDER BY n.cod_nivel
        `;
        
        db.query(query, (err, result) => {
            db.detach();
            
            if (err) {
                console.error('Erro na consulta de níveis com usuários:', err);
                return res.status(500).json({ error: 'Erro no servidor' });
            }

            const niveis = result.map(row => ({
                cod_nivel: row.COD_NIVEL,
                nivel: row.NIVEL
            }));

            res.json(niveis);
        });
    });
});

// API para carregar mensagens (VERSÃO COM CRIPTOGRAFIA)
app.get('/api/mensagens', requireAuth, (req, res) => {
    const { dest } = req.query;
    const usuario_logado = req.session.usuario_logado;
    
    if (!dest) {
        return res.status(400).json({ error: 'Parâmetro dest é obrigatório' });
    }

    const codDestinatario = parseInt(dest.toString());
    
    Firebird.attach(dbOptions, (err, db) => {
        if (err) {
            console.error('Erro ao conectar ao banco:', err);
            return res.status(500).json({ error: 'Erro no servidor' });
        }

        const query = `
            SELECT m.id, m.cod_usuario, m.cod_destinatario, 
                   f.nome AS usuario, 
                   CAST(m.mensagem AS VARCHAR(1000)) AS mensagem,
                   m.data_envio
            FROM chat_mensagens m
            LEFT JOIN FUNCIONARIOS f ON f.cod_funcionario = m.cod_usuario
            WHERE (m.cod_usuario = ? AND m.cod_destinatario = ?)
               OR (m.cod_usuario = ? AND m.cod_destinatario = ?)
            ORDER BY m.data_envio ASC
        `;
        
        const params = [usuario_logado, codDestinatario, codDestinatario, usuario_logado];

        db.query(query, params, (err, result) => {
            db.detach();
            
            if (err) {
                console.error('Erro na consulta de mensagens:', err);
                return res.status(500).json({ error: 'Erro no servidor' });
            }

            // Formatar as mensagens para o frontend COM DESCRIPTOGRAFIA
            const mensagens = result.map(row => ({
                id: row.ID,
                cod_usuario: row.COD_USUARIO,
                cod_destinatario: row.COD_DESTINATARIO,
                usuario: row.USUARIO || "Sem nome",
                mensagem: decryptMessage(row.MENSAGEM || ""),
                data_envio: row.DATA_ENVIO,
                is_own: row.COD_USUARIO == usuario_logado
            }));

            res.json(mensagens);
        });
    });
});

// API para enviar mensagem (COM CRIPTOGRAFIA AES-256)
app.post('/api/enviar', requireAuth, (req, res) => {
    const { mensagem, dest } = req.body;
    const usuario_logado = req.session.usuario_logado;

    if (!usuario_logado || !mensagem || !dest) {
        return res.status(400).json({ error: 'Usuário, mensagem e destinatário são obrigatórios' });
    }

    Firebird.attach(dbOptions, (err, db) => {
        if (err) {
            console.error('Erro ao conectar ao banco:', err);
            return res.status(500).json({ error: 'Erro no servidor' });
        }

        const codFuncionario = parseInt(dest.toString());
        
        // CRIPTOGRAFAR A MENSAGEM COM AES-256
        const mensagemCriptografada = encryptMessage(mensagem);
            
        const queryInsert = `
            INSERT INTO chat_mensagens 
                (cod_usuario, cod_destinatario, usuario, mensagem, data_envio) 
            VALUES 
                (?, ?, 
                (SELECT nome FROM FUNCIONARIOS WHERE cod_funcionario = ?),
                ?, CURRENT_TIMESTAMP)
        `;
        
        // USAR MENSAGEM CRIPTOGRAFADA
        db.query(queryInsert, [usuario_logado, codFuncionario, usuario_logado, mensagemCriptografada], (err, result) => {
            db.detach();
            
            if (err) {
                console.error('Erro ao enviar mensagem:', err);
                return res.status(500).json({ error: 'Erro no servidor' });
            }

            res.json({ 
                success: true,
                message: 'Mensagem criptografada enviada com sucesso'
            });
        });
    });
});

// Rota para o chat (proteção adicional)
app.get('/chat.html', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

// Rota padrão - redireciona para login
app.get('/', (req, res) => {
    if (req.session.usuario_logado) {
        res.redirect('/chat.html');
    } else {
        res.redirect('/login');
    }
});

// Iniciar servidor
app.listen(3000, () => {
    console.log('Servidor rodando na porta 3000');
    console.log('Acesse: http://localhost:3000');
});