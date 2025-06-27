# StreamBoard - Sistema de Controle de Dispositivos e Usuários

**StreamBoard** é uma plataforma de gerenciamento de dispositivos (como TVs e totens), que permite aos administradores controlar o acesso ao conteúdo, configurar dispositivos e gerenciar autenticação com tokens. O sistema foi projetado para ser escalável, seguro e fácil de usar, com autenticação via tokens, criptografia de senhas e gerenciamento de dispositivos em tempo real.

---

## Objetivo do Projeto

O objetivo do **StreamBoard** é permitir que administradores configurem e gerenciem dispositivos em uma plataforma centralizada. O sistema oferece controle completo sobre dispositivos, como TVs, que podem ser configurados, pareados, autenticados e controlados remotamente pelos administradores.

As principais funcionalidades incluem:

- **Autenticação e Criação de Usuários**: Permitir a criação de usuários administradores.
- **Pareamento de Dispositivos**: Permitir que dispositivos sejam pareados à plataforma e recebam tokens de autenticação.
- **Gerenciamento de Tokens**: Gerenciar tokens temporários e permanentes para autenticação dos dispositivos.
- **Controle Remoto de Dispositivos**: Administradores podem ver o status dos dispositivos, revogar tokens e configurar novos dispositivos.

---

## Estrutura do Projeto

1. **Banco de Dados**:
   - Tabelas para armazenar dados de **usuários**, **dispositivos** e **tokens**.
2. **Scripts de Criação de Usuários**:

   - Script interativo para criação de novos administradores (usuários) com criptografia de senhas.

3. **Gestão de Dispositivos**:

   - Sistema para pareamento e autenticação de dispositivos utilizando tokens temporários e permanentes.

4. **Interface do Administrador**:

   - Painel administrativo para gerenciar usuários e dispositivos.

5. **Interface do Dispositivo**:
   - Interface onde os dispositivos se conectam e acessam o conteúdo utilizando tokens.

---

## Funcionalidades do Sistema

### 1. Criação de Usuários

O sistema permite que administradores sejam criados para acessar a plataforma e realizar as configurações. Os administradores podem ser criados com:

- Nome de usuário
- Email
- Nome de exibição
- Papel (`admin` ou `user`)
- Senha (criptografada)

### 2. Pareamento de Dispositivos

Dispositivos, como TVs e totens, se conectam ao sistema através de um **token temporário**, gerado no momento do pareamento. O administrador insere o token para completar o pareamento e associar um dispositivo ao sistema.

### 3. Autenticação Contínua

Após o pareamento, é gerado um **token permanente** para autenticação contínua do dispositivo. Esse token será utilizado para acessar o conteúdo, garantindo que o dispositivo tenha acesso sem a necessidade de reautenticação.

### 4. Gerenciamento de Dispositivos

Administradores têm a capacidade de:

- Visualizar o status de cada dispositivo (última vez online, ativo/inativo, etc.)
- Atualizar o conteúdo do dispositivo
- Revogar tokens a qualquer momento, interrompendo o acesso do dispositivo ao conteúdo.

---
