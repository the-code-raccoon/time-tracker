// Prints an APP_PASSWORD_HASH value for a password typed at a hidden prompt.
import { hashPassword } from '../server/password.ts';

function promptHidden(prompt: string): Promise<string> {
  const { stdin, stdout } = process;
  if (!stdin.isTTY) throw new Error('Run this in an interactive terminal');
  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.setEncoding('utf8');
  stdin.resume();

  return new Promise((resolve) => {
    let value = '';
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\u0003') process.exit(130); // Ctrl+C
        if (char === '\r' || char === '\n' || char === '\u0004') {
          stdin.off('data', onData);
          stdin.setRawMode(false);
          stdin.pause();
          stdout.write('\n');
          resolve(value);
          return;
        }
        value = char === '\u007f' ? value.slice(0, -1) : value + char;
      }
    };
    stdin.on('data', onData);
  });
}

const password = await promptHidden('Password: ');
if (password.length < 12) {
  console.error('Use at least 12 characters.');
  process.exit(1);
}
if (password !== (await promptHidden('Confirm password: '))) {
  console.error('Passwords do not match.');
  process.exit(1);
}
console.log(`\nAPP_PASSWORD_HASH=${await hashPassword(password)}`);
