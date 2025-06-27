const readline = require("readline");
const bcrypt = require("bcrypt");
const db = require("../config/streamboard");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log("👤 Criador de Usuários - StreamBoard\n");

async function promptUserDetails() {
  return new Promise((resolve) => {
    rl.question("📝 Nome de usuário: ", (username) => {
      rl.question("📧 Email: ", (email) => {
        rl.question("🏷️ Nome de exibição: ", (displayName) => {
          rl.question("🔐 Papel (admin/user): ", (role) => {
            rl.question("🔑 Senha: ", (password) => {
              resolve({
                username,
                email,
                displayName,
                role: role || "user",
                password,
              });
            });
          });
        });
      });
    });
  });
}

async function createUser() {
  try {
    const { username, email, displayName, role, password } =
      await promptUserDetails();

    const hashedPassword = await bcrypt.hash(password, 10);

    await db.query(
      "INSERT INTO users (username, email, password, userRole, displayName) VALUES ($1, $2, $3, $4, $5)",
      [username, email, hashedPassword, role, displayName]
    );

    console.log("\n✅ Usuário criado com sucesso!");
  } catch (error) {
    console.error(`\n❌ Erro ao criar usuário: ${error.message}`);
  } finally {
    rl.close();
    process.exit();
  }
}

createUser();
