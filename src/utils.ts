import { resolve, join, relative, dirname, sep } from 'path';
import { readdirSync, statSync, readFileSync, existsSync, openSync, readSync, closeSync } from 'fs';
import { NormalisedPath } from './normalisedPath';
import { MAX_SOURCE_FILE_SIZE_BYTES, SOURCE_CODE_EXTENSIONS } from './constants';

export function getFullPathFromPath(path: string): string {
    return resolve(path);
}

function isProbablyTextFile(filePath: string): boolean {
    let fd: number | undefined;
    try {
        fd = openSync(filePath, 'r');
        const buffer = Buffer.alloc(4096);
        const bytesRead = readSync(fd, buffer, 0, buffer.length, 0);

        if (bytesRead === 0) {
            // Empty file – treat as text
            return true;
        }

        let nonPrintable = 0;
        for (let i = 0; i < bytesRead; i++) {
            const byte = buffer[i]!;
            if (byte === 0) {
                // NUL byte is a very strong binary signal
                return false;
            }
            // Allow common control chars: tab (9), LF (10), CR (13)
            if (byte < 7 || (byte > 13 && byte < 32) || byte === 127) {
                nonPrintable++;
            }
        }

        const ratio = nonPrintable / bytesRead;
        // Heuristic: if too many non-printable chars, assume binary
        return ratio < 0.3;
    } catch {
        // On error, be conservative and treat as non-text
        return false;
    } finally {
        if (fd !== undefined) {
            try {
                closeSync(fd);
            } catch {
                // ignore close errors
            }
        }
    }
}

function isSourceCodeFile(filePath: string): boolean {
    let stats;
    try {
        stats = statSync(filePath);
    } catch {
        return false;
    }

    if (!stats.isFile()) {
        return false;
    }

    if (stats.size > MAX_SOURCE_FILE_SIZE_BYTES) {
        return false;
    }

    const lastDotIndex = filePath.lastIndexOf('.');
    if (lastDotIndex === -1) {
        return false;
    }
    const ext = filePath.slice(lastDotIndex + 1).toLowerCase();
    if (!SOURCE_CODE_EXTENSIONS.has(ext)) {
        return false;
    }

    // if (!isProbablyTextFile(filePath)) {
    //     return false;
    // }

    return true;
}

function gitignorePatternToRegex(pattern: string): RegExp | null {
    pattern = pattern.trim();

    if (!pattern || pattern.startsWith('#')) {
        return null;
    }

    const isNegation = pattern.startsWith('!');
    if (isNegation) {
        pattern = pattern.slice(1).trim();
    }

    if (!pattern) {
        return null;
    }

    const isAnchored = pattern.startsWith('/');
    if (isAnchored) {
        pattern = pattern.slice(1);
    }

    let regexPattern = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
        .replace(/\*\*/g, '__DOUBLE_STAR__') // Temporarily replace **
        .replace(/\*/g, '[^/]*') // * matches anything except /
        .replace(/__DOUBLE_STAR__/g, '.*') // ** matches anything including /
        .replace(/\?/g, '[^/]'); // ? matches single char except /

    if (isAnchored) {
        regexPattern = '^' + regexPattern;
    } else {
        regexPattern = '(^|/)' + regexPattern;
    }

    regexPattern = regexPattern + '(/.*)?$';

    try {
        const regex = new RegExp(regexPattern);
        return regex;
    } catch {
        return null;
    }
}

function findGitignoreFiles(startPath: string): Array<{ path: string; content: string }> {
    const gitignoreFiles: Array<{ path: string; content: string }> = [];
    let currentPath = resolve(startPath);
    const root = process.platform === 'win32' ? currentPath.split(sep)[0] + sep : '/';

    while (currentPath !== root && currentPath !== dirname(currentPath)) {
        const gitignorePath = join(currentPath, '.gitignore');
        if (existsSync(gitignorePath)) {
            try {
                const content = readFileSync(gitignorePath, 'utf-8');
                gitignoreFiles.push({ path: currentPath, content });
            } catch {
                // Ignore read errors
            }
        }
        currentPath = dirname(currentPath);
    }

    gitignoreFiles.reverse(); // ancestors first, then closer .gitignore files override
    return gitignoreFiles;
}

