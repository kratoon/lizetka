function div({children, style, classes}) {
    return render('div', {children, style, classes});
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

function a({children, style, href, attributes = {}}) {
    return render('a', {children, style, attributes: {...attributes, href}});
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

function iframe({attributes, style}) {
    return render('iframe', {attributes, style});
}

function render(element, {attributes, style, children, classes}) {
    const allStyles = {
        ...(attributes?.style ?? {}),
        ...(style ?? {})
    };
    let classesArray = [];
    if (attributes?.class != null) {
        classesArray.push(...attributes.class.split(' '))
    }
    if (classes != null) {
        if (typeof classes === 'string') {
            classesArray.push(...classes.split(' '))
        } else if (Array.isArray(classes)) {
            classesArray.push(...classes.map(it => it.split(' ')).flat());
        }
        classesArray.flat().map(it => (it ?? '').trim()).filter(it => it != null && it !== '');
    }
    const allAttributes = {
        ...(attributes ?? {}),
        style: renderStyle(allStyles),
        class: classesArray.join(' ').trim()
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
    return items ?? '';
}

const html = {
    div,
    img,
    a,
    video,
    source,
    iframe,
}

export default html;