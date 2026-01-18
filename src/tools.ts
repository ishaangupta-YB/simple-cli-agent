import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { ToolsMap } from "./agent.js";

/**
 * Expands ~ to home directory and resolves relative paths.
 * Tolerates fuzzy inputs like "./file" or "~/file".
 */
function resolvePath(inputPath: string): string {
    let resolved = inputPath.trim();

    // Expand home directory
    if (resolved.startsWith("~")) {
        resolved = path.join(os.homedir(), resolved.slice(1));
    }

    // Resolve to absolute path
    return path.resolve(resolved);
}

/**
 * Checks if a path exists and suggests alternatives if not found.
 */
function validatePath(inputPath: string): { valid: boolean; resolved: string; suggestion?: string } {
    const resolved = resolvePath(inputPath);

    if (fs.existsSync(resolved)) {
        return { valid: true, resolved };
    }

    const dir = path.dirname(resolved);
    const basename = path.basename(resolved).toLowerCase();

    if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        const similar = files.find(f => f.toLowerCase().includes(basename) || basename.includes(f.toLowerCase()));
        if (similar) return { valid: false, resolved, suggestion: path.join(dir, similar) };
    }

    return { valid: false, resolved };
}

const readFileDefinition = {
    name: "read_file",
    description: "Reads and returns the contents of a file at the specified path. " +
        "Use this to examine file contents, check configurations, or read source code. " +
        "Supports relative paths (./file), home directory (~), and absolute paths.",
    parameters: {
        type: "object",
        properties: {
            file_path: {
                type: "string",
                description: "Path to the file to read. Examples: './config.json', '~/documents/notes.txt', '/etc/hosts'",
            },
        },
        required: ["file_path"],
    },
};

const listDirectoryDefinition = {
    name: "list_directory",
    description: "Lists all files and folders in a directory. " +
        "Returns an array of filenames. Use this to explore directory structure " +
        "before reading or writing files. Use '.' for current directory.",
    parameters: {
        type: "object",
        properties: {
            directory_path: {
                type: "string",
                description: "Path to the directory to list. Examples: '.', './src', '~/projects'",
            },
        },
        required: ["directory_path"],
    },
};

const writeFileDefinition = {
    name: "write_file",
    description: "Creates or overwrites a file with the specified contents. " +
        "WARNING: This will overwrite existing files without confirmation. " +
        "Use read_file first to check if file exists if needed.",
    parameters: {
        type: "object",
        properties: {
            file_path: {
                type: "string",
                description: "Path where the file will be created/overwritten.",
            },
            contents: {
                type: "string",
                description: "The text content to write to the file.",
            },
        },
        required: ["file_path", "contents"],
    },
};

const deleteFileDefinition = {
    name: "delete_file",
    description: "Permanently deletes a file at the specified path. " +
        "WARNING: This action is irreversible. The file cannot be recovered. " +
        "Use list_directory first to verify the file exists.",
    parameters: {
        type: "object",
        properties: {
            file_path: {
                type: "string",
                description: "Path to the file to delete. Examples: './temp.txt', '~/old-file.log'",
            },
        },
        required: ["file_path"],
    },
};

const deleteDirectoryDefinition = {
    name: "delete_directory",
    description: "Permanently deletes a directory and optionally all its contents. " +
        "WARNING: This action is irreversible. Use with extreme caution. " +
        "Use list_directory first to verify contents before deletion.",
    parameters: {
        type: "object",
        properties: {
            directory_path: {
                type: "string",
                description: "Path to the directory to delete. Examples: './temp', '~/old-folder'",
            },
            recursive: {
                type: "boolean",
                description: "If true, deletes directory and all contents. If false, only deletes if empty. Default: false",
            },
        },
        required: ["directory_path"],
    },
};

