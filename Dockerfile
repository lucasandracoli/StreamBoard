# Use uma imagem oficial do Node.js como base
FROM node:22-alpine

# Crie e defina o diretório de trabalho dentro do contêiner
WORKDIR /usr/src/streamboard

# Copie os arquivos de manifesto de pacotes
COPY package*.json ./

# Instale as dependências da aplicação
RUN npm install

# Copie o restante dos arquivos da aplicação
COPY . .

# Exponha a porta em que a aplicação roda
EXPOSE 3000

# Defina o comando para iniciar a aplicação
CMD [ "node", "server.js" ]