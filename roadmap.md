/public
└── /js
    ├── /admin
    │   ├── utils.js              # Funções e instâncias compartilhadas (Notyf, helpers)
    │   ├── cache.js              # Gerenciador de cache de status
    │   ├── loginForm.js          # Lógica do formulário de login
    │   ├── companyModal.js       # Lógica do modal de Empresas
    │   ├── deviceModal.js        # Lógica do modal de Dispositivos
    │   ├── campaignModal.js      # Lógica do modal de Campanhas
    │   ├── detailsModal.js       # Lógica do modal de Detalhes do Dispositivo
    │   ├── confirmationModal.js  # Lógica do modal de Confirmação
    │   ├── globalListeners.js    # Listeners de eventos globais
    │   └── adminWs.js            # Conexão WebSocket do painel admin
    └── main.js                 # (será substituído pelo novo main.js)