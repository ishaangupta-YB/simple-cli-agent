import * as readline from "readline";
import { Agent } from "./agent.js";
import { tools } from "./tools.js";
import { DEFAULT_MODEL } from "./model.js";

// ============================================================================
// Constants
// ============================================================================

const SYSTEM_INSTRUCTION = `You are a helpful Coding Assistant. You help users explore and manage their files.

IMPORTANT: You have full conversation memory. You can recall and reference all previous messages, queries, tool calls, and responses from this conversation. When users ask about previous queries or what you did, refer back to the conversation history.

Be concise and direct in your responses.`;

const MULTILINE_DELIMITER = '"""';

// ============================================================================
// Readline Setup
// ============================================================================

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

function prompt(question: string): Promise<string> {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer);
        });
    });
}

// ============================================================================
// Multiline Input Handler
// ============================================================================

async function readMultilineInput(): Promise<string> {
    console.log('\x1b[90m   Entering multiline mode. Type """ on a new line to finish.\x1b[0m');
    const lines: string[] = [];

    while (true) {
        const line = await prompt("... ");

        if (line.trim() === MULTILINE_DELIMITER) {
            break;
        }

        lines.push(line);
    }

    return lines.join("\n");
}

// ============================================================================
// Utility Functions
// ============================================================================

function log(message: string): void {
    console.log(`\x1b[90m${message}\x1b[0m`); // Gray color for logs
}

function showHelp(): void {
    console.log(`
\x1b[36m📖 Available Commands:\x1b[0m

  \x1b[33m/help\x1b[0m      Show this help message
  \x1b[33m/clear\x1b[0m     Clear conversation history
  \x1b[33m/exit\x1b[0m      Exit the CLI (also: /quit)
  \x1b[33m"""\x1b[0m        Start multiline input mode

\x1b[36m📁 Available Tools:\x1b[0m

  • read_file        - Read file contents
  • list_directory   - List files in a directory
  • write_file       - Create/overwrite a file (requires confirmation)
  • delete_file      - Delete a file (requires confirmation)
  • delete_directory - Delete a directory (requires confirmation)

\x1b[36m💡 Tips:\x1b[0m

  • Use """ to paste multi-line content (code, configs, etc.)
  • Destructive actions (write, delete) require your confirmation
  • Type /clear to start a fresh conversation
`);
}

// ============================================================================
// Agent Hooks
// ============================================================================

async function confirmAction(toolName: string, args: Record<string, unknown>): Promise<boolean> {
    console.log(`\n\x1b[33m⚠️  Action requires confirmation:\x1b[0m`);
    console.log(`   Tool: ${toolName}`);
    console.log(`   Args: ${JSON.stringify(args, null, 2)}`);

    // Loop until we get a valid y/n response
    while (true) {
        const answer = await prompt("\x1b[33mProceed? (y/n): \x1b[0m");
        const normalized = answer.toLowerCase().trim();

        if (normalized === "y" || normalized === "yes") {
            return true;
        }
        if (normalized === "n" || normalized === "no") {
            return false;
        }

        console.log("   Please enter 'y' or 'n'");
    }
}

function onToolCall(name: string, args: Record<string, unknown>): void {
    log(`[Tool Call] ${name}(${JSON.stringify(args)})`);
}

async function onMaxIterationsReached(iteration: number): Promise<boolean> {
    console.log(`\n\x1b[33m⚠️  Agent has reached ${iteration} iterations.\x1b[0m`);
    console.log("   This might indicate a complex task or potential loop.");

    while (true) {
        const answer = await prompt("\x1b[33mContinue for 15 more iterations? (y/n): \x1b[0m");
        const normalized = answer.toLowerCase().trim();

        if (normalized === "y" || normalized === "yes") {
            console.log("   Continuing...\n");
            return true;
        }
        if (normalized === "n" || normalized === "no") {
            return false;
        }

        console.log("   Please enter 'y' or 'n'");
    }
}

// ============================================================================
// Main CLI Loop
// ============================================================================

async function main(): Promise<void> {
    const agent = new Agent({
        model: DEFAULT_MODEL,
        tools: tools,
        systemInstruction: SYSTEM_INSTRUCTION,
        maxIterations: 15,
        onToolCall: onToolCall,
        confirmAction: confirmAction,
        onMaxIterationsReached: onMaxIterationsReached,
    });

    console.log("\n🤖 Agent ready. Ask me to explore files in this directory.");
    console.log('   Type /help for commands, """ for multiline input.\n');

    while (true) {
        let userInput = await prompt("You: ");
        const trimmedInput = userInput.trim();

        // Empty input - skip
        if (!trimmedInput) {
            continue;
        }

        // Check for multiline delimiter at start
        if (trimmedInput === MULTILINE_DELIMITER || trimmedInput.startsWith(MULTILINE_DELIMITER)) {
            // If just """, enter multiline mode
            if (trimmedInput === MULTILINE_DELIMITER) {
                userInput = await readMultilineInput();
            } else {
                // If """some text, start with that text and continue reading
                const firstLine = trimmedInput.slice(MULTILINE_DELIMITER.length);
                const restOfInput = await readMultilineInput();
                userInput = firstLine + "\n" + restOfInput;
            }

            if (!userInput.trim()) {
                console.log("   Empty input, skipping.\n");
                continue;
            }
        }

        // Special commands (must start with /)
        if (trimmedInput.startsWith("/")) {
            const command = trimmedInput.toLowerCase();

            if (command === "/exit" || command === "/quit") {
                console.log("\nGoodbye! 👋\n");
                break;
            }

            if (command === "/clear") {
                agent.clearHistory();
                console.log("Conversation history cleared.\n");
                continue;
            }

            if (command === "/help") {
                showHelp();
                continue;
            }

            // Unknown command
            console.log(`\x1b[31mUnknown command: ${trimmedInput}\x1b[0m`);
            console.log("Type /help for available commands.\n");
            continue;
        }

        // Run agent with user input
        try {
            const response = await agent.run(userInput);
            console.log(`\nAssistant: ${response.text}\n`);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`\n\x1b[31mError: ${message}\x1b[0m\n`);
        }
    }

    rl.close();
}

// Run the CLI
main().catch(console.error);
