/**
 * Creates a new user account from the command line - the admin-side
 * equivalent of the public /register page, for deployments where you'd
 * rather provision accounts yourself than expose self-registration.
 *
 * Usage:
 *   node dist/scripts/createUser.js --email=jane@example.com --name="Jane Doe" --password=...
 *   node dist/scripts/createUser.js              (prompts for each field interactively)
 *
 * Behaves exactly like registering through the UI: creates the user, their
 * first personal workspace, and redeems any pending invites for that email.
 */
import * as readline from "node:readline";
import { registerSchema } from "@notorious/shared";
import { registerUser } from "../modules/auth/service.js";
import { sqlite } from "../db/client.js";

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (const raw of argv) {
    const match = /^--([^=]+)=(.*)$/.exec(raw);
    if (match) args[match[1]!] = match[2]!;
  }
  return args;
}

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

/** Prompts for a password without echoing it back to the terminal. */
function askHidden(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    const output = rl as unknown as { output: NodeJS.WritableStream; _writeToOutput?: (s: string) => void };
    let masked = false;
    output._writeToOutput = (text: string) => {
      output.output.write(masked ? "" : text);
    };
    rl.question(question, (answer) => {
      output._writeToOutput = undefined;
      output.output.write("\n");
      resolve(answer);
    });
    masked = true;
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    const email = args.email ?? (await ask(rl, "Email: ")).trim();
    const name = args.name ?? (await ask(rl, "Full name: ")).trim();
    const password = args.password ?? (await askHidden(rl, "Password (min. 8 characters): "));

    const input = registerSchema.parse({ email, name, password });
    const user = await registerUser(input);

    console.warn(`Created user ${user.email} (${user.name}) with their own workspace.`);
  } catch (error) {
    console.error("Could not create user:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    rl.close();
    sqlite.close();
  }
}

void main();
