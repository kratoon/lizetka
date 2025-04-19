function meta(meta) {
    return `---
${Object.entries(meta).map(([key, value]) => {
        return `${key}: ${typeof value === 'string' ? value : `\n${value.map(it => `  - ${it}`).join('\n')}`}`
    }).join('\n')}
---`;
}

function comment(text) {
    return `<!-- ${text} -->`;
}

function h1(text) {
    return `# ${text}`;
}

function h2(text) {
    return `## ${text}`;
}

function h3(text) {
    return `### ${text}`;
}

function h4(text) {
    return `### ${text}`;
}

const md = {
    meta,
    comment,
    h1,
    h2,
    h3,
    h4,
}

export default md;