function isIgnored(
    filePath: string,
    gitignoreFiles: Array<{ path: string; content: string }>,
    isDirectory: boolean
): boolean {
    const normalizedPath = resolve(filePath);
    const pathSegments = normalizedPath.split(sep);

    // Always ignore anything inside a .git folder
    if (pathSegments.includes('.git')) {
        return true;
    }

    const baseName = pathSegments[pathSegments.length - 1] || '';

    // Ignore hidden files/directories (starting with '.')
    if (baseName.startsWith('.') && baseName !== '.' && baseName !== '..') {
        return true;
    }

    // Ignore anything inside tmp or temp folders
    if (pathSegments.includes('tmp') || pathSegments.includes('temp')) {
        return true;
    }

    let ignored = false;

    for (const { path: gitignoreDir, content } of gitignoreFiles) {
        const normalizedGitignoreDir = resolve(gitignoreDir);
        const normalizedFilePath = resolve(filePath);

        const relativePath = relative(normalizedGitignoreDir, normalizedFilePath);
        if (relativePath.startsWith('..')) {
            continue;
        }

        const pathFromGitignore = relative(gitignoreDir, filePath).replace(/\\/g, '/');
        const pathToMatch = pathFromGitignore || '.';

        const lines = content.split('\n');

        for (const line of lines) {
            const pattern = line.trim();
            if (!pattern || pattern.startsWith('#')) {
                continue;
            }

            const isNegation = pattern.startsWith('!');
            const actualPattern = isNegation ? pattern.slice(1).trim() : pattern;

            if (!actualPattern) {
                continue;
            }

            const regex = gitignorePatternToRegex(actualPattern);
            if (!regex) {
                continue;
            }

            const testPath = isDirectory && !pathToMatch.endsWith('/')
                ? pathToMatch + '/'
                : pathToMatch;

            const matches = regex.test(testPath);

            if (matches) {
                if (isNegation) {
                    ignored = false; // Negation un-ignores
                } else {
                    ignored = true; // Pattern matches, so ignore
                }
            }
        }
    }

    return ignored;
}

function findFilesRecursive(
    dirPath: string,
    gitignoreFiles: Array<{ path: string; content: string }>,
    result: string[]
): void {
    try {
        const entries = readdirSync(dirPath, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = join(dirPath, entry.name);

            if (isIgnored(fullPath, gitignoreFiles, entry.isDirectory())) {
                continue;
            }

            if (entry.isDirectory()) {
                findFilesRecursive(fullPath, gitignoreFiles, result);
            } else if (entry.isFile()) {
                result.push(fullPath);
            }
        }
    } catch (error) {
        // Ignore permission errors and other filesystem errors
    }
}

function findAllFilesInPathAndSubPathsThatAreNotInGitIgnoreHelper(path: string): string[] {
    const resolvedPath = resolve(path);

    // Check if path exists
    if (!existsSync(resolvedPath)) {
        return [];
    }

    const stats = statSync(resolvedPath);
    if (stats.isFile()) {
        const gitignoreFiles = findGitignoreFiles(dirname(resolvedPath));
        if (!isIgnored(resolvedPath, gitignoreFiles, false)) {
            return [resolvedPath];
        }
        return [];
    }

    if (!stats.isDirectory()) {
        // Not a file or directory (e.g., symlink, socket, etc.)
        return [];
    }

    const gitignoreFiles = findGitignoreFiles(resolvedPath);

    const result: string[] = [];
    findFilesRecursive(resolvedPath, gitignoreFiles, result);

    return result;
}

export function findAllFilesInPathAndSubPathsThatAreNotInGitIgnore(basePath: string): NormalisedPath[] {
    let result = findAllFilesInPathAndSubPathsThatAreNotInGitIgnoreHelper(basePath);
    result = result.filter(isSourceCodeFile);
    result = result.map(p => relative(basePath, p));
    return result.map(p => new NormalisedPath(p, basePath));
}