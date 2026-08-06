import { describe, it, expect } from 'vitest';
import { isBroadDestructiveStatement } from '../sqlSafety';

describe('isBroadDestructiveStatement', () => {
  it('flags a DELETE with no WHERE clause', () => {
    expect(isBroadDestructiveStatement('DELETE FROM users;')).toBe(true);
  });

  it('flags an UPDATE with no WHERE clause', () => {
    expect(isBroadDestructiveStatement("UPDATE users SET status = 'inactive';")).toBe(true);
  });

  it('does not flag a DELETE that has a WHERE clause', () => {
    expect(isBroadDestructiveStatement('DELETE FROM users WHERE id = 42;')).toBe(false);
  });

  it('does not flag an UPDATE that has a WHERE clause', () => {
    expect(isBroadDestructiveStatement("UPDATE users SET status = 'inactive' WHERE last_login < '2020-01-01';")).toBe(false);
  });

  it('does not flag a plain SELECT', () => {
    expect(isBroadDestructiveStatement('SELECT * FROM users;')).toBe(false);
  });

  it('does not flag an INSERT', () => {
    expect(isBroadDestructiveStatement("INSERT INTO users (name) VALUES ('a');")).toBe(false);
  });

  it('is case-insensitive for both the statement keyword and WHERE', () => {
    expect(isBroadDestructiveStatement('delete from users;')).toBe(true);
    expect(isBroadDestructiveStatement('delete from users where id = 1;')).toBe(false);
  });

  it('flags if any statement in a multi-statement batch is a bare DELETE/UPDATE', () => {
    const sql = "SELECT 1; DELETE FROM users; UPDATE users SET x = 1 WHERE id = 1;";
    expect(isBroadDestructiveStatement(sql)).toBe(true);
  });

  it('does not let a WHERE mentioned only in a comment count as a real WHERE clause', () => {
    const sql = '-- WHERE clause intentionally omitted for this cleanup\nDELETE FROM sessions;';
    expect(isBroadDestructiveStatement(sql)).toBe(true);
  });

  it('ignores WHERE inside a block comment too', () => {
    const sql = '/* has a WHERE somewhere */ DELETE FROM sessions;';
    expect(isBroadDestructiveStatement(sql)).toBe(true);
  });

  it('handles a real WHERE clause split across multiple lines', () => {
    const sql = `UPDATE users
SET status = 'archived'
WHERE last_login < '2020-01-01';`;
    expect(isBroadDestructiveStatement(sql)).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(isBroadDestructiveStatement('')).toBe(false);
  });
});
