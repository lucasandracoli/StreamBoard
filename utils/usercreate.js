const readline = require("readline");
const bcrypt = require("bcrypt");
const db = require("../config/streamboard");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log("👤 User Creator - StreamBoard\n");

async function promptUserDetails() {
  return new Promise((resolve) => {
    rl.question("📝 Username: ", (username) => {
      rl.question("📧 Email: ", (email) => {
        rl.question("🏷️ Display Name: ", (displayName) => {
          rl.question("🔐 Role (admin/user): ", (role) => {
            rl.question("🔑 Password: ", (password) => {
              resolve({
                username,
                email,
                display_name: displayName,
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
    const { username, email, display_name, role, password } =
      await promptUserDetails();

    const hashedPassword = await bcrypt.hash(password, 10);

    await db.query(
      "INSERT INTO users (username, email, password, user_role, display_name) VALUES ($1, $2, $3, $4, $5)",
      [username, email, hashedPassword, role, display_name]
    );

    console.log("\n✅ User successfully created!");
  } catch (error) {
    console.error(`\n❌ Failed to create user: ${error.message}`);
  } finally {
    rl.close();
    process.exit();
  }
}

createUser();
