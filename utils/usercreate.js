const readline = require("readline");
const bcrypt = require("bcrypt");
const db = require("../config/streamboard");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log("👤 Criador de Usuários - StreamBoard\n");

async function createUser() {
  rl.question("📝 Nome de usuário: ", (username) => {
    rl.question("🏷️  Nome de exibição: ", (displayName) => {
      rl.question("🔐 Papel (admin/user): ", (role) => {
        rl.question("🔑 Senha: ", async (password) => {
          const hashedPassword = await bcrypt.hash(password, 10);
          try {
            await db.query(
              "INSERT INTO users (username, password, role, displayName) VALUES ($1, $2, $3, $4)",
              [username, hashedPassword, role || "user", displayName]
            );
            console.log("\n✅ Usuário criado com sucesso!");
          } catch (error) {
            console.error(`\n❌ Erro ao criar usuário: ${error.message}`);
          } finally {
            rl.close();
            process.exit();
          }
        });
      });
    });
  });
}

createUser();
