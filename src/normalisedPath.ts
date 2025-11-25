import { join } from "path";

export class NormalisedPath {
    private relativePath: string;
    private basePath: string;

    constructor(relativePath: string, basePath: string) {
        this.relativePath = relativePath;
        this.basePath = basePath;
    }

    getRelativePath(): string {
        return this.relativePath;
    }

    getFullPath(): string {
        return join(this.basePath, this.relativePath);
    }
}