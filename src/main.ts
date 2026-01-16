import * as readline from "readline";
import { Agent } from "./agent.js";
import { tools } from "./tools.js";
import { DEFAULT_MODEL } from "./model.js";

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

function log(message: string): void {
    console.log(`\x1b[90m${message}\x1b[0m`); // Gray color for logs
}

async function confirmAction(toolName: string, args: Record<string, unknown>): Promise<boolean> {
    console.log(`\n\x1b[33m⚠️  Action requires confirmation:\x1b[0m`);
    console.log(`   Tool: ${toolName}`);
    console.log(`   Args: ${JSON.stringify(args, null, 2)}`);

    const answer = await prompt("\x1b[33mProceed? (y/n): \x1b[0m");
    return answer.toLowerCase() === "y" || answer.toLowerCase() === "yes";
}

function onToolCall(name: string, args: Record<string, unknown>): void {
    log(`[Tool Call] ${name}(${JSON.stringify(args)})`);
}

async function main(): Promise<void> {
    const agent = new Agent({
        model: DEFAULT_MODEL,
        tools: tools,
        systemInstruction: `You are a helpful Coding Assistant. You help users explore and manage their files.

IMPORTANT: You have full conversation memory. You can recall and reference all previous messages, queries, tool calls, and responses from this conversation. When users ask about previous queries or what you did, refer back to the conversation history.

Be concise and direct in your responses.`,
        maxIterations: 15,
        onToolCall: onToolCall,
        confirmAction: confirmAction,
    });

    console.log("\n🤖 Agent ready. Ask me to explore files in this directory.");
    console.log("   Type 'exit' or 'quit' to stop.\n");

    while (true) {
        const userInput = await prompt("You: ");

        if (!userInput.trim()) {
            continue;
        }

        if (userInput.toLowerCase() === "exit" || userInput.toLowerCase() === "quit") {
            console.log("\nGoodbye! 👋\n");
            break;
        }

        // Special commands
        if (userInput.toLowerCase() === "clear") {
            agent.clearHistory();
            console.log("Conversation history cleared.\n");
            continue;
        }

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

main().catch(console.error);
