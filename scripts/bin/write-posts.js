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
        config.content.forEach(child => post.push(...markdownContent(child)));
        fs.outputFileSync(path.join(mdDir, path.basename(file.path).replace('.json', '.md')), post.join('\n'));
    });
}

main();

function markdownContent(item) {
    const result = [];
    const type = item.type;
    if (['h1', 'h2', 'h3', 'h4'].includes(type)) {
        const title = ({
            'h1': md.h1(item.content),
            'h2': md.h2(item.content),
            'h3': md.h3(item.content),
            'h4': md.h4(item.content),
        })[type] ?? item.content;
        result.push(title);
    } else if (type === 'comment') {
        result.push(md.comment(item.content));
    } else if (type === 'image') {
        if (item.link) {
            result.push(html.a({
                href: item.link, children: html.img({
                    src: item.src, style: {
                        "object-fit": "cover",
                        width: '150px', height: '110px'
                    }
                })
                
            }));
        } else {
            result.push(html.img({src: item.src}));
        }
    } else if (type === 'video') {
        result.push(html.a({
            href: item.link, children: html.video({
                poster: item.poster, children: html.source({src: item.src, type: 'video/mp4'}), style: {
                    width: '150px', height: '110px'
                },
            })
        }));
    } else if (type === 'paragraph') {
        result.push(html.div({children: item.content}));
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
                children: markdownContent(item)
            })
        ]
    });
}


