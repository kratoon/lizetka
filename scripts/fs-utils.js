import klaw from "klaw";

export function isJsonFile(file) {
    return file.stats.isFile() && file.path.endsWith('.json');
}

export async function walkFiles(dir, filter) {
    const files = [];
    for await (const file of klaw(dir)) {
        if (!filter || filter(file)) {
            files.push(file);
        }
    }
    return files;
}

