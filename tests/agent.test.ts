import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ToolsMap, AgentConfig } from "../src/agent.js";

// ============================================================================
// Mock Setup - Must be before imports that use the client
// ============================================================================

// Mock the model module
vi.mock("../src/model.js", () => ({
    client: {
        models: {
            generateContent: vi.fn(),
        },
    },
    DEFAULT_MODEL: "gemini-2.5-flash",
}));

// Now import Agent after mocking
import { Agent } from "../src/agent.js";
import { client } from "../src/model.js";

// ============================================================================
// Test Helpers
// ============================================================================

const mockGenerateContent = client.models.generateContent as ReturnType<typeof vi.fn>;

function createMockResponse(text: string, functionCalls?: Array<{ name: string; args: Record<string, unknown> }>) {
    return {
        text,
        candidates: [{
            content: {
                role: "model",
                parts: functionCalls
                    ? functionCalls.map(fc => ({ functionCall: fc }))
                    : [{ text }],
            },
        }],
        functionCalls: functionCalls?.map(fc => ({
            name: fc.name,
            args: fc.args,
        })),
    };
}

function createMockTools(): ToolsMap {
    return {
        test_tool: {
            definition: {
                name: "test_tool",
                description: "A test tool",
                parameters: {
                    type: "object",
                    properties: {
                        input: { type: "string" },
                    },
                    required: ["input"],
                },
            },
            function: vi.fn((input: string) => `Result: ${input}`),
            requiresConfirmation: false,
        },
        dangerous_tool: {
            definition: {
                name: "dangerous_tool",
                description: "A dangerous tool that requires confirmation",
                parameters: {
                    type: "object",
                    properties: {},
                },
            },
            function: vi.fn(() => "Danger executed"),
            requiresConfirmation: true,
        },
    };
}

// ============================================================================
// Agent Constructor Tests
// ============================================================================

describe("Agent Constructor", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should create agent with default config", () => {
        const agent = new Agent();

        expect(agent.model).toBe("gemini-2.5-flash");
        expect(agent.systemInstruction).toBe("You are a helpful assistant.");
        expect(agent.maxIterations).toBe(15);
        expect(agent.contents).toEqual([]);
        expect(agent.tools).toBeUndefined();
    });

    it("should create agent with custom config", () => {
        const tools = createMockTools();
        const config: AgentConfig = {
            model: "custom-model",
            tools,
            systemInstruction: "Custom instruction",
            maxIterations: 10,
        };

        const agent = new Agent(config);

        expect(agent.model).toBe("custom-model");
        expect(agent.systemInstruction).toBe("Custom instruction");
        expect(agent.maxIterations).toBe(10);
        expect(agent.tools).toBe(tools);
    });

    it("should set hooks when provided", () => {
        const onToolCall = vi.fn();
        const confirmAction = vi.fn();
        const onMaxIterationsReached = vi.fn();

        const agent = new Agent({
            onToolCall,
            confirmAction,
            onMaxIterationsReached,
        });

        expect(agent.onToolCall).toBe(onToolCall);
        expect(agent.confirmAction).toBe(confirmAction);
        expect(agent.onMaxIterationsReached).toBe(onMaxIterationsReached);
    });
});

// ============================================================================
// Agent History Management Tests
// ============================================================================

describe("Agent History Management", () => {
    let agent: Agent;

    beforeEach(() => {
        vi.clearAllMocks();
        agent = new Agent();
    });

    it("should start with empty history", () => {
        expect(agent.getHistory()).toEqual([]);
    });

    it("should clear history", async () => {
        mockGenerateContent.mockResolvedValueOnce(createMockResponse("Hello"));

        await agent.run("Test message");
        expect(agent.getHistory().length).toBeGreaterThan(0);

        agent.clearHistory();
        expect(agent.getHistory()).toEqual([]);
    });

    it("should return a copy of history, not the original", () => {
        const history1 = agent.getHistory();
        const history2 = agent.getHistory();

        expect(history1).not.toBe(history2);
        expect(history1).toEqual(history2);
    });
});

// ============================================================================
// Agent run() Tests - Basic Flow
// ============================================================================

