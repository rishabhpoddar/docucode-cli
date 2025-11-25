#!/usr/bin/env node
import { Command } from 'commander';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { findAllFilesInPathAndSubPathsThatAreNotInGitIgnore, getFullPathFromPath } from './utils';
import { SOURCE_CODE_EXTENSIONS } from './constants';

const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));

async function main() {
    const program = new Command();
    program
        .name(packageJson.name)
        .description(packageJson.description)
        .version(packageJson.version)
        .option('-p, --path <path>', 'the path to the file or directory to process');
    program.parse();
    const options = program.opts();

    let path = options.path;
    if (!path) {
        path = process.cwd();
    }
    path = getFullPathFromPath(path);

    if (!existsSync(path)) {
        throw new Error("The given path does not exist. Please provide a valid path.");
    }

    const sourceCodeFilesRelativePaths = findAllFilesInPathAndSubPathsThatAreNotInGitIgnore(path);
    if (sourceCodeFilesRelativePaths.length === 0) {
        throw new Error("No source code files found in the given path. Supported file extensions: " + Array.from(SOURCE_CODE_EXTENSIONS).join(', '));
    }

    // TODO:...
}

main().catch(error => {
    console.error(`Error: ${error.message}`);
    process.exit(1);
});