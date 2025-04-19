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

async function main() {
    const files = await walkFiles(jsonDir, isJsonFile);
    files.forEach((file) => {
        const config = fs.readJsonSync(file.path);
        const post = [
            md.meta(config.meta),
        ];
        config.content.forEach(child => markdownContent(child, post));
        fs.outputFileSync(path.join(mdDir, path.basename(file.path).replace('.json', '.md')), post.join('\n'));
    });
}

main();

function markdownContent(item, result = [], depth = 0,) {
    const type = item.type;
    if (type === 'section') {
        const title = ({
            0: md.h1(item.title),
            1: md.h2(item.title),
            2: md.h3(item.title),
            3: md.h4(item.title),
        })[depth] ?? item.title;
        result.push(title);
        item.content.forEach(child => markdownContent(child, result, depth + 1));
    } else if (type === 'comment') {
        result.push(md.comment(item.content));
    } else if (type === 'image') {
        if (item.link) {
            result.push(html.a({
                href: item.link, children: [
                    html.img({
                        src: item.src, style: {
                            "object-fit": "cover",
                            width: '150px', height: '110px'
                        }
                    })
                ]
            }));
        } else {
            result.push(html.img({src: item.src}));
        }
    } else if (type === 'video') {
        result.push(html.a({
            href: item.link, children: [
                html.video({
                    poster: item.poster, style: {
                        width: '150px', height: '110px'
                    }, children: [
                        html.source({src: item.src, type: 'video/mp4'})
                    ]
                })
            ]
        }));
    } else if (type === 'text') {
        result.push(item.content);
    } else if (type === 'gallery') {
        result.push(gallery(item.content));
    }
    return result;
}


function gallery(gallery) {
    if (!gallery && gallery.length === 0) {
        return '';
    }
    return html.div({children: gallery.map(galleryItem), style: {display: "flex", "flex-wrap": "wrap", gap: "10px"}});
}

function galleryItem(item) {
    return html.div({
        children: [
            item.title,
            html.div({
                children: [
                    markdownContent(item)
                ]
            })
        ]
    });
}


