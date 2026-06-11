import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(__dirname, '../../database.sqlite');
const db = new Database(dbPath);

console.log('Initializing database at', dbPath);

db.exec(`
  DROP TABLE IF EXISTS users;
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'active'
  );

  DROP TABLE IF EXISTS orders;
  CREATE TABLE orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    total_amount REAL NOT NULL,
    status TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  DROP TABLE IF EXISTS products;
  CREATE TABLE products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    stock INTEGER NOT NULL
  );
`);

const insertUser = db.prepare('INSERT INTO users (id, email, status) VALUES (?, ?, ?)');
insertUser.run('123e4567-e89b-12d3-a456-426614174000', 'alice@example.com', 'active');
insertUser.run('123e4567-e89b-12d3-a456-426614174001', 'bob@example.com', 'pending');
insertUser.run('123e4567-e89b-12d3-a456-426614174002', 'charlie@example.com', 'active');

const insertProduct = db.prepare('INSERT INTO products (name, price, stock) VALUES (?, ?, ?)');
insertProduct.run('Mechanical Keyboard', 150.00, 45);
insertProduct.run('Wireless Mouse', 80.00, 120);
insertProduct.run('27" 4K Monitor', 350.00, 15);

const insertOrder = db.prepare('INSERT INTO orders (user_id, total_amount, status) VALUES (?, ?, ?)');
insertOrder.run('123e4567-e89b-12d3-a456-426614174000', 150.00, 'shipped');
insertOrder.run('123e4567-e89b-12d3-a456-426614174001', 430.00, 'processing');

console.log('Database seeded successfully.');
