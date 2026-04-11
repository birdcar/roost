import { describe, test, expect } from 'bun:test';
import { toPascalCase, toCamelCase, toKebabCase, toSnakeCase, toTableName, pluralize } from '../src/utils';

describe('toPascalCase', () => {
  test('converts kebab-case', () => expect(toPascalCase('send-email')).toBe('SendEmail'));
  test('converts snake_case', () => expect(toPascalCase('send_email')).toBe('SendEmail'));
  test('keeps PascalCase', () => expect(toPascalCase('SendEmail')).toBe('SendEmail'));
  test('converts single word', () => expect(toPascalCase('user')).toBe('User'));
});

describe('toCamelCase', () => {
  test('converts kebab-case', () => expect(toCamelCase('send-email')).toBe('sendEmail'));
  test('converts PascalCase', () => expect(toCamelCase('SendEmail')).toBe('sendEmail'));
});

describe('toKebabCase', () => {
  test('converts PascalCase', () => expect(toKebabCase('SendEmail')).toBe('send-email'));
  test('converts camelCase', () => expect(toKebabCase('sendEmail')).toBe('send-email'));
  test('keeps kebab-case', () => expect(toKebabCase('send-email')).toBe('send-email'));
});

describe('toSnakeCase', () => {
  test('converts PascalCase', () => expect(toSnakeCase('SendEmail')).toBe('send_email'));
  test('converts kebab-case', () => expect(toSnakeCase('send-email')).toBe('send_email'));
});

describe('toTableName', () => {
  test('converts PascalCase to snake plural', () => {
    expect(toTableName('User')).toBe('users');
    expect(toTableName('UserProfile')).toBe('user_profiles');
    expect(toTableName('BlogPost')).toBe('blog_posts');
  });
});

describe('pluralize', () => {
  test('adds s', () => expect(pluralize('user')).toBe('users'));
  test('handles y ending', () => expect(pluralize('category')).toBe('categories'));
  test('keeps existing s', () => expect(pluralize('users')).toBe('users'));
});
