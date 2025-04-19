#!/usr/bin/env node

import path from 'path';
import {fileURLToPath} from 'url';
import fs from 'fs-extra';
import {isJsonFile, walkFiles} from '../fs-utils.js';
import md from '../md.js';
import html from '../html.js';

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const jsonDir = path.join(rootDir, 'posts');
const mdDir = path.join(rootDir, 'docs/posts');
const br = '</br>';

async function main() {
    const files = await walkFiles(jsonDir, isJsonFile);
    files.forEach((file) => {
        const config = fs.readJsonSync(file.path);
        const post = [
            md.meta(config.meta),
            ...markdownContent(config.content)
        ].join('\n');
        fs.outputFileSync(path.join(mdDir, path.basename(file.path).replace('.json', '.md')), post);
    });
}

main();

function markdownContent(item, depth = 0, result = []) {
    const type = item.type;
    if (type === 'section') {
        const title = ({
            0: md.h1(item.title),
            1: md.h2(item.title),
            2: md.h3(item.title),
            3: md.h4(item.title),
        })[depth] ?? item.title;
        result.push(item.title);
        result.push(markdownContent(item.content));
    } else if (type === 'comment') {
        result.push(md.comment(item.content));
    }
    // return [            md.h1(config.meta.title),
    //     config.content.map(markdownItem).join(br),
    //     md.comment('more'),
    //     ...[config.sections.map(markdownSection).join('\n')]]
    return result;
}

function markdownSection({title, text, gallery}) {
    return [
        md.h2(title),
        text,
        markdownGallery(gallery)
    ].join('\n');
}

function markdownGallery(gallery) {
    if (!gallery && gallery.length === 0) {
        return '';
    }
    return html.div({children: gallery.map(markdownItem), style: {display: "flex"}});
}

function markdownItem(item) {
    if (item.type === 'image') {
        if (item.link) {
            return `<div style="margin: 10px">
    <div><span>${item.title}</span></div>
    <div><a href="${item.link}"><img src="${item.src}" width="150" height="86"></a></div>
</div>`;
        } else {
            return `<img alt="" src="${item.src}" width="850">`;
        }
    } else if (item.type === 'video') {
        return `<div style="margin: 10px">
        <div>
            <span>${item.title}</span>
        </div>
        <a href="${item.link}">
        <video width="150" poster="${item.poster}" controls="" autoplay="" loop="" muted="">
            <source src="${item.src}" type="video/mp4">
        </video>
    </a></div>`;
    }
    return '';
}
