const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

const USERS_FILE = path.join(__dirname, 'users.json');
const BCRYPT_ROUNDS = 12;

function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) return [];
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function findUser(username) {
  return loadUsers().find(u => u.username === username) || null;
}

async function createUser(username, password) {
  const users = loadUsers();
  if (users.find(u => u.username === username)) {
    throw new Error('User already exists');
  }
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  users.push({ username, passwordHash, createdAt: new Date().toISOString() });
  saveUsers(users);
}

function deleteUser(username) {
  const users = loadUsers();
  const idx = users.findIndex(u => u.username === username);
  if (idx === -1) throw new Error('User not found');
  users.splice(idx, 1);
  saveUsers(users);
}

async function verifyPassword(username, password) {
  const user = findUser(username);
  if (!user) return false;
  return bcrypt.compare(password, user.passwordHash);
}

async function initAdminIfNeeded() {
  if (fs.existsSync(USERS_FILE)) return;
  const { ADMIN_USER, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_USER || !ADMIN_PASSWORD) {
    console.error('users.json not found. Set ADMIN_USER and ADMIN_PASSWORD to initialize.');
    process.exit(1);
  }
  await createUser(ADMIN_USER, ADMIN_PASSWORD);
  console.log(`Admin user "${ADMIN_USER}" created.`);
}

module.exports = { loadUsers, findUser, createUser, deleteUser, verifyPassword, initAdminIfNeeded };
