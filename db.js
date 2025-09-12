const Firebird = require('node-firebird');

const options = {
  host: 'db-junior-demo.sp1.br.saveincloud.net.br',
  port: 13305,
  database: '/opt/firebird/data/dados_sposto_junior-remoto.fdb', // ajuste para o seu banco
  user: 'SYSDBA',
  password: 'gmvgB9LwmvprEj1SLYm3',
  lowercase_keys: false,
  role: null
};

module.exports = { Firebird, options };
