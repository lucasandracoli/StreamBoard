# StreamBoard

Painel administrativo com distribuição de ofertas e controle de dispositivos (TVs, players, apps conectados). O sistema permite cadastrar usuários, emparelhar dispositivos e gerenciar o conteúdo exibido remotamente.

---

## ✅ Funcionalidades implementadas

### 🔐 Autenticação de Usuário
- Sessão baseada em cookie (express-session)
- Login de administrador via `/login`
- Logout via `/logout`
- Proteção de rotas com middleware `isAuthenticated` + `isAdmin`

### 🖥️ Gerenciamento de Dispositivos
- Rota `/devices` com:
  - Cadastro de novos dispositivos
  - Geração automática de `device_id` e `device_secret`
  - Exibição do status (ativo/inativo), último acesso
  - Ações de ativar/desativar
- Interface com layout responsivo em EJS

### 🔗 Emparelhamento de Dispositivo
- Rota visual `/deviceLogin` com formulário simples (`pair.ejs`)
- Validação de `device_id` e `device_secret`
- Geração de `access_token` e `refresh_token` via JWT
- Tela de confirmação pós-emparelhamento (`player.ejs`)

### 🔒 Autenticação via Token (JWT)
- Rotas:
  - `POST /device/auth`: autentica e retorna token
  - `POST /device/refresh`: emite novos tokens
- Middleware `deviceAuth` para proteger rotas futuras
- Tokens persistidos na tabela `device_tokens`

---

## 🔧 Estrutura de Banco de Dados

Tabelas criadas:

- `users`: controle de administradores
- `devices`: controle de dispositivos registrados
- `device_tokens`: tokens de acesso/refresh emitidos

---

## 📂 Estrutura de Views (EJS)

| Página              | View         |
|---------------------|--------------|
| Login de usuário    | `login.ejs`  |
| Dashboard admin     | `dashboard.ejs` |
| Gerenciar devices   | `devices.ejs` |
| Emparelhar device   | `pair.ejs`   |
| Player após login   | `player.ejs` |

---

## 🟡 Próximos passos

### 📦 Distribuição de Conteúdo

- [ ] Criar tabela `offers` (ofertas)
- [ ] Associar ofertas a dispositivos
- [ ] Implementar rota `GET /deviceOffers` (JWT protegido)
- [ ] Renderizar ofertas no player

### 🧠 Funcionalidades Futuras

- [ ] Visualização de logs de conexão por dispositivo
- [ ] Notificações de dispositivo offline
- [ ] Upload de vídeos/imagens no painel
- [ ] QR Code na tela `/devices` para emparelhamento rápido
- [ ] Interface pública para visualização externa (modo kiosk)

---

## 🚀 Setup Rápido

```bash
npm install
node scripts/setup-database.js
node server.js
