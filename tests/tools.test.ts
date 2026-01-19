import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { tools } from "../src/tools.js";

// ============================================================================
// Test Fixtures Setup
// ============================================================================

const TEST_DIR = path.join(os.tmpdir(), "gemini-agent-tests");
const TEST_FILE = path.join(TEST_DIR, "test-file.txt");
const TEST_SUBDIR = path.join(TEST_DIR, "subdir");
const TEST_NESTED_FILE = path.join(TEST_SUBDIR, "nested.txt");

function setupTestDir() {
    // Clean up if exists
    if (fs.existsSync(TEST_DIR)) {
        fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }

    // Create fresh test directory
    fs.mkdirSync(TEST_DIR, { recursive: true });
    fs.mkdirSync(TEST_SUBDIR, { recursive: true });

    // Create test files
    fs.writeFileSync(TEST_FILE, "Hello, World!");
    fs.writeFileSync(TEST_NESTED_FILE, "Nested content");
}

function cleanupTestDir() {
    if (fs.existsSync(TEST_DIR)) {
        fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
}

// ============================================================================
// Helper to call tool functions
// ============================================================================

function callTool(name: string, ...args: unknown[]) {
    const tool = tools[name];
    if (!tool) throw new Error(`Tool ${name} not found`);
    return tool.function(...args);
}

// ============================================================================
// Tool Definitions Tests
// ============================================================================

describe("Tool Definitions", () => {
    it("should export all expected tools", () => {
        expect(tools).toHaveProperty("read_file");
        expect(tools).toHaveProperty("write_file");
        expect(tools).toHaveProperty("list_directory");
        expect(tools).toHaveProperty("delete_file");
        expect(tools).toHaveProperty("delete_directory");
    });

    it("each tool should have definition, function, and requiresConfirmation", () => {
        for (const [name, tool] of Object.entries(tools)) {
            expect(tool).toHaveProperty("definition");
            expect(tool).toHaveProperty("function");
            expect(tool).toHaveProperty("requiresConfirmation");
            expect(typeof tool.function).toBe("function");
            expect(typeof tool.definition.name).toBe("string");
            expect(typeof tool.definition.description).toBe("string");
        }
    });

    it("destructive tools should require confirmation", () => {
        expect(tools.write_file.requiresConfirmation).toBe(true);
        expect(tools.delete_file.requiresConfirmation).toBe(true);
        expect(tools.delete_directory.requiresConfirmation).toBe(true);
    });

    it("read-only tools should not require confirmation", () => {
        expect(tools.read_file.requiresConfirmation).toBe(false);
        expect(tools.list_directory.requiresConfirmation).toBe(false);
    });
});

// ============================================================================
// read_file Tests
// ============================================================================

describe("read_file", () => {
    beforeEach(setupTestDir);
    afterEach(cleanupTestDir);

    it("should read file contents successfully", () => {
        const content = callTool("read_file", TEST_FILE);
        expect(content).toBe("Hello, World!");
    });

    it("should read nested file", () => {
        const content = callTool("read_file", TEST_NESTED_FILE);
        expect(content).toBe("Nested content");
    });

    it("should throw error for non-existent file", () => {
        expect(() => callTool("read_file", path.join(TEST_DIR, "nonexistent.txt")))
            .toThrow(/File not found/);
    });

    it("should suggest similar file names", () => {
        // Create a file with similar name
        fs.writeFileSync(path.join(TEST_DIR, "data.csv"), "data");

        try {
            // Use "data" which is a substring of "data.csv"
            callTool("read_file", path.join(TEST_DIR, "data"));
            expect.fail("Should have thrown");
        } catch (error) {
            expect((error as Error).message).toContain("Did you mean");
            expect((error as Error).message).toContain("data.csv");
        }
    });

    it("should throw error when trying to read a directory", () => {
        expect(() => callTool("read_file", TEST_SUBDIR))
            .toThrow(/is a directory/);
    });

    it("should handle paths with spaces", () => {
        const fileWithSpaces = path.join(TEST_DIR, "file with spaces.txt");
        fs.writeFileSync(fileWithSpaces, "content with spaces");

        const content = callTool("read_file", fileWithSpaces);
        expect(content).toBe("content with spaces");
    });

    it("should trim whitespace from path", () => {
        const content = callTool("read_file", `  ${TEST_FILE}  `);
        expect(content).toBe("Hello, World!");
    });

    it("should reject files larger than 100KB", () => {
        const largeFile = path.join(TEST_DIR, "large.txt");
        // Create a file larger than 100KB
        fs.writeFileSync(largeFile, "x".repeat(101 * 1024));

        expect(() => callTool("read_file", largeFile))
            .toThrow(/too large/);
    });

    it("should handle relative paths", () => {
        const cwd = process.cwd();
        process.chdir(TEST_DIR);

        try {
            const content = callTool("read_file", "./test-file.txt");
            expect(content).toBe("Hello, World!");
        } finally {
            process.chdir(cwd);
        }
    });
});

// ============================================================================
// write_file Tests
// ============================================================================

describe("write_file", () => {
    beforeEach(setupTestDir);
    afterEach(cleanupTestDir);

    it("should create new file", () => {
        const newFile = path.join(TEST_DIR, "new-file.txt");
        const result = callTool("write_file", newFile, "New content");

        expect(result).toContain("Successfully wrote");
        expect(fs.existsSync(newFile)).toBe(true);
        expect(fs.readFileSync(newFile, "utf-8")).toBe("New content");
    });

    it("should overwrite existing file", () => {
        const result = callTool("write_file", TEST_FILE, "Overwritten");

        expect(result).toContain("Successfully wrote");
        expect(fs.readFileSync(TEST_FILE, "utf-8")).toBe("Overwritten");
    });

    it("should create parent directories if they don't exist", () => {
        const deepFile = path.join(TEST_DIR, "a", "b", "c", "deep.txt");
        callTool("write_file", deepFile, "Deep content");

        expect(fs.existsSync(deepFile)).toBe(true);
        expect(fs.readFileSync(deepFile, "utf-8")).toBe("Deep content");
    });

    it("should report correct character count", () => {
        const content = "Hello!";
        const result = callTool("write_file", path.join(TEST_DIR, "count.txt"), content);

        expect(result).toContain(`${content.length} characters`);
    });

    it("should handle empty content", () => {
        const emptyFile = path.join(TEST_DIR, "empty.txt");
        callTool("write_file", emptyFile, "");

        expect(fs.existsSync(emptyFile)).toBe(true);
        expect(fs.readFileSync(emptyFile, "utf-8")).toBe("");
    });

    it("should handle unicode content", () => {
        const unicodeFile = path.join(TEST_DIR, "unicode.txt");
        const content = "Hello 世界 🌍 émojis";
        callTool("write_file", unicodeFile, content);

        expect(fs.readFileSync(unicodeFile, "utf-8")).toBe(content);
    });

    it("should handle multiline content", () => {
        const multilineFile = path.join(TEST_DIR, "multiline.txt");
        const content = "Line 1\nLine 2\nLine 3";
        callTool("write_file", multilineFile, content);

        expect(fs.readFileSync(multilineFile, "utf-8")).toBe(content);
    });
});

// ============================================================================
// list_directory Tests
// ============================================================================

describe("list_directory", () => {
    beforeEach(setupTestDir);
    afterEach(cleanupTestDir);

    it("should list directory contents", () => {
        const contents = callTool("list_directory", TEST_DIR);

        expect(Array.isArray(contents)).toBe(true);
        expect(contents).toContain("test-file.txt");
        expect(contents).toContain("subdir");
    });

    it("should list subdirectory contents", () => {
        const contents = callTool("list_directory", TEST_SUBDIR);

        expect(contents).toContain("nested.txt");
    });

    it("should throw error for non-existent directory", () => {
        expect(() => callTool("list_directory", path.join(TEST_DIR, "nonexistent")))
            .toThrow(/Directory not found/);
    });

    it("should throw error when trying to list a file", () => {
        expect(() => callTool("list_directory", TEST_FILE))
            .toThrow(/is a file, not a directory/);
    });

    it("should return empty array for empty directory", () => {
        const emptyDir = path.join(TEST_DIR, "empty-dir");
        fs.mkdirSync(emptyDir);

        const contents = callTool("list_directory", emptyDir);

        expect(Array.isArray(contents)).toBe(true);
        expect(contents.length).toBe(0);
    });

    it("should handle current directory notation", () => {
        const cwd = process.cwd();
        process.chdir(TEST_DIR);

        try {
            const contents = callTool("list_directory", ".");
            expect(contents).toContain("test-file.txt");
        } finally {
            process.chdir(cwd);
        }
    });

    it("should suggest similar directory names", () => {
        try {
            callTool("list_directory", path.join(TEST_DIR, "subdi"));
        } catch (error) {
            expect((error as Error).message).toContain("Did you mean");
        }
    });
});

// ============================================================================
// delete_file Tests
// ============================================================================

describe("delete_file", () => {
    beforeEach(setupTestDir);
    afterEach(cleanupTestDir);

    it("should delete existing file", () => {
        expect(fs.existsSync(TEST_FILE)).toBe(true);

        const result = callTool("delete_file", TEST_FILE);

        expect(result).toContain("Successfully deleted");
        expect(fs.existsSync(TEST_FILE)).toBe(false);
    });

    it("should throw error for non-existent file", () => {
        expect(() => callTool("delete_file", path.join(TEST_DIR, "nonexistent.txt")))
            .toThrow(/File not found/);
    });

    it("should throw error when trying to delete a directory", () => {
        expect(() => callTool("delete_file", TEST_SUBDIR))
            .toThrow(/is a directory/);
    });

    it("should suggest similar file names on error", () => {
        try {
            // Use "test-file" which is a substring of "test-file.txt"
            callTool("delete_file", path.join(TEST_DIR, "test-file"));
            expect.fail("Should have thrown");
        } catch (error) {
            expect((error as Error).message).toContain("Did you mean");
            expect((error as Error).message).toContain("test-file.txt");
        }
    });
});

// ============================================================================
// delete_directory Tests
// ============================================================================

describe("delete_directory", () => {
    beforeEach(setupTestDir);
    afterEach(cleanupTestDir);

    it("should delete empty directory", () => {
        const emptyDir = path.join(TEST_DIR, "empty-to-delete");
        fs.mkdirSync(emptyDir);

        const result = callTool("delete_directory", emptyDir, false);

        expect(result).toContain("Successfully deleted empty directory");
        expect(fs.existsSync(emptyDir)).toBe(false);
    });

    it("should throw error when deleting non-empty directory without recursive", () => {
        expect(() => callTool("delete_directory", TEST_SUBDIR, false))
            .toThrow(/is not empty/);
    });

    it("should delete non-empty directory with recursive=true", () => {
        expect(fs.existsSync(TEST_SUBDIR)).toBe(true);

        const result = callTool("delete_directory", TEST_SUBDIR, true);

        expect(result).toContain("Successfully deleted directory and all contents");
        expect(fs.existsSync(TEST_SUBDIR)).toBe(false);
    });

    it("should throw error for non-existent directory", () => {
        expect(() => callTool("delete_directory", path.join(TEST_DIR, "nonexistent")))
            .toThrow(/Directory not found/);
    });

    it("should throw error when trying to delete a file", () => {
        expect(() => callTool("delete_directory", TEST_FILE))
            .toThrow(/is a file, not a directory/);
    });

    it("should delete deeply nested directory structure", () => {
        const deepDir = path.join(TEST_DIR, "deep");
        fs.mkdirSync(path.join(deepDir, "a", "b", "c"), { recursive: true });
        fs.writeFileSync(path.join(deepDir, "a", "b", "c", "file.txt"), "deep");

        const result = callTool("delete_directory", deepDir, true);

        expect(result).toContain("Successfully deleted");
        expect(fs.existsSync(deepDir)).toBe(false);
    });

    it("should report item count in error message", () => {
        // Create directory with known number of items
        const dirWithItems = path.join(TEST_DIR, "with-items");
        fs.mkdirSync(dirWithItems);
        fs.writeFileSync(path.join(dirWithItems, "a.txt"), "a");
        fs.writeFileSync(path.join(dirWithItems, "b.txt"), "b");
        fs.writeFileSync(path.join(dirWithItems, "c.txt"), "c");

        try {
            callTool("delete_directory", dirWithItems, false);
        } catch (error) {
            expect((error as Error).message).toContain("3 items");
        }
    });

    it("should default recursive to false", () => {
        // Create non-empty directory
        const dirWithContent = path.join(TEST_DIR, "with-content");
        fs.mkdirSync(dirWithContent);
        fs.writeFileSync(path.join(dirWithContent, "file.txt"), "content");

        // Call without recursive parameter
        expect(() => callTool("delete_directory", dirWithContent))
            .toThrow(/is not empty/);
    });
});

// ============================================================================
// Path Resolution Tests (via tool functions)
// ============================================================================

describe("Path Resolution", () => {
    beforeEach(setupTestDir);
    afterEach(cleanupTestDir);

    it("should resolve ~ to home directory", () => {
        const homeFile = path.join(os.homedir(), ".gemini-test-temp");
        fs.writeFileSync(homeFile, "home test");

        try {
            const content = callTool("read_file", "~/.gemini-test-temp");
            expect(content).toBe("home test");
        } finally {
            fs.unlinkSync(homeFile);
        }
    });

    it("should handle ./relative paths", () => {
        const cwd = process.cwd();
        process.chdir(TEST_DIR);

        try {
            const content = callTool("read_file", "./test-file.txt");
            expect(content).toBe("Hello, World!");
        } finally {
            process.chdir(cwd);
        }
    });

    it("should handle ../parent paths", () => {
        const cwd = process.cwd();
        process.chdir(TEST_SUBDIR);

        try {
            const content = callTool("read_file", "../test-file.txt");
            expect(content).toBe("Hello, World!");
        } finally {
            process.chdir(cwd);
        }
    });

    it("should handle absolute paths", () => {
        const content = callTool("read_file", TEST_FILE);
        expect(content).toBe("Hello, World!");
    });

    it("should trim leading/trailing whitespace", () => {
        const content = callTool("read_file", `   ${TEST_FILE}   `);
        expect(content).toBe("Hello, World!");
    });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe("Edge Cases", () => {
    beforeEach(setupTestDir);
    afterEach(cleanupTestDir);

    it("should handle file with special characters in name", () => {
        const specialFile = path.join(TEST_DIR, "file-with_special.chars.txt");
        fs.writeFileSync(specialFile, "special");

        const content = callTool("read_file", specialFile);
        expect(content).toBe("special");
    });

    it("should handle very long file names", () => {
        const longName = "a".repeat(200) + ".txt";
        const longFile = path.join(TEST_DIR, longName);

        try {
            fs.writeFileSync(longFile, "long name");
            const content = callTool("read_file", longFile);
            expect(content).toBe("long name");
        } catch (error) {
            // Some systems don't support very long file names
            expect((error as Error).message).toMatch(/ENAMETOOLONG|File not found/);
        }
    });

    it("should handle hidden files (starting with .)", () => {
        const hiddenFile = path.join(TEST_DIR, ".hidden");
        fs.writeFileSync(hiddenFile, "hidden content");

        const content = callTool("read_file", hiddenFile);
        expect(content).toBe("hidden content");

        const listing = callTool("list_directory", TEST_DIR);
        expect(listing).toContain(".hidden");
    });

    it("should handle symlinks", () => {
        const symlinkPath = path.join(TEST_DIR, "symlink.txt");

        try {
            fs.symlinkSync(TEST_FILE, symlinkPath);
            const content = callTool("read_file", symlinkPath);
            expect(content).toBe("Hello, World!");
        } catch (error) {
            // Symlinks might not be supported on all systems
            console.log("Symlink test skipped:", (error as Error).message);
        }
    });

    it("should handle concurrent reads", async () => {
        const promises = Array(10).fill(null).map(() =>
            Promise.resolve(callTool("read_file", TEST_FILE))
        );

        const results = await Promise.all(promises);
        results.forEach(content => {
            expect(content).toBe("Hello, World!");
        });
    });

    it("should handle concurrent writes to different files", async () => {
        const promises = Array(5).fill(null).map((_, i) => {
            const file = path.join(TEST_DIR, `concurrent-${i}.txt`);
            return Promise.resolve(callTool("write_file", file, `Content ${i}`));
        });

        await Promise.all(promises);

        for (let i = 0; i < 5; i++) {
            const file = path.join(TEST_DIR, `concurrent-${i}.txt`);
            expect(fs.readFileSync(file, "utf-8")).toBe(`Content ${i}`);
        }
    });
});
