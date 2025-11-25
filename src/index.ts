#!/usr/bin/env node
import { Command } from 'commander';
import { readFileSync } from 'fs';
import { join } from 'path';
import { findAllFilesInPathAndSubPathsThatAreNotInGitIgnore, getFullPathFromPath } from './utils';

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

    const sourceCodeFilesRelativePaths = findAllFilesInPathAndSubPathsThatAreNotInGitIgnore(path);
    console.log(sourceCodeFilesRelativePaths.map(i => i.getFullPath()));
}

main();