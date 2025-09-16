const express = require('express');
const session = require('express-session');
const Firebird = require('node-firebird');
const { Pool } = require('pg'); // Adicione esta linha para importar o PostgreSQL
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const app = express();
// Configure o multer corretamente
const multer = require('multer');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});
// CHAVE SECRETA (em produção, use variáveis de ambiente!)
const CRYPTO_KEY = crypto.scryptSync('minha-chave-super-secreta-chat-app-2024', 'salt', 32);
const ALGORITHM = 'aes-256-cbc';

// Configuração do PostgreSQL - Adicione este bloco
const pgPool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'chat_imagens',
  password: 'senha4253',
  port: 5432,
});

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

// API para obter contatos por nível com verificação de permissões
app.get('/api/contatos', requireAuth, (req, res) => {
    const { nivel } = req.query;
    const usuario_logado = req.session.usuario_logado;
    
    console.log(`Solicitação de contatos para o nível: ${nivel} pelo usuário: ${usuario_logado}`);
    
    if (!nivel) {
        return res.status(400).json({ error: 'Parâmetro nível é obrigatório' });
    }

    Firebird.attach(dbOptions, (err, db) => {
        if (err) {
            console.error('Erro ao conectar ao banco:', err);
            return res.status(500).json({ error: 'Erro no servidor' });
        }

        // Primeiro, obter o nível do usuário logado
        const queryNivelUsuario = `
            SELECT n.nivel, n.cod_nivel
            FROM FUNCIONARIOS f
            INNER JOIN NIVEL_USUARIO n ON f.cod_nivel = n.cod_nivel
            WHERE f.cod_funcionario = ?
        `;

        db.query(queryNivelUsuario, [usuario_logado], (err, resultNivel) => {
            if (err) {
                db.detach();
                console.error('Erro ao obter nível do usuário:', err);
                return res.status(500).json({ error: 'Erro no servidor' });
            }

            if (resultNivel.length === 0) {
                db.detach();
                return res.status(404).json({ error: 'Usuário não encontrado' });
            }

            const nivelUsuarioLogado = resultNivel[0].NIVEL;
            const codNivelUsuarioLogado = resultNivel[0].COD_NIVEL;

            console.log(`Usuário logado: Nível ${nivelUsuarioLogado}, Código ${codNivelUsuarioLogado}`);

            // Buscar todos os níveis disponíveis para determinar as permissões
            const queryTodosNiveis = `
                SELECT cod_nivel, nivel FROM NIVEL_USUARIO
            `;

            db.query(queryTodosNiveis, (err, resultTodosNiveis) => {
                if (err) {
                    db.detach();
                    console.error('Erro ao obter níveis:', err);
                    return res.status(500).json({ error: 'Erro no servidor' });
                }

                // Mapear códigos dos níveis
                const codigosNiveis = {};
                resultTodosNiveis.forEach(row => {
                    codigosNiveis[row.NIVEL] = row.COD_NIVEL;
                });

                console.log('Códigos dos níveis:', codigosNiveis);

                // Definir quais níveis o usuário logado pode acessar
                let codNiveisPermitidos = [];
                
                switch(nivelUsuarioLogado) {
                    case 'MASTER':
                        // Master pode acessar todos os níveis
                        codNiveisPermitidos = resultTodosNiveis.map(row => row.COD_NIVEL);
                        break;
                    case 'ADMINISTRATIVO':
                        codNiveisPermitidos = [
                            codigosNiveis['ADMINISTRATIVO'],
                            codigosNiveis['INQUILINO']
                        ].filter(Boolean);
                        break;
                    case 'PROPRIETARIO':
                        codNiveisPermitidos = [
                            codigosNiveis['ADMINISTRATIVO'],
                            codigosNiveis['PROPRIETARIO']
                        ].filter(Boolean);
                        break;
                    case 'INQUILINO':
                        codNiveisPermitidos = [
                            codigosNiveis['ADMINISTRATIVO'],
                            codigosNiveis['INQUILINO']
                        ].filter(Boolean);
                        break;
                    default:
                        codNiveisPermitidos = [];
                }

                console.log(`Níveis permitidos para ${nivelUsuarioLogado}: ${codNiveisPermitidos}`);

                // Verificar se o nível solicitado está na lista de permitidos
                const nivelSolicitado = parseInt(nivel);
                if (!codNiveisPermitidos.includes(nivelSolicitado)) {
                    db.detach();
                    console.log(`Acesso negado: Usuário ${nivelUsuarioLogado} tentou acessar nível ${nivelSolicitado}`);
                    return res.status(403).json({ error: 'Acesso não permitido a este nível' });
                }

                // Se tem permissão, buscar os contatos do nível solicitado
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

                    console.log(`Retornando ${contatos.length} contatos para o nível ${nivel}`);
                    res.json(contatos);
                });
            });
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

// API para carregar mensagens (VERSÃO COM CRIPTOGRAFIA E IMAGENS)
app.get('/api/mensagens', requireAuth, async (req, res) => {
    const { dest } = req.query;
    const usuario_logado = req.session.usuario_logado;
    
    if (!dest) {
        return res.status(400).json({ error: 'Parâmetro dest é obrigatório' });
    }

    const codDestinatario = parseInt(dest.toString());
    
    try {
        // Buscar mensagens de texto do Firebird
        const mensagensTexto = await new Promise((resolve, reject) => {
            Firebird.attach(dbOptions, (err, db) => {
                if (err) {
                    reject(err);
                    return;
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
                        reject(err);
                    } else {
                        resolve(result.map(row => ({
                            id: row.ID,
                            tipo: 'texto',
                            cod_usuario: row.COD_USUARIO,
                            cod_destinatario: row.COD_DESTINATARIO,
                            usuario: row.USUARIO || "Sem nome",
                            conteudo: decryptMessage(row.MENSAGEM || ""),
                            data_envio: row.DATA_ENVIO,
                            is_own: row.COD_USUARIO == usuario_logado
                        })));
                    }
                });
            });
        });

        // Buscar imagens do PostgreSQL
        const imagensQuery = `
            SELECT id, cod_usuario, cod_destinatario, arquivo, data_envio
            FROM chat_mensagens 
            WHERE (cod_usuario = $1 AND cod_destinatario = $2)
               OR (cod_usuario = $2 AND cod_destinatario = $1)
            ORDER BY data_envio ASC
        `;
        
        const imagensResult = await pgPool.query(imagensQuery, [usuario_logado, codDestinatario]);
        
        // Buscar nomes dos usuários das imagens
        const codigosUsuariosImagens = [...new Set(imagensResult.rows.map(row => row.cod_usuario))];
        const nomesUsuarios = {};

        if (codigosUsuariosImagens.length > 0) {
            await new Promise((resolve, reject) => {
                Firebird.attach(dbOptions, (err, db) => {
                    if (err) {
                        console.error('Erro ao conectar ao Firebird:', err);
                        resolve();
                        return;
                    }

                    const placeholders = codigosUsuariosImagens.map(() => '?').join(',');
                    const queryNomes = `
                        SELECT cod_funcionario, nome
                        FROM FUNCIONARIOS
                        WHERE cod_funcionario IN (${placeholders})
                    `;

                    db.query(queryNomes, codigosUsuariosImagens, (err, result) => {
                        db.detach();
                        if (err) {
                            console.error('Erro ao buscar nomes:', err);
                        } else {
                            result.forEach(row => {
                                nomesUsuarios[row.COD_FUNCIONARIO] = row.NOME;
                            });
                        }
                        resolve();
                    });
                });
            });
        }

        // Formatar mensagens de imagem
        const mensagensImagem = imagensResult.rows.map(row => ({
            id: row.id,
            tipo: 'imagem',
            cod_usuario: row.cod_usuario,
            cod_destinatario: row.cod_destinatario,
            usuario: nomesUsuarios[row.cod_usuario] || "Sem nome",
            conteudo: row.arquivo,
            data_envio: row.data_envio,
            is_own: row.cod_usuario == usuario_logado
        }));

        // Combinar e ordenar todas as mensagens
        const todasMensagens = [...mensagensTexto, ...mensagensImagem];
        todasMensagens.sort((a, b) => new Date(a.data_envio) - new Date(b.data_envio));

        res.json(todasMensagens);

    } catch (error) {
        console.error('Erro ao carregar mensagens:', error);
        res.status(500).json({ error: 'Erro ao carregar mensagens' });
    }
});

// API para enviar mensagem (COM CRIPTOGRAFIA AES-256 e replicação no Postgres)
app.post('/api/enviar', requireAuth, async (req, res) => {
    const { mensagem, dest } = req.body;
    const usuario_logado = req.session.usuario_logado;

    if (!usuario_logado || !mensagem || !dest) {
        return res.status(400).json({ error: 'Usuário, mensagem e destinatário são obrigatórios' });
    }

    const codFuncionario = parseInt(dest.toString());
    const mensagemCriptografada = encryptMessage(mensagem);

    // SALVAR NO FIREBIRD
    Firebird.attach(dbOptions, async (err, db) => {
        if (err) {
            console.error('Erro ao conectar ao Firebird:', err);
            return res.status(500).json({ error: 'Erro no servidor Firebird' });
        }

        const queryFB = `
            INSERT INTO chat_mensagens 
                (cod_usuario, cod_destinatario, usuario, mensagem, data_envio) 
            VALUES 
                (?, ?, (SELECT nome FROM FUNCIONARIOS WHERE cod_funcionario = ?), ?, CURRENT_TIMESTAMP)
        `;

        db.query(queryFB, [usuario_logado, codFuncionario, usuario_logado, mensagemCriptografada], async (errFB) => {
            db.detach();

            if (errFB) {
                console.error('Erro ao salvar no Firebird:', errFB);
                return res.status(500).json({ error: 'Erro ao salvar mensagem no Firebird' });
            }

            // ✅ SALVAR NO POSTGRES
            try {
                await pgPool.query(`
                    INSERT INTO chat_mensagens 
                        (cod_usuario, cod_destinatario, usuario, mensagem, data_envio)
                    VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
                `, [usuario_logado, codFuncionario, req.session.usuario_nome, mensagemCriptografada]);

                res.json({ 
                    success: true, 
                    message: 'Mensagem enviada e replicada no Postgres com sucesso' 
                });
            } catch (errPG) {
                console.error('Erro ao salvar no Postgres:', errPG);
                return res.status(500).json({ error: 'Erro ao salvar mensagem no Postgres' });
            }
        });
    });
});

// Rota para upload de imagem
app.post('/upload-imagem', upload.single('imagem'), async (req, res) => {
  try {
    // Verifique se o arquivo foi recebido
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhuma imagem enviada' });
    }

    const { cod_usuario, cod_destinatario, usuario, mensagem } = req.body;
    const imagem = req.file.buffer;

    const query = `
      INSERT INTO chat_mensagens 
        (cod_usuario, cod_destinatario, usuario, mensagem, data_envio, arquivo)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, $5)
    `;

    await pgPool.query(query, [
      cod_usuario,
      cod_destinatario,
      usuario,
      mensagem,
      imagem
    ]);

    res.status(200).json({ message: 'Imagem salva com sucesso!' });
  } catch (error) {
    console.error('Erro ao salvar imagem:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
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