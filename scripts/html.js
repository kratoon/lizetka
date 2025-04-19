function div({children, style}) {
    const attributes = {
        style: Object.entries(style).map(([it, value]) => `${it}: ${value}`).join(',')
    };
    return `<div ${Object.entries(attributes).filter(([_, value]) => value != null).map(([key, value]) => `${key}="${value}"`).join(' ')}>${childrenText(children)}</div>`;
}

function childrenText(items) {
    return `${(items ?? []).filter(it => it != null).join('\n')}`;
}

const html = {
    div,
}

export default html;