describe("Agent run() - Basic Flow", () => {
    let agent: Agent;

    beforeEach(() => {
        vi.clearAllMocks();
        agent = new Agent();
    });

    it("should add user message to contents", async () => {
        mockGenerateContent.mockResolvedValueOnce(createMockResponse("Response"));

        await agent.run("Hello");

        expect(agent.contents[0]).toEqual({
            role: "user",
            parts: [{ text: "Hello" }],
        });
    });

    it("should call generateContent with correct parameters", async () => {
        mockGenerateContent.mockResolvedValueOnce(createMockResponse("Response"));

        await agent.run("Hello");

        expect(mockGenerateContent).toHaveBeenCalledWith({
            model: "gemini-2.5-flash",
            contents: expect.any(Array),
            config: {
                systemInstruction: "You are a helpful assistant.",
                tools: undefined,
            },
        });
    });

    it("should include function declarations when tools provided", async () => {
        const tools = createMockTools();
        agent = new Agent({ tools });
        mockGenerateContent.mockResolvedValueOnce(createMockResponse("Response"));

        await agent.run("Hello");

        expect(mockGenerateContent).toHaveBeenCalledWith(
            expect.objectContaining({
                config: expect.objectContaining({
                    tools: [{ functionDeclarations: expect.any(Array) }],
                }),
            })
        );
    });

    it("should append model response to contents", async () => {
        mockGenerateContent.mockResolvedValueOnce(createMockResponse("Response"));

        await agent.run("Hello");

        expect(agent.contents.length).toBe(2);
        expect(agent.contents[1].role).toBe("model");
    });

    it("should return the response", async () => {
        const mockResponse = createMockResponse("Test response");
        mockGenerateContent.mockResolvedValueOnce(mockResponse);

        const response = await agent.run("Hello");

        expect(response.text).toBe("Test response");
    });

    it("should maintain conversation history across multiple calls", async () => {
        mockGenerateContent
            .mockResolvedValueOnce(createMockResponse("First response"))
            .mockResolvedValueOnce(createMockResponse("Second response"));

        await agent.run("First message");
        await agent.run("Second message");

        expect(agent.contents.length).toBe(4); // 2 user + 2 model
        expect(agent.contents[0].parts[0]).toEqual({ text: "First message" });
        expect(agent.contents[2].parts[0]).toEqual({ text: "Second message" });
    });
});

// ============================================================================
// Agent run() Tests - Function Calling
// ============================================================================

describe("Agent run() - Function Calling", () => {
    let agent: Agent;
    let tools: ToolsMap;

    beforeEach(() => {
        vi.clearAllMocks();
        tools = createMockTools();
        agent = new Agent({ tools });
    });

    it("should execute tool when function call returned", async () => {
        mockGenerateContent
            .mockResolvedValueOnce(createMockResponse("", [
                { name: "test_tool", args: { input: "test" } }
            ]))
            .mockResolvedValueOnce(createMockResponse("Tool executed"));

        await agent.run("Use the tool");

        expect(tools.test_tool.function).toHaveBeenCalledWith("test");
    });

    it("should send function response back to model", async () => {
        mockGenerateContent
            .mockResolvedValueOnce(createMockResponse("", [
                { name: "test_tool", args: { input: "test" } }
            ]))
            .mockResolvedValueOnce(createMockResponse("Done"));

        await agent.run("Use the tool");

        // Second call should include function response
        expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    });

    it("should call onToolCall hook", async () => {
        const onToolCall = vi.fn();
        agent = new Agent({ tools, onToolCall });

        mockGenerateContent
            .mockResolvedValueOnce(createMockResponse("", [
                { name: "test_tool", args: { input: "test" } }
            ]))
            .mockResolvedValueOnce(createMockResponse("Done"));

        await agent.run("Use the tool");

        expect(onToolCall).toHaveBeenCalledWith("test_tool", { input: "test" });
    });

    it("should handle tool not found", async () => {
        mockGenerateContent
            .mockResolvedValueOnce(createMockResponse("", [
                { name: "nonexistent_tool", args: {} }
            ]))
            .mockResolvedValueOnce(createMockResponse("Tool not found"));

        await agent.run("Use unknown tool");

        // Should still complete without throwing
        expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    });

    it("should handle tool execution error", async () => {
        tools.test_tool.function = vi.fn(() => {
            throw new Error("Tool failed");
        });

        mockGenerateContent
            .mockResolvedValueOnce(createMockResponse("", [
                { name: "test_tool", args: { input: "test" } }
            ]))
            .mockResolvedValueOnce(createMockResponse("Error handled"));

        await agent.run("Use the tool");

        // Should complete without throwing
        expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    });

    it("should handle multiple function calls in one response", async () => {
        mockGenerateContent
            .mockResolvedValueOnce(createMockResponse("", [
                { name: "test_tool", args: { input: "first" } },
                { name: "test_tool", args: { input: "second" } },
            ]))
            .mockResolvedValueOnce(createMockResponse("Done"));

        await agent.run("Use tools");

        expect(tools.test_tool.function).toHaveBeenCalledTimes(2);
        expect(tools.test_tool.function).toHaveBeenCalledWith("first");
        expect(tools.test_tool.function).toHaveBeenCalledWith("second");
    });
});

