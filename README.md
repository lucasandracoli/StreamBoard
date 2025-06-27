# 📺 Plataforma de Gerenciamento de Conteúdo para Dispositivos Remotos

## 🔁 Fluxo Completo e Resumido

### 1. Login Técnico
- **Acesso restrito ao painel** apenas para a **equipe técnica**.
- **Clientes e dispositivos (TVs, totens)** não fazem login.

### 2. Pareamento do Dispositivo (único por dispositivo)
- A TV acessa uma URL especial:  
  `https://sua-plataforma.com/pair`
- A plataforma exibe um **token temporário de pareamento** (ex: `ABC123`).
- O técnico, logado no painel, insere esse token e atribui um nome à TV.
- O sistema:
  - Associa o dispositivo ao técnico autenticado.
  - Gera um **token permanente de autenticação** (ex: `a1b2c3d4...`).
  - Salva esse token **localmente na TV**.

### 3. Playback (uso contínuo)
- A TV acessa o endpoint de conteúdo:
  `https://sua-plataforma.com/playback?token=a1b2c3d4...`
- A plataforma:
  - Valida o token.
  - Entrega o conteúdo vinculado ao dispositivo.
- O conteúdo pode ser atualizado remotamente **sem alterar o token**.

### 4. Gerenciamento Remoto (via painel)
- Técnicos têm controle total via painel:
  - Visualização do status de cada TV (ex: `lastSeen`, `online/offline`).
  - Atualização de conteúdos por dispositivo ou em massa.
  - Revogação e reconfiguração de dispositivos.

## 🔐 Segurança
- Tokens:
  - **Únicos**, **longos**, **aleatórios**.
  - **Salvos apenas localmente** na TV.
- Dispositivos:
  - Acesso **somente ao conteúdo**, **sem acesso ao painel**.
- Tokens:
  - **Revogáveis remotamente**.
- Tráfego:
  - **100% via HTTPS** (obrigatório).

## 🧱 Estrutura Essencial do Banco de Dados
- `users`: Técnicos e administradores do sistema.
- `devices`: TVs, totens e outros dispositivos.
- `deviceTokens`: Tokens de autenticação permanente para dispositivos.
- *(Futuro)*:
  - `media`: Arquivos de mídia gerenciados.
  - `deviceContent`: Relação entre conteúdos e dispositivos.
