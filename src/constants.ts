export const MAX_SOURCE_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB safety cap

export const SOURCE_CODE_EXTENSIONS = new Set<string>([
    // TypeScript / JavaScript
    'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
    // Web / config
    'json', 'html', 'css', 'scss', 'sass', 'less',
    'yml', 'yaml', 'toml',
    // Common languages
    'py', 'rb', 'go', 'rs', 'java', 'kt', 'cs', 'php', 'swift',
    'scala', 'sh', 'bash', 'zsh',
    // Infra / misc text that is often “code-ish”
    'sql', 'graphql', 'gql',
    // Markdown
    'md', 'markdown',
]);