// ============================================================================
// Agent run() Tests - Human in the Loop
// ============================================================================

describe("Agent run() - Human in the Loop", () => {
    let agent: Agent;
    let tools: ToolsMap;

    beforeEach(() => {
        vi.clearAllMocks();
        tools = createMockTools();
    });

    it("should call confirmAction for tools requiring confirmation", async () => {
        const confirmAction = vi.fn().mockResolvedValue(true);
        agent = new Agent({ tools, confirmAction });

        mockGenerateContent
            .mockResolvedValueOnce(createMockResponse("", [
                { name: "dangerous_tool", args: {} }
            ]))
            .mockResolvedValueOnce(createMockResponse("Done"));

        await agent.run("Do something dangerous");

        expect(confirmAction).toHaveBeenCalledWith("dangerous_tool", {});
    });

    it("should not execute tool if confirmation denied", async () => {
        const confirmAction = vi.fn().mockResolvedValue(false);
        agent = new Agent({ tools, confirmAction });

        mockGenerateContent
            .mockResolvedValueOnce(createMockResponse("", [
                { name: "dangerous_tool", args: {} }
            ]))
            .mockResolvedValueOnce(createMockResponse("Cancelled"));

        await agent.run("Do something dangerous");

        expect(tools.dangerous_tool.function).not.toHaveBeenCalled();
    });

    it("should execute tool if confirmation approved", async () => {
        const confirmAction = vi.fn().mockResolvedValue(true);
        agent = new Agent({ tools, confirmAction });

        mockGenerateContent
            .mockResolvedValueOnce(createMockResponse("", [
                { name: "dangerous_tool", args: {} }
            ]))
            .mockResolvedValueOnce(createMockResponse("Done"));

        await agent.run("Do something dangerous");

        expect(tools.dangerous_tool.function).toHaveBeenCalled();
    });

    it("should not call confirmAction for tools not requiring confirmation", async () => {
        const confirmAction = vi.fn().mockResolvedValue(true);
        agent = new Agent({ tools, confirmAction });

        mockGenerateContent
            .mockResolvedValueOnce(createMockResponse("", [
                { name: "test_tool", args: { input: "test" } }
            ]))
            .mockResolvedValueOnce(createMockResponse("Done"));

        await agent.run("Use safe tool");

        expect(confirmAction).not.toHaveBeenCalled();
    });
});

// ============================================================================
// Agent run() Tests - Max Iterations
// ============================================================================

describe("Agent run() - Max Iterations", () => {
    let agent: Agent;
    let tools: ToolsMap;

    beforeEach(() => {
        vi.clearAllMocks();
        tools = createMockTools();
    });

    it("should throw error when max iterations exceeded without hook", async () => {
        agent = new Agent({ tools, maxIterations: 2 });

        // Set up responses that always return function calls
        mockGenerateContent.mockResolvedValue(createMockResponse("", [
            { name: "test_tool", args: { input: "test" } }
        ]));

        await expect(agent.run("Loop forever")).rejects.toThrow(/exceeded maximum iterations/);
    });

    it("should call onMaxIterationsReached hook when limit reached", async () => {
        const onMaxIterationsReached = vi.fn().mockResolvedValue(false);
        agent = new Agent({ tools, maxIterations: 2, onMaxIterationsReached });

        mockGenerateContent.mockResolvedValue(createMockResponse("", [
            { name: "test_tool", args: { input: "test" } }
        ]));

        await expect(agent.run("Loop")).rejects.toThrow();

        expect(onMaxIterationsReached).toHaveBeenCalledWith(2);
    });

    it("should continue if onMaxIterationsReached returns true", async () => {
        const onMaxIterationsReached = vi.fn().mockResolvedValue(true);
        agent = new Agent({ tools, maxIterations: 1, onMaxIterationsReached });

        mockGenerateContent
            .mockResolvedValueOnce(createMockResponse("", [
                { name: "test_tool", args: { input: "1" } }
            ]))
            .mockResolvedValueOnce(createMockResponse("Done")); // No more function calls

        const response = await agent.run("Start");

        expect(onMaxIterationsReached).toHaveBeenCalled();
        expect(response.text).toBe("Done");
    });

    it("should stop if onMaxIterationsReached returns false", async () => {
        const onMaxIterationsReached = vi.fn().mockResolvedValue(false);
        agent = new Agent({ tools, maxIterations: 1, onMaxIterationsReached });

        mockGenerateContent.mockResolvedValue(createMockResponse("", [
            { name: "test_tool", args: { input: "test" } }
        ]));

        await expect(agent.run("Start")).rejects.toThrow(/stopped after.*iterations by user/);
    });
});

