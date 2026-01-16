import { GoogleGenAI, Content, Part, GenerateContentResponse } from "@google/genai";
import { tools } from "./tools.js";
import { client, DEFAULT_MODEL } from "./model.js";

type ToolDefinition = {
    name: string;
    description: string;
    parameters: object;
};

type ToolsMap = Record<string, {
    definition: ToolDefinition;
    function: (...args: any[]) => any;
}>;

class Agent {
    client: GoogleGenAI;
    model: string;
    tools?: ToolsMap;
    contents: Content[];
    systemInstruction: string;

    constructor(
        model: string = DEFAULT_MODEL,
        tools?: ToolsMap,
        systemInstruction: string = "You are a helpful assistant."
    ) {
        this.client = client;
        this.model = model;
        this.tools = tools;
        this.contents = [];
        this.systemInstruction = systemInstruction;
    }

    async run(input: string | Part[]): Promise<GenerateContentResponse> {
        // Handle string input or function response parts
        if (typeof input === "string") {
            this.contents.push({ role: "user", parts: [{ text: input }] });
        } else {
            this.contents.push({ role: "user", parts: input });
        }

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

        if (response.candidates?.[0]?.content) {
            this.contents.push(response.candidates[0].content);
        }

        // Handle function calls (agentic loop)
        if (response.functionCalls && response.functionCalls.length > 0) {
            const functionResponseParts: Part[] = [];

            for (const functionCall of response.functionCalls) {
                console.log(`[Function Call] ${functionCall.name}(${JSON.stringify(functionCall.args)})`);

                let result: Record<string, unknown>;
                if (this.tools && functionCall.name && functionCall.name in this.tools) {
                    try {
                        const toolFn = this.tools[functionCall.name].function;
                        const args = functionCall.args ?? {};
                        // Call function with named args spread as positional
                        const fnResult = toolFn(...Object.values(args));
                        result = { result: fnResult };
                    } catch (error) {
                        result = { error: String(error) };
                    }
                } else {
                    result = { error: "Tool not found" };
                }

                console.log(`[Function Response] ${JSON.stringify(result)}`);

                functionResponseParts.push({
                    functionResponse: {
                        name: functionCall.name!,
                        response: result,
                    },
                });
            }

            // Recursively call run with function responses
            return this.run(functionResponseParts);
        }

        return response;
    }
}

const agent = new Agent(
    DEFAULT_MODEL,
    tools,
    "You are a helpful Coding Assistant."
);

const response = await agent.run("Can you list my files in the current directory?");
console.log(response.text);
