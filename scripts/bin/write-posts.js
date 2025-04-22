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
                    src: item.src,
                    style: {
                        "object-fit": "cover",
                        "object-position": "center",
                        "width": "100%",
                        "max-width": "100%",
                        "height": "8rem",
                        "border-radius": ".5rem"
                    }
                })
            }));
        } else {
            result.push(html.img({src: item.content.src}));
        }
    } else if (type === 'video') {
        // result.push(html.a({
        //     href: item.link, children: html.video({
        //         poster: item.poster, children: html.source({src: item.src, type: 'video/mp4'}), style: {
        //             width: '150px', height: '110px'
        //         },
        //     })
        // }));
    } else if (type === 'paragraph') {
        result.push(html.div({children: item.content}));
    } else if (type === 'gallery') {
        result.push(gallery(item.content));
    } else if (type === 'youtube') {
        result.push(html.iframe({
            attributes: {
                src: `https://www.youtube.com/embed/${item.content}`,
                width: '560',
                height: '315',
                title: "YouTube video player",
                allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
                referrerpolicy: "strict-origin-when-cross-origin",
                allowfullscreen: true
            },
            style: {
                margin: '20px 0 20px 0',
                width: '100%',
                height: '20rem'
            }
        }));
    }
    return result;
}


function gallery(gallery) {
    if (!gallery && gallery.length === 0) {
        return '';
    }
    return html.div({
        children: gallery.map(galleryItem),
        classes: ['gallery grid-cols-1 sm:grid-cols-2 md:grid-cols-3'],
        style: {
            "margin-top": "2rem",
            "margin-bottom": "2rem",
            display: "grid",
            "flex-wrap": "wrap",
            gap: "1rem"
        }
    });
}

function galleryItem(item) {
    return html.div({
            children: [
                html.div({
                    style: {'padding-left': '5px'},
                    children: item.title
                }),
                markdownContent(item)
            ]
        }
    );
}