// ============================================================================
// Agent run() Tests - Part[] Input (Function Responses)
// ============================================================================

describe("Agent run() - Part[] Input", () => {
    let agent: Agent;

    beforeEach(() => {
        vi.clearAllMocks();
        agent = new Agent();
    });

    it("should handle Part[] input correctly", async () => {
        mockGenerateContent.mockResolvedValueOnce(createMockResponse("Response"));

        const parts = [
            { functionResponse: { name: "test", response: { result: "ok" } } }
        ];

        await agent.run(parts);

        expect(agent.contents[0]).toEqual({
            role: "user",
            parts,
        });
    });
});

// ============================================================================
// Agent Error Formatting Tests
// ============================================================================

describe("Agent Error Formatting", () => {
    let agent: Agent;
    let tools: ToolsMap;

    beforeEach(() => {
        vi.clearAllMocks();
        tools = {
            failing_tool: {
                definition: {
                    name: "failing_tool",
                    description: "A tool that fails",
                    parameters: { type: "object", properties: {} },
                },
                function: vi.fn(),
                requiresConfirmation: false,
            },
        };
        agent = new Agent({ tools });
    });

    it("should format ENOENT errors", async () => {
        tools.failing_tool.function = vi.fn(() => {
            const error = new Error("ENOENT: no such file or directory");
            throw error;
        });

        mockGenerateContent
            .mockResolvedValueOnce(createMockResponse("", [
                { name: "failing_tool", args: { file_path: "/test/file" } }
            ]))
            .mockResolvedValueOnce(createMockResponse("Handled"));

        await agent.run("Read file");

        // The error should be formatted and sent back
        expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    });

    it("should format permission denied errors", async () => {
        tools.failing_tool.function = vi.fn(() => {
            throw new Error("EACCES: permission denied");
        });

        mockGenerateContent
            .mockResolvedValueOnce(createMockResponse("", [
                { name: "failing_tool", args: {} }
            ]))
            .mockResolvedValueOnce(createMockResponse("Handled"));

        await agent.run("Access denied");

        expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    });
});

// ============================================================================
// Integration-style Tests
// ============================================================================

describe("Agent Integration Tests", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should handle a complete conversation flow", async () => {
        const tools = createMockTools();
        const onToolCall = vi.fn();
        const confirmAction = vi.fn().mockResolvedValue(true);

        const agent = new Agent({
            tools,
            onToolCall,
            confirmAction,
            systemInstruction: "You are helpful",
        });

        // First turn: user asks, model responds with text
        mockGenerateContent.mockResolvedValueOnce(createMockResponse("Hello! How can I help?"));
        const response1 = await agent.run("Hi");
        expect(response1.text).toBe("Hello! How can I help?");

        // Second turn: user asks for tool use, model uses tool
        mockGenerateContent
            .mockResolvedValueOnce(createMockResponse("", [
                { name: "test_tool", args: { input: "data" } }
            ]))
            .mockResolvedValueOnce(createMockResponse("I used the tool and got: Result: data"));

        const response2 = await agent.run("Use the test tool");
        expect(response2.text).toBe("I used the tool and got: Result: data");
        expect(onToolCall).toHaveBeenCalled();

        // Verify history
        expect(agent.getHistory().length).toBe(6); // 2 user + 2 model + 1 tool call + 1 tool response
    });
});
