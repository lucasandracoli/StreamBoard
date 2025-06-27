🔁 Fluxo Completo e Resumido
1. Login Técnico
Apenas equipe técnica faz login no painel.

Clientes e TVs não precisam de login.

2. Pareamento do Dispositivo (uma vez)
A TV abre uma URL especial (ex: https://sua-plataforma.com/pair).

A plataforma exibe um token de pareamento temporário (ex: ABC123).

No painel, o técnico insere esse token e dá um nome à TV.

O sistema associa o dispositivo ao técnico (usuário logado) e gera um token permanente de autenticação (ex: a1b2c3d4...).

Esse token é salvo localmente na TV.

3. Playback (sempre)
A TV acessa:
https://sua-plataforma.com/playback?token=a1b2c3d4...

A plataforma valida o token e entrega o conteúdo associado.

O conteúdo pode ser atualizado remotamente, sem mudar o token.

4. Gerenciamento Remoto
No painel, técnicos podem:

Ver status das TVs (lastSeen, online/offline).

Atualizar conteúdos individualmente ou em grupo.

Revogar ou reconfigurar dispositivos.

🔐 Segurança
Tokens são únicos, longos e aleatórios.

Dispositivos só acessam conteúdo, sem acesso ao painel.

Tokens podem ser revogados remotamente.

HTTPS obrigatório.

🧱 Banco de Dados (essencial)
users: técnicos/administradores.

devices: TVs e totens.

deviceTokens: autenticação permanente de cada dispositivo.

(Mais tarde) media e deviceContent para gestão de arquivos e exibição.