const sqlite3 = require('sqlite3').verbose();

// Open the database
const db = new sqlite3.Database('./database.db', (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else { 
    console.log('Connected to SQLite database');
  }
});

const createTablesSQL = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    balance REAL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    date TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`;

const deleteuser = `DELETE FROM transactions WHERE user_id = 4;
DELETE FROM users WHERE id = 5;`

// Run the SQL code to create tables
db.exec(deleteuser);
// Export the db object to use in other files
module.exports = db;