function readFile(filePath: string): string {
    const validation = validatePath(filePath);

    if (!validation.valid) {
        let errorMsg = `File not found: '${filePath}'`;
        if (validation.suggestion) {
            errorMsg += `. Did you mean '${validation.suggestion}'?`;
        }
        throw new Error(errorMsg);
    }

    const stats = fs.statSync(validation.resolved);
    if (stats.isDirectory()) {
        throw new Error(`'${filePath}' is a directory, not a file. Use list_directory instead.`);
    }

    // Don't dump massive files - context engineering
    const MAX_SIZE = 100 * 1024; // 100KB limit
    if (stats.size > MAX_SIZE) {
        throw new Error(`File is too large (${(stats.size / 1024).toFixed(1)}KB). Maximum supported size is 100KB.`);
    }

    return fs.readFileSync(validation.resolved, "utf-8");
}

function writeFile(filePath: string, contents: string): string {
    const resolved = resolvePath(filePath);

    // Ensure parent directory exists
    const dir = path.dirname(resolved);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(resolved, contents, "utf-8");
    return `Successfully wrote ${contents.length} characters to '${filePath}'`;
}

function listDirectory(directoryPath: string): string[] {
    const validation = validatePath(directoryPath);

    if (!validation.valid) {
        let errorMsg = `Directory not found: '${directoryPath}'`;
        if (validation.suggestion) {
            errorMsg += `. Did you mean '${validation.suggestion}'?`;
        }
        throw new Error(errorMsg);
    }

    const stats = fs.statSync(validation.resolved);
    if (!stats.isDirectory()) {
        throw new Error(`'${directoryPath}' is a file, not a directory. Use read_file instead.`);
    }

    return fs.readdirSync(validation.resolved);
}

function deleteFile(filePath: string): string {
    const validation = validatePath(filePath);

    if (!validation.valid) {
        let errorMsg = `File not found: '${filePath}'`;
        if (validation.suggestion) {
            errorMsg += `. Did you mean '${validation.suggestion}'?`;
        }
        throw new Error(errorMsg);
    }

    const stats = fs.statSync(validation.resolved);
    if (stats.isDirectory()) {
        throw new Error(`'${filePath}' is a directory, not a file. Use delete_directory instead.`);
    }

    fs.unlinkSync(validation.resolved);
    return `Successfully deleted file: '${filePath}'`;
}

function deleteDirectory(directoryPath: string, recursive: boolean = false): string {
    const validation = validatePath(directoryPath);

    if (!validation.valid) {
        let errorMsg = `Directory not found: '${directoryPath}'`;
        if (validation.suggestion) {
            errorMsg += `. Did you mean '${validation.suggestion}'?`;
        }
        throw new Error(errorMsg);
    }

    const stats = fs.statSync(validation.resolved);
    if (!stats.isDirectory()) {
        throw new Error(`'${directoryPath}' is a file, not a directory. Use delete_file instead.`);
    }

    // Check if directory is empty when not recursive
    if (!recursive) {
        const contents = fs.readdirSync(validation.resolved);
        if (contents.length > 0) {
            throw new Error(
                `Directory '${directoryPath}' is not empty (contains ${contents.length} items). ` +
                `Use recursive=true to delete directory and all contents, or remove contents first.`
            );
        }
        fs.rmdirSync(validation.resolved);
        return `Successfully deleted empty directory: '${directoryPath}'`;
    }

    // Recursive delete
    fs.rmSync(validation.resolved, { recursive: true, force: true });
    return `Successfully deleted directory and all contents: '${directoryPath}'`;
}

export const tools: ToolsMap = {
    read_file: {
        definition: readFileDefinition,
        function: readFile,
        requiresConfirmation: false,
    },
    write_file: {
        definition: writeFileDefinition,
        function: writeFile,
        requiresConfirmation: true,
    },
    list_directory: {
        definition: listDirectoryDefinition,
        function: listDirectory,
        requiresConfirmation: false,
    },
    delete_file: {
        definition: deleteFileDefinition,
        function: deleteFile,
        requiresConfirmation: true, // Destructive - requires confirmation
    },
    delete_directory: {
        definition: deleteDirectoryDefinition,
        function: deleteDirectory,
        requiresConfirmation: true, // Destructive - requires confirmation
    },
};
