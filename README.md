# Gemini CLI Agent

A simple, production-ready agentic CLI powered by Google Gemini. Features an interactive loop with tool calling, human-in-the-loop confirmations, and conversation memory.

## Features

- **Agentic Loop** - Automatically executes tools and continues until task completion
- **Conversation Memory** - Maintains full chat history across turns
- **Human-in-the-Loop** - Confirms destructive actions (write, delete) before execution
- **Meaningful Errors** - Clear error messages with suggestions ("Did you mean...?")
- **Context Engineering** - File size limits to prevent context overflow
- **Escape Hatch** - Max iterations to prevent infinite loops
- **Modular Design** - Agent class is reusable and configurable

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Create a `.env` file:

```env
CF_ACCOUNT_ID=your_cloudflare_account_id
CF_GATEWAY_NAME=your_gateway_name
CF_AIG_TOKEN=your_api_token
```

### 3. Run the CLI

```bash
npm run dev
```

## Usage

```
🤖 Agent ready. Ask me to explore files in this directory.
   Type 'exit' or 'quit' to stop.

You: list files in current directory
Assistant: The files are: package.json, src/, README.md...

You: read the package.json file
Assistant: Here are the contents of package.json...

You: create a file called hello.py with a print statement
⚠️  Action requires confirmation:
   Tool: write_file
   Args: { "file_path": "hello.py", "contents": "print('Hello!')" }
Proceed? (y/n): y
[Tool Call] write_file(...)
Assistant: I've created hello.py with the print statement.

You: exit
Goodbye! 👋
```

### Special Commands

| Command | Description |
|---------|-------------|
| `exit` / `quit` | Exit the CLI |
| `clear` | Clear conversation history |

## Available Tools

| Tool | Description | Confirmation |
|------|-------------|--------------|
| `read_file` | Read file contents | No |
| `list_directory` | List files in directory | No |
| `write_file` | Create/overwrite file | **Yes** |
| `delete_file` | Delete a file | **Yes** |
| `delete_directory` | Delete a directory | **Yes** |

## Architecture

```
src/
├── model.ts      # Gemini client configuration
├── agent.ts      # Reusable Agent class
├── tools.ts      # Tool definitions & implementations
└── main.ts       # CLI entry point
```

### Agent Class

The `Agent` class is designed to be imported and used anywhere:

```typescript
import { Agent } from "./agent.js";
import { tools } from "./tools.js";

const agent = new Agent({
    model: "gemini-2.5-flash",
    tools: tools,
    systemInstruction: "You are a helpful assistant.",
    maxIterations: 15,
    onToolCall: (name, args) => console.log(`Calling ${name}`),
    confirmAction: async (name, args) => {
        // Your confirmation logic
        return true;
    },
});

const response = await agent.run("What files are in this directory?");
console.log(response.text);
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `model` | string | `gemini-2.5-flash` | Model to use |
| `tools` | ToolsMap | undefined | Tools available to agent |
| `systemInstruction` | string | "You are a helpful assistant." | System prompt |
| `maxIterations` | number | 15 | Max tool loops (escape hatch) |
| `onToolCall` | function | undefined | Logging hook |
| `confirmAction` | function | undefined | Confirmation hook |

## Best Practices Implemented

| Practice | Implementation |
|----------|----------------|
| **Clear Tool Naming** | `list_directory` not `ls_v2` |
| **Precise Descriptions** | Full sentences with examples in tool definitions |
| **Meaningful Errors** | "File not found. Did you mean 'data.csv'?" |
| **Fuzzy Inputs** | Handles `~`, `./`, trims whitespace |
| **Context Engineering** | 100KB file size limit |
| **Escape Hatch** | `maxIterations` prevents infinite loops |
| **Human-in-the-Loop** | Destructive actions require confirmation |
| **Transparency** | `onToolCall` hook logs all tool invocations |

## Adding New Tools

1. Define the tool in `tools.ts`:

```typescript
const myToolDefinition = {
    name: "my_tool",
    description: "Clear description of what this tool does. Include examples.",
    parameters: {
        type: "object",
        properties: {
            param1: {
                type: "string",
                description: "Description of param1",
            },
        },
        required: ["param1"],
    },
};

function myTool(param1: string): string {
    // Implementation with meaningful error handling
    return "result";
}
```

2. Add to the tools export:

```typescript
export const tools: ToolsMap = {
    // ... existing tools
    my_tool: {
        definition: myToolDefinition,
        function: myTool,
        requiresConfirmation: false, // Set true for destructive actions
    },
};
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Run CLI in development mode |
| `npm run build` | Compile TypeScript |
| `npm run start` | Run compiled CLI |
| `npm run typecheck` | Type check without emitting |

## License

ISC
