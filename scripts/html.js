function div({children, style}) {
    return render('div', {children, style});
}

function img({src, width, height, style, alt = "img"}) {
    return render('img', {
        style, attributes: {
            src,
            alt,
            width,
            height,
        }
    });
}

function a({children, style, href}) {
    return render('a', {children, style, attributes: {href}});
}

function video({children, width, poster, style}) {
    return render('video', {
        children, style, attributes: {
            width,
            poster,
            controls: "",
            autoplay: "",
            loop: "",
            muted: "",
        }
    });

}

function source({src, type}) {
    return render('source', {attributes: {src, type}});
}

function render(element, {attributes, style, children}) {
    const allStyles = {
        ...(attributes?.style ?? {}),
        ...(style ?? {})
    };
    const allAttributes = {
        ...(attributes ?? {}),
        style: renderStyle(allStyles)
    };
    return `<${element} ${renderAttributes(allAttributes)}>${renderChildren(children)}</${element}>`;
}

function renderAttributes(attributes = {}) {
    return Object.entries(attributes).filter(([_, value]) => value != null).map(([key, value]) => `${key}="${value}"`).join(' ');
}

function renderStyle(style = {}) {
    if (Object.entries(style).length === 0) {
        return null;
    }
    return Object.entries(style).map(([it, value]) => `${it}:${value}`).join(';');
}

function renderChildren(items = []) {
    if (Array.isArray(items)) {
        return `${items.filter(it => it != null).join('\n')}`;
    }
    return items;
}

const html = {
    div,
    img,
    a,
    video,
    source
}

export default html;