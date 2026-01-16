import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const read_file_definition = {
    name: "read_file",
    description: "Reads a file and returns its contents.",
    parameters: {
        type: "object",
        properties: {
            file_path: {
                type: "string",
                description: "Path to the file to read.",
            },
        },
        required: ["file_path"],
    },
};

const list_dir_definition = {
    name: "list_dir",
    description: "Lists the contents of a directory.",
    parameters: {
        type: "object",
        properties: {
            directory_path: {
                type: "string",
                description: "Path to the directory to list.",
            },
        },
        required: ["directory_path"],
    },
};

const write_file_definition = {
    name: "write_file",
    description: "Writes a file with the given contents.",
    parameters: {
        type: "object",
        properties: {
            file_path: {
                type: "string",
                description: "Path to the file to write.",
            },
            contents: {
                type: "string",
                description: "Contents to write to the file.",
            },
        },
        required: ["file_path", "contents"],
    },
};

function expandPath(filePath: string): string {
    if (filePath.startsWith("~")) {
        return path.join(os.homedir(), filePath.slice(1));
    }
    return filePath;
}

function read_file(file_path: string): string {
    const fullPath = expandPath(file_path);
    return fs.readFileSync(fullPath, "utf-8");
}

function write_file(file_path: string, contents: string): boolean {
    const fullPath = expandPath(file_path);
    fs.writeFileSync(fullPath, contents, "utf-8");
    return true;
}

function list_dir(directory_path: string): string[] {
    const fullPath = expandPath(directory_path);
    return fs.readdirSync(fullPath);
}

export const tools = {
    read_file: { definition: read_file_definition, function: read_file },
    write_file: { definition: write_file_definition, function: write_file },
    list_dir: { definition: list_dir_definition, function: list_dir },
};
