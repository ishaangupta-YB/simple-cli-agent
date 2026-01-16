import { GoogleGenAI, Content, Part, GenerateContentResponse } from "@google/genai";
import { client, DEFAULT_MODEL } from "./model.js";

export type ToolDefinition = {
    name: string;
    description: string;
    parameters: object;
};

export type ToolsMap = Record<string, {
    definition: ToolDefinition;
    function: (...args: any[]) => any;
    requiresConfirmation?: boolean; // Human-in-the-loop for sensitive operations
}>;

export type AgentConfig = {
    model?: string;
    tools?: ToolsMap;
    systemInstruction?: string;
    maxIterations?: number; // Escape hatch to prevent infinite loops
    onToolCall?: (name: string, args: Record<string, unknown>) => void; // Logging hook
    confirmAction?: (name: string, args: Record<string, unknown>) => Promise<boolean>; // Human-in-the-loop
};

export class Agent {
    client: GoogleGenAI;
    model: string;
    tools?: ToolsMap;
    contents: Content[];
    systemInstruction: string;
    maxIterations: number;
    onToolCall?: (name: string, args: Record<string, unknown>) => void;
    confirmAction?: (name: string, args: Record<string, unknown>) => Promise<boolean>;

    constructor(config: AgentConfig = {}) {
        this.client = client;
        this.model = config.model ?? DEFAULT_MODEL;
        this.tools = config.tools;
        this.contents = [];
        this.systemInstruction = config.systemInstruction ?? "You are a helpful assistant.";
        this.maxIterations = config.maxIterations ?? 15; // Default escape hatch
        this.onToolCall = config.onToolCall;
        this.confirmAction = config.confirmAction;
    }

    /**
     * Clears conversation history. Useful for long-running agents
     * to prevent context window overflow.
     */
    clearHistory(): void {
        this.contents = [];
    }

    /**
     * Returns the current conversation history.
     */
    getHistory(): Content[] {
        return [...this.contents];
    }

    /**
     * Main run method - handles user input and agentic tool loop.
     * @param input - User prompt string or function response parts
     * @param iteration - Current iteration count (internal use)
     */
    async run(input: string | Part[], iteration: number = 0): Promise<GenerateContentResponse> {
        // Escape hatch: prevent infinite loops
        if (iteration >= this.maxIterations) {
            throw new Error(`Agent exceeded maximum iterations (${this.maxIterations}). Stopping to prevent infinite loop.`);
        }

        // Handle string input or function response parts
        if (typeof input === "string") {
            this.contents.push({ role: "user", parts: [{ text: input }] });
        } else {
            this.contents.push({ role: "user", parts: input });
        }

        // Build function declarations from tools map
        const functionDeclarations = this.tools
            ? Object.values(this.tools).map((tool) => tool.definition)
            : undefined;

        const response = await this.client.models.generateContent({
            model: this.model,
            contents: this.contents,
            config: {
                systemInstruction: this.systemInstruction,
                tools: functionDeclarations?.length
                    ? [{ functionDeclarations }]
                    : undefined,
            },
        });

        // Append model response to contents
        if (response.candidates?.[0]?.content) {
            this.contents.push(response.candidates[0].content);
        }

        // Handle function calls (agentic loop)
        if (response.functionCalls && response.functionCalls.length > 0) {
            const functionResponseParts: Part[] = [];

            for (const functionCall of response.functionCalls) {
                const toolName = functionCall.name ?? "unknown";
                const toolArgs = (functionCall.args ?? {}) as Record<string, unknown>;

                let result: Record<string, unknown>;

                if (this.tools && toolName in this.tools) {
                    const tool = this.tools[toolName];

                    // Human-in-the-loop: confirm sensitive actions FIRST
                    if (tool.requiresConfirmation && this.confirmAction) {
                        const confirmed = await this.confirmAction(toolName, toolArgs);
                        if (!confirmed) {
                            result = { error: "Action cancelled by user." };
                            functionResponseParts.push({
                                functionResponse: { name: toolName, response: result },
                            });
                            continue;
                        }
                    }

                    // Log AFTER confirmation (only log approved actions)
                    if (this.onToolCall) {
                        this.onToolCall(toolName, toolArgs);
                    }

                    try {
                        const fnResult = tool.function(...Object.values(toolArgs));
                        result = { result: fnResult };
                    } catch (error) {
                        // Return meaningful errors, not stack traces
                        result = { error: this.formatError(error, toolName, toolArgs) };
                    }
                } else {
                    // Log unknown tool calls for debugging
                    if (this.onToolCall) {
                        this.onToolCall(toolName, toolArgs);
                    }
                    result = { error: `Tool '${toolName}' not found. Available tools: ${Object.keys(this.tools ?? {}).join(", ")}` };
                }

                functionResponseParts.push({
                    functionResponse: { name: toolName, response: result },
                });
            }

            // Recursively call run with function responses
            return this.run(functionResponseParts, iteration + 1);
        }

        return response;
    }

    /**
     * Formats errors into clear, actionable messages for the model.
     */
    private formatError(error: unknown, toolName: string, args: Record<string, unknown>): string {
        const message = error instanceof Error ? error.message : String(error);

        // Provide helpful context based on common errors
        if (message.includes("ENOENT") || message.includes("no such file")) {
            const path = args.file_path ?? args.directory_path ?? "unknown";
            return `Error: File or directory not found at '${path}'. Please verify the path exists.`;
        }
        if (message.includes("EACCES") || message.includes("permission denied")) {
            return `Error: Permission denied. Cannot access the specified path.`;
        }
        if (message.includes("EISDIR")) {
            return `Error: Expected a file but found a directory.`;
        }

        return `Error in ${toolName}: ${message}`;
    }
}
